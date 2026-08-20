// ============================================================
// Search Routes — Global search across all company data
// GET /search?q=...    → JSON results (for live AJAX)
// GET /search?q=...&full=1  → Full HTML page
// ============================================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatGB, formatMoney } from '../lib/calc';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const search = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── helper: highlight matched text ──────────────────────────
function highlight(text: string, q: string): string {
  if (!q || !text) return text ?? '';
  const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text).replace(new RegExp(`(${escaped})`, 'gi'),
    `<mark style="background:rgba(251,191,36,.35);color:inherit;border-radius:2px;padding:0 2px">$1</mark>`
  );
}

function fdate(d: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ============================================================
// GET /search — Search page + AJAX endpoint
// ============================================================
search.get('/', async (c) => {
  const user  = c.get('user');
  const lang  = c.get('lang');
  const q     = (c.req.query('q') ?? '').trim();
  const isJson = c.req.query('format') === 'json';

  // Empty query → just render page shell with search form
  if (!q) {
    if (isJson) return c.json({ results: [], total: 0, q: '' });
    return c.html(pageShell({
      title: 'جستجو', lang, user, activePage: 'search',
      body: buildSearchPage('', null, lang, user),
      scripts: searchScript,
    }));
  }

  const like = `%${q}%`;
  const cid  = user.company_id;
  const isOwner = user.role === 'owner';
  const sellerCond = isOwner ? '' : `AND seller_id = ${user.id}`;

  // ── Run all searches in parallel ─────────────────────────
  const [sellers, sales, allocBatches, invBatches, payments, expenses] = await Promise.all([

    // 1. Sellers / Users
    isOwner
      ? c.env.DB.prepare(`
          SELECT id, full_name, email, role, commission_rate, active
          FROM users WHERE company_id=? AND (full_name LIKE ? OR email LIKE ?)
          ORDER BY full_name LIMIT 20`
        ).bind(cid, like, like).all<any>()
      : Promise.resolve({ results: [] }),

    // 2. Sales (by package name, branch name, notes, seller name)
    c.env.DB.prepare(`
      SELECT s.id, s.snapshot_time, s.total_gb, s.gross_amount, s.net_amount,
             p.name as pkg_name, b.name as branch_name, u.full_name as seller_name,
             s.quantity, s.notes
      FROM sales s
      JOIN packages p ON p.id = s.package_id
      JOIN branches b ON b.id = s.branch_id
      JOIN users    u ON u.id = s.seller_id
      WHERE s.company_id=? ${sellerCond}
        AND (p.name LIKE ? OR b.name LIKE ? OR u.full_name LIKE ? OR s.notes LIKE ?)
      ORDER BY s.snapshot_time DESC LIMIT 30`
    ).bind(cid, like, like, like, like).all<any>(),

    // 3. Allocation batches
    isOwner
      ? c.env.DB.prepare(`
          SELECT ab.id, ab.created_at, ab.total_gb, ab.total_gross, ab.total_net,
                 ab.commission_rate, ab.notes,
                 u.full_name as seller_name, br.name as branch_name
          FROM allocation_batches ab
          JOIN users    u  ON u.id  = ab.seller_id
          JOIN branches br ON br.id = ab.branch_id
          WHERE ab.company_id=?
            AND (u.full_name LIKE ? OR br.name LIKE ? OR ab.notes LIKE ?)
          ORDER BY ab.created_at DESC LIMIT 30`
        ).bind(cid, like, like, like).all<any>()
      : Promise.resolve({ results: [] }),

    // 4. Inventory batches
    isOwner
      ? c.env.DB.prepare(`
          SELECT b.id, b.created_at, b.total_gb, b.total_gross, b.notes,
                 br.name as branch_name
          FROM inventory_batches b
          JOIN branches br ON br.id = b.branch_id
          WHERE b.company_id=?
            AND (br.name LIKE ? OR b.notes LIKE ?)
          ORDER BY b.created_at DESC LIMIT 20`
        ).bind(cid, like, like).all<any>()
      : Promise.resolve({ results: [] }),

    // 5. Payments
    isOwner
      ? c.env.DB.prepare(`
          SELECT p.id, p.payment_date, p.amount, p.type, p.notes,
                 u.full_name as seller_name, br.name as branch_name
          FROM payments p
          JOIN users    u  ON u.id  = p.seller_id
          LEFT JOIN branches br ON br.id = p.branch_id
          WHERE p.company_id=?
            AND (u.full_name LIKE ? OR p.notes LIKE ? OR br.name LIKE ?)
          ORDER BY p.payment_date DESC LIMIT 30`
        ).bind(cid, like, like, like).all<any>()
      : Promise.resolve({ results: [] }),

    // 6. Expenses (name, description)
    c.env.DB.prepare(`
      SELECT e.id, e.expense_date, e.amount, e.name, e.description,
             u.full_name as seller_name
      FROM expenses e
      LEFT JOIN users u ON u.id = e.seller_id
      WHERE e.company_id=? ${sellerCond}
        AND (e.name LIKE ? OR e.description LIKE ?)
      ORDER BY e.expense_date DESC LIMIT 20`
    ).bind(cid, like, like).all<any>(),
  ]);

  const results = {
    sellers:     sellers.results    ?? [],
    sales:       sales.results      ?? [],
    allocations: allocBatches.results ?? [],
    inventory:   invBatches.results  ?? [],
    payments:    payments.results    ?? [],
    expenses:    expenses.results    ?? [],
  };

  const total = Object.values(results).reduce((s, a) => s + a.length, 0);

  if (isJson) return c.json({ results, total, q });

  return c.html(pageShell({
    title: `جستجو: ${q}`, lang, user, activePage: 'search',
    body: buildSearchPage(q, results, lang, user),
    scripts: searchScript,
  }));
});

// ── HTML builder ─────────────────────────────────────────────
function buildSearchPage(q: string, results: any, lang: Lang, user: SessionUser | null): string {
  const isOwner = user?.role === 'owner';

  const searchBar = `
  <div class="page-header" style="flex-wrap:wrap;gap:1rem">
    <div>
      <div class="page-title">🔍 جستجوی سراسری</div>
      <div class="page-subtitle">جستجو در فروش، تخصیص، انباری، پرداخت و...</div>
    </div>
  </div>

  <div class="card" style="padding:1rem;margin-bottom:1.25rem">
    <form method="GET" action="/search" style="display:flex;gap:.75rem;align-items:center;flex-wrap:wrap">
      <input type="text" name="q" value="${q.replace(/"/g, '&quot;')}" id="search-input"
        placeholder="نام فروشنده، پکیج، شعبه، یادداشت..."
        autocomplete="off" autofocus
        style="flex:1;min-width:220px;padding:.6rem 1rem;border:2px solid var(--primary);border-radius:10px;font-size:1rem;background:var(--bg-secondary);color:var(--text-primary);outline:none"/>
      <button type="submit" class="btn btn-primary" style="padding:.6rem 1.5rem">🔍 جستجو</button>
      ${q ? `<a href="/search" class="btn btn-outline">✕ پاک‌کردن</a>` : ''}
    </form>
  </div>`;

  if (!results) return searchBar + `
    <div class="card" style="padding:2.5rem;text-align:center;color:var(--text-muted)">
      <div style="font-size:3rem;margin-bottom:.75rem">🔍</div>
      <div style="font-size:1rem">عبارت جستجو را وارد کنید</div>
      <div style="font-size:.82rem;margin-top:.4rem">می‌توانید نام فروشنده، شعبه، پکیج یا یادداشت را جستجو کنید</div>
    </div>`;

  const total = Object.values(results).reduce((s: number, a: any) => s + a.length, 0);

  if (total === 0) return searchBar + `
    <div class="card" style="padding:2.5rem;text-align:center;color:var(--text-muted)">
      <div style="font-size:3rem;margin-bottom:.75rem">😕</div>
      <div style="font-size:1rem">نتیجه‌ای برای «${q}» یافت نشد</div>
      <div style="font-size:.82rem;margin-top:.4rem">کلمات کلیدی دیگری امتحان کنید</div>
    </div>`;

  // ── Sections ─────────────────────────────────────────────
  let sections = '';

  // ── 1. Sellers ──
  if (isOwner && results.sellers?.length) {
    const rows = results.sellers.map((s: any) => `
    <tr>
      <td>
        <a href="/people/${s.id}" style="font-weight:600;color:var(--primary)">${highlight(s.full_name, q)}</a>
        <div style="font-size:.72rem;color:var(--text-muted)">${highlight(s.email ?? '', q)}</div>
      </td>
      <td><span class="badge badge-${s.role}">${s.role}</span></td>
      <td>${s.commission_rate ? Math.round(s.commission_rate * 100) + '%' : '—'}</td>
      <td><span class="badge badge-${s.active ? 'success' : 'danger'}">${s.active ? 'فعال' : 'غیرفعال'}</span></td>
      <td>
        <a href="/people/${s.id}" class="btn btn-outline btn-sm">📊 پروفایل</a>
      </td>
    </tr>`).join('');

    sections += buildSection('👥 فروشندگان', results.sellers.length, `
    <table>
      <thead><tr><th>نام</th><th>نقش</th><th>کمیسیون</th><th>وضعیت</th><th>عملیات</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
  }

  // ── 2. Sales ──
  if (results.sales?.length) {
    const rows = results.sales.map((s: any) => `
    <tr>
      <td style="font-size:.8rem">${fdate(s.snapshot_time)}</td>
      <td><strong>${highlight(s.pkg_name, q)}</strong></td>
      <td>${highlight(s.branch_name, q)}</td>
      ${isOwner ? `<td style="font-size:.82rem">${highlight(s.seller_name, q)}</td>` : ''}
      <td class="text-primary font-bold">${formatGB(s.total_gb)}</td>
      ${isOwner ? `<td class="text-success font-bold">${formatMoney(s.net_amount)}</td>` : ''}
      <td style="font-size:.78rem;color:var(--text-muted);max-width:150px">${highlight(s.notes ?? '', q) || '—'}</td>
    </tr>`).join('');

    sections += buildSection('💰 فروش', results.sales.length, `
    <table>
      <thead><tr>
        <th>تاریخ</th><th>پکیج</th><th>شعبه</th>
        ${isOwner ? '<th>فروشنده</th>' : ''}
        <th>GB</th>
        ${isOwner ? '<th>خالص</th>' : ''}
        <th>یادداشت</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
  }

  // ── 3. Allocations ──
  if (isOwner && results.allocations?.length) {
    const rows = results.allocations.map((a: any) => `
    <tr>
      <td style="font-size:.8rem">${fdate(a.created_at)}</td>
      <td><a href="/people/${a.seller_id ?? ''}" style="font-weight:600;color:var(--primary)">${highlight(a.seller_name, q)}</a></td>
      <td>${highlight(a.branch_name, q)}</td>
      <td class="text-primary font-bold">${formatGB(a.total_gb)}</td>
      <td class="text-warning">${Math.round((a.commission_rate ?? 0) * 100)}%</td>
      <td class="text-success font-bold">${formatMoney(a.total_net)}</td>
      <td style="font-size:.78rem;color:var(--text-muted);max-width:150px">${highlight(a.notes ?? '', q) || '—'}</td>
    </tr>`).join('');

    sections += buildSection('🔀 تخصیص‌ها', results.allocations.length, `
    <table>
      <thead><tr><th>تاریخ</th><th>فروشنده</th><th>شعبه</th><th>GB</th><th>کمیسیون</th><th>خالص</th><th>یادداشت</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
  }

  // ── 4. Inventory ──
  if (isOwner && results.inventory?.length) {
    const rows = results.inventory.map((b: any) => `
    <tr>
      <td style="font-size:.8rem">${fdate(b.created_at)}</td>
      <td>${highlight(b.branch_name, q)}</td>
      <td class="text-primary font-bold">${formatGB(b.total_gb)}</td>
      <td class="text-success">${formatMoney(b.total_gross)}</td>
      <td style="font-size:.78rem;color:var(--text-muted);max-width:150px">${highlight(b.notes ?? '', q) || '—'}</td>
      <td>
        <a href="/inventory/${b.id}/edit" class="btn btn-outline btn-sm">✏️ ویرایش</a>
      </td>
    </tr>`).join('');

    sections += buildSection('📦 انباری', results.inventory.length, `
    <table>
      <thead><tr><th>تاریخ</th><th>شعبه</th><th>GB</th><th>ارزش</th><th>یادداشت</th><th>عملیات</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
  }

  // ── 5. Payments ──
  if (isOwner && results.payments?.length) {
    const rows = results.payments.map((p: any) => `
    <tr>
      <td style="font-size:.8rem">${fdate(p.payment_date)}</td>
      <td><a href="/people/${p.seller_id ?? ''}" style="font-weight:600;color:var(--primary)">${highlight(p.seller_name, q)}</a></td>
      <td>${highlight(p.branch_name ?? '—', q)}</td>
      <td class="text-success font-bold">${formatMoney(p.amount)}</td>
      <td><span class="badge badge-${p.type === 'cash' ? 'success' : 'info'}">${p.type}</span></td>
      <td style="font-size:.78rem;color:var(--text-muted);max-width:150px">${highlight(p.notes ?? '', q) || '—'}</td>
    </tr>`).join('');

    sections += buildSection('💳 پرداختی‌ها', results.payments.length, `
    <table>
      <thead><tr><th>تاریخ</th><th>فروشنده</th><th>شعبه</th><th>مبلغ</th><th>نوع</th><th>یادداشت</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
  }

  // ── 6. Expenses ──
  if (results.expenses?.length) {
    const rows = results.expenses.map((e: any) => `
    <tr>
      <td style="font-size:.8rem">${fdate(e.expense_date)}</td>
      <td><strong>${highlight(e.name, q)}</strong></td>
      ${isOwner ? `<td style="font-size:.82rem">${highlight(e.seller_name ?? 'شرکت', q)}</td>` : ''}
      <td class="text-danger font-bold">${formatMoney(e.amount)}</td>
      <td style="font-size:.78rem;color:var(--text-muted);max-width:180px">${highlight(e.description ?? '', q) || '—'}</td>
    </tr>`).join('');

    sections += buildSection('💸 هزینه‌ها', results.expenses.length, `
    <table>
      <thead><tr>
        <th>تاریخ</th><th>نام</th>${isOwner ? '<th>مرتبط با</th>' : ''}<th>مبلغ</th><th>توضیحات</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
  }

  return searchBar + `
  <div style="margin-bottom:1rem;font-size:.85rem;color:var(--text-muted)">
    <strong style="color:var(--text-primary)">${total}</strong> نتیجه برای «<strong style="color:var(--primary)">${q}</strong>» یافت شد
  </div>
  ${sections}`;
}

function buildSection(title: string, count: number, tableHtml: string): string {
  return `
  <div class="card" style="margin-bottom:1rem">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:.75rem 1rem;border-bottom:1px solid var(--border)">
      <div style="font-weight:600;font-size:.95rem">${title}</div>
      <span class="badge badge-primary">${count}</span>
    </div>
    <div class="table-wrapper" style="overflow-x:auto">${tableHtml}</div>
  </div>`;
}

// ── Client-side live search script ───────────────────────────
const searchScript = `<script>
(function() {
  const inp = document.getElementById('search-input');
  if (!inp) return;
  let timer;
  inp.addEventListener('input', function() {
    clearTimeout(timer);
    const q = this.value.trim();
    if (q.length < 2) return;
    timer = setTimeout(() => {
      // Navigate to search page with query (form submit)
      // No-op: form submit on Enter or button click handles it
    }, 600);
  });
  // Focus and select all on load
  inp.focus();
  inp.select();
})();
</script>`;

export default search;
