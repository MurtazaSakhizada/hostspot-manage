// ============================================
// Expenses Routes (مصارف)
// GET  /expenses         - list + add form
// POST /expenses         - create expense
// POST /expenses/:id     - edit expense
// DELETE /api/expenses/:id - delete
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatMoney } from '../lib/calc';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const expenses = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const CATEGORIES = [
  { key: 'rent',        label: '🏠 Rent',        color: '#6366f1' },
  { key: 'salary',      label: '👤 Salary',       color: '#0891b2' },
  { key: 'utilities',   label: '💡 Utilities',    color: '#f59e0b' },
  { key: 'maintenance', label: '🔧 Maintenance',  color: '#8b5cf6' },
  { key: 'transport',   label: '🚗 Transport',    color: '#10b981' },
  { key: 'general',     label: '📋 General',      color: '#64748b' },
  { key: 'other',       label: '➕ Other',         color: '#94a3b8' },
];

function catLabel(k: string) {
  return CATEGORIES.find(c => c.key === k)?.label ?? k;
}
function catColor(k: string) {
  return CATEGORIES.find(c => c.key === k)?.color ?? '#64748b';
}

// ── GET /expenses ─────────────────────────────────────────────
expenses.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const isOwner = user.role === 'owner';

  const from = c.req.query('from') ?? '';
  const to   = c.req.query('to')   ?? '';
  const cat  = c.req.query('cat')  ?? 'all';

  let where = 'WHERE e.company_id=?';
  const binds: any[] = [user.company_id];
  // Seller sees only expenses they created
  if (!isOwner) { where += ` AND e.created_by = ${user.id}`; }
  if (from) { where += ` AND e.expense_date >= ?`; binds.push(from); }
  if (to)   { where += ` AND e.expense_date <= ?`; binds.push(to); }
  if (cat !== 'all') { where += ` AND e.category = ?`; binds.push(cat); }

  const stmt = c.env.DB.prepare(`
    SELECT e.*, u.full_name as creator_name
    FROM expenses e LEFT JOIN users u ON u.id = e.created_by
    ${where} ORDER BY e.expense_date DESC, e.created_at DESC`);
  const items = await stmt.bind(...binds).all<any>();

  // Totals by category (all time in filter)
  const totalsCreatorFilter = !isOwner ? ` AND created_by = ${user.id}` : '';
  const totals = await c.env.DB.prepare(
    `SELECT category, COALESCE(SUM(amount),0) as total, COUNT(*) as cnt
     FROM expenses WHERE company_id=? ${totalsCreatorFilter} GROUP BY category ORDER BY total DESC`)
    .bind(user.company_id).all<any>();
  const grandTotal = (totals.results||[]).reduce((s:number,r:any)=>s+r.total, 0);

  // Period total (within filter) - use e alias consistent with main query
  const periodWhere = where.replace(/e\./g, '');
  const periodTotalRow = await (binds.length > 1
    ? c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM expenses ${periodWhere}`)
        .bind(...binds)
    : c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM expenses WHERE company_id=?`)
        .bind(user.company_id)
  ).first<{t:number}>();
  const periodTotal = periodTotalRow?.t ?? 0;

  const catOpts = CATEGORIES.map(c2 =>
    `<option value="${c2.key}" ${cat===c2.key?'selected':''}>${c2.label}</option>`
  ).join('');
  const catFilterBtns = [
    {key:'all',label:'All'},
    ...CATEGORIES.map(c2=>({key:c2.key,label:c2.label}))
  ].map(c2=>`
    <a href="/expenses?from=${from}&to=${to}&cat=${c2.key}"
       class="btn btn-sm ${cat===c2.key?'btn-primary':'btn-outline'}"
       style="white-space:nowrap">${c2.label}</a>
  `).join('');

  const totalRows = (totals.results||[]).map((r:any) => `
    <div style="display:flex;justify-content:space-between;align-items:center;
         padding:.5rem .75rem;border-radius:6px;margin-bottom:.3rem;
         background:${catColor(r.category)}18">
      <span style="font-size:.875rem">${catLabel(r.category)}</span>
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
          ${catLabel(e.category)}
        </span>
      </td>
      <td><strong>${e.title}</strong></td>
      <td class="text-danger font-bold" style="color:var(--danger)">−${formatMoney(e.amount)}</td>
      <td style="color:var(--text-muted);font-size:.82rem">${e.notes||'—'}</td>
      <td>${e.creator_name??'—'}</td>
      <td>
        <button onclick="openEditExpense(${e.id},'${e.category}','${e.title.replace(/'/g,"\\'")}',${e.amount},'${e.expense_date}','${(e.notes||'').replace(/'/g,"\\'")}',event)"
          class="btn btn-outline btn-sm">✏️</button>
        <button onclick="confirmDelete('/api/expenses/${e.id}','Delete this expense?')"
          class="btn btn-danger btn-sm">🗑</button>
      </td>
    </tr>`).join('');

  const emptyState = `
    <tr><td colspan="7">
      <div class="empty-state">
        <div class="empty-state-icon">💸</div>
        <h3>No expenses yet</h3>
        <p>Track your business expenses to calculate real net profit.</p>
      </div>
    </td></tr>`;

  const catOptsNew = CATEGORIES.map(c2 =>
    `<option value="${c2.key}">${c2.label}</option>`
  ).join('');

  return c.html(pageShell({
    title: 'Expenses', lang, user, activePage: 'expenses',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">💸 Expenses (مصارف)</div>
        <div class="page-subtitle">Track business costs · ${from||to ? `${from||'Start'} → ${to||'Today'}` : 'All Time'}</div>
      </div>
      <button onclick="document.getElementById('add-exp-modal').classList.add('open')" class="btn btn-primary">+ Add Expense</button>
    </div>

    <!-- Summary row -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:1.25rem">
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--danger)"></div>
        <div class="stat-label">Total Expenses</div>
        <div class="stat-value" style="color:var(--danger)">${formatMoney(grandTotal)}</div>
        <div class="stat-sub">All time</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--warning)"></div>
        <div class="stat-label">Period Expenses</div>
        <div class="stat-value warning">${formatMoney(periodTotal)}</div>
        <div class="stat-sub">${from||to?'Filtered period':'All time'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--primary)"></div>
        <div class="stat-label">Categories</div>
        <div class="stat-value primary">${(totals.results||[]).length}</div>
        <div class="stat-sub">Expense types</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 240px;gap:1rem;align-items:start">
      <!-- Main table -->
      <div>
        <!-- Filters -->
        <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-bottom:1rem;align-items:flex-end">
          <form method="GET" action="/expenses" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:flex-end">
            <div class="form-group" style="margin:0;min-width:130px">
              <label style="font-size:.78rem">From</label>
              <input type="date" name="from" value="${from}"/>
            </div>
            <div class="form-group" style="margin:0;min-width:130px">
              <label style="font-size:.78rem">To</label>
              <input type="date" name="to" value="${to}"/>
            </div>
            <input type="hidden" name="cat" value="${cat}"/>
            <button type="submit" class="btn btn-outline btn-sm">Filter</button>
            <a href="/expenses" class="btn btn-ghost btn-sm">Clear</a>
          </form>
        </div>
        <div style="display:flex;gap:.35rem;flex-wrap:wrap;margin-bottom:.875rem">${catFilterBtns}</div>

        <div class="card" style="padding:0">
          <div class="table-wrapper">
            <table>
              <thead><tr>
                <th>Date</th>
                <th>Category</th>
                <th>Title</th>
                <th>Amount</th>
                <th>Notes</th>
                <th>By</th>
                <th>Actions</th>
              </tr></thead>
              <tbody>${rows || emptyState}</tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Category breakdown sidebar -->
      <div class="card">
        <div class="card-header">
          <div class="card-title">📊 By Category</div>
        </div>
        <div style="padding:.75rem">
          ${totalRows || '<div style="color:var(--text-muted);text-align:center;padding:1rem;font-size:.85rem">No expenses</div>'}
          ${grandTotal > 0 ? `<div style="border-top:1px solid var(--border);margin-top:.5rem;padding-top:.5rem;display:flex;justify-content:space-between;font-weight:700">
            <span>Total</span><span style="color:var(--danger)">${formatMoney(grandTotal)}</span>
          </div>` : ''}
        </div>
      </div>
    </div>

    <!-- Add Expense Modal -->
    <div class="modal-overlay" id="add-exp-modal">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">➕ Add Expense</div>
          <button onclick="document.getElementById('add-exp-modal').classList.remove('open')" class="modal-close">✕</button>
        </div>
        <form method="POST" action="/expenses">
          <div class="form-row">
            <div class="form-group">
              <label>Category *</label>
              <select name="category" required>${catOptsNew}</select>
            </div>
            <div class="form-group">
              <label>Date *</label>
              <input type="date" name="expense_date" required value="${new Date().toISOString().split('T')[0]}"/>
            </div>
          </div>
          <div class="form-group">
            <label>Title / Description *</label>
            <input type="text" name="title" required placeholder="e.g. Office rent, Electricity bill..."/>
          </div>
          <div class="form-group">
            <label>Amount (افغانی) *</label>
            <input type="number" name="amount" min="1" step="0.01" required placeholder="0"/>
          </div>
          <div class="form-group">
            <label>Notes (optional)</label>
            <textarea name="notes" rows="2" placeholder="Additional details..."></textarea>
          </div>
          <div class="modal-footer" style="border:none;padding:0;margin-top:1rem">
            <button type="button" onclick="document.getElementById('add-exp-modal').classList.remove('open')" class="btn btn-outline">Cancel</button>
            <button type="submit" class="btn btn-primary">💾 Save</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit Expense Modal -->
    <div class="modal-overlay" id="edit-exp-modal">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">✏️ Edit Expense</div>
          <button onclick="document.getElementById('edit-exp-modal').classList.remove('open')" class="modal-close">✕</button>
        </div>
        <form method="POST" id="edit-exp-form" action="/expenses/0">
          <div class="form-row">
            <div class="form-group">
              <label>Category *</label>
              <select name="category" id="edit-exp-cat" required>${catOpts}</select>
            </div>
            <div class="form-group">
              <label>Date *</label>
              <input type="date" name="expense_date" id="edit-exp-date" required/>
            </div>
          </div>
          <div class="form-group">
            <label>Title *</label>
            <input type="text" name="title" id="edit-exp-title" required/>
          </div>
          <div class="form-group">
            <label>Amount (افغانی) *</label>
            <input type="number" name="amount" id="edit-exp-amount" min="1" step="0.01" required/>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea name="notes" id="edit-exp-notes" rows="2"></textarea>
          </div>
          <div class="modal-footer" style="border:none;padding:0;margin-top:1rem">
            <button type="button" onclick="document.getElementById('edit-exp-modal').classList.remove('open')" class="btn btn-outline">Cancel</button>
            <button type="submit" class="btn btn-primary">💾 Save Changes</button>
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
  const form = await c.req.formData();
  const category     = form.get('category')?.toString() ?? 'general';
  const title        = form.get('title')?.toString().trim() ?? '';
  const amount       = parseFloat(form.get('amount')?.toString() ?? '0');
  const expense_date = form.get('expense_date')?.toString() ?? new Date().toISOString().split('T')[0];
  const notes        = form.get('notes')?.toString() ?? '';

  if (!title || amount <= 0) {
    return new Response(null, { status: 302, headers: { 'Location': '/expenses' } });
  }
  await c.env.DB.prepare(`
    INSERT INTO expenses (company_id, category, title, amount, expense_date, notes, created_by)
    VALUES (?,?,?,?,?,?,?)`)
    .bind(user.company_id, category, title, amount, expense_date, notes||null, user.id).run();
  return new Response(null, { status: 302, headers: { 'Location': '/expenses' } });
});

// ── POST /expenses/:id (edit) ─────────────────────────────────
expenses.post('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const form = await c.req.formData();
  const category     = form.get('category')?.toString() ?? 'general';
  const title        = form.get('title')?.toString().trim() ?? '';
  const amount       = parseFloat(form.get('amount')?.toString() ?? '0');
  const expense_date = form.get('expense_date')?.toString() ?? '';
  const notes        = form.get('notes')?.toString() ?? '';

  // Sellers can only edit their own expenses
  const editFilter = user.role !== 'owner' ? ` AND created_by = ${user.id}` : '';
  await c.env.DB.prepare(`
    UPDATE expenses SET category=?,title=?,amount=?,expense_date=?,notes=?
    WHERE id=? AND company_id=? ${editFilter}`)
    .bind(category, title, amount, expense_date, notes||null, id, user.company_id).run();
  return new Response(null, { status: 302, headers: { 'Location': '/expenses' } });
});

// ── DELETE /api/expenses/:id ──────────────────────────────────
expenses.delete('/api/expenses/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  // Sellers can only delete their own expenses; owners can delete any
  const deleteFilter = user.role !== 'owner' ? ` AND created_by = ${user.id}` : '';
  await c.env.DB.prepare(`DELETE FROM expenses WHERE id=? AND company_id=? ${deleteFilter}`)
    .bind(id, user.company_id).run();
  return c.json({ success: true });
});

export default expenses;
