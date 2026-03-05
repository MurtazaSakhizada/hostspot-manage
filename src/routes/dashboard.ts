// ============================================
// Dashboard Routes - Owner & Seller
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

// ============================================================
// OWNER DASHBOARD
// Formula:
//   Net Profit = Gross Revenue - Commissions - Purchase Cost
//   Available Capital = Net Profit - Total Expenses
// ============================================================
async function ownerDashboard(db: D1Database, user: SessionUser, lang: Lang): Promise<string> {

  // ── Company purchase price ───────────────────────────────
  const company = await db.prepare('SELECT name, settings FROM companies WHERE id=?')
    .bind(user.company_id).first<any>();
  const settings = JSON.parse(company?.settings || '{}');
  const purchasePricePerGb: number = settings.purchase_price_per_gb ?? 0;

  // ── Sales totals ─────────────────────────────────────────
  const sls = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb,
           COALESCE(SUM(gross_amount),0) as gross,
           COALESCE(SUM(commission_amount),0) as comm,
           COALESCE(SUM(net_amount),0) as net,
           COUNT(*) as cnt
    FROM sales WHERE company_id=?`).bind(user.company_id).first<any>();

  // ── Inventory totals ─────────────────────────────────────
  const invBatch = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb,
           COALESCE(SUM(total_gross),0) as gross,
           COALESCE(SUM(purchase_cost),0) as purchase_cost
    FROM inventory_batches WHERE company_id=?`).bind(user.company_id).first<any>();

  // ── Allocations ──────────────────────────────────────────
  const alloc = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb,
           COALESCE(SUM(gross_amount),0) as gross
    FROM allocations WHERE company_id=?`).bind(user.company_id).first<any>();

  // ── Expenses ─────────────────────────────────────────────
  const expTotal = await db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE company_id=?`)
    .bind(user.company_id).first<{total:number}>();

  // ── Payments (paid to sellers) ───────────────────────────
  const payTotal = await db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE company_id=?`)
    .bind(user.company_id).first<{total:number}>();

  // ── Formula calculations ──────────────────────────────────
  const grossRevenue    = sls?.gross ?? 0;
  const totalComm       = sls?.comm  ?? 0;
  // Purchase cost: from inventory_batches (recorded at entry time)
  const purchaseCost    = invBatch?.purchase_cost ?? 0;
  // If no purchase cost in batches yet, calculate from total GB × company price
  const effectivePurchaseCost = purchaseCost > 0
    ? purchaseCost
    : (purchasePricePerGb > 0 ? (invBatch?.gb ?? 0) * purchasePricePerGb : 0);

  // Net Profit = Gross Revenue - Commissions - Purchase Cost (of sold stock)
  // We calculate purchase cost of SOLD GB (not all inventory)
  const soldGb = sls?.gb ?? 0;
  const soldPurchaseCost = purchasePricePerGb > 0
    ? soldGb * purchasePricePerGb
    : (invBatch?.gb > 0 && invBatch?.purchase_cost > 0
      ? (soldGb / (invBatch?.gb || 1)) * purchaseCost
      : 0);
  const netProfit = grossRevenue - totalComm - soldPurchaseCost;

  // Available Capital = Net Profit - Expenses
  const totalExpenses   = expTotal?.total ?? 0;
  const availableCapital = netProfit - totalExpenses;

  // Stock value remaining
  const stockGb = (invBatch?.gb ?? 0) - soldGb;
  const stockValue = purchasePricePerGb > 0 ? stockGb * purchasePricePerGb : 0;

  // ── Branch drill-down ────────────────────────────────────
  const branches = await db.prepare(`
    SELECT b.id, b.name,
      COALESCE(SUM(s.total_gb),0) as sold_gb,
      COALESCE(SUM(s.gross_amount),0) as gross,
      COALESCE(SUM(s.commission_amount),0) as comm,
      COALESCE(SUM(s.net_amount),0) as net,
      COUNT(DISTINCT s.seller_id) as sellers
    FROM branches b
    LEFT JOIN sales s ON s.branch_id=b.id AND s.company_id=b.company_id
    WHERE b.company_id=?
    GROUP BY b.id, b.name ORDER BY sold_gb DESC`).bind(user.company_id).all<any>();

  // ── Per seller (includes allocation value for debt calculation) ──────────
  const sellers = await db.prepare(`
    SELECT u.id, u.full_name, u.commission_rate,
      COALESCE(SUM(s.total_gb),0) as sold_gb,
      COALESCE(SUM(s.gross_amount),0) as gross,
      COALESCE(SUM(s.commission_amount),0) as comm,
      COALESCE(SUM(s.net_amount),0) as net,
      COUNT(s.id) as tx_count,
      COALESCE((SELECT SUM(amount) FROM payments p WHERE p.seller_id=u.id AND p.company_id=u.company_id),0) as paid,
      COALESCE((SELECT SUM(total_gross) FROM allocation_batches ab WHERE ab.seller_id=u.id AND ab.company_id=u.company_id),0) as alloc_value
    FROM users u
    LEFT JOIN sales s ON s.seller_id=u.id AND s.company_id=u.company_id
    WHERE u.company_id=? AND u.role='seller' AND u.active=1
    GROUP BY u.id, u.full_name, u.commission_rate ORDER BY sold_gb DESC`)
    .bind(user.company_id).all<any>();

  // ── Monthly trend (last 6 months) ───────────────────────
  const monthly = await db.prepare(`
    SELECT strftime('%Y-%m', snapshot_time) as month,
      COALESCE(SUM(total_gb),0) as gb,
      COALESCE(SUM(gross_amount),0) as gross,
      COALESCE(SUM(commission_amount),0) as comm,
      COALESCE(SUM(net_amount),0) as net
    FROM sales WHERE company_id=?
    GROUP BY month ORDER BY month DESC LIMIT 6`).bind(user.company_id).all<any>();

  // ── Recent expenses ──────────────────────────────────────
  const recentExp = await db.prepare(`
    SELECT category, title, amount, expense_date
    FROM expenses WHERE company_id=?
    ORDER BY expense_date DESC, created_at DESC LIMIT 5`)
    .bind(user.company_id).all<any>();

  // ── Chart labels (last 7 days) ────────────────────────────
  const chart7 = await db.prepare(`
    SELECT strftime('%Y-%m-%d', snapshot_time) as day,
      COALESCE(SUM(gross_amount),0) as rev,
      COALESCE(SUM(net_amount),0) as net,
      COUNT(*) as cnt
    FROM sales WHERE company_id=? AND snapshot_time >= datetime('now','-7 days')
    GROUP BY day ORDER BY day ASC`).bind(user.company_id).all<any>();

  const days7: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days7.push(d.toISOString().split('T')[0]);
  }
  const chartMap7 = Object.fromEntries((chart7.results||[]).map((r:any)=>[r.day,r]));
  const chartLabels = JSON.stringify(days7.map(d=>new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})));
  const chartGross = JSON.stringify(days7.map(d=>Math.round(chartMap7[d]?.rev??0)));
  const chartNet   = JSON.stringify(days7.map(d=>Math.round(chartMap7[d]?.net??0)));
  const chartCnt   = JSON.stringify(days7.map(d=>chartMap7[d]?.cnt??0));

  // ── HTML building ─────────────────────────────────────────
  const sellerRows = (sellers.results||[]).map((s: any) => {
    // debt = alloc_value - commission_earned - paid_to_seller
    // debt > 0 → seller still owes owner; debt <= 0 → owner owes seller (overpaid)
    const debt = s.alloc_value - s.comm - s.paid;
    const debtLabel = debt > 0
      ? `<span style="color:var(--danger)">بدهی: ${formatMoney(debt)}</span>`
      : debt < 0
      ? `<span style="color:var(--success)">طلب: ${formatMoney(Math.abs(debt))}</span>`
      : `<span style="color:var(--text-muted)">تسویه</span>`;
    return `
    <tr>
      <td><strong>${s.full_name}</strong></td>
      <td><span class="badge badge-info">${Math.round(s.commission_rate*100)}%</span></td>
      <td class="text-primary font-bold">${formatGB(s.sold_gb)}</td>
      <td>${formatMoney(s.gross)}</td>
      <td class="text-warning">${formatMoney(s.comm)}</td>
      <td style="color:#0891b2">${formatMoney(s.alloc_value)}</td>
      <td class="text-success font-bold">${formatMoney(s.paid)}</td>
      <td>${s.tx_count}</td>
      <td style="font-weight:600">${debtLabel}</td>
    </tr>`;
  }).join('');

  const branchRows = (branches.results||[]).map((b: any, i: number) => `
    <tr>
      <td><strong>${b.name}</strong></td>
      <td class="text-primary font-bold">${formatGB(b.sold_gb)}</td>
      <td>${formatMoney(b.gross)}</td>
      <td class="text-warning">${formatMoney(b.comm)}</td>
      <td class="text-success font-bold">${formatMoney(b.net)}</td>
      <td>${b.sellers}</td>
    </tr>`).join('');

  const monthlyRows = (monthly.results||[]).map((m: any) => `
    <div class="summary-row">
      <span class="summary-label">${m.month}</span>
      <span class="summary-value gb">${formatGB(m.gb)}</span>
      <span class="summary-value money">${formatMoney(m.net)}</span>
    </div>`).join('');

  const expRows = (recentExp.results||[]).map((e:any) => `
    <div class="summary-row">
      <span class="summary-label">${e.title}</span>
      <span style="font-size:.78rem;color:var(--text-muted)">${e.expense_date}</span>
      <span class="summary-value" style="color:var(--danger)">−${formatMoney(e.amount)}</span>
    </div>`).join('');

  const purchasePriceNote = purchasePricePerGb > 0
    ? `<div style="font-size:.78rem;color:var(--text-muted);margin-top:.2rem">@ ${formatMoney(purchasePricePerGb)}/GB</div>`
    : `<div style="font-size:.75rem;color:var(--warning);margin-top:.2rem">⚠️ <a href="/settings" style="color:var(--warning)">Set purchase price</a></div>`;

  return `
  <div class="page-header">
    <div>
      <div class="page-title">📊 ${t(lang,'dashboard')}</div>
      <div class="page-subtitle">${company?.name ?? ''} · همه وقت</div>
    </div>
    <div class="btn-group">
      <a href="/reports" class="btn btn-outline btn-sm">📋 ${t(lang,'reports')}</a>
      <a href="/inventory/add" class="btn btn-primary btn-sm">+ ${t(lang,'add_inventory')}</a>
    </div>
  </div>

  <!-- PROFIT FORMULA BANNER -->
  <div style="background:linear-gradient(135deg,var(--primary-dark,#312e81),#1e1b4b);border-radius:12px;padding:1rem 1.25rem;margin-bottom:1.25rem;display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center">
    <div style="color:#a5b4fc;font-size:.78rem;font-weight:600;white-space:nowrap">💡 فرمول سود</div>
    <div style="flex:1;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;font-size:.875rem">
      <span style="color:#f1f5f9">${formatMoney(grossRevenue)}</span>
      <span style="color:#94a3b8">فروش کل</span>
      <span style="color:#94a3b8">−</span>
      <span style="color:#fbbf24">${formatMoney(totalComm)}</span>
      <span style="color:#94a3b8">کمیشن</span>
      <span style="color:#94a3b8">−</span>
      <span style="color:#f87171">${formatMoney(soldPurchaseCost)}</span>
      <span style="color:#94a3b8">قیمت خرید</span>
      <span style="color:#94a3b8">=</span>
      <span style="color:#4ade80;font-weight:700;font-size:1rem">${formatMoney(netProfit)}</span>
      <span style="color:#4ade80">سود خالص</span>
      <span style="color:#94a3b8">−</span>
      <span style="color:#fb923c">${formatMoney(totalExpenses)}</span>
      <span style="color:#94a3b8">مصارف</span>
      <span style="color:#94a3b8">=</span>
      <span style="color:${availableCapital>=0?'#34d399':'#f87171'};font-weight:700;font-size:1rem">${formatMoney(availableCapital)}</span>
      <span style="color:${availableCapital>=0?'#34d399':'#f87171'}">سرمایه موجود</span>
    </div>
  </div>

  <!-- PRIMARY KPIs -->
  <div class="stats-grid" style="margin-bottom:1.25rem">
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--primary)"></div>
      <div class="stat-label">مجموع GB موجودی</div>
      <div class="stat-value primary">${formatGB(invBatch?.gb ?? 0)}</div>
      <div class="stat-sub">${formatGB(stockGb)} باقی‌مانده</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-label">GB تخصیص یافته</div>
      <div class="stat-value" style="color:#7c3aed">${formatGB(alloc?.gb ?? 0)}</div>
      <div class="stat-sub">به فروشندگان</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">GB فروخته شده</div>
      <div class="stat-value success">${formatGB(soldGb)}</div>
      <div class="stat-sub">${sls?.cnt ?? 0} تراکنش</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#0891b2"></div>
      <div class="stat-label">درآمد ناخالص</div>
      <div class="stat-value" style="color:#0891b2">${formatMoney(grossRevenue)}</div>
      <div class="stat-sub">قبل از کسورات</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--warning)"></div>
      <div class="stat-label">کمیشن‌ها</div>
      <div class="stat-value warning">${formatMoney(totalComm)}</div>
      <div class="stat-sub">پرداخت به فروشندگان</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--danger)"></div>
      <div class="stat-label">قیمت خرید</div>
      <div class="stat-value" style="color:var(--danger)">${formatMoney(soldPurchaseCost)}</div>
      ${purchasePriceNote}
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">سود خالص</div>
      <div class="stat-value success large">${formatMoney(netProfit)}</div>
      <div class="stat-sub">بعد از کمیشن + خرید</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#f97316"></div>
      <div class="stat-label">مجموع مصارف</div>
      <div class="stat-value" style="color:#f97316">${formatMoney(totalExpenses)}</div>
      <div class="stat-sub"><a href="/expenses" style="color:var(--primary);font-size:.75rem">مدیریت →</a></div>
    </div>
    <div class="stat-card" style="background:${availableCapital>=0?'linear-gradient(135deg,var(--success-light,#dcfce7),var(--bg-secondary))':'linear-gradient(135deg,#fee2e2,var(--bg-secondary))'}">
      <div class="stat-card-accent" style="background:${availableCapital>=0?'var(--success)':'var(--danger)'}"></div>
      <div class="stat-label">💎 سرمایه موجود</div>
      <div class="stat-value" style="color:${availableCapital>=0?'var(--success)':'var(--danger)'};font-size:1.35rem">${formatMoney(availableCapital)}</div>
      <div class="stat-sub">سود خالص − مصارف</div>
    </div>
  </div>

  <!-- Charts + Activity -->
  <div style="display:grid;grid-template-columns:1fr 300px;gap:1rem;margin-bottom:1.5rem">
    <div class="card">
      <div class="card-header">
        <div class="card-title">📈 درآمد — ۷ روز اخیر</div>
        <div style="display:flex;gap:.75rem;font-size:.72rem;color:var(--text-muted)">
          <span style="color:var(--primary)">● ناخالص</span>
          <span style="color:var(--success)">● خالص</span>
        </div>
      </div>
      <canvas id="revChart" height="120"></canvas>
    </div>
    <div class="card" style="overflow:hidden">
      <div class="card-header">
        <div class="card-title">💸 مصارف اخیر</div>
        <a href="/expenses" class="btn btn-outline btn-sm">همه →</a>
      </div>
      ${expRows || `<div class="empty-state" style="padding:1.5rem"><div class="empty-state-icon">💸</div><h3>No expenses</h3></div>`}
      ${totalExpenses>0?`<div style="padding:.75rem 1rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-weight:600">
        <span>مجموع</span><span style="color:var(--danger)">${formatMoney(totalExpenses)}</span>
      </div>`:''}
    </div>
  </div>

  <!-- Branch Breakdown -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">🏢 ${t(lang,'by_branch')}</div>
    </div>
    ${(branches.results||[]).length ? `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>${t(lang,'branch')}</th>
          <th>GB فروخته</th>
          <th>ناخالص</th>
          <th>کمیشن</th>
          <th>خالص</th>
          <th>فروشندگان</th>
        </tr></thead>
        <tbody>${branchRows}</tbody>
      </table>
    </div>` : `<div class="empty-state"><div class="empty-state-icon">🏢</div><h3>${t(lang,'no_data')}</h3></div>`}
  </div>

  <!-- Seller Performance -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">👥 عملکرد فروشندگان</div>
      <a href="/users" class="btn btn-outline btn-sm">مدیریت →</a>
    </div>
    ${(sellers.results||[]).length ? `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>فروشنده</th>
          <th>نرخ کمیشن</th>
          <th>GB فروخته</th>
          <th>مجموع فروش</th>
          <th>کمیشن</th>
          <th>ارزش تخصیص</th>
          <th>پرداخت شده</th>
          <th>تعداد</th>
          <th>مانده بدهی</th>
        </tr></thead>
        <tbody>${sellerRows}</tbody>
      </table>
    </div>` : `<div class="empty-state"><div class="empty-state-icon">👥</div><h3>${t(lang,'no_data')}</h3></div>`}
  </div>

  <!-- Monthly Trend -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">📅 روند ماهانه (۶ ماه اخیر)</div>
    </div>
    <div style="padding:.875rem">
      ${monthlyRows || `<div class="empty-state"><div class="empty-state-icon">📅</div><h3>${t(lang,'no_data')}</h3></div>`}
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
  const ctx7 = document.getElementById('revChart');
  if(ctx7) {
    new Chart(ctx7, {
      type:'bar',
      data:{
        labels:${chartLabels},
        datasets:[
          {label:'ناخالص',data:${chartGross},backgroundColor:'rgba(99,102,241,.55)',borderColor:'var(--primary)',borderWidth:1.5,borderRadius:4},
          {label:'خالص',data:${chartNet},backgroundColor:'rgba(34,197,94,.45)',borderColor:'var(--success)',borderWidth:1.5,borderRadius:4}
        ]
      },
      options:{
        responsive:true,interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false}},
        scales:{
          x:{grid:{color:'var(--border)'},ticks:{color:'var(--text-muted)',font:{size:10}}},
          y:{grid:{color:'var(--border)'},ticks:{color:'var(--text-muted)',font:{size:10},callback:v=>'؋'+Math.round(v).toLocaleString()}}
        }
      }
    });
  }
  </script>`;
}

// ============================================================
// SELLER DASHBOARD - Full rebuild with bug fixes
// ============================================================
async function sellerDashboard(db: D1Database, user: SessionUser, lang: Lang, period: string): Promise<string> {

  // ── Date filter for selected period ────────────────────────
  let dateFilter = '';
  if (period === 'today') dateFilter = `AND date(s.snapshot_time) = date('now')`;
  else if (period === 'week')  dateFilter = `AND s.snapshot_time >= datetime('now','-7 days')`;
  else if (period === 'month') dateFilter = `AND s.snapshot_time >= datetime('now','-30 days')`;
  else if (period === 'year')  dateFilter = `AND s.snapshot_time >= datetime('now','-365 days')`;

  // ── Run all queries in parallel ──────────────────────────
  const [
    soldPeriod,
    soldAll,
    paidRow,
    allocTotals,
    recentSales,
    recentAllocs,
    recentPayments,
    allocRemaining,
    monthlySales,
    chart7,
    paymentsByType,
    personalExpenses,
    recentPersonalExp,
  ] = await Promise.all([

    // 1. Sales in selected period
    db.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(gross_amount),0) as gross,
             COALESCE(SUM(commission_amount),0) as comm,
             COALESCE(SUM(net_amount),0) as net,
             COUNT(*) as cnt
      FROM sales s WHERE s.company_id=? AND s.seller_id=? ${dateFilter}`)
      .bind(user.company_id, user.id).first<any>(),

    // 2. All-time totals
    db.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(gross_amount),0) as gross,
             COALESCE(SUM(commission_amount),0) as comm,
             COUNT(*) as cnt
      FROM sales WHERE company_id=? AND seller_id=?`)
      .bind(user.company_id, user.id).first<any>(),

    // 3. Total payments made by seller to owner (all-time)
    db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
      FROM payments WHERE company_id=? AND seller_id=?`)
      .bind(user.company_id, user.id).first<any>(),

    // 4. Allocation totals (all-time GB allocated)
    db.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(total_gross),0) as gross,
             COUNT(*) as batches
      FROM allocation_batches WHERE company_id=? AND seller_id=?`)
      .bind(user.company_id, user.id).first<any>(),

    // 5. Recent sales (last 20) with package + branch name
    db.prepare(`
      SELECT s.id, s.snapshot_time, s.quantity, s.total_gb,
             s.gross_amount, s.commission_amount, s.net_amount,
             s.commission_rate, s.notes,
             p.name as pkg_name, p.size_gb,
             b.name as branch_name
      FROM sales s
      JOIN packages p ON p.id = s.package_id
      JOIN branches b ON b.id = s.branch_id
      WHERE s.company_id=? AND s.seller_id=?
      ORDER BY s.snapshot_time DESC LIMIT 20`)
      .bind(user.company_id, user.id).all<any>(),

    // 6. Recent allocations (last 10)
    db.prepare(`
      SELECT ab.id, ab.created_at, ab.total_gb, ab.total_gross,
             ab.commission_rate, ab.notes,
             br.name as branch_name
      FROM allocation_batches ab
      JOIN branches br ON br.id = ab.branch_id
      WHERE ab.company_id=? AND ab.seller_id=?
      ORDER BY ab.created_at DESC LIMIT 10`)
      .bind(user.company_id, user.id).all<any>(),

    // 7. Recent payments (last 10)
    db.prepare(`
      SELECT p.id, p.payment_date, p.type, p.amount, p.notes,
             b.name as branch_name
      FROM payments p
      LEFT JOIN branches b ON b.id = p.branch_id
      WHERE p.company_id=? AND p.seller_id=?
      ORDER BY p.payment_date DESC, p.created_at DESC LIMIT 10`)
      .bind(user.company_id, user.id).all<any>(),

    // 8. Remaining inventory (allocated GB − sold GB)
    db.prepare(`
      SELECT
        COALESCE((SELECT SUM(total_gb) FROM allocation_batches WHERE company_id=? AND seller_id=?),0)
        - COALESCE((SELECT SUM(total_gb) FROM sales WHERE company_id=? AND seller_id=?),0)
        as remaining_gb`)
      .bind(user.company_id, user.id, user.company_id, user.id).first<{remaining_gb:number}>(),

    // 9. Monthly sales trend (last 6 months)
    db.prepare(`
      SELECT strftime('%Y-%m', snapshot_time) as month,
             COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(gross_amount),0) as gross,
             COALESCE(SUM(commission_amount),0) as comm,
             COUNT(*) as cnt
      FROM sales WHERE company_id=? AND seller_id=?
      GROUP BY month ORDER BY month DESC LIMIT 6`)
      .bind(user.company_id, user.id).all<any>(),

    // 10. Last 7 days chart data
    db.prepare(`
      SELECT strftime('%Y-%m-%d', snapshot_time) as day,
             COALESCE(SUM(total_gb),0) as gb,
             COALESCE(SUM(gross_amount),0) as gross,
             COALESCE(SUM(commission_amount),0) as comm,
             COUNT(*) as cnt
      FROM sales WHERE company_id=? AND seller_id=?
        AND snapshot_time >= datetime('now','-6 days','start of day')
      GROUP BY day ORDER BY day ASC`)
      .bind(user.company_id, user.id).all<any>(),

    // 11. Payments breakdown by type
    db.prepare(`
      SELECT type, COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
      FROM payments WHERE company_id=? AND seller_id=?
      GROUP BY type ORDER BY total DESC`)
      .bind(user.company_id, user.id).all<any>(),

    // 12. Seller personal expenses (seller_id = user.id, does NOT affect debt)
    db.prepare(`
      SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
      FROM expenses WHERE company_id=? AND seller_id=?`)
      .bind(user.company_id, user.id).first<any>(),

    // 13. Recent personal expenses (last 5)
    db.prepare(`
      SELECT category, title, amount, expense_date
      FROM expenses WHERE company_id=? AND seller_id=?
      ORDER BY expense_date DESC, created_at DESC LIMIT 5`)
      .bind(user.company_id, user.id).all<any>(),
  ]);

  // ── Derived values ────────────────────────────────────────
  const allTimeComm  = soldAll?.comm  ?? 0;
  const allTimeGb    = soldAll?.gb    ?? 0;
  const totalPaid    = paidRow?.total ?? 0;
  const allocValue   = allocTotals?.gross ?? 0; // total value of stock given to seller
  // بدهی فروشنده = ارزش تخصیص − کمیسیون کسب‌شده − پرداخت‌های انجام‌شده توسط فروشنده
  // debt > 0 means seller still owes owner; debt < 0 means owner overpaid
  const debt         = allocValue - allTimeComm - totalPaid;
  const remainingGb  = Math.max(0, allocRemaining?.remaining_gb ?? 0);
  // Personal expenses: tracking only, NOT part of debt calculation
  const personalExpTotal = personalExpenses?.total ?? 0;
  const personalExpCnt   = personalExpenses?.cnt   ?? 0;

  // ── Chart: last 7 days ────────────────────────────────────
  const days7: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days7.push(d.toISOString().split('T')[0]);
  }
  const chartMap = Object.fromEntries((chart7.results || []).map((r: any) => [r.day, r]));
  const chartLabels = JSON.stringify(days7.map(d =>
    new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })));
  const chartGb   = JSON.stringify(days7.map(d => Math.round((chartMap[d]?.gb   ?? 0) * 100) / 100));
  const chartGross = JSON.stringify(days7.map(d => Math.round(chartMap[d]?.gross ?? 0)));
  const chartComm  = JSON.stringify(days7.map(d => Math.round(chartMap[d]?.comm  ?? 0)));
  const chartCnt   = JSON.stringify(days7.map(d => chartMap[d]?.cnt ?? 0));

  // ── Period label ──────────────────────────────────────────
  const periodLabel = period === 'today' ? 'امروز'
    : period === 'week'  ? 'این هفته'
    : period === 'month' ? 'این ماه'
    : period === 'year'  ? 'امسال'
    : 'همه وقت';

  // ── Period selector buttons ───────────────────────────────
  const periodBtns = ['today','week','month','year','all'].map(p => `
    <a href="/dashboard?period=${p}"
       class="btn btn-sm ${period === p ? 'btn-primary' : 'btn-outline'}"
       style="white-space:nowrap">${
         p === 'today' ? '📅 امروز'
       : p === 'week'  ? '📅 این هفته'
       : p === 'month' ? '📅 این ماه'
       : p === 'year'  ? '📅 امسال'
       :                 '📅 همه وقت'
    }</a>`).join('');

  // ── Helper: format date ───────────────────────────────────
  function fdate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function ftime(d: string) {
    return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  // ── Sale rows ─────────────────────────────────────────────
  const saleRows = (recentSales.results || []).map((s: any, i: number) => `
    <tr>
      <td>
        <div class="font-bold" style="font-size:.85rem">${fdate(s.snapshot_time)}</div>
        <div style="font-size:.7rem;color:var(--text-muted)">${ftime(s.snapshot_time)}</div>
      </td>
      <td>
        <span style="font-size:.82rem">${s.branch_name}</span>
      </td>
      <td>
        <div class="font-bold" style="font-size:.82rem">${s.pkg_name}</div>
        <span class="badge badge-primary" style="font-size:.68rem">${s.size_gb} GB</span>
      </td>
      <td class="text-center font-bold">${s.quantity}</td>
      <td class="text-primary font-bold">${formatGB(s.total_gb)}</td>
      <td style="color:#0891b2">${formatMoney(s.gross_amount)}</td>
      <td class="text-warning font-bold">${formatMoney(s.commission_amount)}</td>
      <td style="font-size:.75rem;color:var(--text-muted)">${Math.round(s.commission_rate * 100)}%</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${s.notes || '—'}</td>
    </tr>`).join('');

  // ── Allocation rows ───────────────────────────────────────
  const allocRows = (recentAllocs.results || []).map((a: any) => `
    <tr>
      <td>
        <div style="font-size:.82rem">${fdate(a.created_at)}</div>
        <div style="font-size:.7rem;color:var(--text-muted)">${ftime(a.created_at)}</div>
      </td>
      <td><span style="font-size:.82rem">${a.branch_name}</span></td>
      <td class="text-primary font-bold">${formatGB(a.total_gb)}</td>
      <td style="color:#0891b2">${formatMoney(a.total_gross)}</td>
      <td><span class="badge badge-info" style="font-size:.7rem">${Math.round(a.commission_rate * 100)}%</span></td>
      <td style="font-size:.78rem;color:var(--text-muted)">${a.notes || '—'}</td>
    </tr>`).join('');

  // ── Payment rows ──────────────────────────────────────────
  const paymentRows = (recentPayments.results || []).map((p: any) => `
    <tr>
      <td><div style="font-size:.82rem">${fdate(p.payment_date)}</div></td>
      <td>
        <span class="badge ${
          p.type === 'commission'  ? 'badge-success' :
          p.type === 'advance'     ? 'badge-warning' :
          p.type === 'settlement'  ? 'badge-info'    : 'badge-primary'
        }" style="font-size:.72rem">${
          p.type === 'commission' ? 'کمیشن' :
          p.type === 'advance'    ? 'پیش‌پرداخت' :
          p.type === 'settlement' ? 'تسویه' : p.type
        }</span>
      </td>
      <td style="font-size:.82rem">${p.branch_name || '—'}</td>
      <td class="font-bold" style="color:var(--danger)">−${formatMoney(p.amount)}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${p.notes || '—'}</td>
    </tr>`).join('');

  // ── Personal expenses rows ────────────────────────────────
  const personalExpRows = (recentPersonalExp.results || []).map((e: any) => `
    <tr>
      <td style="font-size:.82rem">${fdate(e.expense_date)}</td>
      <td>
        <span class="badge" style="background:#f43f5e22;color:#f43f5e;border:1px solid #f43f5e44;font-size:.72rem">
          ${e.category === 'rent' ? '🏠 کرایه' :
            e.category === 'salary' ? '👤 معاش' :
            e.category === 'utilities' ? '💡 برق/آب' :
            e.category === 'maintenance' ? '🔧 ترمیم' :
            e.category === 'transport' ? '🚗 ترانسپورت' :
            e.category === 'general' ? '📋 عمومی' : '➕ سایر'}
        </span>
      </td>
      <td style="font-size:.82rem">${e.title}</td>
      <td class="font-bold" style="color:#f43f5e">−${formatMoney(e.amount)}</td>
    </tr>`).join('');

  // ── Monthly trend rows ────────────────────────────────────
  const monthlyRows = (monthlySales.results || []).map((m: any) => `
    <tr>
      <td class="font-bold">${m.month}</td>
      <td class="text-primary">${formatGB(m.gb)}</td>
      <td style="color:#0891b2">${formatMoney(m.gross)}</td>
      <td class="text-warning">${formatMoney(m.comm)}</td>
      <td style="font-size:.8rem;color:var(--text-muted);text-align:center">${m.cnt}</td>
    </tr>`).join('');

  // ── Balance card style (debt > 0 = seller owes owner; debt < 0 = owner owes seller) ──────
  const balance = debt; // alias for template
  // debt > 0 → seller still owes money to owner (shown in red as debt)
  // debt < 0 → owner owes money to seller (shown in green as receivable)
  const balanceColor  = debt > 0  ? 'var(--danger)'  : debt < 0 ? 'var(--success)' : 'var(--text-muted)';
  const balanceBg     = debt > 0  ? 'linear-gradient(135deg,#fee2e2,var(--bg-secondary))'
                      : debt < 0  ? 'linear-gradient(135deg,#dcfce7,var(--bg-secondary))'
                      : '';
  const balanceLabel  = debt > 0  ? '⚠️ بدهی به مالک'
                      : debt < 0  ? '✅ مالک بدهکار شماست'
                      : '✓ تسویه';
  const balanceSign   = debt > 0 ? '−' : '+';

  return `
  <!-- Page Header -->
  <div class="page-header">
    <div>
      <div class="page-title">👋 ${user.full_name}</div>
      <div class="page-subtitle">داشبورد فروشنده · ${periodLabel}</div>
    </div>
    <a href="/sales/add" class="btn btn-primary">
      <span style="font-size:1.1rem">+</span> ثبت فروش
    </a>
  </div>

  <!-- Period Filter -->
  <div style="margin-bottom:1.25rem;display:flex;gap:.4rem;flex-wrap:wrap">
    ${periodBtns}
  </div>

  <!-- ══════════════════════════════════════════
       ROW 1 – KPI CARDS (6 cards)
  ══════════════════════════════════════════ -->
  <div class="stats-grid" style="margin-bottom:1.25rem">

    <!-- GB Remaining (available to sell) -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-label">📦 GB موجود</div>
      <div class="stat-value" style="color:#7c3aed">${formatGB(remainingGb)}</div>
      <div class="stat-sub">تخصیص − فروخته (کل)</div>
    </div>

    <!-- GB Sold in period -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">📤 GB فروخته</div>
      <div class="stat-value success">${formatGB(soldPeriod?.gb ?? 0)}</div>
      <div class="stat-sub">${soldPeriod?.cnt ?? 0} تراکنش · ${periodLabel}</div>
    </div>

    <!-- Gross Revenue in period -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#0891b2"></div>
      <div class="stat-label">💵 درآمد کل</div>
      <div class="stat-value" style="color:#0891b2">${formatMoney(soldPeriod?.gross ?? 0)}</div>
      <div class="stat-sub">${periodLabel}</div>
    </div>

    <!-- Commission in period -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--warning)"></div>
      <div class="stat-label">🏷 کمیشن کسب شده</div>
      <div class="stat-value warning">${formatMoney(soldPeriod?.comm ?? 0)}</div>
      <div class="stat-sub">کل: ${formatMoney(allTimeComm)}</div>
    </div>

    <!-- Total Paid by Seller to Owner -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--primary)"></div>
      <div class="stat-label">💳 مجموع پرداختی</div>
      <div class="stat-value primary">${formatMoney(totalPaid)}</div>
      <div class="stat-sub">${paidRow?.cnt ?? 0} پرداخت به سیستم</div>
    </div>

    <!-- Debt/Balance card -->
    <div class="stat-card" style="${balanceBg ? `background:${balanceBg}` : ''}">
      <div class="stat-card-accent" style="background:${balanceColor}"></div>
      <div class="stat-label">⚖️ بدهی / مانده حساب</div>
      <div class="stat-value" style="color:${balanceColor}">${balanceSign}${formatMoney(Math.abs(debt))}</div>
      <div class="stat-sub">${balanceLabel}</div>
    </div>

    <!-- Personal Expenses card (tracking only, NOT affecting debt) -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#f43f5e"></div>
      <div class="stat-label">💸 مصارف شخصی</div>
      <div class="stat-value" style="color:#f43f5e">${formatMoney(personalExpTotal)}</div>
      <div class="stat-sub">${personalExpCnt} مصرف · <a href="/expenses" style="color:var(--primary)">مشاهده →</a></div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════
       ROW 2 – CHART + MONTHLY TREND
  ══════════════════════════════════════════ -->
  <div style="display:grid;grid-template-columns:1fr 340px;gap:1rem;margin-bottom:1rem">

    <!-- Chart: Last 7 days -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">📈 فروش‌های من — ۷ روز اخیر</div>
        <div style="display:flex;gap:1rem;font-size:.72rem;color:var(--text-muted)">
          <span style="color:var(--primary)">● GB فروخته</span>
          <span style="color:var(--warning)">● کمیشن</span>
          <span style="color:#0891b2">● کل</span>
        </div>
      </div>
      <div style="padding:.75rem 1rem 1rem">
        <canvas id="sellerChart" height="140"></canvas>
      </div>
    </div>

    <!-- Monthly Trend -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">📅 Monthly Trend</div>
        <span style="font-size:.72rem;color:var(--text-muted)">Last 6 months</span>
      </div>
      ${(monthlySales.results || []).length ? `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>GB</th>
              <th>Gross</th>
              <th>Comm.</th>
              <th style="text-align:center">Txns</th>
            </tr>
          </thead>
          <tbody>${monthlyRows}</tbody>
        </table>
      </div>` : `
      <div class="empty-state" style="padding:2rem">
        <div class="empty-state-icon">📅</div>
        <h3>No monthly data yet</h3>
      </div>`}
    </div>
  </div>

  <!-- ══════════════════════════════════════════
       ROW 3 – RECENT SALES TABLE (full width)
  ══════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">💰 فروش‌های اخیر
        <span class="badge badge-primary" style="margin-left:.5rem;font-size:.72rem">${(recentSales.results||[]).length}</span>
      </div>
      <a href="/sales" class="btn btn-outline btn-sm">همه فروش‌ها →</a>
    </div>
    ${(recentSales.results || []).length ? `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>تاریخ / وقت</th>
            <th>شعبه</th>
            <th>پکیج</th>
            <th style="text-align:center">تعداد</th>
            <th>GB</th>
            <th>درآمد کل</th>
            <th>کمیشن</th>
            <th>نرخ</th>
            <th>یادداشت</th>
          </tr>
        </thead>
        <tbody>${saleRows}</tbody>
      </table>
    </div>
    <div style="padding:.75rem 1rem;border-top:1px solid var(--border);display:flex;gap:2rem;font-size:.82rem;flex-wrap:wrap">
      <span>GB کل فروخته: <strong class="text-primary">${formatGB(allTimeGb)}</strong></span>
      <span>درآمد کل: <strong style="color:#0891b2">${formatMoney(soldPeriod?.gross??0)}</strong></span>
      <span>کمیشن: <strong class="text-warning">${formatMoney(soldPeriod?.comm??0)}</strong></span>
    </div>` : `
    <div class="empty-state" style="padding:2.5rem">
      <div class="empty-state-icon">💰</div>
      <h3>هنوز فروشی ثبت نشده</h3>
      <p>فروش‌های خود را ثبت کنید.</p>
      <a href="/sales/add" class="btn btn-primary">+ ثبت اولین فروش</a>
    </div>`}
  </div>

  <!-- ══════════════════════════════════════════
       ROW 4 – ALLOCATIONS + PAYMENTS
  ══════════════════════════════════════════ -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">

    <!-- Allocations -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">🔀 Stock Allocations
          <span class="badge badge-info" style="margin-left:.5rem;font-size:.72rem">${allocTotals?.batches ?? 0}</span>
        </div>
        <a href="/allocations" class="btn btn-outline btn-sm">View All →</a>
      </div>
      <div style="padding:.5rem 1rem;background:var(--bg-tertiary,var(--bg-secondary));display:flex;gap:2rem;font-size:.82rem;border-bottom:1px solid var(--border)">
        <span>Total Allocated: <strong class="text-primary">${formatGB(allocTotals?.gb ?? 0)}</strong></span>
        <span>Remaining: <strong style="color:#7c3aed">${formatGB(remainingGb)}</strong></span>
      </div>
      ${(recentAllocs.results || []).length ? `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>شعبه</th>
              <th>گیگابایت</th>
              <th>ارزش</th>
              <th>نرخ</th>
              <th>یادداشت</th>
            </tr>
          </thead>
          <tbody>${allocRows}</tbody>
        </table>
      </div>` : `
      <div class="empty-state" style="padding:1.5rem">
        <div class="empty-state-icon">🔀</div>
        <h3>هنوز تخصیصی ثبت نشده</h3>
      </div>`}
    </div>

    <!-- Payments -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">💳 پرداخت‌های فروشنده به سیستم
          <span class="badge badge-success" style="margin-left:.5rem;font-size:.72rem">${paidRow?.cnt ?? 0}</span>
        </div>
        <a href="/payments" class="btn btn-outline btn-sm">همه پرداخت‌ها →</a>
      </div>
      <div style="padding:.5rem 1rem;background:var(--bg-tertiary,var(--bg-secondary));display:flex;gap:2rem;font-size:.82rem;border-bottom:1px solid var(--border)">
        <span>ارزش تخصیص: <strong style="color:#0891b2">${formatMoney(allocValue)}</strong></span>
        <span>کمیشن: <strong class="text-warning">${formatMoney(allTimeComm)}</strong></span>
        <span>پرداختی: <strong class="text-success">${formatMoney(totalPaid)}</strong></span>
        <span>بدهی: <strong style="color:${balanceColor}">${balanceSign}${formatMoney(Math.abs(debt))}</strong></span>
      </div>
      ${(recentPayments.results || []).length ? `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>تاریخ</th>
              <th>نوع</th>
              <th>شعبه</th>
              <th>مبلغ</th>
              <th>یادداشت</th>
            </tr>
          </thead>
          <tbody>${paymentRows}</tbody>
        </table>
      </div>` : `
      <div class="empty-state" style="padding:1.5rem">
        <div class="empty-state-icon">💳</div>
        <h3>هنوز پرداختی ثبت نشده</h3>
        <p style="font-size:.82rem;color:var(--text-muted)">پرداخت‌های شما به مالک اینجا نمایش داده می‌شود</p>
      </div>`}
    </div>
  </div>

  <!-- ══════════════════════════════════════════
       ROW 4.5 – PERSONAL EXPENSES (tracking only)
  ══════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">💸 مصارف شخصی
        <span class="badge" style="background:#f43f5e22;color:#f43f5e;border:1px solid #f43f5e44;margin-right:.4rem;font-size:.72rem">${personalExpCnt}</span>
      </div>
      <a href="/expenses" class="btn btn-outline btn-sm">همه مصارف →</a>
    </div>
    <div style="padding:.5rem 1rem;background:linear-gradient(135deg,#fff1f2,var(--bg-secondary));border-bottom:1px solid var(--border);font-size:.78rem;color:#9f1239">
      ℹ️ این مصارف <strong>صرفاً برای کنترل شخصی</strong> شما ثبت شده و در محاسبه بدهی یا حساب سیستم تأثیر ندارد.
      مجموع: <strong style="color:#f43f5e">${formatMoney(personalExpTotal)}</strong>
    </div>
    ${(recentPersonalExp.results || []).length ? `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>تاریخ</th>
            <th>دسته‌بندی</th>
            <th>عنوان</th>
            <th>مبلغ</th>
          </tr>
        </thead>
        <tbody>${personalExpRows}</tbody>
      </table>
    </div>` : `
    <div class="empty-state" style="padding:1.5rem">
      <div class="empty-state-icon">💸</div>
      <h3>هنوز مصرف شخصی ثبت نشده</h3>
      <p style="font-size:.82rem;color:var(--text-muted)"><a href="/expenses">+ ثبت اولین مصرف</a></p>
    </div>`}
  </div>

  <!-- ══════════════════════════════════════════
       ROW 5 – ALL-TIME SUMMARY BANNER
  ══════════════════════════════════════════ -->
  <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:12px;padding:1rem 1.5rem;margin-bottom:1rem">
    <div style="color:#a5b4fc;font-size:.75rem;font-weight:600;margin-bottom:.6rem;letter-spacing:.05em">📊 خلاصه کل عملکرد</div>
    <div style="display:flex;flex-wrap:wrap;gap:1.5rem;align-items:center">
      <div style="text-align:center">
        <div style="color:#94a3b8;font-size:.72rem">ارزش تخصیص</div>
        <div style="color:#e2e8f0;font-weight:700;font-size:1rem">${formatMoney(allocValue)}</div>
      </div>
      <div style="color:#475569">−</div>
      <div style="text-align:center">
        <div style="color:#94a3b8;font-size:.72rem">کمیشن کسبی</div>
        <div style="color:#fbbf24;font-weight:700;font-size:1rem">${formatMoney(allTimeComm)}</div>
      </div>
      <div style="color:#475569">−</div>
      <div style="text-align:center">
        <div style="color:#94a3b8;font-size:.72rem">پرداختی به مالک</div>
        <div style="color:#34d399;font-weight:700;font-size:1rem">${formatMoney(totalPaid)}</div>
      </div>
      <div style="color:#475569">=</div>
      <div style="text-align:center">
        <div style="color:#94a3b8;font-size:.72rem">${debt > 0 ? 'بدهی به مالک' : 'مالک بدهکار'}</div>
        <div style="color:${balanceColor};font-weight:700;font-size:1.1rem">${balanceSign}${formatMoney(Math.abs(debt))}</div>
      </div>
      <div style="width:1px;height:40px;background:#334155;margin:0 .5rem"></div>
      <div style="text-align:center">
        <div style="color:#94a3b8;font-size:.72rem">کل تخصیص شده</div>
        <div style="color:#818cf8;font-weight:700;font-size:1rem">${formatGB(allocTotals?.gb ?? 0)}</div>
      </div>
      <div style="color:#475569">→</div>
      <div style="text-align:center">
        <div style="color:#94a3b8;font-size:.72rem">فروخته</div>
        <div style="color:#4ade80;font-weight:700;font-size:1rem">${formatGB(allTimeGb)}</div>
      </div>
      <div style="color:#475569">→</div>
      <div style="text-align:center">
        <div style="color:#94a3b8;font-size:.72rem">باقی</div>
        <div style="color:#e2e8f0;font-weight:700;font-size:1rem">${formatGB(remainingGb)}</div>
      </div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════
       ROW 6 – FINANCIAL SUMMARY (مصارف / مالی خلاصه)
  ══════════════════════════════════════════ -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">💸 ${lang === 'fa' ? 'مالی خلاصه' : lang === 'ps' ? 'مالي لنډیز' : 'Financial Summary'}</div>
      <span style="font-size:.75rem;color:var(--text-muted)">${lang === 'fa' ? 'تاریخچه دریافت‌ها' : lang === 'ps' ? 'د تادیاتو تاریخچه' : 'All-time payment history'}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;padding:1rem">

      <!-- Commission Earned -->
      <div style="background:linear-gradient(135deg,#fef9c3,var(--bg-secondary));border-radius:10px;padding:1rem;border:1px solid #fde68a">
        <div style="font-size:.72rem;color:#92400e;font-weight:600;margin-bottom:.4rem">🏷️ ${lang === 'fa' ? 'کمیسیون کسب شده' : lang === 'ps' ? 'ګټل شوی کمیشن' : 'Commission Earned'}</div>
        <div style="font-size:1.4rem;font-weight:700;color:#b45309">${formatMoney(allTimeComm)}</div>
        <div style="font-size:.72rem;color:#92400e;margin-top:.25rem">${soldAll?.cnt ?? 0} ${lang === 'fa' ? 'فروش' : lang === 'ps' ? 'پلور' : 'sales'}</div>
      </div>

      <!-- Total Paid by Seller -->
      <div style="background:linear-gradient(135deg,#dcfce7,var(--bg-secondary));border-radius:10px;padding:1rem;border:1px solid #86efac">
        <div style="font-size:.72rem;color:#14532d;font-weight:600;margin-bottom:.4rem">💸 ${lang === 'fa' ? 'مجموع پرداختی به مالک' : lang === 'ps' ? 'ټول تادیات مالک ته' : 'Total Paid to Owner'}</div>
        <div style="font-size:1.4rem;font-weight:700;color:#15803d">${formatMoney(totalPaid)}</div>
        <div style="font-size:.72rem;color:#14532d;margin-top:.25rem">${paidRow?.cnt ?? 0} ${lang === 'fa' ? 'پرداخت' : lang === 'ps' ? 'تادیه' : 'payments'}</div>
      </div>

      <!-- Debt/Balance Due -->
      <div style="background:${debt > 0 ? 'linear-gradient(135deg,#fee2e2,var(--bg-secondary))' : debt < 0 ? 'linear-gradient(135deg,#dcfce7,var(--bg-secondary))' : 'var(--bg-secondary)'};border-radius:10px;padding:1rem;border:1px solid ${debt > 0 ? '#fca5a5' : debt < 0 ? '#86efac' : 'var(--border)'}">
        <div style="font-size:.72rem;color:${debt > 0 ? '#991b1b' : debt < 0 ? '#14532d' : 'var(--text-muted)'};font-weight:600;margin-bottom:.4rem">⚖️ ${lang === 'fa' ? 'بدهی / مانده حساب' : lang === 'ps' ? 'پور / بیلانس' : 'Debt / Balance'}</div>
        <div style="font-size:1.4rem;font-weight:700;color:${balanceColor}">${balanceSign}${formatMoney(Math.abs(debt))}</div>
        <div style="font-size:.72rem;color:${balanceColor};margin-top:.25rem">${debt > 0 ? (lang === 'fa' ? '⚠️ بدهی به مالک' : lang === 'ps' ? '⚠️ پور مالک ته' : '⚠️ Debt to owner') : debt < 0 ? (lang === 'fa' ? '✅ مالک بدهکار شماست' : lang === 'ps' ? '✅ مالک تاسو ته پور لري' : '✅ Owner owes you') : (lang === 'fa' ? '✓ تسویه شده' : lang === 'ps' ? '✓ تصفیه شوې' : '✓ Settled')}</div>
      </div>
    </div>

    ${(paymentsByType?.results || []).length ? `
    <!-- Payment Breakdown by Type -->
    <div style="padding:0 1rem 1rem">
      <div style="font-size:.78rem;font-weight:600;color:var(--text-muted);margin-bottom:.5rem">${lang === 'fa' ? 'دریافت‌ها بر اساس نوع' : lang === 'ps' ? 'د ډول پر بنسټ تادیات' : 'Payments Breakdown by Type'}</div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        ${(paymentsByType?.results || []).map((p: any) => `
          <div style="background:var(--bg-tertiary,var(--bg-secondary));border-radius:8px;padding:.5rem .875rem;border:1px solid var(--border)">
            <span class="badge ${
              p.type === 'commission'  ? 'badge-success' :
              p.type === 'advance'     ? 'badge-warning' :
              p.type === 'settlement'  ? 'badge-info'    : 'badge-primary'
            }" style="font-size:.7rem;text-transform:capitalize">${p.type}</span>
            <span style="margin-left:.5rem;font-weight:600;color:var(--text-primary);font-size:.85rem">${formatMoney(p.total)}</span>
            <span style="font-size:.72rem;color:var(--text-muted)"> × ${p.cnt}</span>
          </div>`).join('')}
      </div>
    </div>` : ''}
  </div>

  <!-- Chart.js Script -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
  (function() {
    const ctx = document.getElementById('sellerChart');
    if (!ctx) return;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${chartLabels},
        datasets: [
          {
            label: 'GB Sold',
            data: ${chartGb},
            backgroundColor: 'rgba(99,102,241,.6)',
            borderColor: 'var(--primary)',
            borderWidth: 1.5,
            borderRadius: 4,
            yAxisID: 'y'
          },
          {
            label: 'Commission ؋',
            data: ${chartComm},
            type: 'line',
            borderColor: 'var(--warning)',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: 'var(--warning)',
            tension: 0.4,
            yAxisID: 'y2'
          },
          {
            label: 'Gross ؋',
            data: ${chartGross},
            type: 'line',
            borderColor: '#0891b2',
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            pointRadius: 3,
            tension: 0.4,
            borderDash: [4,3],
            yAxisID: 'y2'
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(ctx) {
                if (ctx.dataset.yAxisID === 'y') return ' ' + ctx.parsed.y.toFixed(1) + ' GB';
                return ' ؋' + Math.round(ctx.parsed.y).toLocaleString();
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: 'rgba(148,163,184,.1)' },
            ticks: { color: 'var(--text-muted)', font: { size: 10 } }
          },
          y: {
            position: 'left',
            grid: { color: 'rgba(148,163,184,.1)' },
            ticks: {
              color: 'var(--primary)',
              font: { size: 10 },
              callback: v => v + ' GB'
            }
          },
          y2: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              color: 'var(--warning)',
              font: { size: 10 },
              callback: v => '؋' + Math.round(v).toLocaleString()
            }
          }
        }
      }
    });
  })();
  </script>`;
}


// ---- Router ----
dashboard.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const period = c.req.query('period') ?? 'all';

  let bodyHtml: string;
  if (user.role === 'owner') {
    bodyHtml = await ownerDashboard(c.env.DB, user, lang);
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
