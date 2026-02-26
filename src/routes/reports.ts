// ============================================
// Reports Routes - Summary-first with PDF export
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatGB, formatMoney } from '../lib/calc';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const reports = new Hono<{ Bindings: Bindings; Variables: Variables }>();

reports.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const reportType = c.req.query('type') ?? 'summary';
  const groupBy = c.req.query('group') ?? 'date';
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';

  let dateFilter = '';
  if (from) dateFilter += ` AND date(snapshot_time) >= '${from}'`;
  if (to) dateFilter += ` AND date(snapshot_time) <= '${to}'`;

  // Sales Summary
  const salesSummary = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(gross_amount),0) as gross,
           COALESCE(SUM(commission_amount),0) as comm, COALESCE(SUM(net_amount),0) as net, COUNT(*) as cnt
    FROM sales WHERE company_id=? ${dateFilter}`).bind(user.company_id).first<any>();

  // By Date
  const byDate = await c.env.DB.prepare(`
    SELECT strftime('%Y-%m-%d', snapshot_time) as period,
      COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(gross_amount),0) as gross,
      COALESCE(SUM(commission_amount),0) as comm, COALESCE(SUM(net_amount),0) as net, COUNT(*) as cnt
    FROM sales WHERE company_id=? ${dateFilter}
    GROUP BY period ORDER BY period DESC LIMIT 30`).bind(user.company_id).all<any>();

  // By Branch
  const byBranch = await c.env.DB.prepare(`
    SELECT b.name as period,
      COALESCE(SUM(s.total_gb),0) as gb, COALESCE(SUM(s.gross_amount),0) as gross,
      COALESCE(SUM(s.commission_amount),0) as comm, COALESCE(SUM(s.net_amount),0) as net, COUNT(s.id) as cnt
    FROM branches b LEFT JOIN sales s ON s.branch_id=b.id AND s.company_id=b.company_id ${dateFilter.replace('snapshot_time','s.snapshot_time')}
    WHERE b.company_id=?
    GROUP BY b.id, b.name ORDER BY gb DESC`).bind(user.company_id).all<any>();

  // By Seller
  const bySeller = user.role === 'owner'
    ? await c.env.DB.prepare(`
      SELECT u.full_name as period, u.commission_rate,
        COALESCE(SUM(s.total_gb),0) as gb, COALESCE(SUM(s.gross_amount),0) as gross,
        COALESCE(SUM(s.commission_amount),0) as comm, COALESCE(SUM(s.net_amount),0) as net, COUNT(s.id) as cnt
      FROM users u LEFT JOIN sales s ON s.seller_id=u.id AND s.company_id=u.company_id ${dateFilter.replace('snapshot_time','s.snapshot_time')}
      WHERE u.company_id=? AND u.role='seller'
      GROUP BY u.id, u.full_name, u.commission_rate ORDER BY gb DESC`).bind(user.company_id).all<any>()
    : { results: [] };

  const activeGroup = groupBy;

  function buildTable(data: any[], showOwnerCols: boolean) {
    if (!data?.length) return `<div class="empty-state"><div class="empty-state-icon">📋</div><h3>${t(lang,'no_data')}</h3></div>`;
    const rows = data.map((row: any) => `
      <tr>
        <td><strong>${row.period}</strong></td>
        <td class="text-primary font-bold">${formatGB(row.gb)}</td>
        ${showOwnerCols?`<td>${formatMoney(row.gross)}</td><td class="text-warning">${formatMoney(row.comm)}</td>`:''}
        <td class="text-success font-bold">${formatMoney(row.net)}</td>
        <td class="text-center">${row.cnt}</td>
      </tr>`).join('');
    return `<div class="table-wrapper"><table>
      <thead><tr>
        <th>${t(lang,'summary')}</th>
        <th>${t(lang,'total_gb')}</th>
        ${showOwnerCols?`<th>${t(lang,'total_gross')}</th><th>${t(lang,'total_commission')}</th>`:''}
        <th>${t(lang,'net_amount')}</th>
        <th>Count</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  const isOwner = user.role === 'owner';
  const activeData = activeGroup==='branch' ? byBranch.results : activeGroup==='seller' ? bySeller.results : byDate.results;

  return c.html(pageShell({
    title: t(lang,'reports'), lang, user, activePage: 'reports',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">📋 ${t(lang,'reports')}</div>
        <div class="page-subtitle">${t(lang,'summary_first')}</div>
      </div>
      <button onclick="window.print()" class="btn btn-outline">🖨️ ${t(lang,'export_pdf')}</button>
    </div>

    <!-- Filter Bar -->
    <form method="GET" action="/reports" class="filter-bar">
      <div class="form-group" style="min-width:100px">
        <label>${t(lang,'from_date')}</label>
        <input type="date" name="from" value="${from}"/>
      </div>
      <div class="form-group" style="min-width:100px">
        <label>${t(lang,'to_date')}</label>
        <input type="date" name="to" value="${to}"/>
      </div>
      <div class="form-group" style="min-width:120px">
        <label>${t(lang,'filter_by')}</label>
        <select name="group">
          <option value="date" ${activeGroup==='date'?'selected':''}>${t(lang,'by_date')}</option>
          <option value="branch" ${activeGroup==='branch'?'selected':''}>${t(lang,'by_branch')}</option>
          ${isOwner?`<option value="seller" ${activeGroup==='seller'?'selected':''}>${t(lang,'by_seller')}</option>`:''}
        </select>
      </div>
      <button type="submit" class="btn btn-primary" style="align-self:flex-end">${t(lang,'generate_report')}</button>
    </form>

    <!-- KPI Summary (Always Visible First) -->
    <div class="stats-grid" style="margin-bottom:1.5rem">
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--primary)"></div>
        <div class="stat-label">${t(lang,'total_gb')}</div>
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
    </div>

    <!-- Tabs: By Date / Branch / Seller -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">📊 ${activeGroup==='branch'?t(lang,'by_branch'):activeGroup==='seller'?t(lang,'by_seller'):t(lang,'by_date')}</div>
        <div class="btn-group">
          <a href="?group=date${from?`&from=${from}`:''}${to?`&to=${to}`:''}" class="btn btn-sm ${activeGroup==='date'?'btn-primary':'btn-outline'}">${t(lang,'by_date')}</a>
          <a href="?group=branch${from?`&from=${from}`:''}${to?`&to=${to}`:''}" class="btn btn-sm ${activeGroup==='branch'?'btn-primary':'btn-outline'}">${t(lang,'by_branch')}</a>
          ${isOwner?`<a href="?group=seller${from?`&from=${from}`:''}${to?`&to=${to}`:''}" class="btn btn-sm ${activeGroup==='seller'?'btn-primary':'btn-outline'}">${t(lang,'by_seller')}</a>`:''}
        </div>
      </div>
      ${buildTable(activeData||[], isOwner)}
    </div>

    <!-- Drill-down sections -->
    <div class="drill-section" id="drill-branch" style="margin-top:1rem">
      <div class="drill-header" onclick="document.getElementById('drill-branch').classList.toggle('open')">
        <div class="drill-header-left">
          <span>🏢 ${t(lang,'by_branch')} ${t(lang,'details')}</span>
        </div>
        <span class="drill-chevron">▼</span>
      </div>
      <div class="drill-body">${buildTable(byBranch.results||[], isOwner)}</div>
    </div>

    ${isOwner?`
    <div class="drill-section" id="drill-seller" style="margin-top:1rem">
      <div class="drill-header" onclick="document.getElementById('drill-seller').classList.toggle('open')">
        <div class="drill-header-left">
          <span>👥 ${t(lang,'by_seller')} ${t(lang,'details')}</span>
        </div>
        <span class="drill-chevron">▼</span>
      </div>
      <div class="drill-body">${buildTable(bySeller.results||[], true)}</div>
    </div>`:''}

    <div style="margin-top:1rem;text-align:right">
      <button onclick="generatePDF()" class="btn btn-outline">📄 ${t(lang,'export_pdf')}</button>
      <a href="/api/reports/csv?group=${groupBy}&from=${from}&to=${to}" class="btn btn-outline">📥 ${t(lang,'export_csv')}</a>
    </div>`,
    scripts: `<script>
    function generatePDF() {
      window.print();
    }
    </script>`
  }));
});

// CSV Export
reports.get('/api/reports/csv', async (c) => {
  const user = c.get('user');
  const from = c.req.query('from') ?? '';
  const to = c.req.query('to') ?? '';
  let dateFilter = '';
  if (from) dateFilter += ` AND date(s.snapshot_time) >= '${from}'`;
  if (to) dateFilter += ` AND date(s.snapshot_time) <= '${to}'`;

  const data = await c.env.DB.prepare(`
    SELECT s.snapshot_time, u.full_name as seller, b.name as branch, p.name as package,
           s.quantity, s.total_gb, s.gross_amount, s.commission_rate, s.commission_amount, s.net_amount
    FROM sales s
    JOIN users u ON u.id=s.seller_id
    JOIN branches b ON b.id=s.branch_id
    JOIN packages p ON p.id=s.package_id
    WHERE s.company_id=? ${dateFilter}
    ORDER BY s.snapshot_time DESC`).bind(user.company_id).all<any>();

  const header = 'Date,Seller,Branch,Package,Quantity,Total GB,Gross,Commission Rate,Commission,Net\n';
  const rows = (data.results||[]).map((r: any) =>
    `${r.snapshot_time},${r.seller},${r.branch},${r.package},${r.quantity},${r.total_gb},${r.gross_amount},${r.commission_rate},${r.commission_amount},${r.net_amount}`
  ).join('\n');

  return new Response(header + rows, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="hotspot-report-${new Date().toISOString().split('T')[0]}.csv"`
    }
  });
});

export default reports;
