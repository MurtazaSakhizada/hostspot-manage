// ============================================
// Payments Routes
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatMoney } from '../lib/calc';
import { createNotification } from './notifications';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const payments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

payments.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const sellerFilter = user.role === 'seller' ? `AND seller_id = ${user.id}` : '';

  const items = await c.env.DB.prepare(`
    SELECT p.*, u.full_name as seller_name, b.name as branch_name
    FROM payments p
    JOIN users u ON u.id = p.seller_id
    LEFT JOIN branches b ON b.id = p.branch_id
    WHERE p.company_id=? ${sellerFilter}
    ORDER BY p.payment_date DESC, p.created_at DESC`).bind(user.company_id).all<any>();

  const totals = await c.env.DB.prepare(`
    SELECT type, COALESCE(SUM(amount),0) as total
    FROM payments WHERE company_id=? ${sellerFilter}
    GROUP BY type`).bind(user.company_id).all<any>();

  const totalsByType: Record<string,number> = {};
  (totals.results||[]).forEach((t: any) => totalsByType[t.type] = t.total);

  const sellers = user.role === 'owner'
    ? await c.env.DB.prepare("SELECT * FROM users WHERE company_id=? AND role='seller' AND active=1").bind(user.company_id).all<any>()
    : { results: [] };
  const branches = await c.env.DB.prepare('SELECT * FROM branches WHERE company_id=? AND active=1').bind(user.company_id).all<any>();

  const rows = (items.results||[]).map((item: any) => `
    <tr>
      <td>${item.payment_date}</td>
      ${user.role==='owner'?`<td><strong>${item.seller_name}</strong></td>`:''}
      <td>${item.branch_name||'—'}</td>
      <td><span class="badge badge-${item.type==='commission'?'warning':item.type==='settlement'?'success':'info'}">${t(lang, item.type as any)}</span></td>
      <td class="${user.role==='seller'?'font-bold':'text-success font-bold'}" style="${user.role==='seller'?'color:var(--danger)':''}">
        ${user.role==='seller'?'−':''}${formatMoney(item.amount)}
      </td>
      <td>${item.notes||'—'}</td>
      ${user.role==='owner'?`<td><button onclick="confirmDelete('/api/payments/${item.id}','${t(lang,'confirm_delete')}')" class="btn btn-danger btn-sm">${t(lang,'delete')}</button></td>`:''}
    </tr>`).join('');

  return c.html(pageShell({
    title: t(lang,'payments'), lang, user, activePage: 'payments',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">💳 ${t(lang,'payments')}</div>
        ${user.role === 'seller' ? `<div class="page-subtitle" style="font-size:.82rem;color:var(--text-muted)">${lang === 'fa' ? 'پرداخت‌های شما به مالک سیستم' : lang === 'ps' ? 'ستاسو تادیات مالک ته' : 'Your payments to the system owner'}</div>` : ''}
      </div>
      ${user.role==='owner'?`<a href="/payments/add" class="btn btn-primary">+ ${t(lang,'add_payment')}</a>`:''}
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      ${Object.entries(totalsByType).map(([type, total]) => `
      <div class="stat-card">
        <div class="stat-label">${t(lang, type as any)}</div>
        <div class="stat-value success">${formatMoney(total)}</div>
      </div>`).join('')}
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>${t(lang,'date')}</th>
            ${user.role==='owner'?`<th>${t(lang,'seller')}</th>`:''}
            <th>${t(lang,'branch')}</th>
            <th>${t(lang,'payment_type')}</th>
            <th>${t(lang,'net_amount')}</th>
            <th>${t(lang,'notes')}</th>
            ${user.role==='owner'?`<th>${t(lang,'actions')}</th>`:''}
          </tr></thead>
          <tbody>${rows||`<tr><td colspan="7"><div class="empty-state"><div class="empty-state-icon">💳</div><h3>${t(lang,'no_data')}</h3></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>`
  }));
});

payments.get('/add', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/payments');

  const sellers = await c.env.DB.prepare("SELECT * FROM users WHERE company_id=? AND role='seller' AND active=1").bind(user.company_id).all<any>();
  const branches = await c.env.DB.prepare('SELECT * FROM branches WHERE company_id=? AND active=1').bind(user.company_id).all<any>();

  return c.html(pageShell({
    title: t(lang,'add_payment'), lang, user, activePage: 'payments',
    body: `
    <div class="page-header"><div class="page-title">💳 ${t(lang,'add_payment')}</div></div>
    <div class="card" style="max-width:500px">
      <form method="POST" action="/payments">
        <div class="form-row">
          <div class="form-group">
            <label>${t(lang,'seller')}</label>
            <select name="seller_id" required>
              ${(sellers.results||[]).map((s: any) => `<option value="${s.id}">${s.full_name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>${t(lang,'branch')} (optional)</label>
            <select name="branch_id">
              <option value="">—</option>
              ${(branches.results||[]).map((b: any) => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>${t(lang,'payment_type')}</label>
            <select name="type" required>
              <option value="commission">${t(lang,'commission_pay')}</option>
              <option value="advance">${t(lang,'advance')}</option>
              <option value="settlement">${t(lang,'settlement')}</option>
              <option value="other">${t(lang,'other')}</option>
            </select>
          </div>
          <div class="form-group">
            <label>Amount (؋)</label>
            <input type="number" name="amount" min="0.01" step="0.01" required/>
          </div>
        </div>
        <div class="form-group">
          <label>${t(lang,'date')}</label>
          <input type="date" name="payment_date" required value="${new Date().toISOString().split('T')[0]}"/>
        </div>
        <div class="form-group">
          <label>${t(lang,'notes')}</label>
          <textarea name="notes" rows="2"></textarea>
        </div>
        <div class="modal-footer" style="border:none;padding:0;margin-top:1.25rem">
          <a href="/payments" class="btn btn-outline">${t(lang,'cancel')}</a>
          <button type="submit" class="btn btn-primary">${t(lang,'save')}</button>
        </div>
      </form>
    </div>`
  }));
});

payments.post('/', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const form = await c.req.formData();
  const seller_id = parseInt(form.get('seller_id')?.toString()??'0');
  const branch_id = form.get('branch_id')?.toString()??'';
  const type = form.get('type')?.toString()??'other';
  const amount = parseFloat(form.get('amount')?.toString()??'0');
  const payment_date = form.get('payment_date')?.toString()??new Date().toISOString().split('T')[0];
  const notes = form.get('notes')?.toString()??'';

  await c.env.DB.prepare(`
    INSERT INTO payments (company_id,seller_id,branch_id,amount,payment_date,type,notes)
    VALUES (?,?,?,?,?,?,?)`).bind(
    user.company_id, seller_id,
    branch_id ? parseInt(branch_id) : null,
    amount, payment_date, type, notes||null
  ).run();

  // Get seller name for notification
  const seller = await c.env.DB.prepare('SELECT full_name FROM users WHERE id=? AND company_id=?')
    .bind(seller_id, user.company_id).first<{full_name:string}>();
  const typeLabels: Record<string,string> = {
    commission: 'Commission', advance: 'Advance', settlement: 'Settlement', other: 'Payment'
  };
  await createNotification(c.env.DB, {
    company_id: user.company_id,
    user_id: null, // broadcast to all owners
    type: 'success',
    category: 'payment',
    title: `💳 ${typeLabels[type]??'Payment'} recorded`,
    message: `${formatMoney(amount)} paid to ${seller?.full_name??'seller'} on ${payment_date}`,
    link: '/payments',
  });

  return new Response(null, { status: 302, headers: { 'Location': '/payments' } });
});

payments.delete('/api/payments/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM payments WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

export default payments;
