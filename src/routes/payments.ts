// ============================================
// Payments Routes
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatMoney } from '../lib/calc';
import { createNotification } from './notifications';
import { createLedgerEntry } from '../lib/ledger';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const payments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Helper: fetch pending edit request for a payment ─────────────────────────
async function hasPendingRequest(db: D1Database, paymentId: number): Promise<boolean> {
  const row = await db.prepare(
    `SELECT id FROM payment_edit_requests WHERE payment_id=? AND status='pending' LIMIT 1`
  ).bind(paymentId).first<{id:number}>();
  return !!row;
}

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

  // For seller: get pending request counts per payment for badge display
  let pendingSet = new Set<number>();
  if (user.role === 'seller') {
    const pendingRows = await c.env.DB.prepare(
      `SELECT payment_id FROM payment_edit_requests WHERE company_id=? AND seller_id=? AND status='pending'`
    ).bind(user.company_id, user.id).all<{payment_id:number}>();
    pendingSet = new Set((pendingRows.results||[]).map((r: any) => r.payment_id));
  }

  const sellers = user.role === 'owner'
    ? await c.env.DB.prepare("SELECT * FROM users WHERE company_id=? AND role='seller' AND active=1").bind(user.company_id).all<any>()
    : { results: [] };
  const branches = await c.env.DB.prepare('SELECT * FROM branches WHERE company_id=? AND active=1').bind(user.company_id).all<any>();

  // Count pending edit requests (for owner badge)
  let pendingCount = 0;
  if (user.role === 'owner') {
    const pRow = await c.env.DB.prepare(
      `SELECT COUNT(*) as cnt FROM payment_edit_requests WHERE company_id=? AND status='pending'`
    ).bind(user.company_id).first<{cnt:number}>();
    pendingCount = pRow?.cnt ?? 0;
  }

  // Group by seller (owner) or flat (seller)
  let rows = '';
  if (user.role === 'owner') {
    const grouped: Record<string, any[]> = {};
    (items.results||[]).forEach((item: any) => {
      const key = item.seller_name || 'نامشخص';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });
    rows = Object.entries(grouped).map(([sellerName, sellerItems]) => {
      const sellerTotal = sellerItems.reduce((s, i) => s + i.amount, 0);
      const itemRows = sellerItems.map((item: any) => `
        <tr>
          <td style="padding-right:1.5rem">${item.payment_date}</td>
          <td>${item.branch_name||'—'}</td>
          <td><span class="badge badge-${item.type==='commission'?'warning':item.type==='settlement'?'success':'info'}">${t(lang, item.type as any)}</span></td>
          <td class="font-bold text-success">+ ${formatMoney(item.amount)}</td>
          <td>${item.notes||'—'}</td>
          <td>
            <a href="/payments/${item.id}/edit" class="btn btn-outline btn-sm">✏️ ${t(lang,'edit')}</a>
            <button onclick="confirmDelete('/api/payments/${item.id}','${t(lang,'confirm_delete')}')" class="btn btn-danger btn-sm">${t(lang,'delete')}</button>
          </td>
        </tr>`).join('');
      return `
      <tr style="background:var(--gray-50);border-top:2px solid var(--success)">
        <td colspan="6" style="padding:.6rem 1rem">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.5rem">
            <div style="font-weight:700;font-size:1rem;color:var(--primary)">👤 ${sellerName}</div>
            <div style="font-size:.82rem">💰 جمع دریافتی: <strong class="text-success">${formatMoney(sellerTotal)}</strong> — ${sellerItems.length} پرداخت</div>
          </div>
        </td>
      </tr>
      ${itemRows}`;
    }).join('');
  } else {
    // Seller view with edit request button
    rows = (items.results||[]).map((item: any) => {
      const hasPending = pendingSet.has(item.id);
      return `
      <tr>
        <td>${item.payment_date}</td>
        <td>${item.branch_name||'—'}</td>
        <td><span class="badge badge-${item.type==='commission'?'warning':item.type==='settlement'?'success':'info'}">${t(lang, item.type as any)}</span></td>
        <td class="font-bold" style="color:var(--danger);">− ${formatMoney(item.amount)}</td>
        <td>${item.notes||'—'}</td>
        <td>
          ${hasPending
            ? `<span style="font-size:.75rem;color:var(--warning);font-weight:600">⏳ ${t(lang,'status_pending')}</span>`
            : `<a href="/payments/${item.id}/request-edit" class="btn btn-outline btn-sm">📝 ${t(lang,'request_edit')}</a>`
          }
        </td>
      </tr>`;
    }).join('');
  }

  return c.html(pageShell({
    title: t(lang,'payments'), lang, user, activePage: 'payments',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">${user.role === 'seller' ? '💳 پرداختی‌های من' : '💰 ' + t(lang,'payments')}</div>
        ${user.role === 'seller' ? `<div class="page-subtitle" style="font-size:.82rem;color:var(--text-muted)">${t(lang,'your_payments_to_owner')}</div>` : `<div class="page-subtitle" style="font-size:.82rem;color:var(--text-muted)">دریافتی‌های ثبت‌شده از فروشندگان</div>`}
      </div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        ${user.role==='owner'
          ? `${pendingCount>0?`<a href="/payments/edit-requests" class="btn btn-warning btn-sm">📋 ${t(lang,'pending_requests')} <span style="background:#fff;color:#d97706;border-radius:999px;padding:0 6px;font-size:.72rem;font-weight:700">${pendingCount}</span></a>`:''}
             <a href="/payments/add" class="btn btn-primary">+ ${t(lang,'add_payment')}</a>`
          : `<a href="/payments/add" class="btn btn-primary">${t(lang,'register_payment_seller')}</a>`
        }
      </div>
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
      ${Object.entries(totalsByType).map(([type, total]) => `
      <div class="stat-card">
        <div class="stat-label">${t(lang, type as any)}</div>
        <div class="stat-value" style="color:#0891b2;font-weight:700">${formatMoney(total)}</div>
      </div>`).join('')}
    </div>
    <div class="card">
      <div class="card-header" style="padding:.75rem 1rem">
        <div class="card-title" style="font-size:.85rem">
          ${user.role === 'seller' ? '💳 پرداختی‌های من به مالک' : '💰 دریافتی‌ها'}
        </div>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>${t(lang,'date')}</th>
            <th>${t(lang,'branch')}</th>
            <th>${user.role==='seller'?'نوع پرداختی':t(lang,'payment_type')}</th>
            <th>${user.role==='seller'?'مبلغ پرداختی':t(lang,'net_amount')}</th>
            <th>${t(lang,'notes')}</th>
            <th>${t(lang,'actions')}</th>
          </tr></thead>
          <tbody>${rows||`<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">💳</div><h3>${t(lang,'no_data')}</h3></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>`
  }));
});

// ── Add Payment (GET) ─────────────────────────────────────────────────────────
payments.get('/add', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');

  const branches = await c.env.DB.prepare('SELECT * FROM branches WHERE company_id=? AND active=1').bind(user.company_id).all<any>();

  // Sellers register their own payment; owners pick a seller
  const sellerField = user.role === 'owner'
    ? await (async () => {
        const sellers = await c.env.DB.prepare("SELECT * FROM users WHERE company_id=? AND role='seller' AND active=1").bind(user.company_id).all<any>();
        return `<div class="form-group">
          <label>${t(lang,'seller')}</label>
          <select name="seller_id" required>
            ${(sellers.results||[]).map((s: any) => `<option value="${s.id}">${s.full_name}</option>`).join('')}
          </select>
        </div>`;
      })()
    : `<input type="hidden" name="seller_id" value="${user.id}"/>`;

  return c.html(pageShell({
    title: user.role==='seller' ? t(lang,'register_payment_seller') : t(lang,'add_payment'),
    lang, user, activePage: 'payments',
    body: `
    <div class="page-header">
      <div class="page-title">${user.role==='seller' ? '💳 ' + t(lang,'register_payment_seller') : '💰 ' + t(lang,'add_payment')}</div>
    </div>
    <div class="card" style="max-width:500px">
      <form method="POST" action="/payments">
        ${sellerField}
        <div class="form-row">
          <div class="form-group">
            <label>${t(lang,'branch')} (${t(lang,'optional')})</label>
            <select name="branch_id">
              <option value="">—</option>
              ${(branches.results||[]).map((b: any) => `<option value="${b.id}">${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>${user.role==='seller'?'نوع پرداختی':t(lang,'payment_type')}</label>
            <select name="type" required>
              <option value="commission">${t(lang,'commission_pay')}</option>
              <option value="advance">${t(lang,'advance')}</option>
              <option value="settlement">${t(lang,'settlement')}</option>
              <option value="other">${t(lang,'other')}</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>${user.role==='seller'?'مبلغ پرداختی (؋)':t(lang,'amount')+' (؋)'}</label>
            <input type="number" name="amount" min="0.01" step="0.01" required/>
          </div>
          <div class="form-group">
            <label>${t(lang,'date')}</label>
            <input type="date" name="payment_date" required value="${new Date().toISOString().split('T')[0]}"/>
          </div>
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

// ── Add Payment (POST) ────────────────────────────────────────────────────────
payments.post('/', async (c) => {
  const user = c.get('user');
  const form = await c.req.formData();

  // Both sellers and owners can register payments
  const seller_id = user.role === 'owner'
    ? parseInt(form.get('seller_id')?.toString()??'0')
    : user.id;
  const branch_id    = form.get('branch_id')?.toString()??'';
  const type         = form.get('type')?.toString()??'other';
  const amount       = parseFloat(form.get('amount')?.toString()??'0');
  const payment_date = form.get('payment_date')?.toString()??new Date().toISOString().split('T')[0];
  const notes        = form.get('notes')?.toString()??'';

  await c.env.DB.prepare(`
    INSERT INTO payments (company_id,seller_id,branch_id,amount,payment_date,type,notes)
    VALUES (?,?,?,?,?,?,?)`).bind(
    user.company_id, seller_id,
    branch_id ? parseInt(branch_id) : null,
    amount, payment_date, type, notes||null
  ).run();

  const seller = await c.env.DB.prepare('SELECT full_name FROM users WHERE id=? AND company_id=?')
    .bind(seller_id, user.company_id).first<{full_name:string}>();
  const typeLabels: Record<string,string> = {
    commission: 'Commission', advance: 'Advance', settlement: 'Settlement', other: 'Payment'
  };
  await createNotification(c.env.DB, {
    company_id: user.company_id,
    user_id: null,
    type: 'success',
    category: 'payment',
    title: `💳 ${typeLabels[type]??'Payment'} recorded`,
    message: `${formatMoney(amount)} paid by ${seller?.full_name??'seller'} on ${payment_date}`,
    link: '/payments',
  });

  const payRow = await c.env.DB.prepare(
    `SELECT id FROM payments WHERE company_id=? AND seller_id=? ORDER BY created_at DESC LIMIT 1`
  ).bind(user.company_id, seller_id).first<{id:number}>();

  await createLedgerEntry(c.env.DB, {
    company_id:       user.company_id,
    seller_id:        seller_id,
    transaction_type: 'payment',
    ref_type:         'payment',
    ref_id:           payRow?.id,
    gb_amount:        0,
    money_amount:     -(Math.round(amount * 100) / 100),
    notes:            `${typeLabels[type]??'Payment'} · ${formatMoney(amount)} on ${payment_date}`,
    created_by:       user.id,
  });

  return new Response(null, { status: 302, headers: { 'Location': '/payments' } });
});

// ── Edit Payment (GET) — owner only ──────────────────────────────────────────
payments.get('/:id/edit', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/payments');

  const id = parseInt(c.req.param('id'));
  const payment = await c.env.DB.prepare(
    `SELECT p.*, u.full_name as seller_name FROM payments p JOIN users u ON u.id=p.seller_id WHERE p.id=? AND p.company_id=?`
  ).bind(id, user.company_id).first<any>();
  if (!payment) return c.redirect('/payments');

  const branches = await c.env.DB.prepare('SELECT * FROM branches WHERE company_id=? AND active=1').bind(user.company_id).all<any>();

  return c.html(pageShell({
    title: t(lang,'edit_payment'), lang, user, activePage: 'payments',
    body: `
    <div class="page-header">
      <div class="page-title">✏️ ${t(lang,'edit_payment')}</div>
    </div>
    <div class="card" style="max-width:500px">
      <form method="POST" action="/payments/${id}/edit">
        <div class="form-group">
          <label>${t(lang,'seller')}</label>
          <input type="text" value="${payment.seller_name}" disabled style="background:var(--gray-100)"/>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>${t(lang,'branch')} (${t(lang,'optional')})</label>
            <select name="branch_id">
              <option value="">—</option>
              ${(branches.results||[]).map((b: any) => `<option value="${b.id}" ${b.id===payment.branch_id?'selected':''}>${b.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>${t(lang,'payment_type')}</label>
            <select name="type" required>
              <option value="commission" ${payment.type==='commission'?'selected':''}>${t(lang,'commission_pay')}</option>
              <option value="advance" ${payment.type==='advance'?'selected':''}>${t(lang,'advance')}</option>
              <option value="settlement" ${payment.type==='settlement'?'selected':''}>${t(lang,'settlement')}</option>
              <option value="other" ${payment.type==='other'?'selected':''}>${t(lang,'other')}</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>${t(lang,'amount')} (؋)</label>
            <input type="number" name="amount" min="0.01" step="0.01" value="${payment.amount}" required/>
          </div>
          <div class="form-group">
            <label>${t(lang,'date')}</label>
            <input type="date" name="payment_date" required value="${payment.payment_date}"/>
          </div>
        </div>
        <div class="form-group">
          <label>${t(lang,'notes')}</label>
          <textarea name="notes" rows="2">${payment.notes||''}</textarea>
        </div>
        <div class="modal-footer" style="border:none;padding:0;margin-top:1.25rem">
          <a href="/payments" class="btn btn-outline">${t(lang,'cancel')}</a>
          <button type="submit" class="btn btn-primary">💾 ${t(lang,'save_changes')}</button>
        </div>
      </form>
    </div>`
  }));
});

// ── Edit Payment (POST) — owner only ─────────────────────────────────────────
payments.post('/:id/edit', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.redirect('/payments');

  const id = parseInt(c.req.param('id'));
  const existing = await c.env.DB.prepare(
    `SELECT * FROM payments WHERE id=? AND company_id=?`
  ).bind(id, user.company_id).first<any>();
  if (!existing) return c.redirect('/payments');

  const form = await c.req.formData();
  const branch_id    = form.get('branch_id')?.toString()??'';
  const type         = form.get('type')?.toString()??existing.type;
  const amount       = parseFloat(form.get('amount')?.toString()??String(existing.amount));
  const payment_date = form.get('payment_date')?.toString()??existing.payment_date;
  const notes        = form.get('notes')?.toString()??'';

  // Update ledger: remove old entry, add new
  await c.env.DB.prepare(`DELETE FROM financial_ledger WHERE company_id=? AND ref_type='payment' AND ref_id=?`
  ).bind(user.company_id, id).run();

  await c.env.DB.prepare(`
    UPDATE payments SET branch_id=?, type=?, amount=?, payment_date=?, notes=? WHERE id=? AND company_id=?`
  ).bind(
    branch_id ? parseInt(branch_id) : null,
    type, amount, payment_date, notes||null,
    id, user.company_id
  ).run();

  await createLedgerEntry(c.env.DB, {
    company_id:       user.company_id,
    seller_id:        existing.seller_id,
    transaction_type: 'payment',
    ref_type:         'payment',
    ref_id:           id,
    gb_amount:        0,
    money_amount:     -(Math.round(amount * 100) / 100),
    notes:            `Payment edited · ${formatMoney(amount)} on ${payment_date}`,
    created_by:       user.id,
  });

  return new Response(null, { status: 302, headers: { 'Location': '/payments' } });
});

// ── Request Edit (GET) — seller submits edit request ─────────────────────────
payments.get('/:id/request-edit', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'seller') return c.redirect('/payments');

  const id = parseInt(c.req.param('id'));
  const payment = await c.env.DB.prepare(
    `SELECT p.*, b.name as branch_name FROM payments p LEFT JOIN branches b ON b.id=p.branch_id WHERE p.id=? AND p.company_id=? AND p.seller_id=?`
  ).bind(id, user.company_id, user.id).first<any>();
  if (!payment) return c.redirect('/payments');

  // Check if already has pending
  const pending = await hasPendingRequest(c.env.DB, id);
  if (pending) return c.redirect('/payments');

  const branches = await c.env.DB.prepare('SELECT * FROM branches WHERE company_id=? AND active=1').bind(user.company_id).all<any>();

  return c.html(pageShell({
    title: t(lang,'edit_request_title'), lang, user, activePage: 'payments',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">${t(lang,'edit_request_title')}</div>
        <div class="page-subtitle" style="font-size:.82rem;color:var(--warning)">⚠️ درخواست ویرایش به ادمین ارسال می‌شود و پس از تأیید اعمال می‌گردد.</div>
      </div>
    </div>

    <!-- Current values -->
    <div class="card" style="max-width:620px;margin-bottom:1rem">
      <div class="card-header"><div class="card-title">📋 ${t(lang,'old_value')}</div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1rem;padding:1rem">
        <div><div class="section-heading">${t(lang,'date')}</div><div class="font-bold">${payment.payment_date}</div></div>
        <div><div class="section-heading">نوع پرداختی</div><div>${payment.type}</div></div>
        <div><div class="section-heading">مبلغ</div><div class="font-bold text-danger">${formatMoney(payment.amount)}</div></div>
        <div><div class="section-heading">${t(lang,'notes')}</div><div>${payment.notes||'—'}</div></div>
      </div>
    </div>

    <!-- Proposed new values -->
    <div class="card" style="max-width:620px">
      <div class="card-header"><div class="card-title">✏️ ${t(lang,'new_value')}</div></div>
      <form method="POST" action="/payments/${id}/request-edit" style="padding:1rem">
        <div class="form-row">
          <div class="form-group">
            <label>نوع پرداختی جدید</label>
            <select name="new_type" required>
              <option value="commission" ${payment.type==='commission'?'selected':''}>${t(lang,'commission_pay')}</option>
              <option value="advance" ${payment.type==='advance'?'selected':''}>${t(lang,'advance')}</option>
              <option value="settlement" ${payment.type==='settlement'?'selected':''}>${t(lang,'settlement')}</option>
              <option value="other" ${payment.type==='other'?'selected':''}>${t(lang,'other')}</option>
            </select>
          </div>
          <div class="form-group">
            <label>مبلغ جدید (؋)</label>
            <input type="number" name="new_amount" min="0.01" step="0.01" value="${payment.amount}" required/>
          </div>
        </div>
        <div class="form-group">
          <label>تاریخ جدید</label>
          <input type="date" name="new_payment_date" value="${payment.payment_date}" required/>
        </div>
        <div class="form-group">
          <label>یادداشت جدید</label>
          <textarea name="new_notes" rows="2">${payment.notes||''}</textarea>
        </div>
        <div class="form-group">
          <label style="font-weight:700;color:var(--warning)">دلیل درخواست ویرایش *</label>
          <textarea name="admin_notes" rows="2" required placeholder="توضیح دهید چرا نیاز به ویرایش دارد..."></textarea>
        </div>
        <div class="modal-footer" style="border:none;padding:0;margin-top:1.25rem">
          <a href="/payments" class="btn btn-outline">${t(lang,'cancel')}</a>
          <button type="submit" class="btn btn-warning">📤 ارسال درخواست</button>
        </div>
      </form>
    </div>`
  }));
});

// ── Request Edit (POST) — seller submits edit request ────────────────────────
payments.post('/:id/request-edit', async (c) => {
  const user = c.get('user');
  if (user.role !== 'seller') return c.redirect('/payments');

  const id = parseInt(c.req.param('id'));
  const payment = await c.env.DB.prepare(
    `SELECT * FROM payments WHERE id=? AND company_id=? AND seller_id=?`
  ).bind(id, user.company_id, user.id).first<any>();
  if (!payment) return c.redirect('/payments');

  const pending = await hasPendingRequest(c.env.DB, id);
  if (pending) return c.redirect('/payments');

  const form = await c.req.formData();
  const new_type         = form.get('new_type')?.toString()??payment.type;
  const new_amount       = parseFloat(form.get('new_amount')?.toString()??String(payment.amount));
  const new_payment_date = form.get('new_payment_date')?.toString()??payment.payment_date;
  const new_notes        = form.get('new_notes')?.toString()??'';
  const admin_notes      = form.get('admin_notes')?.toString()??'';

  await c.env.DB.prepare(`
    INSERT INTO payment_edit_requests
      (company_id, payment_id, seller_id, new_amount, new_type, new_payment_date, new_notes,
       old_amount, old_type, old_payment_date, old_notes, status, admin_notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',?)`
  ).bind(
    user.company_id, id, user.id,
    new_amount, new_type, new_payment_date, new_notes||null,
    payment.amount, payment.type, payment.payment_date, payment.notes||null,
    admin_notes||null
  ).run();

  // Notify owners
  await createNotification(c.env.DB, {
    company_id: user.company_id,
    user_id: null,
    type: 'warning',
    category: 'payment',
    title: '📝 Payment Edit Request',
    message: `${user.full_name} requested to edit payment #${id} (${formatMoney(payment.amount)} → ${formatMoney(new_amount)})`,
    link: '/payments/edit-requests',
  });

  return new Response(null, {
    status: 302,
    headers: { 'Location': '/payments?msg=request_sent' }
  });
});

// ── Edit Requests List (GET) — owner only ─────────────────────────────────────
payments.get('/edit-requests', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/payments');

  const requests = await c.env.DB.prepare(`
    SELECT r.*, u.full_name as seller_name,
           p.payment_date as orig_date
    FROM payment_edit_requests r
    JOIN users u ON u.id = r.seller_id
    JOIN payments p ON p.id = r.payment_id
    WHERE r.company_id=?
    ORDER BY r.created_at DESC`
  ).bind(user.company_id).all<any>();

  const statusBadge = (s: string) =>
    s==='pending'  ? `<span class="badge badge-warning">🕐 ${t(lang,'status_pending')}</span>` :
    s==='approved' ? `<span class="badge badge-success">✅ ${t(lang,'status_approved')}</span>` :
                    `<span class="badge badge-danger">❌ ${t(lang,'status_rejected')}</span>`;

  const rows = (requests.results||[]).map((r: any) => `
    <tr>
      <td style="font-size:.78rem;color:var(--text-muted)">${new Date(r.created_at).toLocaleDateString()}</td>
      <td><strong>${r.seller_name}</strong></td>
      <td>
        <div style="font-size:.78rem;color:var(--text-muted)">قبلی: ${formatMoney(r.old_amount)} · ${r.old_type} · ${r.old_payment_date}</div>
        <div style="font-weight:700;color:var(--primary)">جدید: ${formatMoney(r.new_amount)} · ${r.new_type} · ${r.new_payment_date}</div>
        ${r.new_notes ? `<div style="font-size:.75rem">${r.new_notes}</div>` : ''}
      </td>
      <td style="font-size:.78rem">${r.admin_notes||'—'}</td>
      <td>${statusBadge(r.status)}</td>
      <td>
        ${r.status==='pending' ? `
          <button onclick="reviewRequest(${r.id},'approve')" class="btn btn-success btn-sm">✅ ${t(lang,'approve')}</button>
          <button onclick="reviewRequest(${r.id},'reject')" class="btn btn-danger btn-sm">❌ ${t(lang,'reject')}</button>
        ` : '—'}
      </td>
    </tr>`).join('');

  return c.html(pageShell({
    title: t(lang,'edit_requests'), lang, user, activePage: 'payments',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">${t(lang,'edit_requests')}</div>
        <div class="page-subtitle">درخواست‌های ویرایش پرداختی از فروشندگان</div>
      </div>
      <a href="/payments" class="btn btn-outline">← ${t(lang,'payments')}</a>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>${t(lang,'date')}</th>
            <th>${t(lang,'seller')}</th>
            <th>تغییرات پیشنهادی</th>
            <th>دلیل درخواست</th>
            <th>${t(lang,'request_status')}</th>
            <th>${t(lang,'actions')}</th>
          </tr></thead>
          <tbody>${rows||`<tr><td colspan="6"><div class="empty-state"><div class="empty-state-icon">📋</div><h3>${t(lang,'no_requests')}</h3></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>`,
    scripts: `<script>
    async function reviewRequest(id, action) {
      const notes = action==='reject' ? prompt('دلیل رد کردن (اختیاری):') : null;
      const res = await fetch('/payments/edit-requests/' + id + '/' + action, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ admin_notes: notes||'' })
      });
      if (res.ok) location.reload();
      else alert('خطا در پردازش درخواست');
    }
    </script>`
  }));
});

// ── Review Request (POST) — owner approves/rejects ───────────────────────────
payments.post('/edit-requests/:id/:action', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);

  const id     = parseInt(c.req.param('id'));
  const action = c.req.param('action'); // 'approve' | 'reject'
  if (!['approve','reject'].includes(action)) return c.json({error:'Invalid action'},400);

  const req = await c.env.DB.prepare(
    `SELECT * FROM payment_edit_requests WHERE id=? AND company_id=? AND status='pending'`
  ).bind(id, user.company_id).first<any>();
  if (!req) return c.json({error:'Not found or already reviewed'},404);

  let adminNotes = '';
  try {
    const body: any = await c.req.json();
    adminNotes = body?.admin_notes ?? '';
  } catch { /* no body */ }

  if (action === 'approve') {
    // Apply the changes to the actual payment
    await c.env.DB.prepare(`
      UPDATE payments SET amount=?, type=?, payment_date=?, notes=? WHERE id=? AND company_id=?`
    ).bind(req.new_amount, req.new_type, req.new_payment_date, req.new_notes, req.payment_id, user.company_id).run();

    // Update ledger
    await c.env.DB.prepare(`DELETE FROM financial_ledger WHERE company_id=? AND ref_type='payment' AND ref_id=?`
    ).bind(user.company_id, req.payment_id).run();

    await createLedgerEntry(c.env.DB, {
      company_id:       user.company_id,
      seller_id:        req.seller_id,
      transaction_type: 'payment',
      ref_type:         'payment',
      ref_id:           req.payment_id,
      gb_amount:        0,
      money_amount:     -(Math.round(req.new_amount * 100) / 100),
      notes:            `Payment edited (approved) · ${formatMoney(req.new_amount)} on ${req.new_payment_date}`,
      created_by:       user.id,
    });

    // Notify seller
    await createNotification(c.env.DB, {
      company_id: user.company_id,
      user_id: req.seller_id,
      type: 'success',
      category: 'payment',
      title: '✅ Edit Request Approved',
      message: `Your payment edit request was approved. New amount: ${formatMoney(req.new_amount)}`,
      link: '/payments',
    });
  } else {
    // Notify seller of rejection
    await createNotification(c.env.DB, {
      company_id: user.company_id,
      user_id: req.seller_id,
      type: 'error',
      category: 'payment',
      title: '❌ Edit Request Rejected',
      message: `Your payment edit request was rejected. ${adminNotes ? 'Reason: ' + adminNotes : ''}`,
      link: '/payments',
    });
  }

  // Mark request as reviewed
  await c.env.DB.prepare(`
    UPDATE payment_edit_requests
    SET status=?, admin_notes=?, reviewed_by=?, reviewed_at=CURRENT_TIMESTAMP
    WHERE id=?`
  ).bind(action==='approve'?'approved':'rejected', adminNotes||null, user.id, id).run();

  return c.json({ success: true });
});

payments.delete('/api/payments/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');

  await c.env.DB.prepare(`
    DELETE FROM financial_ledger
    WHERE company_id=? AND ref_type='payment' AND ref_id=?
  `).bind(user.company_id, id).run();

  await c.env.DB.prepare('DELETE FROM payments WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

export default payments;
