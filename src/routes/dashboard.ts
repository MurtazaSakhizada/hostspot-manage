// ============================================
// Dashboard Routes - Owner & Seller
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { parseCookies } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatGB, formatMoney } from '../lib/calc';
import { getCompanyLedgerSummary, getAllSellerBalances, getSellerLedger } from '../lib/ledger';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const dashboard = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ============================================================
// OWNER DASHBOARD
// Formula:
//   Net Profit = Gross Revenue - Commissions - Purchase Cost
//   Available Capital = Net Profit - Total Expenses
// ============================================================
// ── Period / date-range helpers ──────────────────────────

/**
 * Build SQL WHERE fragment.
 * If dateFrom/dateTo are provided they take precedence over period.
 */
function getPeriodFilter(
  period: string,
  col = 'snapshot_time',
  dateFrom = '',
  dateTo   = ''
) {
  if (dateFrom && dateTo)  return `AND date(${col}) BETWEEN '${dateFrom}' AND '${dateTo}'`;
  if (dateFrom)            return `AND date(${col}) >= '${dateFrom}'`;
  if (dateTo)              return `AND date(${col}) <= '${dateTo}'`;
  if (period === 'today')  return `AND date(${col}) = date('now')`;
  if (period === 'week')   return `AND ${col} >= datetime('now','-7 days')`;
  if (period === 'month')  return `AND ${col} >= datetime('now','-30 days')`;
  if (period === 'year')   return `AND ${col} >= datetime('now','-365 days')`;
  return '';
}

function getPeriodLabel(p: string, from = '', to = '') {
  if (from || to) return `${from || '…'} تا ${to || '…'}`;
  return p==='today'?'امروز':p==='week'?'این هفته':p==='month'?'این ماه':p==='year'?'امسال':'همه وقت';
}

/** Renders period quick-buttons + from/to date inputs + optional branch selector */
function renderPeriodBar(
  current: string,
  base   = '/dashboard',
  from   = '',
  to     = '',
  extra  = '',          // extra query params to keep, e.g. '&mode=financial'
  branches: any[] = [], // list of {id, name} for branch filter
  selectedBranch = ''   // currently selected branch id
) {
  const periods = ['today','week','month','year','all'];
  const labels: Record<string,string> = {
    today:'امروز', week:'این هفته', month:'این ماه', year:'امسال', all:'همه وقت'
  };
  const btns = periods.map(p => {
    const active = current === p && !from && !to;
    return `<a href="${base}?period=${p}${extra}${selectedBranch?'&branch='+selectedBranch:''}"
        class="btn btn-sm ${active?'btn-primary':'btn-outline'}"
        style="white-space:nowrap">📅 ${labels[p]}</a>`;
  }).join('');

  const branchSelect = branches.length > 0 ? `
    <div style="display:flex;gap:.35rem;align-items:center;margin-right:.5rem">
      <label style="font-size:.8rem;color:var(--text-muted);white-space:nowrap">🏢 شعبه:</label>
      <select name="branch" onchange="this.form.submit()"
        style="padding:.3rem .6rem;border:1px solid var(--border);border-radius:6px;font-size:.82rem;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer">
        <option value="" ${!selectedBranch?'selected':''}>همه شعبه‌ها</option>
        ${branches.map(b => `<option value="${b.id}" ${selectedBranch===String(b.id)?'selected':''}>${b.name}</option>`).join('')}
      </select>
      ${selectedBranch ? `<a href="${base}?period=${current}${extra}" class="btn btn-sm btn-outline" style="white-space:nowrap" title="پاک‌کردن فیلتر شعبه">✕ شعبه</a>` : ''}
    </div>` : '';

  return `
  <form method="GET" action="${base}" style="display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-bottom:1.25rem">
    ${extra ? extra.replace(/^&/,'').split('&').map(kv => {
      const [k,v] = kv.split('=');
      return `<input type="hidden" name="${k}" value="${v||''}">`;
    }).join('') : ''}
    ${btns}
    ${branchSelect}
    <div style="display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;margin-right:.5rem">
      <label style="font-size:.8rem;color:var(--text-muted);white-space:nowrap">از تاریخ:</label>
      <input type="date" name="from" value="${from}"
        style="padding:.3rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.82rem;background:var(--bg-secondary);color:var(--text-primary)">
      <label style="font-size:.8rem;color:var(--text-muted);white-space:nowrap">تا تاریخ:</label>
      <input type="date" name="to" value="${to}"
        style="padding:.3rem .5rem;border:1px solid var(--border);border-radius:6px;font-size:.82rem;background:var(--bg-secondary);color:var(--text-primary)">
      <button type="submit" class="btn btn-sm btn-primary" style="white-space:nowrap">🔍 اعمال</button>
      ${(from||to)?`<a href="${base}?period=${current}${selectedBranch?'&branch='+selectedBranch:''}${extra}" class="btn btn-sm btn-outline" style="white-space:nowrap">✕ تاریخ</a>`:''}
    </div>
  </form>`;
}

// Keep backward-compat alias
function renderPeriodBtns(current: string, base = '/dashboard') {
  return renderPeriodBar(current, base);
}

async function ownerDashboard(
  db: D1Database, user: SessionUser, lang: Lang,
  period: string, dateFrom = '', dateTo = '',
  branchId = ''
): Promise<string> {

  const pf  = getPeriodFilter(period, 'snapshot_time', dateFrom, dateTo);
  const pfP = getPeriodFilter(period, 'payment_date',  dateFrom, dateTo);
  const pfE = getPeriodFilter(period, 'expense_date',  dateFrom, dateTo);
  const pl  = getPeriodLabel(period, dateFrom, dateTo);

  // Branch SQL condition
  const bfS  = branchId ? `AND branch_id = ${parseInt(branchId)}` : '';   // for sales
  const bfP  = branchId ? `AND branch_id = ${parseInt(branchId)}` : '';   // for payments
  const bfAb = branchId ? `AND branch_id = ${parseInt(branchId)}` : '';   // for allocation_batches

  // ── Company purchase price ───────────────────────────────
  const company = await db.prepare('SELECT name, settings FROM companies WHERE id=?')
    .bind(user.company_id).first<any>();
  const settings = JSON.parse(company?.settings || '{}');
  const purchasePricePerGb: number = settings.purchase_price_per_gb ?? 0;

  // ── All branches list (for selector UI) ────────────────────
  const allBranches = await db.prepare('SELECT id, name FROM branches WHERE company_id=? AND active=1 ORDER BY name')
    .bind(user.company_id).all<any>();
  const selectedBranchName = branchId
    ? (allBranches.results||[]).find((b: any) => String(b.id) === branchId)?.name ?? ''
    : '';

  // ── Sales totals (period + branch filtered) ───────────────
  const sls = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb,
           COALESCE(SUM(gross_amount),0) as gross,
           COALESCE(SUM(commission_amount),0) as comm,
           COALESCE(SUM(net_amount),0) as net,
           COUNT(*) as cnt
    FROM sales WHERE company_id=? ${pf} ${bfS}`).bind(user.company_id).first<any>();

  // ── Inventory totals (not branch-filtered — inventory is company-wide) ──
  const invBatch = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb,
           COALESCE(SUM(total_gross),0) as gross,
           COALESCE(SUM(purchase_cost),0) as purchase_cost
    FROM inventory_batches WHERE company_id=?`).bind(user.company_id).first<any>();

  // ── Allocations (branch filtered) ─────────────────────────
  const alloc = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0)         as gb,
           COALESCE(SUM(total_gross),0)      as gross,
           COALESCE(SUM(total_commission),0) as commission,
           COALESCE(SUM(total_net),0)        as net
    FROM allocation_batches WHERE company_id=? ${bfAb}`).bind(user.company_id).first<any>();

  // ── Expenses (COMPANY ONLY, period-filtered, NOT branch-filtered) ─────────
  const expTotal = await db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM expenses
    WHERE company_id=? AND (seller_id IS NULL OR seller_id = 0) ${pfE}`)
    .bind(user.company_id).first<{total:number}>();

  // ── Payments (received FROM sellers, period + branch filtered) ────────────
  const payTotal = await db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE company_id=? ${pfP} ${bfP}`)
    .bind(user.company_id).first<{total:number}>();

  // ── Formula calculations ──────────────────────────────────
  const soldGb = sls?.gb ?? 0;
  const allocGb = alloc?.gb ?? 0;
  const purchaseCost = invBatch?.purchase_cost ?? 0;

  // Purchase cost of ALL allocated GB × price per GB
  const allocPurchaseCost = purchasePricePerGb > 0
    ? Math.round(allocGb * purchasePricePerGb * 100) / 100
    : (purchaseCost > 0 && invBatch?.gb > 0
      ? Math.round((allocGb / (invBatch?.gb || 1)) * purchaseCost * 100) / 100
      : 0);

  const totalExpenses      = expTotal?.total ?? 0;
  const totalPaidBySellers = payTotal?.total ?? 0;

  // Available Capital = دریافتی از فروشندگان − پول خرید (تخصیص‌شده) − مصارف
  const availableCapital = totalPaidBySellers - allocPurchaseCost - totalExpenses;

  // Stock GB remaining
  const stockGb = (invBatch?.gb ?? 0) - soldGb;

  // ── Branch drill-down (all branches summary) ──────────────
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

  // ── Per seller (branch-filtered) ──────────────────────────
  const sellerBranchJoin = branchId ? `AND s.branch_id = ${parseInt(branchId)}` : '';
  const sellers = await db.prepare(`
    SELECT u.id, u.full_name, u.commission_rate,
      COALESCE(SUM(s.total_gb),0) as sold_gb,
      COALESCE(SUM(s.gross_amount),0) as gross,
      COALESCE(SUM(s.commission_amount),0) as comm,
      COALESCE(SUM(s.net_amount),0) as net,
      COUNT(s.id) as tx_count,
      COALESCE((SELECT SUM(amount) FROM payments p WHERE p.seller_id=u.id AND p.company_id=u.company_id ${bfP}),0) as paid,
      COALESCE((SELECT SUM(total_gross) FROM allocation_batches ab WHERE ab.seller_id=u.id AND ab.company_id=u.company_id ${bfAb}),0) as alloc_value
    FROM users u
    LEFT JOIN sales s ON s.seller_id=u.id AND s.company_id=u.company_id ${sellerBranchJoin}
    WHERE u.company_id=? AND u.role='seller' AND u.active=1
    GROUP BY u.id, u.full_name, u.commission_rate ORDER BY sold_gb DESC`)
    .bind(user.company_id).all<any>();



  // ── HTML building ─────────────────────────────────────────
  const sellerRows = (sellers.results||[]).map((s: any) => {
    // debt = alloc_value - commission_earned - paid_to_seller
    // debt > 0 → seller still owes owner; debt <= 0 → owner owes seller (overpaid)
    const debt = s.alloc_value - s.comm - s.paid;
    const debtLabel = debt > 0
      ? `<span style="color:var(--danger)">${t(lang,'debt_label')}: ${formatMoney(debt)}</span>`
      : debt < 0
      ? `<span style="color:var(--success)">${t(lang,'credit_label')}: ${formatMoney(Math.abs(debt))}</span>`
      : `<span style="color:var(--text-muted)">${t(lang,'settled_label')}</span>`;
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

  return `
  <div class="page-header">
    <div>
      <div class="page-title">📊 ${t(lang,'dashboard')}</div>
      <div class="page-subtitle">${company?.name ?? ''} · ${pl}${selectedBranchName ? ' · 🏢 ' + selectedBranchName : ''}</div>
    </div>
    <div class="btn-group">
      <a href="/reports" class="btn btn-outline btn-sm">📋 ${t(lang,'reports')}</a>
      <a href="/inventory/add" class="btn btn-primary btn-sm">+ ${t(lang,'add_inventory')}</a>
    </div>
  </div>

  ${renderPeriodBar(period, '/dashboard', dateFrom, dateTo, '', allBranches.results||[], branchId)}

  <!-- PRIMARY KPIs — 6 cards -->
  <div class="stats-grid" style="margin-bottom:1.25rem">
    <!-- موجودی انبار -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--primary)"></div>
      <div class="stat-label">${t(lang,'total_inventory_gb')}</div>
      <div class="stat-value primary">${formatGB(invBatch?.gb ?? 0)}</div>
      <div class="stat-sub">${formatGB(stockGb)} ${t(lang,'remaining')}</div>
    </div>
    <!-- تخصیص شده -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-label">${t(lang,'allocated_gb')}</div>
      <div class="stat-value" style="color:#7c3aed">${formatGB(alloc?.gb ?? 0)}</div>
      <div class="stat-sub">${formatMoney(alloc?.gross ?? 0)} ${t(lang,'gross')}</div>
    </div>
    <!-- فروش شده -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">${t(lang,'sold_gb')} · ${pl}</div>
      <div class="stat-value success">${formatGB(soldGb)}</div>
      <div class="stat-sub">${sls?.cnt ?? 0} ${t(lang,'transactions')}</div>
    </div>
    <!-- دریافتی از فروشندگان -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#0891b2"></div>
      <div class="stat-label">💰 ${t(lang,'total_received')} · ${pl}</div>
      <div class="stat-value" style="color:#0891b2">${formatMoney(totalPaidBySellers)}</div>
      <div class="stat-sub">${t(lang,'received_from_sellers')}</div>
    </div>
    <!-- مصارف -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#f97316"></div>
      <div class="stat-label">${t(lang,'total_expenses')} · ${pl}</div>
      <div class="stat-value" style="color:#f97316">${formatMoney(totalExpenses)}</div>
      <div class="stat-sub"><a href="/expenses" style="color:var(--primary);font-size:.75rem">${t(lang,'manage')}</a></div>
    </div>
    <!-- سرمایه موجود -->
    <div class="stat-card" style="background:${availableCapital>=0?'linear-gradient(135deg,var(--success-light,#dcfce7),var(--bg-secondary))':'linear-gradient(135deg,#fee2e2,var(--bg-secondary))'}">
      <div class="stat-card-accent" style="background:${availableCapital>=0?'var(--success)':'var(--danger)'}"></div>
      <div class="stat-label">${t(lang,'available_capital_card')}</div>
      <div class="stat-value" style="color:${availableCapital>=0?'var(--success)':'var(--danger)'};font-size:1.35rem">${formatMoney(availableCapital)}</div>
      <div class="stat-sub">دریافتی − خرید − مصارف</div>
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
          <th>${t(lang,'sold_gb')}</th>
          <th>${t(lang,'gross')}</th>
          <th>${t(lang,'commission_amount')}</th>
          <th>${t(lang,'net')}</th>
          <th>${t(lang,'sellers')}</th>
        </tr></thead>
        <tbody>${branchRows}</tbody>
      </table>
    </div>` : `<div class="empty-state"><div class="empty-state-icon">🏢</div><h3>${t(lang,'no_data')}</h3></div>`}
  </div>

  <!-- Seller Performance -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">${t(lang,'seller_performance')}</div>
      <a href="/users" class="btn btn-outline btn-sm">${t(lang,'manage')}</a>
    </div>
    ${(sellers.results||[]).length ? `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>${t(lang,'seller')}</th>
          <th>${t(lang,'commission_rate')}</th>
          <th>${t(lang,'sold_gb')}</th>
          <th>${t(lang,'total_gross')}</th>
          <th>${t(lang,'commission_amount')}</th>
          <th>${t(lang,'allocation_value')}</th>
          <th>${t(lang,'total_received')}</th>
          <th>${t(lang,'quantity')}</th>
          <th>${t(lang,'debt_balance')}</th>
        </tr></thead>
        <tbody>${sellerRows}</tbody>
      </table>
    </div>` : `<div class="empty-state"><div class="empty-state-icon">👥</div><h3>${t(lang,'no_data')}</h3></div>`}
  </div>

  <!-- Formula Banner — at the bottom of the page -->
  <div class="formula-strip" style="margin-top:.5rem">
    <div class="formula-strip-group">
      <span style="color:#94a3b8;font-size:.7rem">ناخالص فروش</span>
      <span style="color:#e2e8f0;font-weight:700">${formatMoney(sls?.gross ?? 0)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">کمیسیون‌ها</span>
      <span style="color:#fbbf24;font-weight:700">${formatMoney(sls?.comm ?? 0)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">پول خرید</span>
      <span style="color:#f97316;font-weight:700">${formatMoney(allocPurchaseCost)}</span>
      <span class="formula-strip-sep">=</span>
      <span style="color:#94a3b8;font-size:.7rem">سود خالص مالک</span>
      <span style="color:${(sls?.gross??0)-(sls?.comm??0)-allocPurchaseCost>=0?'#34d399':'#f87171'};font-weight:700;font-size:.95rem">${formatMoney((sls?.gross??0)-(sls?.comm??0)-allocPurchaseCost)}</span>
    </div>
    <div class="formula-strip-divider"></div>
    <div class="formula-strip-group">
      <span style="color:#94a3b8;font-size:.7rem">دریافتی از فروشندگان</span>
      <span style="color:#34d399;font-weight:700">${formatMoney(totalPaidBySellers)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">پول خرید</span>
      <span style="color:#f97316;font-weight:700">${formatMoney(allocPurchaseCost)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">مصارف</span>
      <span style="color:#fb923c;font-weight:700">${formatMoney(totalExpenses)}</span>
      <span class="formula-strip-sep">=</span>
      <span style="color:#94a3b8;font-size:.7rem">سرمایه موجود</span>
      <span style="color:${availableCapital>=0?'#34d399':'#f87171'};font-weight:700;font-size:.95rem">${formatMoney(availableCapital)}</span>
    </div>
  </div>
  `;
}

// ============================================================
// SELLER DASHBOARD - Full rebuild with bug fixes
// ============================================================
async function sellerDashboard(
  db: D1Database, user: SessionUser, lang: Lang,
  period: string, dateFrom = '', dateTo = ''
): Promise<string> {

  // ── Date filter for selected period / range ─────────────────
  let dateFilter = '';
  if (dateFrom && dateTo)  dateFilter = `AND date(s.snapshot_time) BETWEEN '${dateFrom}' AND '${dateTo}'`;
  else if (dateFrom)       dateFilter = `AND date(s.snapshot_time) >= '${dateFrom}'`;
  else if (dateTo)         dateFilter = `AND date(s.snapshot_time) <= '${dateTo}'`;
  else if (period === 'today') dateFilter = `AND date(s.snapshot_time) = date('now')`;
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
  const periodLabel = getPeriodLabel(period, dateFrom, dateTo);

  // ── Period selector bar (with date-range inputs) ──────────
  const periodBtns = renderPeriodBar(period, '/dashboard', dateFrom, dateTo);

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
          p.type === 'commission' ? t(lang,'commission_pay') :
          p.type === 'advance'    ? t(lang,'advance') :
          p.type === 'settlement' ? t(lang,'settlement') : p.type
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
          ${e.category === 'rent' ? '🏠 ' + t(lang,'cat_rent') :
            e.category === 'salary' ? '👤 ' + t(lang,'cat_salary') :
            e.category === 'utilities' ? '💡 ' + t(lang,'cat_utilities') :
            e.category === 'maintenance' ? '🔧 ' + t(lang,'cat_maintenance') :
            e.category === 'transport' ? '🚗 ' + t(lang,'cat_transport') :
            e.category === 'general' ? '📋 ' + t(lang,'cat_general') : '➕ ' + t(lang,'cat_other')}
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

  ${periodBtns}

  <!-- ══════════════════════════════════════════
       ROW 1 – KPI CARDS (6 cards)
  ══════════════════════════════════════════ -->
  <div class="stats-grid" style="margin-bottom:1.25rem">

    <!-- GB Remaining (available to sell) -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-label">📦 ${t(lang,'available_gb')}</div>
      <div class="stat-value" style="color:#7c3aed">${formatGB(remainingGb)}</div>
      <div class="stat-sub">${t(lang,'total_allocated')} − ${t(lang,'total_sold')}</div>
    </div>

    <!-- GB Sold in period -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">📤 ${t(lang,'sold_gb')}</div>
      <div class="stat-value success">${formatGB(soldPeriod?.gb ?? 0)}</div>
      <div class="stat-sub">${soldPeriod?.cnt ?? 0} ${t(lang,'transactions')} · ${periodLabel}</div>
    </div>

    <!-- Gross Revenue in period -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#0891b2"></div>
      <div class="stat-label">💵 ${t(lang,'gross_income')}</div>
      <div class="stat-value" style="color:#0891b2">${formatMoney(soldPeriod?.gross ?? 0)}</div>
      <div class="stat-sub">${periodLabel}</div>
    </div>

    <!-- Commission in period -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--warning)"></div>
      <div class="stat-label">🏷 ${t(lang,'commission_earned_lbl')}</div>
      <div class="stat-value warning">${formatMoney(soldPeriod?.comm ?? 0)}</div>
      <div class="stat-sub">${t(lang,'total')}: ${formatMoney(allTimeComm)}</div>
    </div>

    <!-- Total Paid by Seller to Owner -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--primary)"></div>
      <div class="stat-label">💳 ${t(lang,'seller_paid_to_owner')}</div>
      <div class="stat-value primary">${formatMoney(totalPaid)}</div>
      <div class="stat-sub">${paidRow?.cnt ?? 0} ${t(lang,'payments_count')}</div>
    </div>

    <!-- Debt/Balance card -->
    <div class="stat-card" style="${balanceBg ? `background:${balanceBg}` : ''}">
      <div class="stat-card-accent" style="background:${balanceColor}"></div>
      <div class="stat-label">⚖️ ${t(lang,'debt_balance')}</div>
      <div class="stat-value" style="color:${balanceColor}">${balanceSign}${formatMoney(Math.abs(debt))}</div>
      <div class="stat-sub">${balanceLabel}</div>
    </div>

    <!-- Personal Expenses card (tracking only, NOT affecting debt) -->
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#f43f5e"></div>
      <div class="stat-label">💸 ${t(lang,'personal_expenses')}</div>
      <div class="stat-value" style="color:#f43f5e">${formatMoney(personalExpTotal)}</div>
      <div class="stat-sub">${personalExpCnt} ${t(lang,'expense_type')} · <a href="/expenses" style="color:var(--primary)">${t(lang,'view_all')}</a></div>
    </div>
  </div>

  <!-- ══════════════════════════════════════════
       ROW 2 – CHART + MONTHLY TREND
  ══════════════════════════════════════════ -->
  <div class="grid-chart-trend">

    <!-- Chart: Last 7 days -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">📈 فروش‌های من — ۷ روز اخیر</div>
        <div style="display:flex;gap:1rem;font-size:.72rem;color:var(--text-muted)">
          <span style="color:var(--primary)">● ${t(lang,'sold_gb')}</span>
          <span style="color:var(--warning)">● ${t(lang,'commission_amount')}</span>
          <span style="color:#0891b2">● ${t(lang,'total')}</span>
        </div>
      </div>
      <div style="padding:.75rem 1rem 1rem">
        <canvas id="sellerChart" height="140"></canvas>
      </div>
    </div>

    <!-- Monthly Trend -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">📅 روند ماهانه</div>
        <span style="font-size:.72rem;color:var(--text-muted)">۶ ماه اخیر</span>
      </div>
      ${(monthlySales.results || []).length ? `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>ماه</th>
              <th>GB</th>
              <th>ناخالص</th>
              <th>کمیسیون</th>
              <th style="text-align:center">معاملات</th>
            </tr>
          </thead>
          <tbody>${monthlyRows}</tbody>
        </table>
      </div>` : `
      <div class="empty-state" style="padding:2rem">
        <div class="empty-state-icon">📅</div>
        <h3>هنوز داده‌ای نیست</h3>
      </div>`}
    </div>
  </div>

  <!-- ROW 3 – RECENT SALES TABLE (full width) -->
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
      <span>${t(lang,'total_sold')}: <strong class="text-primary">${formatGB(allTimeGb)}</strong></span>
      <span>${t(lang,'gross_income')}: <strong style="color:#0891b2">${formatMoney(soldPeriod?.gross??0)}</strong></span>
      <span>${t(lang,'commission_amount')}: <strong class="text-warning">${formatMoney(soldPeriod?.comm??0)}</strong></span>
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
  <div class="grid-2col">

    <!-- Allocations -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">🔀 تخصیص‌های من
          <span class="badge badge-info" style="margin-left:.5rem;font-size:.72rem">${allocTotals?.batches ?? 0}</span>
        </div>
        <a href="/allocations" class="btn btn-outline btn-sm">همه →</a>
      </div>
      <div style="padding:.5rem 1rem;background:var(--bg-tertiary,var(--bg-secondary));display:flex;gap:2rem;font-size:.82rem;border-bottom:1px solid var(--border)">
        <span>کل تخصیص: <strong class="text-primary">${formatGB(allocTotals?.gb ?? 0)}</strong></span>
        <span>باقی‌مانده: <strong style="color:#7c3aed">${formatGB(remainingGb)}</strong></span>
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
        <div class="card-title">💳 پرداختی‌های من به مالک
          <span class="badge badge-success" style="margin-left:.5rem;font-size:.72rem">${paidRow?.cnt ?? 0}</span>
        </div>
        <a href="/payments" class="btn btn-outline btn-sm">همه →</a>
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
        <p style="font-size:.82rem;color:var(--text-muted)">پرداختی‌های شما به مالک اینجا نمایش داده می‌شود</p>
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
      <a href="/expenses" class="btn btn-outline btn-sm">همه →</a>
    </div>
    <div style="padding:.5rem 1rem;background:linear-gradient(135deg,#fff1f2,var(--bg-secondary));border-bottom:1px solid var(--border);font-size:.78rem;color:#9f1239">
      ℹ️ این مصارف <strong>صرفاً برای کنترل شخصی</strong> شما ثبت شده و در محاسبه بدهی یا پرداختی به مالک تأثیر ندارد.
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
  <div class="formula-banner">
    <div style="color:#a5b4fc;font-size:.75rem;font-weight:600;margin-bottom:.6rem;letter-spacing:.05em">📊 خلاصه کل عملکرد</div>
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
        <div class="formula-label">${debt > 0 ? 'بدهی به مالک' : 'مالک بدهکار'}</div>
        <div class="formula-value" style="color:${balanceColor};font-size:1.1rem">${balanceSign}${formatMoney(Math.abs(debt))}</div>
      </div>
      <div class="formula-divider"></div>
      <div class="formula-item">
        <div class="formula-label">کل تخصیص شده</div>
        <div class="formula-value" style="color:#818cf8">${formatGB(allocTotals?.gb ?? 0)}</div>
      </div>
      <span class="formula-sep">→</span>
      <div class="formula-item">
        <div class="formula-label">فروخته</div>
        <div class="formula-value" style="color:#4ade80">${formatGB(allTimeGb)}</div>
      </div>
      <span class="formula-sep">→</span>
      <div class="formula-item">
        <div class="formula-label">باقی</div>
        <div class="formula-value" style="color:#e2e8f0">${formatGB(remainingGb)}</div>
      </div>
    </div>
  </div>

  <!-- ROW 6 – FINANCIAL SUMMARY -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">💸 ${t(lang,'financial_summary')}</div>
      <span style="font-size:.75rem;color:var(--text-muted)">${t(lang,'payment_history')}</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;padding:1rem">

      <!-- Commission Earned -->
      <div style="background:linear-gradient(135deg,#fef9c3,var(--bg-secondary));border-radius:10px;padding:1rem;border:1px solid #fde68a">
        <div style="font-size:.72rem;color:#92400e;font-weight:600;margin-bottom:.4rem">🏷️ ${t(lang,'commission_earned_lbl')}</div>
        <div style="font-size:1.4rem;font-weight:700;color:#b45309">${formatMoney(allTimeComm)}</div>
        <div style="font-size:.72rem;color:#92400e;margin-top:.25rem">${soldAll?.cnt ?? 0} ${t(lang,'sales_count')}</div>
      </div>

      <!-- Total Paid by Seller -->
      <div style="background:linear-gradient(135deg,#dcfce7,var(--bg-secondary));border-radius:10px;padding:1rem;border:1px solid #86efac">
        <div style="font-size:.72rem;color:#14532d;font-weight:600;margin-bottom:.4rem">💳 ${t(lang,'seller_paid_to_owner')}</div>
        <div style="font-size:1.4rem;font-weight:700;color:#15803d">${formatMoney(totalPaid)}</div>
        <div style="font-size:.72rem;color:#14532d;margin-top:.25rem">${paidRow?.cnt ?? 0} ${t(lang,'payments_count')}</div>
      </div>

      <!-- Debt/Balance Due -->
      <div style="background:${debt > 0 ? 'linear-gradient(135deg,#fee2e2,var(--bg-secondary))' : debt < 0 ? 'linear-gradient(135deg,#dcfce7,var(--bg-secondary))' : 'var(--bg-secondary)'};border-radius:10px;padding:1rem;border:1px solid ${debt > 0 ? '#fca5a5' : debt < 0 ? '#86efac' : 'var(--border)'}">
        <div style="font-size:.72rem;color:${debt > 0 ? '#991b1b' : debt < 0 ? '#14532d' : 'var(--text-muted)'};font-weight:600;margin-bottom:.4rem">⚖️ ${t(lang,'debt_balance')}</div>
        <div style="font-size:1.4rem;font-weight:700;color:${balanceColor}">${balanceSign}${formatMoney(Math.abs(debt))}</div>
        <div style="font-size:.72rem;color:${balanceColor};margin-top:.25rem">${debt > 0 ? t(lang,'debt_to_owner') : debt < 0 ? t(lang,'owner_owes_you') : t(lang,'settled')}</div>
      </div>
    </div>

    ${(paymentsByType?.results || []).length ? `
    <!-- Payment Breakdown by Type -->
    <div style="padding:0 1rem 1rem">
      <div style="font-size:.78rem;font-weight:600;color:var(--text-muted);margin-bottom:.5rem">${t(lang,'payments_by_type')}</div>
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


// ============================================================
// FINANCIAL INVESTOR DASHBOARD
// Mode: financial — shows allocations, payments, balances + commission + purchase cost
// This mode is for owners who do NOT sell themselves; sellers do all selling.
// Formula:
//   ناخالص (Gross)        = total_gross from allocation_batches
//   کمیسیون (Commission)  = total_commission (auto-deducted for sellers)
//   پول خرید (Purchase)   = total_gb × purchase_price_per_gb (from company settings)
//   سود خالص مالک         = Gross − Commission − Purchase Cost
//   دریافتی (Paid)        = payments received from sellers
//   باقی‌مانده            = Net (seller owes) − Paid
//   سرمایه موجود         = Paid − مصارف شرکت
// ============================================================
async function investorDashboard(
  db: D1Database, user: SessionUser, lang: Lang,
  period: string, dateFrom = '', dateTo = '',
  branchId = ''
): Promise<string> {

  const pfA = getPeriodFilter(period, 'created_at',   dateFrom, dateTo);
  const pfP = getPeriodFilter(period, 'payment_date', dateFrom, dateTo);
  const pl  = getPeriodLabel(period, dateFrom, dateTo);

  // Branch SQL condition
  const bfAb = branchId ? `AND branch_id = ${parseInt(branchId)}` : '';
  const bfP  = branchId ? `AND branch_id = ${parseInt(branchId)}` : '';

  // ── Company settings (purchase price per GB) ─────────────
  const company = await db.prepare('SELECT name, settings FROM companies WHERE id=?')
    .bind(user.company_id).first<any>();
  const settings = JSON.parse(company?.settings || '{}');
  const purchasePricePerGb: number = settings.purchase_price_per_gb ?? 0;

  // ── All branches list (for selector UI) ────────────────────
  const allBranches = await db.prepare('SELECT id, name FROM branches WHERE company_id=? AND active=1 ORDER BY name')
    .bind(user.company_id).all<any>();
  const selectedBranchName = branchId
    ? (allBranches.results||[]).find((b: any) => String(b.id) === branchId)?.name ?? ''
    : '';

  // ── Company-wide totals from allocation_batches (period + branch filtered) ──
  const allocTotals = await db.prepare(`
    SELECT
      COALESCE(SUM(total_gb),0)         as total_gb,
      COALESCE(SUM(total_gross),0)      as total_gross,
      COALESCE(SUM(total_commission),0) as total_commission,
      COALESCE(SUM(total_net),0)        as total_net
    FROM allocation_batches WHERE company_id=? ${pfA} ${bfAb}
  `).bind(user.company_id).first<any>();

  const totalGb         = allocTotals?.total_gb         ?? 0;
  const totalGross      = allocTotals?.total_gross       ?? 0;
  const totalCommission = allocTotals?.total_commission  ?? 0;
  const totalNet        = allocTotals?.total_net         ?? 0;   // what sellers owe owner

  // ── Purchase cost (auto-calculated: GB × price from settings) ─────────
  const totalPurchaseCost = Math.round(totalGb * purchasePricePerGb * 100) / 100;

  // ── Owner's net profit = Gross − Commission − Purchase Cost ──────────
  const ownerNetProfit = totalGross - totalCommission - totalPurchaseCost;

  // ── Total payments received from sellers (period + branch filtered) ──────
  const payRow = await db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total_paid
    FROM payments WHERE company_id=? ${pfP} ${bfP}
  `).bind(user.company_id).first<{total_paid:number}>();
  const totalPaid = payRow?.total_paid ?? 0;

  // ── Remaining balance sellers still owe ──────────────────
  const totalRemaining = totalNet - totalPaid;

  // ── Company expenses (not branch-filtered) ────────────────
  const expRow = await db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total FROM expenses
    WHERE company_id=? AND (seller_id IS NULL OR seller_id = 0)
  `).bind(user.company_id).first<{total:number}>();
  const totalExpenses = expRow?.total ?? 0;

  // ── Available capital = paid − purchase_cost − expenses ──
  const availableCapital = totalPaid - totalPurchaseCost - totalExpenses;

  // ── Per-seller breakdown (branch-filtered) ────────────────
  const sellerStats = await db.prepare(`
    SELECT
      u.id as seller_id,
      u.full_name as seller_name,
      u.commission_rate,
      COALESCE(ab.total_gb,0)         as total_gb,
      COALESCE(ab.total_gross,0)      as total_gross,
      COALESCE(ab.total_commission,0) as total_commission,
      COALESCE(ab.total_net,0)        as total_net,
      COALESCE(p.total_paid,0)        as total_paid
    FROM users u
    LEFT JOIN (
      SELECT seller_id,
        SUM(total_gb)         as total_gb,
        SUM(total_gross)      as total_gross,
        SUM(total_commission) as total_commission,
        SUM(total_net)        as total_net
      FROM allocation_batches WHERE company_id=? ${bfAb}
      GROUP BY seller_id
    ) ab ON ab.seller_id = u.id
    LEFT JOIN (
      SELECT seller_id, SUM(amount) as total_paid
      FROM payments WHERE company_id=? ${bfP}
      GROUP BY seller_id
    ) p ON p.seller_id = u.id
    WHERE u.company_id=? AND u.role='seller' AND u.active=1
      AND (ab.total_gb IS NOT NULL OR p.total_paid IS NOT NULL)
    ORDER BY ab.total_gb DESC
  `).bind(user.company_id, user.company_id, user.company_id).all<any>();

  // ── Recent allocations (last 10, branch-filtered) ─────────
  const recentAllocs = await db.prepare(`
    SELECT ab.id, ab.created_at, ab.total_gb, ab.total_gross, ab.total_commission, ab.total_net,
           u.full_name as seller_name, br.name as branch_name
    FROM allocation_batches ab
    JOIN users u ON u.id = ab.seller_id
    JOIN branches br ON br.id = ab.branch_id
    WHERE ab.company_id=? ${bfAb}
    ORDER BY ab.created_at DESC LIMIT 10
  `).bind(user.company_id).all<any>();

  // ── Recent payments (last 10, branch-filtered) ────────────
  const recentPayments = await db.prepare(`
    SELECT p.id, p.payment_date, p.amount, p.type, p.notes,
           u.full_name as seller_name, b.name as branch_name
    FROM payments p
    JOIN users u ON u.id = p.seller_id
    LEFT JOIN branches b ON b.id = p.branch_id
    WHERE p.company_id=? ${bfP}
    ORDER BY p.payment_date DESC, p.created_at DESC LIMIT 10
  `).bind(user.company_id).all<any>();

  // ── 7-day daily payments chart (branch-filtered) ──────────
  const chart7Pay = await db.prepare(`
    SELECT date(payment_date) as day,
           COALESCE(SUM(amount),0) as total,
           COUNT(*) as cnt
    FROM payments WHERE company_id=? ${bfP}
      AND payment_date >= date('now','-6 days')
    GROUP BY day ORDER BY day ASC
  `).bind(user.company_id).all<any>();

  // ── 6-month monthly trend (allocations + payments, branch-filtered) ──
  const monthly6 = await db.prepare(`
    SELECT
      strftime('%Y-%m', ab.created_at) as month,
      COALESCE(SUM(ab.total_gb),0)         as alloc_gb,
      COALESCE(SUM(ab.total_gross),0)      as alloc_gross,
      COALESCE(SUM(ab.total_commission),0) as alloc_comm,
      COALESCE(SUM(ab.total_net),0)        as alloc_net
    FROM allocation_batches ab
    WHERE ab.company_id=? ${bfAb}
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).bind(user.company_id).all<any>();

  const monthly6Pay = await db.prepare(`
    SELECT strftime('%Y-%m', payment_date) as month,
           COALESCE(SUM(amount),0) as paid
    FROM payments WHERE company_id=? ${bfP}
    GROUP BY month ORDER BY month DESC LIMIT 6
  `).bind(user.company_id).all<any>();

  // merge payment totals into monthly6 by month key
  const payByMonth: Record<string,number> = Object.fromEntries(
    (monthly6Pay.results||[]).map((r:any) => [r.month, r.paid])
  );

  // ── Build chart data (last 7 days) ────────────────────────
  const days7: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days7.push(d.toISOString().split('T')[0]);
  }
  const payChartMap = Object.fromEntries((chart7Pay.results||[]).map((r:any)=>[r.day,r]));
  const chartLabels7 = JSON.stringify(days7.map(d=>new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})));
  const chartPayData = JSON.stringify(days7.map(d=>Math.round(payChartMap[d]?.total??0)));
  const chartPayCnt  = JSON.stringify(days7.map(d=>payChartMap[d]?.cnt??0));

  // ── Per-seller table rows ─────────────────────────────────
  const sellerRows = (sellerStats.results || []).map((s: any) => {
    const remaining = (s.total_net ?? 0) - (s.total_paid ?? 0);
    const pct = s.total_net > 0
      ? Math.min(100, Math.round((s.total_paid / s.total_net) * 100))
      : 0;
    const commPct = Math.round((s.commission_rate ?? 0) * 100);
    const remColor = remaining > 0 ? 'var(--danger)' : remaining < 0 ? 'var(--success)' : 'var(--text-muted)';
    return `
    <tr>
      <td><strong>${s.seller_name}</strong><div style="font-size:.7rem;color:var(--text-muted)">کمیسیون: ${commPct}%</div></td>
      <td class="text-primary font-bold">${formatGB(s.total_gb)}</td>
      <td style="color:var(--text-secondary)">${formatMoney(s.total_gross)}</td>
      <td class="text-warning font-bold">−${formatMoney(s.total_commission)}<div style="font-size:.7rem">${commPct}%</div></td>
      <td class="font-bold" style="color:#0891b2">${formatMoney(s.total_net)}</td>
      <td class="text-success font-bold">${formatMoney(s.total_paid)}</td>
      <td style="color:${remColor};font-weight:600">${formatMoney(Math.abs(remaining))}
        <div style="font-size:.7rem;color:var(--text-muted)">${remaining > 0 ? '(بدهی)' : remaining < 0 ? '(اضافه)' : '(تسویه)'}</div>
      </td>
      <td>
        <div style="background:var(--bg-secondary);border-radius:99px;height:8px;width:70px;overflow:hidden">
          <div style="background:${pct>=100?'var(--success)':'var(--primary)'};height:100%;width:${pct}%;border-radius:99px"></div>
        </div>
        <div style="font-size:.7rem;color:var(--text-muted);margin-top:.2rem">${pct}%</div>
      </td>
      <td><a href="/ledger/seller/${s.seller_id}" class="btn btn-outline btn-sm">📒 دفتر</a></td>
    </tr>`;
  }).join('');

  const recentAllocRows = (recentAllocs.results || []).map((a: any) => `
    <tr>
      <td style="font-size:.8rem">${new Date(a.created_at).toLocaleDateString('en-GB')}</td>
      <td><strong>${a.seller_name}</strong><div style="font-size:.72rem;color:var(--text-muted)">${a.branch_name}</div></td>
      <td class="text-primary font-bold">${formatGB(a.total_gb)}</td>
      <td style="color:var(--text-secondary)">${formatMoney(a.total_gross)}</td>
      <td class="text-warning">−${formatMoney(a.total_commission)}</td>
      <td class="text-success font-bold">${formatMoney(a.total_net)}</td>
    </tr>`).join('');

  const recentPayRows = (recentPayments.results || []).map((p: any) => `
    <tr>
      <td style="font-size:.8rem">${p.payment_date}</td>
      <td><strong>${p.seller_name}</strong></td>
      <td><span class="badge badge-${p.type==='settlement'?'success':p.type==='commission'?'warning':'info'}">${p.type}</span></td>
      <td class="text-success font-bold">+${formatMoney(p.amount)}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${p.notes||'—'}</td>
    </tr>`).join('');

  return `
  <!-- Page Header -->
  <div class="page-header">
    <div>
      <div class="page-title">💼 داشبورد مالی</div>
      <div class="page-subtitle">${company?.name ?? ''} · ${pl}${selectedBranchName ? ' · 🏢 ' + selectedBranchName : ''}</div>
    </div>
    <div class="btn-group">
      <a href="/dashboard?mode=owner" class="btn btn-outline btn-sm">📊 حالت مالک</a>
      <a href="/allocations" class="btn btn-outline btn-sm">🔀 تخصیص‌ها</a>
      <a href="/payments" class="btn btn-outline btn-sm">💰 دریافتی‌ها</a>
    </div>
  </div>

  ${renderPeriodBar(period, '/dashboard', dateFrom, dateTo, '&mode=financial', allBranches.results||[], branchId)}

  <!-- 6 KPI CARDS -->
  <div class="stats-grid" style="margin-bottom:1.25rem">
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-label">📦 کل تخصیص</div>
      <div class="stat-value" style="color:#7c3aed">${formatGB(totalGb)}</div>
      <div class="stat-sub">${formatMoney(totalGross)} ناخالص</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#d97706"></div>
      <div class="stat-label">🏷️ خالص بدهی فروشندگان</div>
      <div class="stat-value warning">${formatMoney(totalNet)}</div>
      <div class="stat-sub">کمیسیون ${formatMoney(totalCommission)} کسر شد</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">✅ دریافتی از فروشندگان</div>
      <div class="stat-value success">${formatMoney(totalPaid)}</div>
      <div class="stat-sub">total received</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:${totalRemaining>0?'var(--danger)':'var(--success)'}"></div>
      <div class="stat-label">⏳ باقی‌مانده بدهی</div>
      <div class="stat-value" style="color:${totalRemaining>0?'var(--danger)':'var(--success)'}">${formatMoney(Math.abs(totalRemaining))}</div>
      <div class="stat-sub">${totalRemaining>0?'هنوز نپرداخته':'اضافه پرداخت'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#f97316"></div>
      <div class="stat-label">💸 مصارف شرکت</div>
      <div class="stat-value" style="color:#f97316">${formatMoney(totalExpenses)}</div>
      <div class="stat-sub"><a href="/expenses" style="color:var(--primary);font-size:.75rem">مدیریت →</a></div>
    </div>
    <div class="stat-card" style="background:${availableCapital>=0?'linear-gradient(135deg,#dcfce7,var(--bg-secondary))':'linear-gradient(135deg,#fee2e2,var(--bg-secondary))'}">
      <div class="stat-card-accent" style="background:${availableCapital>=0?'var(--success)':'var(--danger)'}"></div>
      <div class="stat-label">💎 سرمایه موجود</div>
      <div class="stat-value" style="color:${availableCapital>=0?'var(--success)':'var(--danger)'};font-size:1.35rem">${formatMoney(availableCapital)}</div>
      <div class="stat-sub">دریافتی − خرید − مصارف</div>
    </div>
  </div>

  <!-- CHART (7-day) + MONTHLY TREND (6 months) -->
  <div class="grid-chart-trend">

    <!-- 7-Day Payments Bar Chart -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">📈 دریافتی‌ها — ۷ روز اخیر</div>
        <span style="font-size:.72rem;color:var(--text-muted)">روزانه</span>
      </div>
      <div style="padding:.75rem 1rem 1rem">
        <canvas id="invChart" height="130"></canvas>
      </div>
    </div>

    <!-- 6-Month Monthly Trend -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">📅 روند ۶ ماهه</div>
        <span style="font-size:.72rem;color:var(--text-muted)">تخصیص / دریافتی</span>
      </div>
      ${(monthly6.results||[]).length ? `
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>ماه</th>
            <th>GB</th>
            <th>خالص بدهی</th>
            <th>دریافتی</th>
          </tr></thead>
          <tbody>
            ${(monthly6.results||[]).map((m:any) => {
              const paid = payByMonth[m.month] ?? 0;
              const rem  = m.alloc_net - paid;
              return `<tr>
                <td class="font-bold" style="font-size:.8rem">${m.month}</td>
                <td class="text-primary">${formatGB(m.alloc_gb)}</td>
                <td style="color:#0891b2">${formatMoney(m.alloc_net)}</td>
                <td class="text-success">${formatMoney(paid)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="empty-state" style="padding:2rem">
        <div class="empty-state-icon">📅</div>
        <h3>هنوز داده‌ای نیست</h3>
      </div>`}
    </div>
  </div>

  <!-- PER-SELLER TABLE -->
  <div class="card" style="margin-bottom:1.25rem">
    <div class="card-header">
      <div class="card-title">👥 وضعیت مالی فروشندگان</div>
      <a href="/ledger" class="btn btn-outline btn-sm">📒 دفتر کل</a>
    </div>
    ${(sellerStats.results||[]).length ? `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>فروشنده</th>
          <th>GB تخصیص</th>
          <th>ناخالص</th>
          <th>کمیسیون</th>
          <th>خالص بدهی</th>
          <th>دریافتی</th>
          <th>باقی‌مانده</th>
          <th>پیشرفت</th>
          <th></th>
        </tr></thead>
        <tbody>${sellerRows}</tbody>
      </table>
    </div>` : `
    <div class="empty-state"><div class="empty-state-icon">👥</div><h3>هنوز تخصیصی ثبت نشده</h3></div>`}
  </div>

  <!-- TWO-COLUMN: RECENT ALLOCATIONS + RECENT PAYMENTS -->
  <div class="grid-2col">
    <div class="card">
      <div class="card-header">
        <div class="card-title">🔀 آخرین تخصیص‌ها</div>
        <a href="/allocations" class="btn btn-outline btn-sm">همه →</a>
      </div>
      ${(recentAllocs.results||[]).length ? `
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>تاریخ</th><th>فروشنده</th><th>GB</th>
            <th>ناخالص</th><th>کمیسیون</th><th>خالص</th>
          </tr></thead>
          <tbody>${recentAllocRows}</tbody>
        </table>
      </div>` : `<div class="empty-state" style="padding:1.5rem"><div class="empty-state-icon">🔀</div><h3>بدون تخصیص</h3></div>`}
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">💰 آخرین دریافتی‌ها</div>
        <a href="/payments" class="btn btn-outline btn-sm">همه →</a>
      </div>
      ${(recentPayments.results||[]).length ? `
      <div class="table-wrapper">
        <table>
          <thead><tr><th>تاریخ</th><th>فروشنده</th><th>نوع</th><th>دریافتی</th><th>یادداشت</th></tr></thead>
          <tbody>${recentPayRows}</tbody>
        </table>
      </div>` : `<div class="empty-state" style="padding:1.5rem"><div class="empty-state-icon">💰</div><h3>بدون دریافتی</h3></div>`}
    </div>
  </div>

  <!-- FORMULA STRIP (moved to bottom) -->
  <div class="formula-strip">
    <div class="formula-strip-group">
      <span style="color:#94a3b8;font-size:.7rem">ناخالص</span>
      <span style="color:#e2e8f0;font-weight:700">${formatMoney(totalGross)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">کمیسیون</span>
      <span style="color:#fbbf24;font-weight:700">${formatMoney(totalCommission)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">خرید</span>
      <span style="color:#f97316;font-weight:700">${formatMoney(totalPurchaseCost)}</span>
      <span class="formula-strip-sep">=</span>
      <span style="color:#94a3b8;font-size:.7rem">سود خالص</span>
      <span style="color:${ownerNetProfit>=0?'#34d399':'#f87171'};font-weight:700;font-size:.95rem">${formatMoney(ownerNetProfit)}</span>
    </div>
    <div class="formula-strip-divider"></div>
    <div class="formula-strip-group">
      <span style="color:#94a3b8;font-size:.7rem">دریافتی</span>
      <span style="color:#34d399;font-weight:700">${formatMoney(totalPaid)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">خرید</span>
      <span style="color:#f97316;font-weight:700">${formatMoney(totalPurchaseCost)}</span>
      <span class="formula-strip-sep">−</span>
      <span style="color:#94a3b8;font-size:.7rem">مصارف</span>
      <span style="color:#fb923c;font-weight:700">${formatMoney(totalExpenses)}</span>
      <span class="formula-strip-sep">=</span>
      <span style="color:#94a3b8;font-size:.7rem">سرمایه موجود</span>
      <span style="color:${availableCapital>=0?'#34d399':'#f87171'};font-weight:700;font-size:.95rem">${formatMoney(availableCapital)}</span>
    </div>
  </div>

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
  (function(){
    const ctx = document.getElementById('invChart');
    if(!ctx) return;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${chartLabels7},
        datasets: [{
          label: 'دریافتی',
          data: ${chartPayData},
          backgroundColor: 'rgba(52,211,153,.55)',
          borderColor: '#10b981',
          borderWidth: 1.5,
          borderRadius: 5
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ' ؋' + Math.round(ctx.parsed.y).toLocaleString()
            }
          }
        },
        scales: {
          x: { grid:{color:'rgba(148,163,184,.08)'}, ticks:{color:'var(--text-muted)',font:{size:10}} },
          y: { grid:{color:'rgba(148,163,184,.08)'}, ticks:{color:'#10b981',font:{size:10}, callback: v=>'؋'+Math.round(v).toLocaleString()} }
        }
      }
    });
  })();
  </script>`;
}


// ---- Router ----
dashboard.get('/', async (c) => {
  const user     = c.get('user');
  const lang     = c.get('lang');
  const period   = c.req.query('period') ?? 'today';   // ← پیش‌فرض: امروز
  const mode     = c.req.query('mode')   ?? '';
  const dateFrom = c.req.query('from')   ?? '';
  const dateTo   = c.req.query('to')     ?? '';
  const branchId = c.req.query('branch') ?? '';

  let bodyHtml: string;
  if (user.role === 'owner') {
    // Check company settings for dashboard_mode
    const company = await c.env.DB.prepare('SELECT settings FROM companies WHERE id=?')
      .bind(user.company_id).first<{settings:string}>();
    const settings = JSON.parse(company?.settings || '{}');
    const dashMode = mode || settings.dashboard_mode || 'owner';

    if (dashMode === 'financial') {
      bodyHtml = await investorDashboard(c.env.DB, user, lang, period, dateFrom, dateTo, branchId);
    } else {
      bodyHtml = await ownerDashboard(c.env.DB, user, lang, period, dateFrom, dateTo, branchId);
    }
  } else {
    bodyHtml = await sellerDashboard(c.env.DB, user, lang, period, dateFrom, dateTo);
  }

  return c.html(pageShell({
    title: t(lang, 'dashboard'),
    lang, user,
    body: bodyHtml,
    activePage: 'dashboard'
  }));
});

export default dashboard;
