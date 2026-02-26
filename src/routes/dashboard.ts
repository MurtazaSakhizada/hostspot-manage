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

// ---- OWNER DASHBOARD ----
async function ownerDashboard(db: D1Database, user: SessionUser, lang: Lang): Promise<string> {
  // Aggregate totals
  const inv = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(gross_amount),0) as gross,
           COALESCE(SUM(commission_amount),0) as comm, COALESCE(SUM(net_amount),0) as net
    FROM inventory WHERE company_id=?`).bind(user.company_id).first<any>();

  const alloc = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(gross_amount),0) as gross,
           COALESCE(SUM(commission_amount),0) as comm, COALESCE(SUM(net_amount),0) as net
    FROM allocations WHERE company_id=?`).bind(user.company_id).first<any>();

  const sls = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(gross_amount),0) as gross,
           COALESCE(SUM(commission_amount),0) as comm, COALESCE(SUM(net_amount),0) as net
    FROM sales WHERE company_id=?`).bind(user.company_id).first<any>();

  // Branch drill-down
  const branches = await db.prepare(`
    SELECT b.id, b.name,
      COALESCE(SUM(s.total_gb),0) as sold_gb,
      COALESCE(SUM(s.gross_amount),0) as gross,
      COALESCE(SUM(s.commission_amount),0) as comm,
      COALESCE(SUM(s.net_amount),0) as net,
      COUNT(DISTINCT s.seller_id) as sellers
    FROM branches b
    LEFT JOIN sales s ON s.branch_id = b.id AND s.company_id = b.company_id
    WHERE b.company_id = ?
    GROUP BY b.id, b.name ORDER BY sold_gb DESC`).bind(user.company_id).all<any>();

  // Per seller
  const sellers = await db.prepare(`
    SELECT u.id, u.full_name, u.commission_rate,
      COALESCE(SUM(s.total_gb),0) as sold_gb,
      COALESCE(SUM(s.gross_amount),0) as gross,
      COALESCE(SUM(s.commission_amount),0) as comm,
      COALESCE(SUM(s.net_amount),0) as net,
      COUNT(s.id) as tx_count
    FROM users u
    LEFT JOIN sales s ON s.seller_id = u.id AND s.company_id = u.company_id
    WHERE u.company_id = ? AND u.role='seller' AND u.active=1
    GROUP BY u.id, u.full_name, u.commission_rate ORDER BY sold_gb DESC`).bind(user.company_id).all<any>();

  // Monthly trend (last 6 months)
  const monthly = await db.prepare(`
    SELECT strftime('%Y-%m', snapshot_time) as month,
      COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(net_amount),0) as net
    FROM sales WHERE company_id=?
    GROUP BY month ORDER BY month DESC LIMIT 6`).bind(user.company_id).all<any>();

  const branchRows = (branches.results || []).map((b: any, i: number) => `
    <tr>
      <td><strong>${b.name}</strong></td>
      <td class="text-primary font-bold">${formatGB(b.sold_gb)}</td>
      <td>${formatMoney(b.gross)}</td>
      <td class="text-warning">${formatMoney(b.comm)}</td>
      <td class="text-success font-bold">${formatMoney(b.net)}</td>
      <td>${b.sellers}</td>
      <td><button onclick="toggleRow('br-sellers-${i}')" class="btn btn-outline btn-sm">${t(lang,'view_details')}</button></td>
    </tr>
    <tr id="br-sellers-${i}" class="hidden">
      <td colspan="7">
        <div class="drill-body" style="display:block">
          ${(sellers.results||[]).map((s: any) => `
            <div class="summary-row">
              <span class="summary-label">${s.full_name} (${Math.round(s.commission_rate*100)}%)</span>
              <span class="summary-value gb">${formatGB(s.sold_gb)}</span>
              <span class="summary-value money">${formatMoney(s.net)}</span>
            </div>`).join('')}
        </div>
      </td>
    </tr>`).join('');

  const sellerRows = (sellers.results || []).map((s: any) => `
    <tr>
      <td><strong>${s.full_name}</strong></td>
      <td><span class="badge badge-info">${Math.round(s.commission_rate*100)}%</span></td>
      <td class="text-primary font-bold">${formatGB(s.sold_gb)}</td>
      <td>${formatMoney(s.gross)}</td>
      <td class="text-warning">${formatMoney(s.comm)}</td>
      <td class="text-success font-bold">${formatMoney(s.net)}</td>
      <td>${s.tx_count}</td>
    </tr>`).join('');

  const monthlyRows = (monthly.results || []).map((m: any) => `
    <div class="summary-row">
      <span class="summary-label">${m.month}</span>
      <span class="summary-value gb">${formatGB(m.gb)}</span>
      <span class="summary-value money">${formatMoney(m.net)}</span>
    </div>`).join('');

  return `
  <div class="page-header">
    <div>
      <div class="page-title">📊 ${t(lang,'dashboard')}</div>
      <div class="page-subtitle">${t(lang,'overview')} · ${t(lang,'all_time')}</div>
    </div>
    <div class="btn-group">
      <a href="/reports" class="btn btn-outline btn-sm">📋 ${t(lang,'reports')}</a>
      <a href="/inventory/add" class="btn btn-primary btn-sm">+ ${t(lang,'add_inventory')}</a>
    </div>
  </div>

  <!-- PRIMARY KPIs -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--primary)"></div>
      <div class="stat-card-icon" style="background:var(--primary-light)">📦</div>
      <div class="stat-label">${t(lang,'total_gb')} (Inventory)</div>
      <div class="stat-value primary">${formatGB(inv?.gb ?? 0)}</div>
      <div class="stat-sub">Total Purchased</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-card-icon" style="background:#ede9fe">🔀</div>
      <div class="stat-label">${t(lang,'total_allocated')}</div>
      <div class="stat-value" style="color:#7c3aed">${formatGB(alloc?.gb ?? 0)}</div>
      <div class="stat-sub">To Sellers</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-card-icon" style="background:var(--success-light)">💰</div>
      <div class="stat-label">${t(lang,'total_sold')}</div>
      <div class="stat-value success">${formatGB(sls?.gb ?? 0)}</div>
      <div class="stat-sub">Revenue-Generating</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#0891b2"></div>
      <div class="stat-card-icon" style="background:#cffafe">📈</div>
      <div class="stat-label">${t(lang,'total_gross')}</div>
      <div class="stat-value" style="color:#0891b2">${formatMoney(sls?.gross ?? 0)}</div>
      <div class="stat-sub">Before Commission</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--warning)"></div>
      <div class="stat-card-icon" style="background:var(--warning-light)">💸</div>
      <div class="stat-label">${t(lang,'total_commission')}</div>
      <div class="stat-value warning">${formatMoney(sls?.comm ?? 0)}</div>
      <div class="stat-sub">Paid to Sellers</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-card-icon" style="background:var(--success-light)">🏆</div>
      <div class="stat-label">${t(lang,'net_profit')}</div>
      <div class="stat-value success large">${formatMoney(sls?.net ?? 0)}</div>
      <div class="stat-sub">Investor Net</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
    <!-- Branch Breakdown -->
    <div class="card" style="grid-column: span 2">
      <div class="card-header">
        <div class="card-title">🏢 ${t(lang,'by_branch')}</div>
        <span class="text-sm text-gray">${t(lang,'drilldown')}</span>
      </div>
      ${(branches.results||[]).length ? `
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>${t(lang,'branch')}</th>
            <th>${t(lang,'total_gb')}</th>
            <th>${t(lang,'total_gross')}</th>
            <th>${t(lang,'total_commission')}</th>
            <th>${t(lang,'net_profit')}</th>
            <th>${t(lang,'sellers')}</th>
            <th></th>
          </tr></thead>
          <tbody>${branchRows}</tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="empty-state-icon">🏢</div><h3>${t(lang,'no_data')}</h3></div>`}
    </div>
  </div>

  <div style="display:grid;grid-template-columns:2fr 1fr;gap:1rem">
    <!-- Seller Performance -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">👥 ${t(lang,'by_seller')}</div>
        <a href="/users" class="btn btn-outline btn-sm">${t(lang,'view_details')}</a>
      </div>
      ${(sellers.results||[]).length ? `
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>${t(lang,'seller')}</th>
            <th>${t(lang,'commission_rate')}</th>
            <th>${t(lang,'total_gb')}</th>
            <th>${t(lang,'total_gross')}</th>
            <th>${t(lang,'commission_amount')}</th>
            <th>${t(lang,'net_profit')}</th>
            <th>Txns</th>
          </tr></thead>
          <tbody>${sellerRows}</tbody>
        </table>
      </div>` : `<div class="empty-state"><div class="empty-state-icon">👥</div><h3>${t(lang,'no_data')}</h3></div>`}
    </div>

    <!-- Monthly Trend -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">📅 Monthly Trend</div>
      </div>
      ${monthlyRows || `<div class="empty-state"><div class="empty-state-icon">📅</div><h3>${t(lang,'no_data')}</h3></div>`}
    </div>
  </div>`;
}

// ---- SELLER DASHBOARD ----
async function sellerDashboard(db: D1Database, user: SessionUser, lang: Lang, period: string): Promise<string> {
  let dateFilter = '';
  if (period === 'today') dateFilter = `AND date(s.snapshot_time) = date('now')`;
  else if (period === 'week') dateFilter = `AND s.snapshot_time >= datetime('now', '-7 days')`;
  else if (period === 'month') dateFilter = `AND s.snapshot_time >= datetime('now', '-30 days')`;
  else if (period === 'year') dateFilter = `AND s.snapshot_time >= datetime('now', '-365 days')`;

  // Seller's allocations (available inventory)
  const avail = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(net_amount),0) as net
    FROM allocations WHERE company_id=? AND seller_id=?`).bind(user.company_id, user.id).first<any>();

  // Seller's sales
  const sold = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(commission_amount),0) as comm,
           COALESCE(SUM(net_amount),0) as net, COUNT(*) as cnt
    FROM sales s WHERE s.company_id=? AND s.seller_id=? ${dateFilter}`).bind(user.company_id, user.id).first<any>();

  // Recent sales
  const recentSales = await db.prepare(`
    SELECT s.*, p.name as pkg_name, p.size_gb, b.name as branch_name
    FROM sales s
    JOIN packages p ON p.id = s.package_id
    JOIN branches b ON b.id = s.branch_id
    WHERE s.company_id=? AND s.seller_id=?
    ORDER BY s.snapshot_time DESC LIMIT 10`).bind(user.company_id, user.id).all<any>();

  // Allocations breakdown
  const allocBreakdown = await db.prepare(`
    SELECT a.*, p.name as pkg_name, p.size_gb, b.name as branch_name
    FROM allocations a
    JOIN packages p ON p.id = a.package_id
    JOIN branches b ON b.id = a.branch_id
    WHERE a.company_id=? AND a.seller_id=?
    ORDER BY a.snapshot_time DESC LIMIT 20`).bind(user.company_id, user.id).all<any>();

  const periodBtns = ['today','week','month','year','all'].map(p => `
    <a href="/dashboard?period=${p}" class="btn btn-sm ${period===p?'btn-primary':'btn-outline'}">${t(lang, p==='all'?'all_time':p==='today'?'today':p==='week'?'this_week':p==='month'?'this_month':'this_year')}</a>
  `).join('');

  const saleRows = (recentSales.results||[]).map((s: any) => `
    <tr>
      <td>${new Date(s.snapshot_time).toLocaleDateString()}</td>
      <td>${s.branch_name}</td>
      <td>${s.pkg_name} (${s.size_gb}GB)</td>
      <td class="text-center">${s.quantity}</td>
      <td class="text-primary font-bold">${formatGB(s.total_gb)}</td>
      <td class="text-success font-bold">${formatMoney(s.net_amount)}</td>
    </tr>`).join('');

  const allocRows = (allocBreakdown.results||[]).map((a: any) => `
    <div class="summary-row">
      <div>
        <div class="font-bold">${a.pkg_name}</div>
        <div class="text-xs text-gray">${a.branch_name} · ${a.quantity} units</div>
      </div>
      <div style="text-align:right">
        <div class="summary-value gb">${formatGB(a.total_gb)}</div>
        <div class="text-xs text-success">${formatMoney(a.net_amount)}</div>
      </div>
    </div>`).join('');

  return `
  <div class="page-header">
    <div>
      <div class="page-title">👋 ${t(lang,'welcome')}, ${user.full_name}</div>
      <div class="page-subtitle">${t(lang,'dashboard')} · ${t(lang,'seller_role')}</div>
    </div>
    <a href="/sales/add" class="btn btn-primary">+ ${t(lang,'add_sale')}</a>
  </div>

  <!-- Period Filter -->
  <div style="margin-bottom:1.5rem">
    <div class="btn-group">${periodBtns}</div>
  </div>

  <!-- Seller KPIs (NET ONLY) -->
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--primary)"></div>
      <div class="stat-card-icon" style="background:var(--primary-light)">📦</div>
      <div class="stat-label">${t(lang,'available_gb')}</div>
      <div class="stat-value primary">${formatGB(avail?.gb ?? 0)}</div>
      <div class="stat-sub">Allocated to you</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-card-icon" style="background:var(--success-light)">✅</div>
      <div class="stat-label">${t(lang,'total_sold')}</div>
      <div class="stat-value success">${formatGB(sold?.gb ?? 0)}</div>
      <div class="stat-sub">${sold?.cnt ?? 0} transactions</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--warning)"></div>
      <div class="stat-card-icon" style="background:var(--warning-light)">💰</div>
      <div class="stat-label">${t(lang,'commission_earned')}</div>
      <div class="stat-value warning">${formatMoney(sold?.comm ?? 0)}</div>
      <div class="stat-sub">Your commission</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-card-icon" style="background:#ede9fe">🏦</div>
      <div class="stat-label">${t(lang,'net_amount')}</div>
      <div class="stat-value" style="color:#7c3aed">${formatMoney(sold?.net ?? 0)}</div>
      <div class="stat-sub">${t(lang,'balance')}</div>
    </div>
  </div>

  <!-- Recent Sales -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">💰 Recent Sales</div>
      <a href="/sales" class="btn btn-outline btn-sm">${t(lang,'view_details')}</a>
    </div>
    ${(recentSales.results||[]).length ? `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>${t(lang,'date')}</th>
          <th>${t(lang,'branch')}</th>
          <th>${t(lang,'package')}</th>
          <th>${t(lang,'quantity')}</th>
          <th>${t(lang,'total_gb')}</th>
          <th>${t(lang,'net_amount')}</th>
        </tr></thead>
        <tbody>${saleRows}</tbody>
      </table>
    </div>` : `<div class="empty-state"><div class="empty-state-icon">💰</div><h3>${t(lang,'no_data')}</h3><p>No sales yet. <a href="/sales/add">Add your first sale</a></p></div>`}
  </div>

  <!-- Allocation Breakdown (Expandable) -->
  <div class="drill-section" id="alloc-drill">
    <div class="drill-header" onclick="document.getElementById('alloc-drill').classList.toggle('open')">
      <div class="drill-header-left">
        <span>🔀 ${t(lang,'allocations')} ${t(lang,'package_breakdown')}</span>
        <span class="badge badge-info">${allocBreakdown.results?.length ?? 0}</span>
      </div>
      <span class="drill-chevron">▼</span>
    </div>
    <div class="drill-body">
      ${allocRows || `<div class="text-gray text-sm">${t(lang,'no_data')}</div>`}
    </div>
  </div>`;
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
