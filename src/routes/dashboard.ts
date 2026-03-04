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

  // ── Per seller ───────────────────────────────────────────
  const sellers = await db.prepare(`
    SELECT u.id, u.full_name, u.commission_rate,
      COALESCE(SUM(s.total_gb),0) as sold_gb,
      COALESCE(SUM(s.gross_amount),0) as gross,
      COALESCE(SUM(s.commission_amount),0) as comm,
      COALESCE(SUM(s.net_amount),0) as net,
      COUNT(s.id) as tx_count,
      COALESCE((SELECT SUM(amount) FROM payments p WHERE p.seller_id=u.id AND p.company_id=u.company_id),0) as paid
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
    const balance = s.comm - s.paid; // owed to seller
    return `
    <tr>
      <td><strong>${s.full_name}</strong></td>
      <td><span class="badge badge-info">${Math.round(s.commission_rate*100)}%</span></td>
      <td class="text-primary font-bold">${formatGB(s.sold_gb)}</td>
      <td>${formatMoney(s.gross)}</td>
      <td class="text-warning">${formatMoney(s.comm)}</td>
      <td class="text-success font-bold">${formatMoney(s.net)}</td>
      <td>${s.tx_count}</td>
      <td style="color:${balance>0?'var(--danger)':'var(--success)'};font-weight:600">${formatMoney(Math.abs(balance))} ${balance>0?'owed':'settled'}</td>
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
      <div class="page-subtitle">${company?.name ?? ''} · All time</div>
    </div>
    <div class="btn-group">
      <a href="/reports" class="btn btn-outline btn-sm">📋 ${t(lang,'reports')}</a>
      <a href="/inventory/add" class="btn btn-primary btn-sm">+ ${t(lang,'add_inventory')}</a>
    </div>
  </div>

  <!-- PROFIT FORMULA BANNER -->
  <div style="background:linear-gradient(135deg,var(--primary-dark,#312e81),#1e1b4b);border-radius:12px;padding:1rem 1.25rem;margin-bottom:1.25rem;display:flex;gap:1.5rem;flex-wrap:wrap;align-items:center">
    <div style="color:#a5b4fc;font-size:.78rem;font-weight:600;white-space:nowrap">💡 PROFIT FORMULA</div>
    <div style="flex:1;display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;font-size:.875rem">
      <span style="color:#f1f5f9">${formatMoney(grossRevenue)}</span>
      <span style="color:#94a3b8">Gross</span>
      <span style="color:#94a3b8">−</span>
      <span style="color:#fbbf24">${formatMoney(totalComm)}</span>
      <span style="color:#94a3b8">Comm.</span>
      <span style="color:#94a3b8">−</span>
      <span style="color:#f87171">${formatMoney(soldPurchaseCost)}</span>
      <span style="color:#94a3b8">Purchase</span>
      <span style="color:#94a3b8">=</span>
      <span style="color:#4ade80;font-weight:700;font-size:1rem">${formatMoney(netProfit)}</span>
      <span style="color:#4ade80">Net Profit</span>
      <span style="color:#94a3b8">−</span>
      <span style="color:#fb923c">${formatMoney(totalExpenses)}</span>
      <span style="color:#94a3b8">Expenses</span>
      <span style="color:#94a3b8">=</span>
      <span style="color:${availableCapital>=0?'#34d399':'#f87171'};font-weight:700;font-size:1rem">${formatMoney(availableCapital)}</span>
      <span style="color:${availableCapital>=0?'#34d399':'#f87171'}">Available Capital</span>
    </div>
  </div>

  <!-- PRIMARY KPIs -->
  <div class="stats-grid" style="margin-bottom:1.25rem">
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--primary)"></div>
      <div class="stat-label">Total GB Stocked</div>
      <div class="stat-value primary">${formatGB(invBatch?.gb ?? 0)}</div>
      <div class="stat-sub">${formatGB(stockGb)} remaining</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-label">GB Allocated</div>
      <div class="stat-value" style="color:#7c3aed">${formatGB(alloc?.gb ?? 0)}</div>
      <div class="stat-sub">To sellers</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">GB Sold</div>
      <div class="stat-value success">${formatGB(soldGb)}</div>
      <div class="stat-sub">${sls?.cnt ?? 0} transactions</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#0891b2"></div>
      <div class="stat-label">Gross Revenue</div>
      <div class="stat-value" style="color:#0891b2">${formatMoney(grossRevenue)}</div>
      <div class="stat-sub">Before deductions</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--warning)"></div>
      <div class="stat-label">Commissions</div>
      <div class="stat-value warning">${formatMoney(totalComm)}</div>
      <div class="stat-sub">Paid to sellers</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--danger)"></div>
      <div class="stat-label">Purchase Cost</div>
      <div class="stat-value" style="color:var(--danger)">${formatMoney(soldPurchaseCost)}</div>
      ${purchasePriceNote}
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">Net Profit</div>
      <div class="stat-value success large">${formatMoney(netProfit)}</div>
      <div class="stat-sub">After comm + purchase</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#f97316"></div>
      <div class="stat-label">Total Expenses</div>
      <div class="stat-value" style="color:#f97316">${formatMoney(totalExpenses)}</div>
      <div class="stat-sub"><a href="/expenses" style="color:var(--primary);font-size:.75rem">Manage →</a></div>
    </div>
    <div class="stat-card" style="background:${availableCapital>=0?'linear-gradient(135deg,var(--success-light,#dcfce7),var(--bg-secondary))':'linear-gradient(135deg,#fee2e2,var(--bg-secondary))'}">
      <div class="stat-card-accent" style="background:${availableCapital>=0?'var(--success)':'var(--danger)'}"></div>
      <div class="stat-label">💎 Available Capital</div>
      <div class="stat-value" style="color:${availableCapital>=0?'var(--success)':'var(--danger)'};font-size:1.35rem">${formatMoney(availableCapital)}</div>
      <div class="stat-sub">Net Profit − Expenses</div>
    </div>
  </div>

  <!-- Charts + Activity -->
  <div style="display:grid;grid-template-columns:1fr 300px;gap:1rem;margin-bottom:1.5rem">
    <div class="card">
      <div class="card-header">
        <div class="card-title">📈 Revenue — Last 7 Days</div>
        <div style="display:flex;gap:.75rem;font-size:.72rem;color:var(--text-muted)">
          <span style="color:var(--primary)">● Gross</span>
          <span style="color:var(--success)">● Net</span>
        </div>
      </div>
      <canvas id="revChart" height="120"></canvas>
    </div>
    <div class="card" style="overflow:hidden">
      <div class="card-header">
        <div class="card-title">💸 Recent Expenses</div>
        <a href="/expenses" class="btn btn-outline btn-sm">All →</a>
      </div>
      ${expRows || `<div class="empty-state" style="padding:1.5rem"><div class="empty-state-icon">💸</div><h3>No expenses</h3></div>`}
      ${totalExpenses>0?`<div style="padding:.75rem 1rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-weight:600">
        <span>Total</span><span style="color:var(--danger)">${formatMoney(totalExpenses)}</span>
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
          <th>GB Sold</th>
          <th>Gross</th>
          <th>Commission</th>
          <th>Net</th>
          <th>Sellers</th>
        </tr></thead>
        <tbody>${branchRows}</tbody>
      </table>
    </div>` : `<div class="empty-state"><div class="empty-state-icon">🏢</div><h3>${t(lang,'no_data')}</h3></div>`}
  </div>

  <!-- Seller Performance -->
  <div class="card" style="margin-bottom:1rem">
    <div class="card-header">
      <div class="card-title">👥 Seller Performance</div>
      <a href="/users" class="btn btn-outline btn-sm">Manage →</a>
    </div>
    ${(sellers.results||[]).length ? `
    <div class="table-wrapper">
      <table>
        <thead><tr>
          <th>Seller</th>
          <th>Rate</th>
          <th>GB Sold</th>
          <th>Gross</th>
          <th>Commission</th>
          <th>Net</th>
          <th>Txns</th>
          <th>Balance</th>
        </tr></thead>
        <tbody>${sellerRows}</tbody>
      </table>
    </div>` : `<div class="empty-state"><div class="empty-state-icon">👥</div><h3>${t(lang,'no_data')}</h3></div>`}
  </div>

  <!-- Monthly Trend -->
  <div class="card">
    <div class="card-header">
      <div class="card-title">📅 Monthly Trend (Last 6 Months)</div>
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
          {label:'Gross',data:${chartGross},backgroundColor:'rgba(99,102,241,.55)',borderColor:'var(--primary)',borderWidth:1.5,borderRadius:4},
          {label:'Net',data:${chartNet},backgroundColor:'rgba(34,197,94,.45)',borderColor:'var(--success)',borderWidth:1.5,borderRadius:4}
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
// SELLER DASHBOARD - Complete rebuild
// ============================================================
async function sellerDashboard(db: D1Database, user: SessionUser, lang: Lang, period: string): Promise<string> {
  let dateFilter = '';
  if (period === 'today') dateFilter = `AND date(snapshot_time) = date('now')`;
  else if (period === 'week')  dateFilter = `AND snapshot_time >= datetime('now','-7 days')`;
  else if (period === 'month') dateFilter = `AND snapshot_time >= datetime('now','-30 days')`;
  else if (period === 'year')  dateFilter = `AND snapshot_time >= datetime('now','-365 days')`;

  // Sales by period
  const sold = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb,
           COALESCE(SUM(gross_amount),0) as gross,
           COALESCE(SUM(commission_amount),0) as comm,
           COALESCE(SUM(net_amount),0) as net,
           COUNT(*) as cnt
    FROM sales WHERE company_id=? AND seller_id=? ${dateFilter}`)
    .bind(user.company_id, user.id).first<any>();

  // All-time sales (for totals)
  const soldAll = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb,
           COALESCE(SUM(commission_amount),0) as comm
    FROM sales WHERE company_id=? AND seller_id=?`)
    .bind(user.company_id, user.id).first<any>();

  // Total payments received
  const paidRow = await db.prepare(`
    SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
    FROM payments WHERE company_id=? AND seller_id=?`)
    .bind(user.company_id, user.id).first<any>();

  // Balance owed (commission - paid)
  const totalComm = soldAll?.comm ?? 0;
  const totalPaid = paidRow?.total ?? 0;
  const balance   = totalComm - totalPaid; // positive = owed to seller

  // Allocation totals (stock given to this seller)
  const allocTotals = await db.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb, COUNT(*) as batches
    FROM allocation_batches WHERE company_id=? AND seller_id=?`)
    .bind(user.company_id, user.id).first<any>();

  // Recent sales
  const recentSales = await db.prepare(`
    SELECT s.snapshot_time, p.name as pkg_name, p.size_gb, b.name as branch_name,
           s.quantity, s.total_gb, s.gross_amount, s.commission_amount, s.net_amount
    FROM sales s
    JOIN packages p ON p.id=s.package_id
    JOIN branches b ON b.id=s.branch_id
    WHERE s.company_id=? AND s.seller_id=?
    ORDER BY s.snapshot_time DESC LIMIT 15`)
    .bind(user.company_id, user.id).all<any>();

  // Recent allocations
  const recentAllocs = await db.prepare(`
    SELECT ab.created_at, br.name as branch_name, ab.total_gb, ab.total_gross
    FROM allocation_batches ab
    JOIN branches br ON br.id=ab.branch_id
    WHERE ab.company_id=? AND ab.seller_id=?
    ORDER BY ab.created_at DESC LIMIT 10`)
    .bind(user.company_id, user.id).all<any>();

  // Recent payments
  const recentPayments = await db.prepare(`
    SELECT payment_date, type, amount, notes
    FROM payments WHERE company_id=? AND seller_id=?
    ORDER BY payment_date DESC, created_at DESC LIMIT 8`)
    .bind(user.company_id, user.id).all<any>();

  // Sales chart last 7 days
  const chart7 = await db.prepare(`
    SELECT strftime('%Y-%m-%d', snapshot_time) as day,
           COALESCE(SUM(total_gb),0) as gb,
           COALESCE(SUM(commission_amount),0) as comm,
           COUNT(*) as cnt
    FROM sales WHERE company_id=? AND seller_id=? AND snapshot_time >= datetime('now','-7 days')
    GROUP BY day ORDER BY day ASC`)
    .bind(user.company_id, user.id).all<any>();

  const days7: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    days7.push(d.toISOString().split('T')[0]);
  }
  const chartMap = Object.fromEntries((chart7.results||[]).map((r:any)=>[r.day,r]));
  const chartLabels = JSON.stringify(days7.map(d=>new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric'})));
  const chartGb   = JSON.stringify(days7.map(d=>Math.round((chartMap[d]?.gb??0)*100)/100));
  const chartComm = JSON.stringify(days7.map(d=>Math.round(chartMap[d]?.comm??0)));

  const periodBtns = ['today','week','month','year','all'].map(p => `
    <a href="/dashboard?period=${p}" class="btn btn-sm ${period===p?'btn-primary':'btn-outline'}">${
      p==='all'?'All Time':p==='today'?'Today':p==='week'?'This Week':p==='month'?'This Month':'This Year'
    }</a>`).join('');

  const saleRows = (recentSales.results||[]).map((s:any) => `
    <tr>
      <td><div class="font-bold">${new Date(s.snapshot_time).toLocaleDateString('en-GB')}</div></td>
      <td>${s.branch_name}</td>
      <td>${s.pkg_name} <span class="badge badge-primary" style="font-size:.7rem">${s.size_gb}GB</span></td>
      <td class="text-center">${s.quantity}</td>
      <td class="text-primary font-bold">${formatGB(s.total_gb)}</td>
      <td class="text-warning">${formatMoney(s.commission_amount)}</td>
      <td class="text-success font-bold">${formatMoney(s.net_amount)}</td>
    </tr>`).join('');

  const allocRows = (recentAllocs.results||[]).map((a:any) => `
    <div class="summary-row">
      <div>
        <div class="font-bold">${formatGB(a.total_gb)}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${a.branch_name} · ${new Date(a.created_at).toLocaleDateString('en-GB')}</div>
      </div>
      <span class="summary-value gb">${formatMoney(a.total_gross)}</span>
    </div>`).join('');

  const paymentRows = (recentPayments.results||[]).map((p:any) => `
    <div class="summary-row">
      <div>
        <div class="font-bold" style="text-transform:capitalize">${p.type}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${p.payment_date}${p.notes?` · ${p.notes}`:''}</div>
      </div>
      <span class="summary-value money" style="color:var(--success)">+${formatMoney(p.amount)}</span>
    </div>`).join('');

  return `
  <div class="page-header">
    <div>
      <div class="page-title">👋 ${user.full_name}</div>
      <div class="page-subtitle">Seller Dashboard · ${period==='all'?'All Time':period==='today'?'Today':period==='week'?'This Week':period==='month'?'This Month':'This Year'}</div>
    </div>
    <a href="/sales/add" class="btn btn-primary">+ Record Sale</a>
  </div>

  <!-- Period Filter -->
  <div style="margin-bottom:1.25rem">
    <div class="btn-group">${periodBtns}</div>
  </div>

  <!-- KPIs -->
  <div class="stats-grid" style="margin-bottom:1.25rem">
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--primary)"></div>
      <div class="stat-label">GB Allocated (Total)</div>
      <div class="stat-value primary">${formatGB(allocTotals?.gb ?? 0)}</div>
      <div class="stat-sub">${allocTotals?.batches??0} allocations</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">GB Sold (${period==='all'?'All':period})</div>
      <div class="stat-value success">${formatGB(sold?.gb ?? 0)}</div>
      <div class="stat-sub">${sold?.cnt ?? 0} transactions</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#0891b2"></div>
      <div class="stat-label">Gross Revenue</div>
      <div class="stat-value" style="color:#0891b2">${formatMoney(sold?.gross ?? 0)}</div>
      <div class="stat-sub">${period==='all'?'All time':'Period'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--warning)"></div>
      <div class="stat-label">Commission Earned</div>
      <div class="stat-value warning">${formatMoney(sold?.comm ?? 0)}</div>
      <div class="stat-sub">${period==='all'?'':'All-time: '+formatMoney(totalComm)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-label">Total Paid to You</div>
      <div class="stat-value" style="color:#7c3aed">${formatMoney(totalPaid)}</div>
      <div class="stat-sub">${paidRow?.cnt??0} payments</div>
    </div>
    <div class="stat-card" style="${balance>50?'background:linear-gradient(135deg,#fee2e2,var(--bg-secondary))':balance<-50?'background:linear-gradient(135deg,var(--success-light,#dcfce7),var(--bg-secondary))':''}">
      <div class="stat-card-accent" style="background:${balance>50?'var(--danger)':balance<-50?'var(--success)':'var(--text-muted)'}"></div>
      <div class="stat-label">💰 Your Balance</div>
      <div class="stat-value" style="color:${balance>50?'var(--danger)':balance<-50?'var(--success)':'var(--text-muted)'}">
        ${balance>0?'+':''}${formatMoney(balance)}
      </div>
      <div class="stat-sub">${balance>0?'Owed to you':balance<0?'Advance received':'Settled ✓'}</div>
    </div>
  </div>

  <!-- Chart + Allocations side by side -->
  <div style="display:grid;grid-template-columns:1fr 280px;gap:1rem;margin-bottom:1rem">
    <div class="card">
      <div class="card-header">
        <div class="card-title">📈 My Sales — Last 7 Days</div>
        <div style="font-size:.72rem;color:var(--text-muted)">
          <span style="color:var(--primary)">● GB Sold</span>
          &nbsp;<span style="color:var(--warning)">● Commission</span>
        </div>
      </div>
      <canvas id="sellerChart" height="130"></canvas>
    </div>
    <div class="card" style="overflow:hidden">
      <div class="card-header">
        <div class="card-title">🔀 Allocations</div>
        <a href="/allocations" class="btn btn-outline btn-sm">All →</a>
      </div>
      ${allocRows || `<div class="empty-state" style="padding:1.5rem"><div class="empty-state-icon">🔀</div><h3>No allocations</h3></div>`}
    </div>
  </div>

  <!-- Sales table + Payments side by side -->
  <div style="display:grid;grid-template-columns:1fr 280px;gap:1rem">
    <div class="card">
      <div class="card-header">
        <div class="card-title">💰 Recent Sales</div>
        <a href="/sales" class="btn btn-outline btn-sm">All Sales →</a>
      </div>
      ${(recentSales.results||[]).length ? `
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>Date</th>
            <th>Branch</th>
            <th>Package</th>
            <th>Qty</th>
            <th>GB</th>
            <th>Comm.</th>
            <th>Net</th>
          </tr></thead>
          <tbody>${saleRows}</tbody>
        </table>
      </div>` : `<div class="empty-state" style="padding:1.5rem"><div class="empty-state-icon">💰</div><h3>No sales yet</h3><p><a href="/sales/add">Add your first sale →</a></p></div>`}
    </div>
    <div class="card" style="overflow:hidden">
      <div class="card-header">
        <div class="card-title">💳 Payments</div>
        <a href="/payments" class="btn btn-outline btn-sm">All →</a>
      </div>
      ${paymentRows || `<div class="empty-state" style="padding:1.5rem"><div class="empty-state-icon">💳</div><h3>No payments</h3></div>`}
      ${totalPaid>0?`<div style="padding:.75rem 1rem;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-weight:600">
        <span>Total received</span><span style="color:var(--success)">${formatMoney(totalPaid)}</span>
      </div>`:''}
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
  const sCtx = document.getElementById('sellerChart');
  if(sCtx) {
    new Chart(sCtx, {
      type:'line',
      data:{
        labels:${chartLabels},
        datasets:[
          {label:'GB',data:${chartGb},borderColor:'var(--primary)',backgroundColor:'rgba(99,102,241,.1)',borderWidth:2,pointRadius:3,tension:.4,fill:true,yAxisID:'y'},
          {label:'Commission',data:${chartComm},borderColor:'var(--warning)',backgroundColor:'transparent',borderWidth:2,pointRadius:3,tension:.4,yAxisID:'y2'}
        ]
      },
      options:{
        responsive:true,interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false}},
        scales:{
          x:{grid:{color:'var(--border)'},ticks:{color:'var(--text-muted)',font:{size:10}}},
          y:{grid:{color:'var(--border)'},ticks:{color:'var(--text-muted)',font:{size:10},callback:v=>v+' GB'}},
          y2:{position:'right',grid:{drawOnChartArea:false},ticks:{color:'var(--warning)',font:{size:10},callback:v=>'؋'+Math.round(v).toLocaleString()}}
        }
      }
    });
  }
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
