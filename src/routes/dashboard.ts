// ============================================
// Dashboard Routes - Owner & Seller
// Period filter defaults to 'today'
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { parseCookies } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatGB, formatMoney } from '../lib/calc';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const dashboard = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── helpers ──────────────────────────────────────────────────
function periodLabel(p: string) {
  return p === 'today' ? 'امروز'
       : p === 'week'  ? 'این هفته'
       : p === 'month' ? 'این ماه'
       : p === 'year'  ? 'امسال'
       : 'همه وقت';
}

function periodDateFilter(p: string, col = 'snapshot_time') {
  if (p === 'today') return `AND date(${col}) = date('now')`;
  if (p === 'week')  return `AND ${col} >= datetime('now','-7 days')`;
  if (p === 'month') return `AND ${col} >= datetime('now','-30 days')`;
  if (p === 'year')  return `AND ${col} >= datetime('now','-365 days')`;
  return '';
}

function periodBtns(current: string, base = '/dashboard') {
  return ['today','week','month','year','all'].map(p => `
    <a href="${base}?period=${p}"
       class="btn btn-sm ${current===p ? 'btn-primary' : 'btn-outline'}"
       style="white-space:nowrap">
      ${ p==='today' ? '📅 امروز'
       : p==='week'  ? '📅 هفته'
       : p==='month' ? '📅 ماه'
       : p==='year'  ? '📅 سال'
       :               '📅 همه'}
    </a>`).join('');
}

function fdate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
}

// ============================================================
// OWNER DASHBOARD  — simplified, period-aware KPI cards
// ============================================================
async function ownerDashboard(
  db: D1Database, user: SessionUser, lang: Lang, period: string
): Promise<string> {

  const company = await db.prepare('SELECT name, settings FROM companies WHERE id=?')
    .bind(user.company_id).first<any>();
  const settings = JSON.parse(company?.settings || '{}');
  const purchasePricePerGb: number = settings.purchase_price_per_gb ?? 0;

  const pf  = periodDateFilter(period);          // snapshot_time filter
  const pfP = periodDateFilter(period, 'payment_date'); // payment_date filter
  const pfE = periodDateFilter(period, 'expense_date');

  // ── Parallel queries ──────────────────────────────────────
  const [slsPeriod, invBatch, alloc, expTotal, payTotal, sellers, branches] = await Promise.all([

    // 1. Sales in period
    db.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(gross_amount),0) as gross,
             COALESCE(SUM(commission_amount),0) as comm,
             COUNT(*) as cnt
      FROM sales WHERE company_id=? ${pf}`)
      .bind(user.company_id).first<any>(),

    // 2. Inventory (all-time stock — period-independent)
    db.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(purchase_cost),0) as purchase_cost
      FROM inventory_batches WHERE company_id=?`)
      .bind(user.company_id).first<any>(),

    // 3. Allocations all-time (for stockGb calc)
    db.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(total_gross),0) as gross
      FROM allocation_batches WHERE company_id=?`)
      .bind(user.company_id).first<any>(),

    // 4. Company expenses in period
    db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total FROM expenses
      WHERE company_id=? AND (seller_id IS NULL OR seller_id=0) ${pfE}`)
      .bind(user.company_id).first<{total:number}>(),

    // 5. Payments received in period
    db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total FROM payments
      WHERE company_id=? ${pfP}`)
      .bind(user.company_id).first<{total:number}>(),

    // 6. Per-seller summary (all-time debt)
    db.prepare(`
      SELECT u.id, u.full_name, u.commission_rate,
        COALESCE(SUM(s.total_gb),0) as sold_gb,
        COALESCE(SUM(s.gross_amount),0) as gross,
        COALESCE(SUM(s.commission_amount),0) as comm,
        COUNT(s.id) as tx_count,
        COALESCE((SELECT SUM(amount) FROM payments p WHERE p.seller_id=u.id AND p.company_id=u.company_id),0) as paid,
        COALESCE((SELECT SUM(total_gross) FROM allocation_batches ab WHERE ab.seller_id=u.id AND ab.company_id=u.company_id),0) as alloc_value
      FROM users u
      LEFT JOIN sales s ON s.seller_id=u.id AND s.company_id=u.company_id
      WHERE u.company_id=? AND u.role='seller' AND u.active=1
      GROUP BY u.id ORDER BY sold_gb DESC`)
      .bind(user.company_id).all<any>(),

    // 7. Branch breakdown in period
    db.prepare(`
      SELECT b.name,
        COALESCE(SUM(s.total_gb),0) as sold_gb,
        COALESCE(SUM(s.gross_amount),0) as gross,
        COALESCE(SUM(s.net_amount),0) as net,
        COUNT(DISTINCT s.seller_id) as sellers
      FROM branches b
      LEFT JOIN sales s ON s.branch_id=b.id AND s.company_id=b.company_id
        ${period==='today' ? "AND date(s.snapshot_time)=date('now')"
        : period==='week'  ? "AND s.snapshot_time>=datetime('now','-7 days')"
        : period==='month' ? "AND s.snapshot_time>=datetime('now','-30 days')"
        : period==='year'  ? "AND s.snapshot_time>=datetime('now','-365 days')"
        : ''}
      WHERE b.company_id=?
      GROUP BY b.id, b.name ORDER BY sold_gb DESC`)
      .bind(user.company_id).all<any>(),
  ]);

  // ── Derived values ────────────────────────────────────────
  const soldGb          = slsPeriod?.gb ?? 0;
  const totalStock      = invBatch?.gb ?? 0;
  const allocGb         = alloc?.gb ?? 0;
  const purchaseCost    = invBatch?.purchase_cost ?? 0;
  const stockRemaining  = Math.max(0, totalStock - allocGb);

  const allocPurchaseCost = purchasePricePerGb > 0
    ? Math.round(allocGb * purchasePricePerGb * 100) / 100
    : purchaseCost > 0 && invBatch?.gb > 0
      ? Math.round((allocGb / (invBatch?.gb || 1)) * purchaseCost * 100) / 100
      : 0;

  const totalExpenses      = expTotal?.total ?? 0;
  const totalPaidBySellers = payTotal?.total ?? 0;
  const availableCapital   = totalPaidBySellers - allocPurchaseCost - totalExpenses;

  // ── Seller rows ───────────────────────────────────────────
  const sellerRows = (sellers.results||[]).map((s: any) => {
    const debt = s.alloc_value - s.comm - s.paid;
    const debtHtml = debt > 0
      ? `<span style="color:var(--danger);font-weight:600">${formatMoney(debt)}</span>`
      : debt < 0
      ? `<span style="color:var(--success);font-weight:600">+${formatMoney(Math.abs(debt))}</span>`
      : `<span style="color:var(--text-muted)">تسویه</span>`;
    return `<tr>
      <td><strong>${s.full_name}</strong></td>
      <td><span class="badge badge-info">${Math.round(s.commission_rate*100)}%</span></td>
      <td class="text-primary">${formatGB(s.sold_gb)}</td>
      <td>${formatMoney(s.alloc_value)}</td>
      <td class="text-success">${formatMoney(s.paid)}</td>
      <td>${debtHtml}</td>
      <td><a href="/payments?seller_id=${s.id}" class="btn btn-outline btn-sm">💰</a></td>
    </tr>`;
  }).join('');

  // ── Branch rows ───────────────────────────────────────────
  const branchRows = (branches.results||[]).filter((b:any)=>b.sold_gb>0).map((b: any) => `
    <tr>
      <td><strong>${b.name}</strong></td>
      <td class="text-primary">${formatGB(b.sold_gb)}</td>
      <td>${formatMoney(b.gross)}</td>
      <td class="text-success">${formatMoney(b.net)}</td>
      <td style="color:var(--text-muted)">${b.sellers}</td>
    </tr>`).join('');

  const pl = periodLabel(period);

  return `
  <!-- Page Header -->
  <div class="page-header">
    <div>
      <div class="page-title">📊 ${t(lang,'dashboard')}</div>
      <div class="page-subtitle">${company?.name ?? ''} · ${pl}</div>
    </div>
    <div class="btn-group">
      <a href="/reports" class="btn btn-outline btn-sm">📋 گزارش</a>
      <a href="/inventory/add" class="btn btn-primary btn-sm">+ موجودی</a>
    </div>
  </div>

  <!-- Period Filter -->
  <div style="margin-bottom:1.25rem;display:flex;gap:.4rem;flex-wrap:wrap">
    ${periodBtns(period)}
  </div>

  <!-- 6 KPI Cards -->
  <div class="stats-grid" style="margin-bottom:1.25rem">

    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--primary)"></div>
      <div class="stat-label">📦 موجودی انبار</div>
      <div class="stat-value primary">${formatGB(totalStock)}</div>
      <div class="stat-sub">${formatGB(stockRemaining)} باقی‌مانده</div>
    </div>

    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-label">🔀 تخصیص داده شده</div>
      <div class="stat-value" style="color:#7c3aed">${formatGB(allocGb)}</div>
      <div class="stat-sub">${formatMoney(alloc?.gross ?? 0)} ارزش</div>
    </div>

    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">📤 فروش · ${pl}</div>
      <div class="stat-value success">${formatGB(soldGb)}</div>
      <div class="stat-sub">${slsPeriod?.cnt ?? 0} معامله · ${formatMoney(slsPeriod?.gross ?? 0)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-card-accent" style="background:#0891b2"></div>
      <div class="stat-label">💰 دریافتی · ${pl}</div>
      <div class="stat-value" style="color:#0891b2">${formatMoney(totalPaidBySellers)}</div>
      <div class="stat-sub">از فروشندگان</div>
    </div>

    <div class="stat-card">
      <div class="stat-card-accent" style="background:#f97316"></div>
      <div class="stat-label">💸 مصارف · ${pl}</div>
      <div class="stat-value" style="color:#f97316">${formatMoney(totalExpenses)}</div>
      <div class="stat-sub"><a href="/expenses" style="color:var(--primary);font-size:.75rem">مدیریت →</a></div>
    </div>

    <div class="stat-card" style="background:${availableCapital>=0?'linear-gradient(135deg,#dcfce7,var(--bg-secondary))':'linear-gradient(135deg,#fee2e2,var(--bg-secondary))'}">
      <div class="stat-card-accent" style="background:${availableCapital>=0?'var(--success)':'var(--danger)'}"></div>
      <div class="stat-label">💎 سرمایه موجود</div>
      <div class="stat-value" style="color:${availableCapital>=0?'var(--success)':'var(--danger)'}">${formatMoney(availableCapital)}</div>
      <div class="stat-sub">دریافتی − خرید − مصارف</div>
    </div>

  </div>

  <!-- Seller Performance -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">👥 عملکرد فروشندگان</div>
      <a href="/users" class="btn btn-outline btn-sm">مدیریت</a>
    </div>
    ${(sellers.results||[]).length ? `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>فروشنده</th>
          <th>نرخ</th>
          <th>فروش (GB)</th>
          <th>ارزش تخصیص</th>
          <th>پرداختی</th>
          <th>بدهی / اعتبار</th>
          <th></th>
        </tr></thead>
        <tbody>${sellerRows}</tbody>
      </table>
    </div>` : `<div class="empty-state"><div class="empty-state-icon">👥</div><h3>${t(lang,'no_data')}</h3></div>`}
  </div>

  ${branchRows ? `
  <!-- Branch Breakdown -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">🏢 عملکرد شعبه‌ها · ${pl}</div>
    </div>
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>شعبه</th>
          <th>فروش (GB)</th>
          <th>ناخالص</th>
          <th>خالص</th>
          <th>فروشندگان</th>
        </tr></thead>
        <tbody>${branchRows}</tbody>
      </table>
    </div>
  </div>` : ''}

  <!-- Formula Strip (bottom) -->
  <div class="formula-strip">
    <div class="formula-strip-group">
      <span style="color:#94a3b8;font-size:.7rem">ناخالص فروش</span>
      <span style="color:#e2e8f0;font-weight:700">${formatMoney(slsPeriod?.gross ?? 0)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">کمیسیون</span>
      <span style="color:#fbbf24;font-weight:700">${formatMoney(slsPeriod?.comm ?? 0)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">پول خرید</span>
      <span style="color:#f97316;font-weight:700">${formatMoney(allocPurchaseCost)}</span>
      <span class="formula-strip-sep">=</span>
      <span style="color:#94a3b8;font-size:.7rem">سود خالص</span>
      <span style="color:${(slsPeriod?.gross??0)-(slsPeriod?.comm??0)-allocPurchaseCost>=0?'#34d399':'#f87171'};font-weight:700;font-size:.95rem">${formatMoney((slsPeriod?.gross??0)-(slsPeriod?.comm??0)-allocPurchaseCost)}</span>
    </div>
    <div class="formula-strip-divider"></div>
    <div class="formula-strip-group">
      <span style="color:#94a3b8;font-size:.7rem">دریافتی</span>
      <span style="color:#34d399;font-weight:700">${formatMoney(totalPaidBySellers)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">خرید + مصارف</span>
      <span style="color:#f97316;font-weight:700">${formatMoney(allocPurchaseCost + totalExpenses)}</span>
      <span class="formula-strip-sep">=</span>
      <span style="color:#94a3b8;font-size:.7rem">سرمایه موجود</span>
      <span style="color:${availableCapital>=0?'#34d399':'#f87171'};font-weight:700;font-size:.95rem">${formatMoney(availableCapital)}</span>
    </div>
  </div>
  `;
}

// ============================================================
// SELLER DASHBOARD — simplified, default period = today
// ============================================================
async function sellerDashboard(
  db: D1Database, user: SessionUser, lang: Lang, period: string
): Promise<string> {

  const pf  = periodDateFilter(period);
  const pfP = periodDateFilter(period, 'payment_date');

  const [
    soldPeriod,
    soldAll,
    paidAll,
    allocTotals,
    recentSales,
    recentPayments,
    allocRemaining,
    chart7,
  ] = await Promise.all([

    // 1. Sales in period
    db.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(gross_amount),0) as gross,
             COALESCE(SUM(commission_amount),0) as comm,
             COUNT(*) as cnt
      FROM sales s WHERE s.company_id=? AND s.seller_id=? ${pf}`)
      .bind(user.company_id, user.id).first<any>(),

    // 2. All-time sales totals (for GB balance)
    db.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(commission_amount),0) as comm
      FROM sales WHERE company_id=? AND seller_id=?`)
      .bind(user.company_id, user.id).first<any>(),

    // 3. All-time payments (for debt calc)
    db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
      FROM payments WHERE company_id=? AND seller_id=?`)
      .bind(user.company_id, user.id).first<any>(),

    // 4. Allocation totals (all-time)
    db.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(total_gross),0) as gross
      FROM allocation_batches WHERE company_id=? AND seller_id=?`)
      .bind(user.company_id, user.id).first<any>(),

    // 5. Recent sales (last 10)
    db.prepare(`
      SELECT s.id, s.snapshot_time, s.quantity, s.total_gb,
             s.gross_amount, s.commission_amount,
             p.name as pkg_name, b.name as branch_name
      FROM sales s
      JOIN packages p ON p.id=s.package_id
      JOIN branches b ON b.id=s.branch_id
      WHERE s.company_id=? AND s.seller_id=?
      ORDER BY s.snapshot_time DESC LIMIT 10`)
      .bind(user.company_id, user.id).all<any>(),

    // 6. Recent payments (last 8)
    db.prepare(`
      SELECT p.id, p.payment_date, p.type, p.amount, p.notes
      FROM payments p
      WHERE p.company_id=? AND p.seller_id=?
      ORDER BY p.payment_date DESC, p.created_at DESC LIMIT 8`)
      .bind(user.company_id, user.id).all<any>(),

    // 7. Remaining GB
    db.prepare(`
      SELECT
        COALESCE((SELECT SUM(total_gb) FROM allocation_batches WHERE company_id=? AND seller_id=?),0)
        - COALESCE((SELECT SUM(total_gb) FROM sales WHERE company_id=? AND seller_id=?),0)
        as remaining_gb`)
      .bind(user.company_id, user.id, user.company_id, user.id).first<{remaining_gb:number}>(),

    // 8. Last 7 days chart
    db.prepare(`
      SELECT strftime('%Y-%m-%d', snapshot_time) as day,
             COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(commission_amount),0) as comm
      FROM sales WHERE company_id=? AND seller_id=?
        AND snapshot_time >= datetime('now','-6 days','start of day')
      GROUP BY day ORDER BY day ASC`)
      .bind(user.company_id, user.id).all<any>(),
  ]);

  // ── Derived ──────────────────────────────────────────────
  const allTimeComm  = soldAll?.comm ?? 0;
  const totalPaid    = paidAll?.total ?? 0;
  const allocValue   = allocTotals?.gross ?? 0;
  const debt         = allocValue - allTimeComm - totalPaid;
  const remainingGb  = Math.max(0, allocRemaining?.remaining_gb ?? 0);
  const pl           = periodLabel(period);

  // ── Balance style ─────────────────────────────────────────
  const balColor = debt > 0 ? 'var(--danger)' : debt < 0 ? 'var(--success)' : 'var(--text-muted)';
  const balSign  = debt <= 0 ? '+' : '−';
  const balLabel = debt > 0 ? '⚠️ بدهی به مالک' : debt < 0 ? '✅ مالک بدهکار شماست' : '✓ تسویه';

  // ── Chart data ────────────────────────────────────────────
  const days7: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days7.push(d.toISOString().split('T')[0]);
  }
  const cmap        = Object.fromEntries((chart7.results||[]).map((r:any)=>[r.day,r]));
  const chartLabels = JSON.stringify(days7.map(d=>new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})));
  const chartGb     = JSON.stringify(days7.map(d=>Math.round((cmap[d]?.gb??0)*100)/100));
  const chartComm   = JSON.stringify(days7.map(d=>Math.round(cmap[d]?.comm??0)));

  // ── Sale rows ─────────────────────────────────────────────
  const saleRows = (recentSales.results||[]).map((s:any)=>`
    <tr>
      <td style="font-size:.82rem">${fdate(s.snapshot_time)}</td>
      <td style="font-size:.82rem">${s.branch_name}</td>
      <td><strong style="font-size:.82rem">${s.pkg_name}</strong></td>
      <td class="text-center">${s.quantity}</td>
      <td class="text-primary">${formatGB(s.total_gb)}</td>
      <td class="text-warning">${formatMoney(s.commission_amount)}</td>
      <td>
        <a href="/sales/${s.id}/edit" class="btn btn-outline btn-sm">✏️</a>
      </td>
    </tr>`).join('');

  // ── Payment rows ──────────────────────────────────────────
  const payRows = (recentPayments.results||[]).map((p:any)=>`
    <tr>
      <td style="font-size:.82rem">${fdate(p.payment_date)}</td>
      <td><span class="badge ${
        p.type==='commission'?'badge-success':p.type==='advance'?'badge-warning':'badge-info'
      }" style="font-size:.7rem">${p.type}</span></td>
      <td class="text-danger">−${formatMoney(p.amount)}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${p.notes||'—'}</td>
    </tr>`).join('');

  return `
  <!-- Page Header -->
  <div class="page-header">
    <div>
      <div class="page-title">👋 ${user.full_name}</div>
      <div class="page-subtitle">داشبورد فروشنده · ${pl}</div>
    </div>
    <a href="/sales/add" class="btn btn-primary">+ ثبت فروش</a>
  </div>

  <!-- Period Filter -->
  <div style="margin-bottom:1.25rem;display:flex;gap:.4rem;flex-wrap:wrap">
    ${periodBtns(period)}
  </div>

  <!-- 4 KPI Cards -->
  <div class="stats-grid" style="margin-bottom:1.25rem">

    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-label">📦 موجودی قابل فروش</div>
      <div class="stat-value" style="color:#7c3aed">${formatGB(remainingGb)}</div>
      <div class="stat-sub">از ${formatGB(allocTotals?.gb??0)} تخصیص</div>
    </div>

    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">📤 فروش · ${pl}</div>
      <div class="stat-value success">${formatGB(soldPeriod?.gb??0)}</div>
      <div class="stat-sub">${soldPeriod?.cnt??0} معامله · ${formatMoney(soldPeriod?.gross??0)}</div>
    </div>

    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--warning)"></div>
      <div class="stat-label">🏷 کمیسیون · ${pl}</div>
      <div class="stat-value warning">${formatMoney(soldPeriod?.comm??0)}</div>
      <div class="stat-sub">کل کمیسیون: ${formatMoney(allTimeComm)}</div>
    </div>

    <div class="stat-card" style="${debt>0?'background:linear-gradient(135deg,#fee2e2,var(--bg-secondary))':debt<0?'background:linear-gradient(135deg,#dcfce7,var(--bg-secondary))':''}">
      <div class="stat-card-accent" style="background:${balColor}"></div>
      <div class="stat-label">⚖️ بدهی / اعتبار</div>
      <div class="stat-value" style="color:${balColor}">${balSign}${formatMoney(Math.abs(debt))}</div>
      <div class="stat-sub">${balLabel}</div>
    </div>

  </div>

  <!-- Chart 7 days + Recent Payments (two-column) -->
  <div class="grid-chart-trend" style="margin-bottom:1rem">

    <!-- Chart -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">📈 فروش ۷ روز اخیر</div>
        <div style="font-size:.72rem;color:var(--text-muted)">
          <span style="color:var(--primary)">● GB</span>
          <span style="color:var(--warning);margin-right:.75rem">● کمیسیون</span>
        </div>
      </div>
      <div style="padding:.75rem 1rem 1rem">
        <canvas id="sellerChart" height="145"></canvas>
      </div>
    </div>

    <!-- Recent Payments -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">💳 پرداختی‌های اخیر</div>
        <a href="/payments" class="btn btn-outline btn-sm">همه →</a>
      </div>
      ${(recentPayments.results||[]).length ? `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>تاریخ</th><th>نوع</th><th>مبلغ</th><th>یادداشت</th></tr></thead>
          <tbody>${payRows}</tbody>
        </table>
      </div>
      <div style="padding:.5rem 1rem;font-size:.78rem;color:var(--text-muted);border-top:1px solid var(--border)">
        جمع پرداختی: <strong style="color:var(--success)">${formatMoney(totalPaid)}</strong>
      </div>` : `
      <div class="empty-state" style="padding:2rem">
        <div class="empty-state-icon">💳</div>
        <p style="font-size:.82rem">هنوز پرداختی ثبت نشده</p>
        <a href="/payments" class="btn btn-primary btn-sm" style="margin-top:.75rem">+ ثبت پرداختی</a>
      </div>`}
    </div>

  </div>

  <!-- Recent Sales -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">💰 فروش‌های اخیر
        <span class="badge badge-primary" style="margin-right:.4rem;font-size:.7rem">${(recentSales.results||[]).length}</span>
      </div>
      <a href="/sales" class="btn btn-outline btn-sm">همه فروش‌ها →</a>
    </div>
    ${(recentSales.results||[]).length ? `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>تاریخ</th><th>شعبه</th><th>پکیج</th>
          <th style="text-align:center">تعداد</th><th>GB</th><th>کمیشن</th><th></th>
        </tr></thead>
        <tbody>${saleRows}</tbody>
      </table>
    </div>` : `
    <div class="empty-state" style="padding:2rem">
      <div class="empty-state-icon">💰</div>
      <p>هنوز فروشی ثبت نشده</p>
      <a href="/sales/add" class="btn btn-primary" style="margin-top:.75rem">+ ثبت اولین فروش</a>
    </div>`}
  </div>

  <!-- Formula Banner (bottom) -->
  <div class="formula-banner">
    <div style="color:#a5b4fc;font-size:.72rem;font-weight:600;margin-bottom:.5rem">📊 خلاصه کل</div>
    <div class="formula-banner-inner">
      <div class="formula-item">
        <div class="formula-label">ارزش تخصیص</div>
        <div class="formula-value" style="color:#e2e8f0">${formatMoney(allocValue)}</div>
      </div>
      <span class="formula-sep">−</span>
      <div class="formula-item">
        <div class="formula-label">کمیشن کسبی</div>
        <div class="formula-value" style="color:#fbbf24">${formatMoney(allTimeComm)}</div>
      </div>
      <span class="formula-sep">−</span>
      <div class="formula-item">
        <div class="formula-label">پرداختی به مالک</div>
        <div class="formula-value" style="color:#34d399">${formatMoney(totalPaid)}</div>
      </div>
      <span class="formula-sep">=</span>
      <div class="formula-item">
        <div class="formula-label">${debt>0?'بدهی به مالک':'مالک بدهکار'}</div>
        <div class="formula-value" style="color:${balColor};font-size:1.05rem">${balSign}${formatMoney(Math.abs(debt))}</div>
      </div>
      <div class="formula-divider"></div>
      <div class="formula-item">
        <div class="formula-label">تخصیص شده</div>
        <div class="formula-value" style="color:#818cf8">${formatGB(allocTotals?.gb??0)}</div>
      </div>
      <span class="formula-sep">→</span>
      <div class="formula-item">
        <div class="formula-label">باقی‌مانده</div>
        <div class="formula-value" style="color:#4ade80">${formatGB(remainingGb)}</div>
      </div>
    </div>
  </div>

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
  (function(){
    const ctx = document.getElementById('sellerChart');
    if(!ctx) return;
    new Chart(ctx,{
      type:'bar',
      data:{
        labels:${chartLabels},
        datasets:[
          {
            label:'GB فروخته',
            data:${chartGb},
            backgroundColor:'rgba(99,102,241,.55)',
            borderColor:'var(--primary)',
            borderWidth:1.5,
            borderRadius:4,
            yAxisID:'y'
          },
          {
            label:'کمیسیون ؋',
            data:${chartComm},
            type:'line',
            borderColor:'var(--warning)',
            backgroundColor:'transparent',
            borderWidth:2,
            pointRadius:3,
            tension:.4,
            yAxisID:'y2'
          }
        ]
      },
      options:{
        responsive:true,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:false},
          tooltip:{callbacks:{
            label:c=>c.dataset.yAxisID==='y'?' '+c.parsed.y.toFixed(1)+' GB':' ؋'+Math.round(c.parsed.y).toLocaleString()
          }}
        },
        scales:{
          x:{grid:{color:'rgba(148,163,184,.08)'},ticks:{color:'var(--text-muted)',font:{size:10}}},
          y:{position:'left',grid:{color:'rgba(148,163,184,.08)'},ticks:{color:'var(--primary)',font:{size:10},callback:v=>v+' GB'}},
          y2:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'var(--warning)',font:{size:10},callback:v=>'؋'+Math.round(v).toLocaleString()}}
        }
      }
    });
  })();
  </script>`;
}

// ============================================================
// INVESTOR / FINANCIAL DASHBOARD — simplified, period-aware
// ============================================================
async function investorDashboard(
  db: D1Database, user: SessionUser, lang: Lang, period: string
): Promise<string> {

  const pfA = periodDateFilter(period, 'ab.created_at');
  const pfP = periodDateFilter(period, 'payment_date');

  const company = await db.prepare('SELECT name, settings FROM companies WHERE id=?')
    .bind(user.company_id).first<any>();
  const settings = JSON.parse(company?.settings || '{}');
  const purchasePricePerGb: number = settings.purchase_price_per_gb ?? 0;

  const [allocPeriod, payPeriod, expRow, sellerStats, chart7Pay, monthly6, monthly6Pay] = await Promise.all([

    // 1. Allocations in period
    db.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(total_gross),0) as gross,
             COALESCE(SUM(total_commission),0) as comm,
             COALESCE(SUM(total_net),0) as net
      FROM allocation_batches ab WHERE company_id=? ${pfA}`)
      .bind(user.company_id).first<any>(),

    // 2. Payments received in period
    db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total
      FROM payments WHERE company_id=? ${pfP}`)
      .bind(user.company_id).first<{total:number}>(),

    // 3. Company expenses (all-time for capital)
    db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total FROM expenses
      WHERE company_id=? AND (seller_id IS NULL OR seller_id=0)`)
      .bind(user.company_id).first<{total:number}>(),

    // 4. Per-seller (all-time debt)
    db.prepare(`
      SELECT u.id as seller_id, u.full_name, u.commission_rate,
             COALESCE(ab.total_gb,0) as total_gb,
             COALESCE(ab.total_gross,0) as total_gross,
             COALESCE(ab.total_commission,0) as total_commission,
             COALESCE(ab.total_net,0) as total_net,
             COALESCE(p.total_paid,0) as total_paid
      FROM users u
      LEFT JOIN (
        SELECT seller_id, SUM(total_gb) as total_gb, SUM(total_gross) as total_gross,
               SUM(total_commission) as total_commission, SUM(total_net) as total_net
        FROM allocation_batches WHERE company_id=? GROUP BY seller_id
      ) ab ON ab.seller_id=u.id
      LEFT JOIN (
        SELECT seller_id, SUM(amount) as total_paid
        FROM payments WHERE company_id=? GROUP BY seller_id
      ) p ON p.seller_id=u.id
      WHERE u.company_id=? AND u.role='seller' AND u.active=1
        AND (ab.total_gb IS NOT NULL OR p.total_paid IS NOT NULL)
      ORDER BY ab.total_gb DESC`)
      .bind(user.company_id, user.company_id, user.company_id).all<any>(),

    // 5. 7-day payments chart
    db.prepare(`
      SELECT date(payment_date) as day, COALESCE(SUM(amount),0) as total
      FROM payments WHERE company_id=?
        AND payment_date >= date('now','-6 days')
      GROUP BY day ORDER BY day ASC`)
      .bind(user.company_id).all<any>(),

    // 6. 6-month allocation trend
    db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month,
             COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(total_net),0) as net
      FROM allocation_batches WHERE company_id=?
      GROUP BY month ORDER BY month DESC LIMIT 6`)
      .bind(user.company_id).all<any>(),

    // 7. 6-month payments
    db.prepare(`
      SELECT strftime('%Y-%m', payment_date) as month,
             COALESCE(SUM(amount),0) as paid
      FROM payments WHERE company_id=?
      GROUP BY month ORDER BY month DESC LIMIT 6`)
      .bind(user.company_id).all<any>(),
  ]);

  // ── Derived ──────────────────────────────────────────────
  const totalGb         = allocPeriod?.gb ?? 0;
  const totalGross      = allocPeriod?.gross ?? 0;
  const totalCommission = allocPeriod?.comm ?? 0;
  const totalNet        = allocPeriod?.net ?? 0;
  const totalPaid       = payPeriod?.total ?? 0;
  const totalExpenses   = expRow?.total ?? 0;
  const purchaseCost    = Math.round(totalGb * purchasePricePerGb * 100) / 100;
  const ownerNetProfit  = totalGross - totalCommission - purchaseCost;
  const availableCapital= totalPaid - purchaseCost - totalExpenses;
  const pl              = periodLabel(period);

  // ── Seller rows ───────────────────────────────────────────
  const sellerRows = (sellerStats.results||[]).map((s:any)=>{
    const remaining = (s.total_net??0) - (s.total_paid??0);
    const pct = s.total_net > 0 ? Math.min(100, Math.round((s.total_paid/s.total_net)*100)) : 0;
    const rc  = remaining > 0 ? 'var(--danger)' : remaining < 0 ? 'var(--success)' : 'var(--text-muted)';
    return `<tr>
      <td><strong>${s.full_name}</strong></td>
      <td class="text-primary">${formatGB(s.total_gb)}</td>
      <td class="text-warning">−${formatMoney(s.total_commission)}</td>
      <td style="color:#0891b2">${formatMoney(s.total_net)}</td>
      <td class="text-success">${formatMoney(s.total_paid)}</td>
      <td style="color:${rc};font-weight:600">${formatMoney(Math.abs(remaining))}
        <span style="font-size:.68rem;color:var(--text-muted)">${remaining>0?'(بدهی)':remaining<0?'(اضافه)':'(تسویه)'}</span>
      </td>
      <td>
        <div style="background:var(--bg-secondary);border-radius:99px;height:6px;width:60px;overflow:hidden;display:inline-block">
          <div style="background:${pct>=100?'var(--success)':'var(--primary)'};height:100%;width:${pct}%"></div>
        </div>
        <span style="font-size:.68rem;color:var(--text-muted);margin-right:.3rem">${pct}%</span>
      </td>
      <td><a href="/ledger/seller/${s.seller_id}" class="btn btn-outline btn-sm">📒</a></td>
    </tr>`;
  }).join('');

  // ── 6-month table rows ────────────────────────────────────
  const payByMonth: Record<string,number> = Object.fromEntries(
    (monthly6Pay.results||[]).map((r:any)=>[r.month, r.paid])
  );
  const monthlyRows = (monthly6.results||[]).map((m:any)=>{
    const paid = payByMonth[m.month]??0;
    return `<tr>
      <td class="font-bold" style="font-size:.8rem">${m.month}</td>
      <td class="text-primary">${formatGB(m.gb)}</td>
      <td style="color:#0891b2">${formatMoney(m.net)}</td>
      <td class="text-success">${formatMoney(paid)}</td>
    </tr>`;
  }).join('');

  // ── Chart data ────────────────────────────────────────────
  const days7: string[] = [];
  for (let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);days7.push(d.toISOString().split('T')[0]);}
  const cmap = Object.fromEntries((chart7Pay.results||[]).map((r:any)=>[r.day,r]));
  const chartLabels7 = JSON.stringify(days7.map(d=>new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})));
  const chartPayData = JSON.stringify(days7.map(d=>Math.round(cmap[d]?.total??0)));

  return `
  <!-- Page Header -->
  <div class="page-header">
    <div>
      <div class="page-title">💼 داشبورد مالی</div>
      <div class="page-subtitle">${company?.name??''} · ${pl}</div>
    </div>
    <div class="btn-group">
      <a href="/dashboard?mode=owner" class="btn btn-outline btn-sm">📊 حالت مالک</a>
      <a href="/payments" class="btn btn-outline btn-sm">💰 دریافتی‌ها</a>
    </div>
  </div>

  <!-- Period Filter -->
  <div style="margin-bottom:1.25rem;display:flex;gap:.4rem;flex-wrap:wrap">
    ${periodBtns(period, '/dashboard?mode=financial')}
  </div>

  <!-- 4 KPI Cards -->
  <div class="stats-grid" style="margin-bottom:1.25rem">

    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-label">📦 تخصیص · ${pl}</div>
      <div class="stat-value" style="color:#7c3aed">${formatGB(totalGb)}</div>
      <div class="stat-sub">${formatMoney(totalGross)} ناخالص</div>
    </div>

    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">✅ دریافتی · ${pl}</div>
      <div class="stat-value success">${formatMoney(totalPaid)}</div>
      <div class="stat-sub">از فروشندگان</div>
    </div>

    <div class="stat-card">
      <div class="stat-card-accent" style="background:#f97316"></div>
      <div class="stat-label">💸 مصارف (کل)</div>
      <div class="stat-value" style="color:#f97316">${formatMoney(totalExpenses)}</div>
      <div class="stat-sub"><a href="/expenses" style="color:var(--primary);font-size:.75rem">مدیریت →</a></div>
    </div>

    <div class="stat-card" style="background:${availableCapital>=0?'linear-gradient(135deg,#dcfce7,var(--bg-secondary))':'linear-gradient(135deg,#fee2e2,var(--bg-secondary))'}">
      <div class="stat-card-accent" style="background:${availableCapital>=0?'var(--success)':'var(--danger)'}"></div>
      <div class="stat-label">💎 سرمایه موجود</div>
      <div class="stat-value" style="color:${availableCapital>=0?'var(--success)':'var(--danger)'}">${formatMoney(availableCapital)}</div>
      <div class="stat-sub">دریافتی − خرید − مصارف</div>
    </div>

  </div>

  <!-- Chart + 6-month trend -->
  <div class="grid-chart-trend" style="margin-bottom:1rem">

    <div class="card">
      <div class="card-header">
        <div class="card-title">📈 دریافتی‌ها — ۷ روز اخیر</div>
      </div>
      <div style="padding:.75rem 1rem 1rem">
        <canvas id="invChart" height="140"></canvas>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">📅 روند ۶ ماهه</div>
        <span style="font-size:.72rem;color:var(--text-muted)">تخصیص / دریافتی</span>
      </div>
      ${(monthly6.results||[]).length ? `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>ماه</th><th>GB</th><th>خالص بدهی</th><th>دریافتی</th></tr></thead>
          <tbody>${monthlyRows}</tbody>
        </table>
      </div>` : `<div class="empty-state" style="padding:2rem"><div class="empty-state-icon">📅</div><h3>هنوز داده‌ای نیست</h3></div>`}
    </div>

  </div>

  <!-- Per-seller table -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">👥 وضعیت مالی فروشندگان</div>
      <a href="/ledger" class="btn btn-outline btn-sm">📒 دفتر کل</a>
    </div>
    ${(sellerStats.results||[]).length ? `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>فروشنده</th><th>GB تخصیص</th><th>کمیسیون</th>
          <th>خالص بدهی</th><th>دریافتی</th><th>باقی‌مانده</th>
          <th>پیشرفت</th><th></th>
        </tr></thead>
        <tbody>${sellerRows}</tbody>
      </table>
    </div>` : `<div class="empty-state"><div class="empty-state-icon">👥</div><h3>هنوز تخصیصی ثبت نشده</h3></div>`}
  </div>

  <!-- Formula Strip (bottom) -->
  <div class="formula-strip">
    <div class="formula-strip-group">
      <span style="color:#94a3b8;font-size:.7rem">ناخالص · ${pl}</span>
      <span style="color:#e2e8f0;font-weight:700">${formatMoney(totalGross)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">کمیسیون</span>
      <span style="color:#fbbf24;font-weight:700">${formatMoney(totalCommission)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">خرید</span>
      <span style="color:#f97316;font-weight:700">${formatMoney(purchaseCost)}</span>
      <span class="formula-strip-sep">=</span>
      <span style="color:#94a3b8;font-size:.7rem">سود خالص</span>
      <span style="color:${ownerNetProfit>=0?'#34d399':'#f87171'};font-weight:700">${formatMoney(ownerNetProfit)}</span>
    </div>
    <div class="formula-strip-divider"></div>
    <div class="formula-strip-group">
      <span style="color:#94a3b8;font-size:.7rem">دریافتی</span>
      <span style="color:#34d399;font-weight:700">${formatMoney(totalPaid)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">خرید + مصارف</span>
      <span style="color:#f97316;font-weight:700">${formatMoney(purchaseCost + totalExpenses)}</span>
      <span class="formula-strip-sep">=</span>
      <span style="color:#94a3b8;font-size:.7rem">سرمایه موجود</span>
      <span style="color:${availableCapital>=0?'#34d399':'#f87171'};font-weight:700">${formatMoney(availableCapital)}</span>
    </div>
  </div>

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
  (function(){
    const ctx=document.getElementById('invChart');
    if(!ctx) return;
    new Chart(ctx,{
      type:'bar',
      data:{
        labels:${chartLabels7},
        datasets:[{
          label:'دریافتی',
          data:${chartPayData},
          backgroundColor:'rgba(52,211,153,.55)',
          borderColor:'#10b981',
          borderWidth:1.5,
          borderRadius:5
        }]
      },
      options:{
        responsive:true,
        plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' ؋'+Math.round(c.parsed.y).toLocaleString()}}},
        scales:{
          x:{grid:{color:'rgba(148,163,184,.08)'},ticks:{color:'var(--text-muted)',font:{size:10}}},
          y:{grid:{color:'rgba(148,163,184,.08)'},ticks:{color:'#10b981',font:{size:10},callback:v=>'؋'+Math.round(v).toLocaleString()}}
        }
      }
    });
  })();
  </script>`;
}


// ---- Router ----
dashboard.get('/', async (c) => {
  const user   = c.get('user');
  const lang   = c.get('lang');
  const period = c.req.query('period') ?? 'today';   // ← default = today
  const mode   = c.req.query('mode') ?? '';

  let bodyHtml: string;
  if (user.role === 'owner') {
    const company = await c.env.DB.prepare('SELECT settings FROM companies WHERE id=?')
      .bind(user.company_id).first<{settings:string}>();
    const settings  = JSON.parse(company?.settings || '{}');
    const dashMode  = mode || settings.dashboard_mode || 'owner';

    if (dashMode === 'financial') {
      bodyHtml = await investorDashboard(c.env.DB, user, lang, period);
    } else {
      bodyHtml = await ownerDashboard(c.env.DB, user, lang, period);
    }
  } else {
    bodyHtml = await sellerDashboard(c.env.DB, user, lang, period);
  }

  return c.html(pageShell({
    title: t(lang, 'dashboard'),
    lang, user,
    body: bodyHtml,
    activePage: 'dashboard'
  }));
});

export default dashboard;
