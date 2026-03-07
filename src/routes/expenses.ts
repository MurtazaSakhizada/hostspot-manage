// ============================================
// Expenses Routes (مصارف / لګښتونه)
// GET  /expenses         - list + add form
// POST /expenses         - create expense
// POST /expenses/:id     - edit expense
// DELETE /api/expenses/:id - delete
//
// LOGIC:
// • Owner sees company expenses (seller_id IS NULL)
// • Seller sees only their own personal expenses (seller_id = user.id)
// • Seller expenses do NOT affect debt/balance calculation
//   They are purely for personal tracking by the seller.
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatMoney } from '../lib/calc';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const expenses = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Category definitions (key → icon prefix only, label from i18n)
const CAT_KEYS = ['rent','salary','utilities','maintenance','transport','general','other'];
const CAT_ICONS: Record<string,string> = {
  rent: '🏠', salary: '👤', utilities: '💡',
  maintenance: '🔧', transport: '🚗', general: '📋', other: '➕'
};
const CAT_COLORS: Record<string,string> = {
  rent: '#6366f1', salary: '#0891b2', utilities: '#f59e0b',
  maintenance: '#8b5cf6', transport: '#10b981', general: '#64748b', other: '#94a3b8'
};
const CAT_I18N_KEY: Record<string,any> = {
  rent: 'cat_rent', salary: 'cat_salary', utilities: 'cat_utilities',
  maintenance: 'cat_maintenance', transport: 'cat_transport',
  general: 'cat_general', other: 'cat_other'
};

function catColor(k: string): string { return CAT_COLORS[k] ?? '#64748b'; }

// ── GET /expenses ─────────────────────────────────────────────
expenses.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const isOwner = user.role === 'owner';

  const from = c.req.query('from') ?? '';
  const to   = c.req.query('to')   ?? '';
  const cat  = c.req.query('cat')  ?? 'all';

  // Owner: company expenses (seller_id IS NULL)
  // Seller: their own personal expenses (seller_id = user.id)
  let where = 'WHERE e.company_id=?';
  const binds: any[] = [user.company_id];

  if (isOwner) {
    where += ` AND (e.seller_id IS NULL OR e.seller_id = 0)`;
  } else {
    where += ` AND e.seller_id = ${user.id}`;
  }

  if (from) { where += ` AND e.expense_date >= ?`; binds.push(from); }
  if (to)   { where += ` AND e.expense_date <= ?`; binds.push(to); }
  if (cat !== 'all') { where += ` AND e.category = ?`; binds.push(cat); }

  const stmt = c.env.DB.prepare(`
    SELECT e.*, u.full_name as creator_name
    FROM expenses e LEFT JOIN users u ON u.id = e.created_by
    ${where} ORDER BY e.expense_date DESC, e.created_at DESC`);
  const items = await stmt.bind(...binds).all<any>();

  // Totals by category (all time, role-scoped)
  const totalsWhere = isOwner
    ? `WHERE company_id=? AND (seller_id IS NULL OR seller_id = 0)`
    : `WHERE company_id=? AND seller_id = ${user.id}`;
  const totals = await c.env.DB.prepare(
    `SELECT category, COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
     FROM expenses ${totalsWhere} GROUP BY category ORDER BY total DESC`)
    .bind(user.company_id).all<any>();
  const grandTotal = (totals.results||[]).reduce((s:number,r:any)=>s+r.total, 0);

  // Period total (within filter)
  const periodWhere = where.replace(/e\./g, '');
  const periodTotalRow = await (binds.length > 1
    ? c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM expenses ${periodWhere}`)
        .bind(...binds)
    : c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE company_id=? AND ${isOwner ? '(seller_id IS NULL OR seller_id = 0)' : `seller_id = ${user.id}`}`)
        .bind(user.company_id)
  ).first<{t:number}>();
  const periodTotal = periodTotalRow?.t ?? 0;

  // Category filter buttons
  const catFilterBtns = [
    {key:'all', label: t(lang,'all')},
    ...CAT_KEYS.map(k => ({ key: k, label: `${CAT_ICONS[k]} ${t(lang, CAT_I18N_KEY[k] as any)}` }))
  ].map(c2=>`
    <a href="/expenses?from=${from}&to=${to}&cat=${c2.key}"
       class="btn btn-sm ${cat===c2.key?'btn-primary':'btn-outline'}"
       style="white-space:nowrap">${c2.label}</a>
  `).join('');

  // Category select options
  const catOptsNew = CAT_KEYS.map(k =>
    `<option value="${k}">${CAT_ICONS[k]} ${t(lang, CAT_I18N_KEY[k] as any)}</option>`
  ).join('');
  const catOpts = CAT_KEYS.map(k =>
    `<option value="${k}" ${cat===k?'selected':''}>${CAT_ICONS[k]} ${t(lang, CAT_I18N_KEY[k] as any)}</option>`
  ).join('');

  const totalRows = (totals.results||[]).map((r:any) => `
    <div style="display:flex;justify-content:space-between;align-items:center;
         padding:.5rem .75rem;border-radius:6px;margin-bottom:.3rem;
         background:${catColor(r.category)}18">
      <span style="font-size:.875rem">${CAT_ICONS[r.category]??''} ${t(lang, CAT_I18N_KEY[r.category] as any ?? 'cat_other')}</span>
      <span style="font-weight:700;color:${catColor(r.category)}">${formatMoney(r.total)}</span>
    </div>`).join('');

  function fdate(d: string) {
    return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
  }

  const rows = (items.results||[]).map((e: any) => `
    <tr>
      <td>
        <div class="font-bold">${fdate(e.expense_date)}</div>
        <div style="font-size:.72rem;color:var(--text-muted)">${new Date(e.created_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
      </td>
      <td>
        <span class="badge" style="background:${catColor(e.category)}22;color:${catColor(e.category)};border:1px solid ${catColor(e.category)}44">
          ${CAT_ICONS[e.category]??''} ${t(lang, CAT_I18N_KEY[e.category] as any ?? 'cat_other')}
        </span>
      </td>
      <td><strong>${e.title}</strong></td>
      <td class="text-danger font-bold" style="color:var(--danger)">−${formatMoney(e.amount)}</td>
      <td style="color:var(--text-muted);font-size:.82rem">${e.notes||'—'}</td>
      ${isOwner ? `<td>${e.creator_name??'—'}</td>` : ''}
      <td>
        <button onclick="openEditExpense(${e.id},'${e.category}','${e.title.replace(/'/g,"\\'")}',${e.amount},'${e.expense_date}','${(e.notes||'').replace(/'/g,"\\'")}',event)"
          class="btn btn-outline btn-sm">✏️</button>
        <button onclick="confirmDelete('/api/expenses/${e.id}','${t(lang,'delete_expense_confirm')}')"
          class="btn btn-danger btn-sm">🗑</button>
      </td>
    </tr>`).join('');

  const colSpan = isOwner ? '7' : '6';
  const emptyState = `
    <tr><td colspan="${colSpan}">
      <div class="empty-state">
        <div class="empty-state-icon">💸</div>
        <h3>${t(lang,'no_expenses_yet')}</h3>
        <p>${t(lang,'add_expense')}</p>
      </div>
    </td></tr>`;

  // Seller notice banner: expenses are personal, not affecting debt
  const sellerNoticeBanner = !isOwner ? `
    <div style="background:linear-gradient(135deg,#fef3c7,#fffbeb);border:1px solid #fcd34d;
         border-radius:10px;padding:.75rem 1rem;margin-bottom:1rem;display:flex;gap:.75rem;align-items:flex-start">
      <span style="font-size:1.2rem">ℹ️</span>
      <div>
        <div style="font-weight:700;color:#92400e;font-size:.88rem">${t(lang,'personal_expenses_title')}</div>
        <div style="color:#78350f;font-size:.78rem;margin-top:.2rem">${t(lang,'personal_expense_notice')}</div>
      </div>
    </div>` : '';

  const pageTitle = isOwner ? t(lang,'company_expenses_title') : t(lang,'personal_expenses_title');
  const subtitle = isOwner ? t(lang,'company_expenses') : t(lang,'personal_expenses');
  const periodInfo = from||to
    ? `${from||t(lang,'since_beginning')} → ${to||t(lang,'until_today')}`
    : t(lang,'all_period');

  return c.html(pageShell({
    title: isOwner ? t(lang,'company_expenses') : t(lang,'personal_expenses'),
    lang, user, activePage: 'expenses',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">${pageTitle}</div>
        <div class="page-subtitle">${subtitle} · ${periodInfo}</div>
      </div>
      <button onclick="document.getElementById('add-exp-modal').classList.add('open')" class="btn btn-primary">+ ${t(lang,'add_expense')}</button>
    </div>

    ${sellerNoticeBanner}

    <!-- Summary row -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:1.25rem">
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--danger)"></div>
        <div class="stat-label">${t(lang,'total_expenses_lbl')}</div>
        <div class="stat-value" style="color:var(--danger)">${formatMoney(grandTotal)}</div>
        <div class="stat-sub">${t(lang,'all_period')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--warning)"></div>
        <div class="stat-label">${t(lang,'period_expenses')}</div>
        <div class="stat-value warning">${formatMoney(periodTotal)}</div>
        <div class="stat-sub">${from||to ? t(lang,'filtered_period') : t(lang,'all_period')}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--primary)"></div>
        <div class="stat-label">${t(lang,'categories_count')}</div>
        <div class="stat-value primary">${(totals.results||[]).length}</div>
        <div class="stat-sub">${t(lang,'expense_type')}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 240px;gap:1rem;align-items:start">
      <!-- Main table -->
      <div>
        <!-- Filters -->
        <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem;align-items:flex-end">
          <form method="GET" action="/expenses" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-end">
            <div class="form-group" style="margin:0;min-width:130px">
              <label style="font-size:.78rem">${t(lang,'from_date')}</label>
              <input type="date" name="from" value="${from}"/>
            </div>
            <div class="form-group" style="margin:0;min-width:130px">
              <label style="font-size:.78rem">${t(lang,'to_date')}</label>
              <input type="date" name="to" value="${to}"/>
            </div>
            <input type="hidden" name="cat" value="${cat}"/>
            <button type="submit" class="btn btn-outline btn-sm">${t(lang,'filter')}</button>
            <a href="/expenses" class="btn btn-ghost btn-sm">${t(lang,'clear_filter')}</a>
          </form>
        </div>
        <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.875rem">${catFilterBtns}</div>

        <div class="card" style="padding:0">
          <div class="table-wrapper">
            <table>
              <thead><tr>
                <th>${t(lang,'date')}</th>
                <th>${t(lang,'expense_category')}</th>
                <th>${t(lang,'expense_title')}</th>
                <th>${t(lang,'amount')}</th>
                <th>${t(lang,'notes')}</th>
                ${isOwner ? `<th>${t(lang,'expense_recorder')}</th>` : ''}
                <th>${t(lang,'actions')}</th>
              </tr></thead>
              <tbody>${rows || emptyState}</tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Category breakdown sidebar -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">${t(lang,'expense_categories_summary')}</div>
        </div>
        <div style="padding:.75rem">
          ${totalRows || `<div style="color:var(--text-muted);text-align:center;padding:1rem;font-size:.85rem">${t(lang,'no_expenses_yet')}</div>`}
          ${grandTotal > 0 ? `<div style="border-top:1px solid var(--border);margin-top:.5rem;padding-top:.5rem;display:flex;justify-content:space-between;font-weight:700">
            <span>${t(lang,'total')}</span><span style="color:var(--danger)">${formatMoney(grandTotal)}</span>
          </div>` : ''}
        </div>
      </div>
    </div>

    <!-- Add Expense Modal -->
    <div class="modal-overlay" id="add-exp-modal">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">➕ ${isOwner ? t(lang,'company_expenses') : t(lang,'personal_expenses')}</div>
          <button onclick="document.getElementById('add-exp-modal').classList.remove('open')" class="modal-close">✕</button>
        </div>
        <form method="POST" action="/expenses">
          <div class="form-row">
            <div class="form-group">
              <label>${t(lang,'expense_category')} *</label>
              <select name="category" required>${catOptsNew}</select>
            </div>
            <div class="form-group">
              <label>${t(lang,'date')} *</label>
              <input type="date" name="expense_date" required value="${new Date().toISOString().split('T')[0]}"/>
            </div>
          </div>
          <div class="form-group">
            <label>${t(lang,'description')} *</label>
            <input type="text" name="title" required placeholder="${t(lang,'description')}..."/>
          </div>
          <div class="form-group">
            <label>${t(lang,'amount_afn')} *</label>
            <input type="number" name="amount" min="1" step="0.01" required placeholder="0"/>
          </div>
          <div class="form-group">
            <label>${t(lang,'extra_notes')}</label>
            <textarea name="notes" rows="2" placeholder="${t(lang,'notes')}..."></textarea>
          </div>
          <div class="modal-footer" style="border:none;padding:0;margin-top:1rem">
            <button type="button" onclick="document.getElementById('add-exp-modal').classList.remove('open')" class="btn btn-outline">${t(lang,'cancel')}</button>
            <button type="submit" class="btn btn-primary">${t(lang,'save_expense')}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit Expense Modal -->
    <div class="modal-overlay" id="edit-exp-modal">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">✏️ ${t(lang,'edit_expense')}</div>
          <button onclick="document.getElementById('edit-exp-modal').classList.remove('open')" class="modal-close">✕</button>
        </div>
        <form method="POST" id="edit-exp-form" action="/expenses/0">
          <div class="form-row">
            <div class="form-group">
              <label>${t(lang,'expense_category')} *</label>
              <select name="category" id="edit-exp-cat" required>${catOpts}</select>
            </div>
            <div class="form-group">
              <label>${t(lang,'date')} *</label>
              <input type="date" name="expense_date" id="edit-exp-date" required/>
            </div>
          </div>
          <div class="form-group">
            <label>${t(lang,'expense_title')} *</label>
            <input type="text" name="title" id="edit-exp-title" required/>
          </div>
          <div class="form-group">
            <label>${t(lang,'amount_afn')} *</label>
            <input type="number" name="amount" id="edit-exp-amount" min="1" step="0.01" required/>
          </div>
          <div class="form-group">
            <label>${t(lang,'notes')}</label>
            <textarea name="notes" id="edit-exp-notes" rows="2"></textarea>
          </div>
          <div class="modal-footer" style="border:none;padding:0;margin-top:1rem">
            <button type="button" onclick="document.getElementById('edit-exp-modal').classList.remove('open')" class="btn btn-outline">${t(lang,'cancel')}</button>
            <button type="submit" class="btn btn-primary">${t(lang,'save_changes')}</button>
          </div>
        </form>
      </div>
    </div>`,
    scripts: `<script>
    function openEditExpense(id, cat, title, amount, date, notes, e) {
      e && e.stopPropagation();
      document.getElementById('edit-exp-form').action = '/expenses/' + id;
      document.getElementById('edit-exp-cat').value = cat;
      document.getElementById('edit-exp-title').value = title;
      document.getElementById('edit-exp-amount').value = amount;
      document.getElementById('edit-exp-date').value = date;
      document.getElementById('edit-exp-notes').value = notes;
      document.getElementById('edit-exp-modal').classList.add('open');
    }
    </script>`
  }));
});

// ── POST /expenses ────────────────────────────────────────────
expenses.post('/', async (c) => {
  const user = c.get('user');
  const isOwner = user.role === 'owner';
  const form = await c.req.formData();
  const category     = form.get('category')?.toString() ?? 'general';
  const title        = form.get('title')?.toString().trim() ?? '';
  const amount       = parseFloat(form.get('amount')?.toString() ?? '0');
  const expense_date = form.get('expense_date')?.toString() ?? new Date().toISOString().split('T')[0];
  const notes        = form.get('notes')?.toString() ?? '';

  if (!title || amount <= 0) {
    return new Response(null, { status: 302, headers: { 'Location': '/expenses' } });
  }

  // Owner: seller_id = NULL (company expense)
  // Seller: seller_id = user.id (personal expense, does not affect debt)
  const sellerId = isOwner ? null : user.id;

  await c.env.DB.prepare(`
    INSERT INTO expenses (company_id, category, title, amount, expense_date, notes, created_by, seller_id)
    VALUES (?,?,?,?,?,?,?,?)`)
    .bind(user.company_id, category, title, amount, expense_date, notes||null, user.id, sellerId).run();
  return new Response(null, { status: 302, headers: { 'Location': '/expenses' } });
});

// ── POST /expenses/:id (edit) ─────────────────────────────────
expenses.post('/:id', async (c) => {
  const user = c.get('user');
  const isOwner = user.role === 'owner';
  const id = c.req.param('id');
  const form = await c.req.formData();
  const category     = form.get('category')?.toString() ?? 'general';
  const title        = form.get('title')?.toString().trim() ?? '';
  const amount       = parseFloat(form.get('amount')?.toString() ?? '0');
  const expense_date = form.get('expense_date')?.toString() ?? '';
  const notes        = form.get('notes')?.toString() ?? '';

  // Sellers can only edit their own personal expenses
  const editFilter = isOwner
    ? ` AND (seller_id IS NULL OR seller_id = 0)`
    : ` AND seller_id = ${user.id}`;
  await c.env.DB.prepare(`
    UPDATE expenses SET category=?,title=?,amount=?,expense_date=?,notes=?
    WHERE id=? AND company_id=? ${editFilter}`)
    .bind(category, title, amount, expense_date, notes||null, id, user.company_id).run();
  return new Response(null, { status: 302, headers: { 'Location': '/expenses' } });
});

// ── DELETE /api/expenses/:id ─────────────────────────────────
expenses.delete('/:id', async (c) => {
  const user = c.get('user');
  const isOwner = user.role === 'owner';
  const id = c.req.param('id');
  // Sellers can only delete their own personal expenses; owners delete company expenses
  const deleteFilter = isOwner
    ? ` AND (seller_id IS NULL OR seller_id = 0)`
    : ` AND seller_id = ${user.id}`;
  await c.env.DB.prepare(`DELETE FROM expenses WHERE id=? AND company_id=? ${deleteFilter}`)
    .bind(id, user.company_id).run();
  return c.json({ success: true });
});

export default expenses;
