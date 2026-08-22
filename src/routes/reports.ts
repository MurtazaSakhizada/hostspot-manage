// ============================================
// Reports Routes - Full PDF export + Analytics
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatGB, formatMoney } from '../lib/calc';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const reports = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ============================================================
// Main Report Page
// ============================================================
reports.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');

  const isOwner = user.role === 'owner';

  // ── Check seller_panel_enabled ────────────────────────────
  const coRow = await c.env.DB.prepare(
    'SELECT COALESCE(seller_panel_enabled,1) as seller_panel_enabled FROM companies WHERE id=?'
  ).bind(user.company_id).first<{seller_panel_enabled:number}>();
  const sellerPanelEnabled = (coRow?.seller_panel_enabled ?? 1) !== 0;

  // ── When seller panel is DISABLED → show Allocation/Inventory/Payment summary ──
  if (isOwner && !sellerPanelEnabled) {
    return renderOwnerSummaryReport(c, user, lang);
  }

  // ── Standard sales-based report (seller_panel_enabled = 1) ───────────────────
  const sellerFilter = !isOwner ? ` AND seller_id = ${user.id}` : '';

  const groupBy = c.req.query('group') ?? 'date';
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';

  let dateFilter = '';
  if (from) dateFilter += ` AND date(snapshot_time) >= '${from}'`;
  if (to) dateFilter += ` AND date(snapshot_time) <= '${to}'`;

  // ── KPI Totals ────────────────────────────────────────────
  const salesSummary = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(gross_amount),0) as gross,
           COALESCE(SUM(commission_amount),0) as comm, COALESCE(SUM(net_amount),0) as net,
           COUNT(*) as cnt
    FROM sales WHERE company_id=? ${sellerFilter} ${dateFilter}`).bind(user.company_id).first<any>();

  const invSummary = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(total_gross),0) as gross, COUNT(*) as batches
    FROM inventory_batches WHERE company_id=? ${dateFilter.replace('snapshot_time','created_at')}`).bind(user.company_id).first<any>();

  const allocSummary = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(total_gross),0) as gross, COUNT(*) as batches
    FROM allocation_batches WHERE company_id=? ${dateFilter.replace('snapshot_time','created_at')}`).bind(user.company_id).first<any>();

  const paymentSummary = user.role === 'owner' ? await c.env.DB.prepare(`
    SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
    FROM payments WHERE company_id=? ${dateFilter.replace('snapshot_time','created_at')}`).bind(user.company_id).first<any>() : null;

  // ── By Date (last 30) ─────────────────────────────────────
  const byDate = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m-%d', snapshot_time) as period,
      COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(gross_amount),0) as gross,
      COALESCE(SUM(commission_amount),0) as comm, COALESCE(SUM(net_amount),0) as net, COUNT(*) as cnt
    FROM sales WHERE company_id=? ${sellerFilter} ${dateFilter}
    GROUP BY period ORDER BY period DESC LIMIT 30`).bind(user.company_id).all<any>();

  // ── By Branch ─────────────────────────────────────────────
  const byBranch = await c.env.DB.prepare(`
    SELECT b.name as period,
      COALESCE(SUM(s.total_gb),0) as gb, COALESCE(SUM(s.gross_amount),0) as gross,
      COALESCE(SUM(s.commission_amount),0) as comm, COALESCE(SUM(s.net_amount),0) as net, COUNT(s.id) as cnt
    FROM branches b LEFT JOIN sales s ON s.branch_id=b.id AND s.company_id=b.company_id
      ${dateFilter.replace('snapshot_time','s.snapshot_time')}
      ${!isOwner ? `AND s.seller_id = ${user.id}` : ''}
    WHERE b.company_id=?
    GROUP BY b.id, b.name ORDER BY gb DESC`).bind(user.company_id).all<any>();

  // ── By Seller ─────────────────────────────────────────────
  const bySeller = user.role === 'owner'
    ? await c.env.DB.prepare(`
      SELECT u.full_name as period, u.commission_rate,
        COALESCE(SUM(s.total_gb),0) as gb, COALESCE(SUM(s.gross_amount),0) as gross,
        COALESCE(SUM(s.commission_amount),0) as comm, COALESCE(SUM(s.net_amount),0) as net, COUNT(s.id) as cnt
      FROM users u LEFT JOIN sales s ON s.seller_id=u.id AND s.company_id=u.company_id
        ${dateFilter.replace('snapshot_time','s.snapshot_time')}
      WHERE u.company_id=? AND u.role='seller'
      GROUP BY u.id, u.full_name, u.commission_rate ORDER BY gb DESC`).bind(user.company_id).all<any>()
    : { results: [] };

  // ── By Package ────────────────────────────────────────────
  const byPackage = await c.env.DB.prepare(`
    SELECT p.name as period, p.size_gb,
      COALESCE(SUM(s.quantity),0) as cnt,
      COALESCE(SUM(s.total_gb),0) as gb,
      COALESCE(SUM(s.gross_amount),0) as gross,
      COALESCE(SUM(s.net_amount),0) as net
    FROM packages p LEFT JOIN sales s ON s.package_id=p.id AND s.company_id=p.company_id
      ${dateFilter.replace('snapshot_time','s.snapshot_time')}
      ${!isOwner ? `AND s.seller_id = ${user.id}` : ''}
    WHERE p.company_id=?
    GROUP BY p.id ORDER BY cnt DESC`).bind(user.company_id).all<any>();

  // ── Chart data (last 14 days) ─────────────────────────────
  const chart14 = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m-%d', snapshot_time) as day,
      COALESCE(SUM(gross_amount),0) as rev, COUNT(*) as cnt
    FROM sales WHERE company_id=? ${sellerFilter} AND snapshot_time >= datetime('now','-14 days')
      ${dateFilter}
    GROUP BY day ORDER BY day ASC`).bind(user.company_id).all<any>();

  const days14: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days14.push(d.toISOString().split('T')[0]);
  }
  const chartMap = Object.fromEntries((chart14.results||[]).map((r:any)=>[r.day,{rev:r.rev,cnt:r.cnt}]));
  const chartLabels = JSON.stringify(days14.map(d=>new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})));
  const chartRev = JSON.stringify(days14.map(d=>Math.round(chartMap[d]?.rev??0)));
  const chartCnt = JSON.stringify(days14.map(d=>chartMap[d]?.cnt??0));

  // isOwner already declared above
  const activeData = groupBy==='branch' ? byBranch.results
    : groupBy==='seller' ? bySeller.results
    : groupBy==='package' ? byPackage.results
    : byDate.results;

  function buildTable(data: any[], type: string) {
    if (!data?.length) return `<div class="empty-state"><div class="empty-state-icon">📋</div><h3>${t(lang,'no_data')}</h3></div>`;
    const rows = data.map((row: any) => `
      <tr>
        <td><strong>${row.period}</strong>${type==='package'&&row.size_gb?` <span class="badge badge-primary" style="font-size:.7rem">${row.size_gb}GB</span>`:''}
            ${type==='seller'&&row.commission_rate?` <small style="color:var(--text-muted)">(${Math.round(row.commission_rate*100)}%)</small>`:''}
        </td>
        <td class="text-center">${row.cnt}</td>
        <td class="text-primary font-bold">${formatGB(row.gb)}</td>
        ${isOwner?`<td>${formatMoney(row.gross)}</td><td class="text-warning">${formatMoney(row.comm??0)}</td>`:''}
        <td class="text-success font-bold">${formatMoney(row.net??row.gross??0)}</td>
      </tr>`).join('');
    return `<div class="table-wrapper"><table>
      <thead><tr>
        <th>${type==='date'?'Date':type==='branch'?'Branch':type==='seller'?'Seller':'Package'}</th>
        <th class="text-center">Count</th>
        <th>${t(lang,'total_gb')}</th>
        ${isOwner?`<th>${t(lang,'total_gross')}</th><th>${t(lang,'total_commission')}</th>`:''}
        <th>${t(lang,'net_amount')}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  // date range label
  const dateLabel = from||to ? `${from||'Start'} → ${to||'Today'}` : 'All Time';

  return c.html(pageShell({
    title: t(lang,'reports'), lang, user, activePage: 'reports',
    extraHead: `<style>
    @media print {
      .sidebar,.topbar,.filter-bar,.btn-group,.page-header .btn,
      .notif-bell-wrap,.lang-switcher,.lang-switcher-mobile,
      .drill-section .drill-header { display:none!important }
      .app-layout { display:block!important }
      .main-content { margin:0!important; padding:0!important }
      .page-content { padding:0!important }
      body { background:#fff!important; color:#000!important; font-size:11pt }
      .card { border:1px solid #ccc!important; background:#fff!important; break-inside:avoid }
      table { width:100%; border-collapse:collapse }
      th,td { border:1px solid #ccc!important; padding:4pt 6pt!important; font-size:10pt; color:#000!important }
      th { background:#f5f5f5!important }
      .stat-card { border:1px solid #ccc!important; background:#fff!important }
      .stat-value { color:#000!important }
      .print-header { display:block!important }
      canvas { display:none!important }
      .drill-body { display:block!important }
    }
    .print-header { display:none }
    </style>`,
    body: `
    <!-- Print header (hidden on screen) -->
    <div class="print-header" style="margin-bottom:1rem;padding-bottom:.75rem;border-bottom:2px solid #000">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-size:1.2rem;font-weight:700">📶 HotSpot Manager — Sales Report</div>
          <div style="font-size:.85rem;color:#555">Period: ${dateLabel} · Generated: ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'} as any)}</div>
        </div>
      </div>
    </div>

    <div class="page-header">
      <div>
        <div class="page-title">📋 ${t(lang,'reports')}</div>
        <div class="page-subtitle">${dateLabel}</div>
      </div>
      <div class="btn-group">
        <button onclick="printPDF()" class="btn btn-primary">🖨️ Print / PDF</button>
        <a href="/reports/pdf?group=${groupBy}&from=${from}&to=${to}" class="btn btn-outline" target="_blank">📄 PDF Report</a>
        <a href="/reports/csv?group=${groupBy}&from=${from}&to=${to}" class="btn btn-outline">📥 CSV</a>
      </div>
    </div>

    <!-- Filter Bar -->
    <form method="GET" action="/reports" class="filter-bar" style="flex-wrap:wrap;gap:.75rem;margin-bottom:1.5rem">
      <div class="form-group" style="min-width:130px">
        <label>${t(lang,'from_date')}</label>
        <input type="date" name="from" value="${from}"/>
      </div>
      <div class="form-group" style="min-width:130px">
        <label>${t(lang,'to_date')}</label>
        <input type="date" name="to" value="${to}"/>
      </div>
      <div class="form-group" style="min-width:140px">
        <label>${t(lang,'filter_by')}</label>
        <select name="group">
          <option value="date" ${groupBy==='date'?'selected':''}>📅 By Date</option>
          <option value="branch" ${groupBy==='branch'?'selected':''}>🏢 By Branch</option>
          ${isOwner?`<option value="seller" ${groupBy==='seller'?'selected':''}>👤 By Seller</option>`:''}
          <option value="package" ${groupBy==='package'?'selected':''}>📦 By Package</option>
        </select>
      </div>
      <div style="display:flex;gap:.4rem;align-self:flex-end;flex-wrap:wrap">
        <button type="submit" class="btn btn-primary">${t(lang,'generate_report')}</button>
        <a href="?from=${getWeekStart()}&to=${getToday()}" class="btn btn-outline btn-sm">This Week</a>
        <a href="?from=${getMonthStart()}&to=${getToday()}" class="btn btn-outline btn-sm">This Month</a>
        <a href="/reports" class="btn btn-ghost btn-sm">All Time</a>
      </div>
    </form>

    <!-- KPI Summary -->
    <div class="stats-grid" style="margin-bottom:1.5rem">
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--primary)"></div>
        <div class="stat-label">Total GB Sold</div>
        <div class="stat-value primary">${formatGB(salesSummary?.gb??0)}</div>
        <div class="stat-sub">${salesSummary?.cnt??0} transactions</div>
      </div>
      ${isOwner?`
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--info)"></div>
        <div class="stat-label">${t(lang,'total_gross')}</div>
        <div class="stat-value" style="color:var(--info)">${formatMoney(salesSummary?.gross??0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--warning)"></div>
        <div class="stat-label">${t(lang,'total_commission')}</div>
        <div class="stat-value warning">${formatMoney(salesSummary?.comm??0)}</div>
      </div>`:''}
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--success)"></div>
        <div class="stat-label">${t(lang,'net_profit')}</div>
        <div class="stat-value success">${formatMoney(salesSummary?.net??0)}</div>
      </div>
      ${isOwner?`
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--primary-dark,#3730a3)"></div>
        <div class="stat-label">GB Stocked</div>
        <div class="stat-value" style="color:var(--info)">${formatGB(invSummary?.gb??0)}</div>
        <div class="stat-sub">${invSummary?.batches??0} stock entries</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:#7c3aed"></div>
        <div class="stat-label">GB Allocated</div>
        <div class="stat-value" style="color:#a78bfa">${formatGB(allocSummary?.gb??0)}</div>
        <div class="stat-sub">${allocSummary?.batches??0} allocations</div>
      </div>`:''}
    </div>

    <!-- Chart (14 days trend) -->
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header">
        <div class="card-title">📈 Sales Trend — Last 14 Days</div>
        <div style="font-size:.78rem;color:var(--text-muted)">
          <span style="color:var(--primary)">● Revenue</span>
          &nbsp;&nbsp;<span style="color:var(--success)">● Count</span>
        </div>
      </div>
      <canvas id="trendChart" height="120"></canvas>
    </div>

    <!-- Main data table with tabs -->
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header">
        <div class="card-title">
          ${groupBy==='branch'?'🏢 By Branch':groupBy==='seller'?'👤 By Seller':groupBy==='package'?'📦 By Package':'📅 By Date'}
        </div>
        <div class="btn-group" style="flex-wrap:wrap;gap:.3rem">
          <a href="?group=date${from?`&from=${from}`:''}${to?`&to=${to}`:''}" class="btn btn-sm ${groupBy==='date'?'btn-primary':'btn-outline'}">📅 Date</a>
          <a href="?group=branch${from?`&from=${from}`:''}${to?`&to=${to}`:''}" class="btn btn-sm ${groupBy==='branch'?'btn-primary':'btn-outline'}">🏢 Branch</a>
          ${isOwner?`<a href="?group=seller${from?`&from=${from}`:''}${to?`&to=${to}`:''}" class="btn btn-sm ${groupBy==='seller'?'btn-primary':'btn-outline'}">👤 Seller</a>`:''}
          <a href="?group=package${from?`&from=${from}`:''}${to?`&to=${to}`:''}" class="btn btn-sm ${groupBy==='package'?'btn-primary':'btn-outline'}">📦 Package</a>
        </div>
      </div>
      ${buildTable(activeData||[], groupBy)}
    </div>

    <!-- All views collapsed (for PDF) -->
    ${isOwner?`
    <div class="drill-section" id="drill-branch">
      <div class="drill-header" onclick="document.getElementById('drill-branch').classList.toggle('open')">
        <span>🏢 Branch Summary</span><span class="drill-chevron">▼</span>
      </div>
      <div class="drill-body">${buildTable(byBranch.results||[], 'branch')}</div>
    </div>
    <div class="drill-section" id="drill-seller" style="margin-top:.75rem">
      <div class="drill-header" onclick="document.getElementById('drill-seller').classList.toggle('open')">
        <span>👤 Seller Summary</span><span class="drill-chevron">▼</span>
      </div>
      <div class="drill-body">${buildTable(bySeller.results||[], 'seller')}</div>
    </div>
    <div class="drill-section" id="drill-package" style="margin-top:.75rem">
      <div class="drill-header" onclick="document.getElementById('drill-package').classList.toggle('open')">
        <span>📦 Package Summary</span><span class="drill-chevron">▼</span>
      </div>
      <div class="drill-body">${buildTable(byPackage.results||[], 'package')}</div>
    </div>`:''}

    <div style="margin-top:1rem;display:flex;justify-content:flex-end;gap:.5rem">
      <button onclick="printPDF()" class="btn btn-primary">🖨️ Print / PDF</button>
      <a href="/reports/pdf?group=${groupBy}&from=${from}&to=${to}" class="btn btn-outline" target="_blank">📄 Open PDF</a>
      <a href="/reports/csv?group=${groupBy}&from=${from}&to=${to}" class="btn btn-outline">📥 Export CSV</a>
    </div>`,
    scripts: `
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script>
    function getToday() { return new Date().toISOString().split('T')[0]; }
    function getWeekStart() {
      const d = new Date(); d.setDate(d.getDate() - d.getDay());
      return d.toISOString().split('T')[0];
    }
    function getMonthStart() {
      const d = new Date(); d.setDate(1);
      return d.toISOString().split('T')[0];
    }
    document.querySelectorAll('a[href*="getToday()"]').forEach(a => {
      a.href = a.href.replace('getToday()', getToday()).replace('getWeekStart()', getWeekStart()).replace('getMonthStart()', getMonthStart());
    });

    // Chart
    const ctx = document.getElementById('trendChart');
    if(ctx) {
      new Chart(ctx, {
        type:'line',
        data:{
          labels:${chartLabels},
          datasets:[
            { label:'Revenue', data:${chartRev}, borderColor:'var(--primary)', backgroundColor:'rgba(99,102,241,.1)', borderWidth:2, pointRadius:3, tension:.4, fill:true, yAxisID:'y' },
            { label:'Count', data:${chartCnt}, borderColor:'var(--success)', backgroundColor:'transparent', borderWidth:2, pointRadius:3, tension:.4, yAxisID:'y2' }
          ]
        },
        options:{
          responsive:true, interaction:{mode:'index',intersect:false},
          plugins:{legend:{display:false}},
          scales:{
            x:{grid:{color:'var(--border)'},ticks:{color:'var(--text-muted)',font:{size:10}}},
            y:{type:'linear',position:'left',grid:{color:'var(--border)'},ticks:{color:'var(--text-muted)',font:{size:10},callback:v=>'؋'+Math.round(v).toLocaleString()}},
            y2:{type:'linear',position:'right',grid:{drawOnChartArea:false},ticks:{color:'var(--success)',font:{size:10}}}
          }
        }
      });
    }

    function printPDF() {
      // Open all drill-downs before printing
      document.querySelectorAll('.drill-section').forEach(el=>el.classList.add('open'));
      window.print();
    }
    </script>`
  }));
});

// ── Helper date functions ─────────────────────────────────────
function getToday() { return new Date().toISOString().split('T')[0]; }
function getWeekStart() { const d = new Date(); d.setDate(d.getDate()-d.getDay()); return d.toISOString().split('T')[0]; }
function getMonthStart() { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; }

// ============================================================
// Owner Summary Report (seller_panel_enabled = 0)
// Shows allocations, inventory, and payments — no sales rows
// ============================================================
async function renderOwnerSummaryReport(c: any, user: any, lang: any): Promise<Response> {
  const from = c.req.query('from') ?? '';
  const to   = c.req.query('to')   ?? '';
  const dateLabel = from || to ? `${from || 'Start'} → ${to || 'Today'}` : 'All Time';

  const allocDF = from ? ` AND date(ab.created_at) >= '${from}'` : '';
  const allocDF2 = to ? ` AND date(ab.created_at) <= '${to}'` : '';
  const invDF  = from ? ` AND date(ib.created_at) >= '${from}'` : '';
  const invDF2 = to   ? ` AND date(ib.created_at) <= '${to}'`   : '';
  const payDF  = from ? ` AND date(p.payment_date) >= '${from}'` : '';
  const payDF2 = to   ? ` AND date(p.payment_date) <= '${to}'`   : '';

  const [
    allocTotals, allocBySeller, allocByBranch,
    invTotals,   invByBranch,
    payTotals,   payBySeller,
    sellerBalances,
  ] = await Promise.all([
    // Allocation totals
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(total_gross),0) as gross,
             COALESCE(SUM(total_commission),0) as comm, COALESCE(SUM(total_net),0) as net,
             COUNT(*) as batches
      FROM allocation_batches ab WHERE ab.company_id=? ${allocDF}${allocDF2}`)
      .bind(user.company_id).first<any>(),

    // Allocation by seller
    c.env.DB.prepare(`
      SELECT u.full_name as seller_name,
             COALESCE(SUM(ab.total_gb),0) as gb,
             COALESCE(SUM(ab.total_gross),0) as gross,
             COALESCE(SUM(ab.total_commission),0) as comm,
             COALESCE(SUM(ab.total_net),0) as net,
             COUNT(*) as batches
      FROM allocation_batches ab
      JOIN users u ON u.id = ab.seller_id
      WHERE ab.company_id=? ${allocDF}${allocDF2}
      GROUP BY ab.seller_id, u.full_name ORDER BY gb DESC`)
      .bind(user.company_id).all<any>(),

    // Allocation by branch
    c.env.DB.prepare(`
      SELECT b.name as branch_name,
             COALESCE(SUM(ab.total_gb),0) as gb,
             COALESCE(SUM(ab.total_gross),0) as gross,
             COALESCE(SUM(ab.total_net),0) as net,
             COUNT(*) as batches
      FROM allocation_batches ab
      JOIN branches b ON b.id = ab.branch_id
      WHERE ab.company_id=? ${allocDF}${allocDF2}
      GROUP BY ab.branch_id, b.name ORDER BY gb DESC`)
      .bind(user.company_id).all<any>(),

    // Inventory totals
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(total_gross),0) as gross,
             COUNT(*) as batches
      FROM inventory_batches ib WHERE ib.company_id=? ${invDF}${invDF2}`)
      .bind(user.company_id).first<any>(),

    // Inventory by branch
    c.env.DB.prepare(`
      SELECT b.name as branch_name,
             COALESCE(SUM(ib.total_gb),0) as gb,
             COALESCE(SUM(ib.total_gross),0) as gross,
             COUNT(*) as batches
      FROM inventory_batches ib
      JOIN branches b ON b.id = ib.branch_id
      WHERE ib.company_id=? ${invDF}${invDF2}
      GROUP BY ib.branch_id, b.name ORDER BY gb DESC`)
      .bind(user.company_id).all<any>(),

    // Payment totals by type
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(p.amount),0) as total, COUNT(*) as cnt
      FROM payments p WHERE p.company_id=? ${payDF}${payDF2}`)
      .bind(user.company_id).first<any>(),

    // Payment by seller (balance summary)
    c.env.DB.prepare(`
      SELECT u.full_name as seller_name,
             COALESCE(SUM(p.amount),0) as paid,
             COUNT(*) as cnt
      FROM payments p
      JOIN users u ON u.id = p.seller_id
      WHERE p.company_id=? ${payDF}${payDF2}
      GROUP BY p.seller_id, u.full_name ORDER BY paid DESC`)
      .bind(user.company_id).all<any>(),

    // Seller balance: allocated gross vs total paid
    c.env.DB.prepare(`
      SELECT u.id, u.full_name,
             COALESCE(SUM(ab.total_gross),0) as total_allocated_gross,
             COALESCE(SUM(ab.total_commission),0) as total_commission,
             COALESCE(SUM(ab.total_net),0) as total_net,
             (SELECT COALESCE(SUM(amount),0) FROM payments pm WHERE pm.seller_id=u.id AND pm.company_id=u.company_id) as total_paid
      FROM users u
      LEFT JOIN allocation_batches ab ON ab.seller_id=u.id AND ab.company_id=u.company_id
      WHERE u.company_id=? AND u.role='seller'
      GROUP BY u.id, u.full_name ORDER BY total_net DESC`)
      .bind(user.company_id).all<any>(),
  ]);

  // GB remaining = inventory GB stocked - allocation GB assigned
  const gbRemaining = (invTotals?.gb ?? 0) - (allocTotals?.gb ?? 0);

  // Build seller balance rows
  const balanceRows = (sellerBalances.results || []).map((r: any) => {
    const debt = (r.total_net ?? 0) - (r.total_paid ?? 0);
    const debtColor = debt > 0 ? 'color:var(--warning)' : 'color:var(--success)';
    return `<tr>
      <td><strong>${r.full_name}</strong></td>
      <td class="text-center">${formatGB(r.total_allocated_gross ?? 0)}</td>
      <td class="text-center text-warning">${formatMoney(r.total_commission ?? 0)}</td>
      <td class="text-center text-success">${formatMoney(r.total_net ?? 0)}</td>
      <td class="text-center">${formatMoney(r.total_paid ?? 0)}</td>
      <td class="text-center font-bold" style="${debtColor}">${debt > 0 ? '🔴' : '🟢'} ${formatMoney(Math.abs(debt))}${debt > 0 ? ' بدهکار' : ' تسویه'}</td>
    </tr>`;
  }).join('');

  const allocBySellerRows = (allocBySeller.results || []).map((r: any) => `
    <tr>
      <td><strong>${r.seller_name}</strong></td>
      <td class="text-center">${r.batches}</td>
      <td class="text-primary font-bold">${formatGB(r.gb)}</td>
      <td>${formatMoney(r.gross)}</td>
      <td class="text-warning">${formatMoney(r.comm)}</td>
      <td class="text-success font-bold">${formatMoney(r.net)}</td>
    </tr>`).join('');

  const allocByBranchRows = (allocByBranch.results || []).map((r: any) => `
    <tr>
      <td><strong>${r.branch_name}</strong></td>
      <td class="text-center">${r.batches}</td>
      <td class="text-primary font-bold">${formatGB(r.gb)}</td>
      <td>${formatMoney(r.gross)}</td>
      <td class="text-success font-bold">${formatMoney(r.net)}</td>
    </tr>`).join('');

  const invByBranchRows = (invByBranch.results || []).map((r: any) => `
    <tr>
      <td><strong>${r.branch_name}</strong></td>
      <td class="text-center">${r.batches}</td>
      <td class="text-primary font-bold">${formatGB(r.gb)}</td>
      <td>${formatMoney(r.gross)}</td>
    </tr>`).join('');

  const payBySellerRows = (payBySeller.results || []).map((r: any) => `
    <tr>
      <td><strong>${r.seller_name}</strong></td>
      <td class="text-center">${r.cnt}</td>
      <td class="text-success font-bold">${formatMoney(r.paid)}</td>
    </tr>`).join('');

  return c.html(pageShell({
    title: t(lang, 'reports'), lang, user, activePage: 'reports',
    extraHead: `<style>
    @media print {
      .sidebar,.topbar,.filter-bar,.btn-group,.page-header .btn,
      .notif-bell-wrap,.lang-switcher,.lang-switcher-mobile { display:none!important }
      .app-layout { display:block!important }
      .main-content { margin:0!important; padding:0!important }
      body { background:#fff!important; color:#000!important }
      .card { border:1px solid #ccc!important; background:#fff!important }
      table { width:100%; border-collapse:collapse }
      th,td { border:1px solid #ccc!important; padding:4pt 6pt!important }
    }
    </style>`,
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">📋 ${t(lang,'reports')}</div>
        <div class="page-subtitle">${dateLabel}</div>
      </div>
      <div class="btn-group">
        <button onclick="window.print()" class="btn btn-primary">🖨️ Print / PDF</button>
      </div>
    </div>

    <!-- Date Filter -->
    <form method="GET" action="/reports" class="filter-bar" style="flex-wrap:wrap;gap:.75rem;margin-bottom:1.5rem">
      <div class="form-group" style="min-width:130px">
        <label>${t(lang,'from_date')}</label>
        <input type="date" name="from" value="${from}"/>
      </div>
      <div class="form-group" style="min-width:130px">
        <label>${t(lang,'to_date')}</label>
        <input type="date" name="to" value="${to}"/>
      </div>
      <div style="display:flex;gap:.4rem;align-self:flex-end;flex-wrap:wrap">
        <button type="submit" class="btn btn-primary">${t(lang,'generate_report')}</button>
        <a href="?from=${getWeekStart()}&to=${getToday()}" class="btn btn-outline btn-sm">این هفته</a>
        <a href="?from=${getMonthStart()}&to=${getToday()}" class="btn btn-outline btn-sm">این ماه</a>
        <a href="/reports" class="btn btn-ghost btn-sm">همه</a>
      </div>
    </form>

    <!-- KPI Grid -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-bottom:1.5rem">
      <div class="stat-card">
        <div class="stat-card-accent" style="background:#7c3aed"></div>
        <div class="stat-label">GB تخصیص‌یافته</div>
        <div class="stat-value" style="color:#7c3aed">${formatGB(allocTotals?.gb??0)}</div>
        <div class="stat-sub">${allocTotals?.batches??0} تخصیص</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--info)"></div>
        <div class="stat-label">GB موجودی خریداری‌شده</div>
        <div class="stat-value" style="color:var(--info)">${formatGB(invTotals?.gb??0)}</div>
        <div class="stat-sub">${invTotals?.batches??0} ورودی</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:${gbRemaining >= 0 ? 'var(--success)' : 'var(--danger)'}"></div>
        <div class="stat-label">GB مانده موجودی</div>
        <div class="stat-value" style="color:${gbRemaining >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatGB(Math.abs(gbRemaining))}</div>
        <div class="stat-sub">${gbRemaining < 0 ? '⚠️ کسری' : 'موجود'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--warning)"></div>
        <div class="stat-label">کل کمیسیون تخصیص</div>
        <div class="stat-value warning">${formatMoney(allocTotals?.comm??0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--success)"></div>
        <div class="stat-label">خالص تخصیص (برای owner)</div>
        <div class="stat-value success">${formatMoney(allocTotals?.net??0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--primary)"></div>
        <div class="stat-label">کل دریافتی از فروشندگان</div>
        <div class="stat-value primary">${formatMoney(payTotals?.total??0)}</div>
        <div class="stat-sub">${payTotals?.cnt??0} پرداخت</div>
      </div>
    </div>

    <!-- Seller Balance Table -->
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header">
        <div class="card-title">👤 مانده‌حساب فروشندگان</div>
        <div style="font-size:.78rem;color:var(--text-muted)">مجموع تخصیص خالص منهای پرداختی‌ها</div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>فروشنده</th>
            <th class="text-center">ارزش تخصیص (ناخالص)</th>
            <th class="text-center">کمیسیون</th>
            <th class="text-center">خالص قابل دریافت</th>
            <th class="text-center">پرداخت‌شده</th>
            <th class="text-center">مانده / وضعیت</th>
          </tr></thead>
          <tbody>${balanceRows || `<tr><td colspan="6"><div class="empty-state"><h3>${t(lang,'no_data')}</h3></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <!-- Allocations by Seller -->
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header"><div class="card-title">📦 تخصیص‌ها بر اساس فروشنده</div></div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>فروشنده</th><th class="text-center">تعداد</th>
            <th>${t(lang,'total_gb')}</th><th>${t(lang,'gross_amount')}</th>
            <th>${t(lang,'commission_amount')}</th><th>${t(lang,'net_amount')}</th>
          </tr></thead>
          <tbody>${allocBySellerRows || `<tr><td colspan="6" class="text-center">${t(lang,'no_data')}</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <!-- Allocations by Branch -->
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header"><div class="card-title">🏢 تخصیص‌ها بر اساس شعبه</div></div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>شعبه</th><th class="text-center">تعداد</th>
            <th>${t(lang,'total_gb')}</th><th>${t(lang,'gross_amount')}</th><th>${t(lang,'net_amount')}</th>
          </tr></thead>
          <tbody>${allocByBranchRows || `<tr><td colspan="5" class="text-center">${t(lang,'no_data')}</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <!-- Inventory by Branch -->
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header"><div class="card-title">📥 موجودی خریداری‌شده بر اساس شعبه</div></div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>شعبه</th><th class="text-center">تعداد ورودی</th>
            <th>${t(lang,'total_gb')}</th><th>هزینه خرید</th>
          </tr></thead>
          <tbody>${invByBranchRows || `<tr><td colspan="4" class="text-center">${t(lang,'no_data')}</td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <!-- Payments by Seller -->
    <div class="card" style="margin-bottom:1.5rem">
      <div class="card-header"><div class="card-title">💳 پرداختی‌های دریافتی از فروشندگان</div></div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>فروشنده</th><th class="text-center">تعداد</th><th>جمع پرداختی</th>
          </tr></thead>
          <tbody>${payBySellerRows || `<tr><td colspan="3" class="text-center">${t(lang,'no_data')}</td></tr>`}</tbody>
        </table>
      </div>
    </div>
    `
  }));
}

// ============================================================
// PDF Report Page  GET /reports/pdf
// Full standalone HTML for printing/saving as PDF
// ============================================================
reports.get('/pdf', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const pdfIsOwner = user.role === 'owner';
  const pdfSellerFilter = !pdfIsOwner ? ` AND seller_id = ${user.id}` : '';
  const from = c.req.query('from') ?? '';
  const to   = c.req.query('to')   ?? '';

  let dateFilter = '';
  if (from) dateFilter += ` AND date(snapshot_time) >= '${from}'`;
  if (to)   dateFilter += ` AND date(snapshot_time) <= '${to}'`;

  // Fetch company name
  const company = await c.env.DB.prepare('SELECT name FROM companies WHERE id=?')
    .bind(user.company_id).first<{name:string}>();
  const companyName = company?.name ?? 'HotSpot Manager';

  // All report data fetched in parallel
  const [salesSummary, byDate, byBranch, bySeller, byPackage,
         invSummary, allocSummary, paymentSummary, recentSales] = await Promise.all([
    // Sales KPIs
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(gross_amount),0) as gross,
             COALESCE(SUM(commission_amount),0) as comm, COALESCE(SUM(net_amount),0) as net,
             COUNT(*) as cnt
      FROM sales WHERE company_id=? ${pdfSellerFilter} ${dateFilter}`)
      .bind(user.company_id).first<any>(),
    // By Date
    c.env.DB.prepare(`
      SELECT strftime('%Y-%m-%d', snapshot_time) as period,
             COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(gross_amount),0) as gross,
             COALESCE(SUM(commission_amount),0) as comm, COALESCE(SUM(net_amount),0) as net,
             COUNT(*) as cnt
      FROM sales WHERE company_id=? ${pdfSellerFilter} ${dateFilter}
      GROUP BY period ORDER BY period DESC LIMIT 60`)
      .bind(user.company_id).all<any>(),
    // By Branch
    c.env.DB.prepare(`
      SELECT b.name as period, COALESCE(SUM(s.total_gb),0) as gb,
             COALESCE(SUM(s.gross_amount),0) as gross, COALESCE(SUM(s.commission_amount),0) as comm,
             COALESCE(SUM(s.net_amount),0) as net, COUNT(s.id) as cnt
      FROM branches b LEFT JOIN sales s
        ON s.branch_id=b.id AND s.company_id=b.company_id
        ${dateFilter.replace('snapshot_time','s.snapshot_time')}
        ${!pdfIsOwner ? `AND s.seller_id = ${user.id}` : ''}
      WHERE b.company_id=? GROUP BY b.id ORDER BY gb DESC`)
      .bind(user.company_id).all<any>(),
    // By Seller (owner only)
    user.role === 'owner'
      ? c.env.DB.prepare(`
          SELECT u.full_name as period, u.commission_rate,
                 COALESCE(SUM(s.total_gb),0) as gb, COALESCE(SUM(s.gross_amount),0) as gross,
                 COALESCE(SUM(s.commission_amount),0) as comm, COALESCE(SUM(s.net_amount),0) as net,
                 COUNT(s.id) as cnt
          FROM users u LEFT JOIN sales s
            ON s.seller_id=u.id AND s.company_id=u.company_id
            ${dateFilter.replace('snapshot_time','s.snapshot_time')}
          WHERE u.company_id=? AND u.role='seller' GROUP BY u.id ORDER BY gb DESC`)
          .bind(user.company_id).all<any>()
      : Promise.resolve({results:[]}),
    // By Package
    c.env.DB.prepare(`
      SELECT p.name as period, p.size_gb, COALESCE(SUM(s.quantity),0) as cnt,
             COALESCE(SUM(s.total_gb),0) as gb, COALESCE(SUM(s.gross_amount),0) as gross,
             COALESCE(SUM(s.net_amount),0) as net
      FROM packages p LEFT JOIN sales s
        ON s.package_id=p.id AND s.company_id=p.company_id
        ${dateFilter.replace('snapshot_time','s.snapshot_time')}
      WHERE p.company_id=? GROUP BY p.id ORDER BY cnt DESC`)
      .bind(user.company_id).all<any>(),
    // Inventory summary
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(total_gross),0) as gross, COUNT(*) as batches
      FROM inventory_batches WHERE company_id=? ${dateFilter.replace('snapshot_time','created_at')}`)
      .bind(user.company_id).first<any>(),
    // Allocation summary
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(total_gross),0) as gross, COUNT(*) as batches
      FROM allocation_batches WHERE company_id=? ${dateFilter.replace('snapshot_time','created_at')}`)
      .bind(user.company_id).first<any>(),
    // Payments summary (owner only)
    user.role === 'owner'
      ? c.env.DB.prepare(`
          SELECT type, COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
          FROM payments WHERE company_id=? ${dateFilter.replace('snapshot_time','payment_date')}
          GROUP BY type`)
          .bind(user.company_id).all<any>()
      : Promise.resolve({results:[]}),
    // Recent individual sales
    c.env.DB.prepare(`
      SELECT s.snapshot_time, u.full_name as seller, b.name as branch, p.name as package,
             s.quantity, s.total_gb, s.gross_amount, s.commission_amount, s.net_amount
      FROM sales s
      JOIN users u ON u.id=s.seller_id
      JOIN branches b ON b.id=s.branch_id
      JOIN packages p ON p.id=s.package_id
      WHERE s.company_id=? ${pdfSellerFilter} ${dateFilter.replace('snapshot_time','s.snapshot_time')}
      ORDER BY s.snapshot_time DESC LIMIT 50`)
      .bind(user.company_id).all<any>(),
  ]);

  const isOwner = pdfIsOwner;
  const dateLabel = from||to ? `${from||'Start'} → ${to||'Today'}` : 'All Time';
  const now = new Date().toLocaleDateString('en-GB', {
    day:'2-digit', month:'long', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  } as any);

  function pdfTable(title: string, data: any[], type: string): string {
    if (!data?.length) return `<p class="no-data">No data available</p>`;
    const totals = {
      cnt: data.reduce((s,r)=>s+(r.cnt??0),0),
      gb:  data.reduce((s,r)=>s+(r.gb??0),0),
      gross: data.reduce((s,r)=>s+(r.gross??0),0),
      comm: data.reduce((s,r)=>s+(r.comm??0),0),
      net:  data.reduce((s,r)=>s+(r.net??r.gross??0),0),
    };
    const rows = data.map(row => `<tr>
      <td>${row.period}${type==='package'&&row.size_gb?` <span class="badge">${row.size_gb}GB</span>`:''}</td>
      <td class="num">${row.cnt??0}</td>
      <td class="num">${formatGB(row.gb??0)}</td>
      ${isOwner?`<td class="num">${formatMoney(row.gross??0)}</td><td class="num warn">${formatMoney(row.comm??0)}</td>`:''}
      <td class="num bold">${formatMoney(row.net??row.gross??0)}</td>
    </tr>`).join('');
    return `
      <h3>${title}</h3>
      <table>
        <thead><tr>
          <th>Name</th><th class="num">Count</th><th class="num">GB</th>
          ${isOwner?'<th class="num">Gross</th><th class="num">Commission</th>':''}
          <th class="num">Net Amount</th>
        </tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr>
          <td><strong>Total</strong></td>
          <td class="num">${totals.cnt}</td>
          <td class="num">${formatGB(totals.gb)}</td>
          ${isOwner?`<td class="num">${formatMoney(totals.gross)}</td><td class="num warn">${formatMoney(totals.comm)}</td>`:''}
          <td class="num bold">${formatMoney(totals.net)}</td>
        </tr></tfoot>
      </table>`;
  }

  const payRows = (paymentSummary as any).results||[];
  const payTotal = payRows.reduce((s:number,r:any)=>s+r.total,0);
  const payHtml = isOwner && payRows.length > 0 ? `
    <div class="section">
      <h2>💳 Payments Summary</h2>
      <table>
        <thead><tr><th>Type</th><th class="num">Count</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${payRows.map((r:any)=>`<tr><td style="text-transform:capitalize">${r.type}</td><td class="num">${r.cnt}</td><td class="num bold">${formatMoney(r.total)}</td></tr>`).join('')}
        </tbody>
        <tfoot><tr><td><strong>Total</strong></td><td class="num">${payRows.reduce((s:number,r:any)=>s+r.cnt,0)}</td><td class="num bold">${formatMoney(payTotal)}</td></tr></tfoot>
      </table>
    </div>` : '';

  const recentRows = (recentSales.results||[]).slice(0,30);
  const recentHtml = recentRows.length > 0 ? `
    <div class="section">
      <h2>📋 Recent Transactions (Last ${recentRows.length})</h2>
      <table style="font-size:9pt">
        <thead><tr>
          <th>Date</th><th>Seller</th><th>Branch</th><th>Package</th>
          <th class="num">Qty</th><th class="num">GB</th>
          ${isOwner?'<th class="num">Gross</th><th class="num">Comm.</th>':''}
          <th class="num">Net</th>
        </tr></thead>
        <tbody>
          ${recentRows.map((r:any)=>`<tr>
            <td>${new Date(r.snapshot_time).toLocaleDateString('en-GB')}</td>
            <td>${r.seller}</td><td>${r.branch}</td><td>${r.package}</td>
            <td class="num">${r.quantity}</td>
            <td class="num">${formatGB(r.total_gb)}</td>
            ${isOwner?`<td class="num">${formatMoney(r.gross_amount)}</td><td class="num warn">${formatMoney(r.commission_amount)}</td>`:''}
            <td class="num bold">${formatMoney(r.net_amount)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>` : '';

  const html = `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Sales Report — ${companyName} — ${dateLabel}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{
      font-family:'Helvetica Neue',Arial,sans-serif;
      font-size:11pt;color:#1e293b;background:#f8fafc;
    }
    .page{max-width:900px;margin:0 auto;background:#fff;padding:2cm;min-height:100vh}
    /* Header */
    .report-header{
      display:flex;justify-content:space-between;align-items:flex-start;
      margin-bottom:1.5rem;padding-bottom:1rem;
      border-bottom:3px solid #1e293b;
    }
    .report-logo{font-size:1.5rem;font-weight:800;color:#1e293b}
    .report-logo span{color:#6366f1}
    .report-meta{text-align:right;font-size:9pt;color:#64748b;line-height:1.6}
    .report-meta strong{color:#1e293b}
    .report-title{
      font-size:1.1rem;font-weight:700;color:#334155;
      margin-top:.3rem;padding:4pt 10pt;background:#f1f5f9;
      border-radius:4px;display:inline-block;
    }
    /* Section */
    .section{margin-bottom:1.5rem}
    h2{
      font-size:12pt;font-weight:700;color:#1e293b;
      margin:0 0 .6rem;padding:.5rem 0;
      border-bottom:2px solid #e2e8f0;
    }
    h3{font-size:10.5pt;font-weight:600;color:#334155;margin:.8rem 0 .3rem}
    /* KPI Grid */
    .kpi-grid{
      display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));
      gap:.6rem;margin-bottom:1rem;
    }
    .kpi{
      border:1px solid #e2e8f0;border-radius:6px;padding:.65rem .75rem;
      background:#fff;border-left:3px solid #6366f1;
    }
    .kpi-label{font-size:8pt;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-bottom:.2rem}
    .kpi-value{font-size:13pt;font-weight:700;color:#1e293b}
    .kpi-sub{font-size:8pt;color:#94a3b8;margin-top:.1rem}
    .kpi.success{border-left-color:#22c55e} .kpi.success .kpi-value{color:#166534}
    .kpi.warn{border-left-color:#f59e0b} .kpi.warn .kpi-value{color:#92400e}
    .kpi.info{border-left-color:#3b82f6} .kpi.info .kpi-value{color:#1e40af}
    .kpi.purple{border-left-color:#a855f7} .kpi.purple .kpi-value{color:#6b21a8}
    /* Table */
    table{width:100%;border-collapse:collapse;margin-bottom:.5rem;font-size:10pt}
    th{background:#1e293b;color:#f1f5f9;padding:5pt 8pt;text-align:left;font-weight:600;font-size:9pt}
    td{padding:4pt 8pt;border-bottom:1px solid #e9eef4;vertical-align:middle}
    tfoot td{border-top:2px solid #334155;border-bottom:none;background:#f8fafc;font-weight:700}
    tr:nth-child(even) td{background:#fafbfc}
    .num{text-align:right}
    .bold{font-weight:700}
    .warn{color:#92400e}
    .badge{
      display:inline-block;background:#ede9fe;color:#5b21b6;
      font-size:7pt;padding:1pt 4pt;border-radius:3px;margin-left:3pt;
    }
    .no-data{color:#94a3b8;text-align:center;font-size:9pt;padding:.5rem;font-style:italic}
    /* Buttons */
    .action-bar{
      position:fixed;top:1rem;right:1rem;
      display:flex;gap:.5rem;z-index:99;
    }
    .btn{
      padding:.45rem 1.1rem;border:none;border-radius:7px;
      cursor:pointer;font-weight:600;font-size:.85rem;text-decoration:none;
      display:inline-flex;align-items:center;gap:.35rem;
    }
    .btn-primary{background:#4f46e5;color:#fff}
    .btn-secondary{background:#334155;color:#fff}
    /* Footer */
    .report-footer{
      margin-top:2rem;padding-top:.75rem;
      border-top:1px solid #e2e8f0;
      font-size:8pt;color:#94a3b8;
      display:flex;justify-content:space-between;
    }
    /* Print */
    @media print {
      body{background:#fff}
      .page{padding:.75cm;max-width:100%}
      .action-bar{display:none}
      table{font-size:9pt}
      h2{font-size:11pt}
      .kpi-value{font-size:11pt}
    }
    @page{size:A4;margin:1.2cm}
  </style>
</head>
<body>
  <div class="action-bar">
    <button class="btn btn-primary" onclick="window.print()">🖨️ Print / Save PDF</button>
    <button class="btn btn-secondary" onclick="window.close()">✕ Close</button>
  </div>

  <div class="page">
    <!-- Header -->
    <div class="report-header">
      <div>
        <div class="report-logo">📶 <span>${companyName}</span></div>
        <div style="font-size:9pt;color:#64748b;margin-top:.2rem">HotSpot Manager — Operations Report</div>
        <div class="report-title">📊 ${dateLabel}</div>
      </div>
      <div class="report-meta">
        <div><strong>Generated:</strong> ${now}</div>
        <div><strong>Prepared by:</strong> ${user.full_name}</div>
        <div><strong>Role:</strong> ${user.role === 'owner' ? 'Owner / Manager' : 'Seller'}</div>
      </div>
    </div>

    <!-- Sales KPI Summary -->
    <div class="section">
      <h2>📊 Sales Summary</h2>
      <div class="kpi-grid">
        <div class="kpi info">
          <div class="kpi-label">Total GB Sold</div>
          <div class="kpi-value">${formatGB(salesSummary?.gb??0)}</div>
          <div class="kpi-sub">${salesSummary?.cnt??0} transactions</div>
        </div>
        ${isOwner?`
        <div class="kpi">
          <div class="kpi-label">Gross Revenue</div>
          <div class="kpi-value">${formatMoney(salesSummary?.gross??0)}</div>
        </div>
        <div class="kpi warn">
          <div class="kpi-label">Total Commission</div>
          <div class="kpi-value">${formatMoney(salesSummary?.comm??0)}</div>
        </div>`:''}
        <div class="kpi success">
          <div class="kpi-label">Net Amount</div>
          <div class="kpi-value">${formatMoney(salesSummary?.net??0)}</div>
        </div>
        ${isOwner?`
        <div class="kpi info">
          <div class="kpi-label">GB Stocked</div>
          <div class="kpi-value">${formatGB(invSummary?.gb??0)}</div>
          <div class="kpi-sub">${invSummary?.batches??0} stock entries</div>
        </div>
        <div class="kpi purple">
          <div class="kpi-label">GB Allocated</div>
          <div class="kpi-value">${formatGB(allocSummary?.gb??0)}</div>
          <div class="kpi-sub">${allocSummary?.batches??0} allocations</div>
        </div>`:''}
      </div>
    </div>

    <!-- By Date -->
    <div class="section">
      <h2>📅 Sales by Date</h2>
      ${pdfTable('', byDate.results||[], 'date')}
    </div>

    <!-- By Branch -->
    <div class="section">
      <h2>🏢 Sales by Branch</h2>
      ${pdfTable('', byBranch.results||[], 'branch')}
    </div>

    ${isOwner?`
    <!-- By Seller -->
    <div class="section">
      <h2>👤 Sales by Seller</h2>
      ${pdfTable('', (bySeller as any).results||[], 'seller')}
    </div>`:''}

    <!-- By Package -->
    <div class="section">
      <h2>📦 Sales by Package</h2>
      ${pdfTable('', byPackage.results||[], 'package')}
    </div>

    <!-- Payments -->
    ${payHtml}

    <!-- Recent Transactions -->
    ${recentHtml}

    <!-- Footer -->
    <div class="report-footer">
      <span>📶 ${companyName} — HotSpot Manager</span>
      <span>Generated: ${now}</span>
    </div>
  </div>

  <script>
  window.addEventListener('load', () => {
    if (window.location.search.includes('autoprint=1')) {
      setTimeout(() => window.print(), 800);
    }
  });
  </script>
</body>
</html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
});

// ============================================================
// CSV Export  GET /reports/csv
// ============================================================
reports.get('/csv', async (c) => {
  const user = c.get('user');
  const csvSellerFilter = user.role !== 'owner' ? ` AND s.seller_id = ${user.id}` : '';
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  let dateFilter = '';
  if (from) dateFilter += ` AND date(s.snapshot_time) >= '${from}'`;
  if (to) dateFilter += ` AND date(s.snapshot_time) <= '${to}'`;

  const data = await c.env.DB.prepare(`
    SELECT s.snapshot_time, u.full_name as seller, b.name as branch, p.name as package,
           s.quantity, s.total_gb, s.gross_amount, s.commission_rate, s.commission_amount, s.net_amount, s.notes
    FROM sales s
    JOIN users u ON u.id=s.seller_id
    JOIN branches b ON b.id=s.branch_id
    JOIN packages p ON p.id=s.package_id
    WHERE s.company_id=? ${csvSellerFilter} ${dateFilter}
    ORDER BY s.snapshot_time DESC`).bind(user.company_id).all<any>();

  const header = 'Date,Seller,Branch,Package,Quantity,Total GB,Gross Amount,Commission Rate,Commission,Net Amount,Notes\n';
  const rows = (data.results||[]).map((r: any) =>
    `"${r.snapshot_time}","${r.seller}","${r.branch}","${r.package}",${r.quantity},${r.total_gb},${r.gross_amount},${r.commission_rate},${r.commission_amount},${r.net_amount},"${r.notes||''}"`
  ).join('\n');

  return new Response(header + rows, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="hotspot-report-${new Date().toISOString().split('T')[0]}.csv"`
    }
  });
});

// Keep backward compat aliases
reports.get('/api/reports/csv', async (c) => {
  return new Response(null, { status: 302, headers: { 'Location': '/reports/csv'+c.req.url.split('?')[1]?'?'+c.req.url.split('?')[1]:'' } });
});

export default reports;
