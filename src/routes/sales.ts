// ============================================
// Sales Routes
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { calculate, formatGB, formatMoney } from '../lib/calc';
import { createNotification } from './notifications';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const sales = new Hono<{ Bindings: Bindings; Variables: Variables }>();

sales.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const period = c.req.query('period') ?? 'all';
  const branchFilter = c.req.query('branch') ?? '';

  let dateFilter = '';
  if (period === 'today') dateFilter = `AND date(s.snapshot_time) = date('now')`;
  else if (period === 'week') dateFilter = `AND s.snapshot_time >= datetime('now','-7 days')`;
  else if (period === 'month') dateFilter = `AND s.snapshot_time >= datetime('now','-30 days')`;
  else if (period === 'year') dateFilter = `AND s.snapshot_time >= datetime('now','-365 days')`;

  const sellerFilter = user.role === 'seller' ? `AND s.seller_id = ${user.id}` : '';
  const branchCondition = branchFilter ? `AND s.branch_id = ${parseInt(branchFilter)}` : '';

  const items = await c.env.DB.prepare(`
    SELECT s.*, p.name as pkg_name, p.size_gb, b.name as branch_name, u.full_name as seller_name
    FROM sales s
    JOIN packages p ON p.id = s.package_id
    JOIN branches b ON b.id = s.branch_id
    JOIN users u ON u.id = s.seller_id
    WHERE s.company_id = ? ${sellerFilter} ${dateFilter} ${branchCondition}
    ORDER BY s.created_at DESC`).bind(user.company_id).all<any>();

  const totals = await c.env.DB.prepare(`
    SELECT COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(gross_amount),0) as gross,
           COALESCE(SUM(commission_amount),0) as comm, COALESCE(SUM(net_amount),0) as net, COUNT(*) as cnt
    FROM sales s WHERE s.company_id=? ${sellerFilter} ${dateFilter} ${branchCondition}`).bind(user.company_id).first<any>();

  const branches = await c.env.DB.prepare('SELECT * FROM branches WHERE company_id=? AND active=1').bind(user.company_id).all<any>();

  const periodBtns = ['today','week','month','year','all'].map(p => `
    <a href="/sales?period=${p}" class="btn btn-sm ${period===p?'btn-primary':'btn-outline'}">${t(lang,p==='all'?'all_time':p==='today'?'today':p==='week'?'this_week':p==='month'?'this_month':'this_year')}</a>`).join('');

  const branchSelect = `<select onchange="location.href='/sales?period=${period}&branch='+this.value" style="height:36px;padding:0.375rem 0.75rem;border:1px solid var(--gray-300);border-radius:8px;font-size:0.8rem">
    <option value="">All Branches</option>
    ${(branches.results||[]).map((b: any) => `<option value="${b.id}" ${branchFilter===String(b.id)?'selected':''}>${b.name}</option>`).join('')}
  </select>`;

  const rows = (items.results || []).map((item: any, i: number) => `
    <tr>
      <td>${new Date(item.snapshot_time).toLocaleDateString()}</td>
      ${user.role === 'owner' ? `<td><strong>${item.seller_name}</strong></td>` : ''}
      <td>${item.branch_name}</td>
      <td class="text-primary font-bold">${formatGB(item.total_gb)}</td>
      ${user.role === 'owner' ? `
      <td>${formatMoney(item.gross_amount)}</td>
      <td class="text-warning">${formatMoney(item.commission_amount)}</td>` : ''}
      <td class="text-success font-bold">${formatMoney(item.net_amount)}</td>
      <td>
        <button onclick="toggleRow('sl-detail-${i}')" class="btn btn-outline btn-sm">${t(lang,'package_breakdown')}</button>
        ${user.role === 'owner' ? `<button onclick="confirmDelete('/api/sales/${item.id}','${t(lang,'confirm_delete')}')" class="btn btn-danger btn-sm">${t(lang,'delete')}</button>` : ''}
      </td>
    </tr>
    <tr id="sl-detail-${i}" class="hidden">
      <td colspan="${user.role==='owner'?8:6}" style="background:var(--gray-50);padding:1rem">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:0.75rem">
          <div><div class="section-heading">${t(lang,'package')}</div><div class="font-bold">${item.pkg_name}</div></div>
          <div><div class="section-heading">${t(lang,'size_gb')}</div><div>${item.size_gb} GB</div></div>
          <div><div class="section-heading">${t(lang,'quantity')}</div><div>${item.quantity}</div></div>
          <div><div class="section-heading">${t(lang,'total_gb')}</div><div class="text-primary font-bold">${formatGB(item.total_gb)}</div></div>
          ${user.role === 'owner' ? `
          <div><div class="section-heading">${t(lang,'commission_rate')}</div><div>${Math.round(item.commission_rate*100)}%</div></div>
          <div><div class="section-heading">${t(lang,'gross_amount')}</div><div>${formatMoney(item.gross_amount)}</div></div>
          <div><div class="section-heading">${t(lang,'commission_amount')}</div><div class="text-warning">${formatMoney(item.commission_amount)}</div></div>` : ''}
          <div><div class="section-heading">${t(lang,'net_amount')}</div><div class="text-success font-bold">${formatMoney(item.net_amount)}</div></div>
          ${item.notes ? `<div><div class="section-heading">${t(lang,'notes')}</div><div>${item.notes}</div></div>` : ''}
        </div>
      </td>
    </tr>`).join('');

  return c.html(pageShell({
    title: t(lang,'sales'), lang, user, activePage: 'sales',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">💰 ${t(lang,'sales')}</div>
        <div class="page-subtitle">${totals?.cnt??0} transactions</div>
      </div>
      <a href="/sales/add" class="btn btn-primary">+ ${t(lang,'add_sale')}</a>
    </div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center">
      ${periodBtns}
      ${branchSelect}
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      <div class="stat-card">
        <div class="stat-label">${t(lang,'total_gb')}</div>
        <div class="stat-value primary">${formatGB(totals?.gb??0)}</div>
      </div>
      ${user.role === 'owner' ? `
      <div class="stat-card">
        <div class="stat-label">${t(lang,'total_gross')}</div>
        <div class="stat-value">${formatMoney(totals?.gross??0)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">${t(lang,'total_commission')}</div>
        <div class="stat-value warning">${formatMoney(totals?.comm??0)}</div>
      </div>` : ''}
      <div class="stat-card">
        <div class="stat-label">${t(lang,'net_amount')}</div>
        <div class="stat-value success">${formatMoney(totals?.net??0)}</div>
      </div>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>${t(lang,'date')}</th>
            ${user.role==='owner'?`<th>${t(lang,'seller')}</th>`:''}
            <th>${t(lang,'branch')}</th>
            <th>${t(lang,'total_gb')}</th>
            ${user.role==='owner'?`<th>${t(lang,'gross_amount')}</th><th>${t(lang,'commission_amount')}</th>`:''}
            <th>${t(lang,'net_amount')}</th>
            <th>${t(lang,'actions')}</th>
          </tr></thead>
          <tbody>${rows||`<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">💰</div><h3>${t(lang,'no_data')}</h3></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>`
  }));
});

// Add Sale Form
sales.get('/add', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');

  const branches = await c.env.DB.prepare('SELECT * FROM branches WHERE company_id=? AND active=1').bind(user.company_id).all<any>();
  const packages = await c.env.DB.prepare('SELECT * FROM packages WHERE company_id=? AND active=1').bind(user.company_id).all<any>();

  let sellers: any[] = [];
  if (user.role === 'owner') {
    const r = await c.env.DB.prepare("SELECT * FROM users WHERE company_id=? AND role='seller' AND active=1").bind(user.company_id).all<any>();
    sellers = r.results || [];
  }

  const sellerRate = user.role === 'seller' ? user.commission_rate : 0;
  const sellerField = user.role === 'owner'
    ? `<div class="form-group">
        <label>${t(lang,'seller')}</label>
        <select name="seller_id" id="sel-sel" required onchange="recalc()">
          ${sellers.map((s: any) => `<option value="${s.id}" data-rate="${s.commission_rate}">${s.full_name} (${Math.round(s.commission_rate*100)}%)</option>`).join('')}
        </select>
       </div>`
    : `<input type="hidden" name="seller_id" value="${user.id}"/>`;

  const branchOpts = (branches.results||[]).map((b: any) => `<option value="${b.id}">${b.name}</option>`).join('');
  const pkgOpts = (packages.results||[]).map((p: any) => `<option value="${p.id}" data-gb="${p.size_gb}" data-price="${p.sale_price_per_gb}">${p.name} (${p.size_gb}GB)</option>`).join('');

  return c.html(pageShell({
    title: t(lang,'add_sale'), lang, user, activePage: 'sales',
    body: `
    <div class="page-header"><div class="page-title">💰 ${t(lang,'add_sale')}</div></div>
    <div class="card" style="max-width:600px">
      <form method="POST" action="/sales">
        ${sellerField}
        <div class="form-row">
          <div class="form-group">
            <label>${t(lang,'branch')}</label>
            <select name="branch_id" required>${branchOpts}</select>
          </div>
          <div class="form-group">
            <label>${t(lang,'package')}</label>
            <select name="package_id" id="pkg-sel" required onchange="recalc()">${pkgOpts}</select>
          </div>
        </div>
        <div class="form-group">
          <label>${t(lang,'quantity')}</label>
          <input type="number" name="quantity" id="qty-inp" min="1" value="1" required oninput="recalc()"/>
        </div>
        <div class="form-group">
          <label>${t(lang,'notes')}</label>
          <textarea name="notes" rows="2"></textarea>
        </div>
        <div class="calc-preview">
          <div style="font-size:0.8rem;opacity:0.8;margin-bottom:0.5rem">📊 Auto Calculation</div>
          <div class="calc-preview-grid">
            <div class="calc-item"><div class="calc-item-label">${t(lang,'total_gb')}</div><div class="calc-item-value main" id="prev-gb">0 GB</div></div>
            ${user.role==='owner'?`<div class="calc-item"><div class="calc-item-label">${t(lang,'gross_amount')}</div><div class="calc-item-value" id="prev-gross">0</div></div>
            <div class="calc-item"><div class="calc-item-label">${t(lang,'commission_amount')}</div><div class="calc-item-value" id="prev-comm">0</div></div>`:''}
            <div class="calc-item"><div class="calc-item-label">${t(lang,'net_amount')}</div><div class="calc-item-value" id="prev-net">0</div></div>
          </div>
        </div>
        <div class="modal-footer" style="border:none;padding:0;margin-top:1.25rem">
          <a href="/sales" class="btn btn-outline">${t(lang,'cancel')}</a>
          <button type="submit" class="btn btn-primary">${t(lang,'save')}</button>
        </div>
      </form>
    </div>`,
    scripts: `<script>
    const pkgs={}; const sels={};
    document.querySelectorAll('#pkg-sel option').forEach(o=>pkgs[o.value]={gb:parseFloat(o.dataset.gb||0),price:parseFloat(o.dataset.price||0)});
    ${user.role==='owner'?`document.querySelectorAll('#sel-sel option').forEach(o=>sels[o.value]=parseFloat(o.dataset.rate||0));`:''}
    const fixedRate = ${sellerRate};
    function recalc(){
      const pkgId=document.getElementById('pkg-sel').value;
      const qty=parseInt(document.getElementById('qty-inp').value)||0;
      const p=pkgs[pkgId]||{gb:0,price:0};
      ${user.role==='owner'?`const selId=document.getElementById('sel-sel')?.value; const rate=sels[selId]||0;`:`const rate=fixedRate;`}
      const gb=p.gb*qty;
      const gross=gb*p.price;
      const comm=gross*rate;
      const net=gross-comm;
      document.getElementById('prev-gb').textContent=gb.toFixed(gb%1===0?0:2)+' GB';
      ${user.role==='owner'?`document.getElementById('prev-gross').textContent='؋ '+gross.toLocaleString();
      document.getElementById('prev-comm').textContent='؋ '+comm.toLocaleString()+' ('+(rate*100).toFixed(0)+'%)';`:''}
      document.getElementById('prev-net').textContent='؋ '+net.toLocaleString();
    }
    recalc();
    </script>`
  }));
});

sales.post('/', async (c) => {
  const user = c.get('user');
  const form = await c.req.formData();
  const seller_id_raw = form.get('seller_id')?.toString() ?? '';
  const seller_id = user.role === 'owner' ? parseInt(seller_id_raw) : user.id;
  const branch_id = parseInt(form.get('branch_id')?.toString() ?? '0');
  const package_id = parseInt(form.get('package_id')?.toString() ?? '0');
  const quantity = parseInt(form.get('quantity')?.toString() ?? '0');
  const notes = form.get('notes')?.toString() ?? '';

  const pkg = await c.env.DB.prepare('SELECT * FROM packages WHERE id=? AND company_id=?').bind(package_id, user.company_id).first<any>();
  const seller = await c.env.DB.prepare('SELECT * FROM users WHERE id=? AND company_id=?').bind(seller_id, user.company_id).first<any>();
  if (!pkg || !seller) return c.json({error:'Not found'},404);

  const calc = calculate({ size_gb: pkg.size_gb, quantity, sale_price_per_gb: pkg.sale_price_per_gb, commission_rate: seller.commission_rate });

  await c.env.DB.prepare(`
    INSERT INTO sales (company_id,seller_id,branch_id,package_id,quantity,total_gb,gross_amount,commission_rate,commission_amount,net_amount,notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).bind(
    user.company_id, seller_id, branch_id, package_id, quantity,
    calc.total_gb, calc.gross_amount, seller.commission_rate,
    calc.commission_amount, calc.net_amount, notes||null
  ).run();

  // Notification
  await createNotification(c.env.DB, {
    company_id: user.company_id,
    user_id: user.id,
    type: 'success',
    category: 'sale',
    title: 'Sale Recorded',
    message: `${quantity}× ${pkg.name} (${formatGB(calc.total_gb)}) by ${seller.full_name} · ${formatMoney(calc.gross_amount)}`,
    link: '/sales'
  });

  return new Response(null, { status: 302, headers: { 'Location': '/sales' } });
});

sales.delete('/api/sales/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM sales WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

export default sales;
