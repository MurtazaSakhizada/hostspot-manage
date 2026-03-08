// ============================================================
// Ledger Routes
// /ledger              - company-wide ledger overview (owner)
// /ledger/seller/:id   - per-seller ledger + drill-down
// /ledger/correction   - POST: add manual correction entry
// ============================================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatGB, formatMoney } from '../lib/calc';
import {
  getCompanyLedgerSummary,
  getAllSellerBalances,
  getSellerLedger,
  getSellerBalance,
  createLedgerEntry
} from '../lib/ledger';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const ledger = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── helpers ─────────────────────────────────────────────────
function txBadge(type: string): string {
  if (type === 'allocation') return `<span style="background:rgba(99,102,241,.15);color:#818cf8;padding:2px 8px;border-radius:6px;font-size:.72rem;font-weight:600">📦 تخصیص</span>`;
  if (type === 'payment')    return `<span style="background:rgba(34,197,94,.15);color:#22c55e;padding:2px 8px;border-radius:6px;font-size:.72rem;font-weight:600">💳 پرداخت</span>`;
  return `<span style="background:rgba(251,191,36,.15);color:#f59e0b;padding:2px 8px;border-radius:6px;font-size:.72rem;font-weight:600">⚙️ تصحیح</span>`;
}

function fdate(d: string): string {
  return d ? new Date(d).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '—';
}

// ============================================================
// GET /ledger — Company-wide ledger overview (owner only)
// ============================================================
ledger.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/dashboard');

  const [summary, sellerBalances] = await Promise.all([
    getCompanyLedgerSummary(c.env.DB, user.company_id),
    getAllSellerBalances(c.env.DB, user.company_id),
  ]);

  const remain = summary.total_price - summary.total_paid;

  const sellerRows = sellerBalances.map((s: any) => {
    const pct = s.total_allocated > 0
      ? Math.min(100, Math.round((s.total_paid / s.total_allocated) * 100))
      : 0;
    const balColor = s.balance > 0 ? 'var(--danger)' : s.balance < 0 ? 'var(--success)' : 'var(--text-muted)';
    return `
    <tr>
      <td><a href="/ledger/seller/${s.seller_id}" style="font-weight:600;color:var(--primary)">${s.seller_name}</a></td>
      <td class="text-primary font-bold">${formatGB(s.total_gb)}</td>
      <td>${formatMoney(s.total_allocated)}</td>
      <td class="text-success font-bold">${formatMoney(s.total_paid)}</td>
      <td style="color:${balColor};font-weight:600">
        ${s.balance > 0 ? '−' : s.balance < 0 ? '+' : ''}${formatMoney(Math.abs(s.balance))}
        <div style="font-size:.68rem;color:var(--text-muted)">${s.balance > 0 ? 'بدهی' : s.balance < 0 ? 'اضافه‌پرداخت' : 'تسویه'}</div>
      </td>
      <td>
        <div style="background:var(--bg-secondary);border-radius:99px;height:8px;width:80px;overflow:hidden;display:inline-block">
          <div style="background:${pct>=100?'var(--success)':'var(--primary)'};height:100%;width:${pct}%;border-radius:99px"></div>
        </div>
        <span style="font-size:.72rem;color:var(--text-muted);margin-right:.4rem">${pct}%</span>
      </td>
      <td>
        <a href="/ledger/seller/${s.seller_id}" class="btn btn-outline btn-sm">📒 مشاهده دفتر</a>
        ${user.role==='owner' ? `<a href="/ledger/seller/${s.seller_id}/allocations" class="btn btn-outline btn-sm">🔀 تخصیص</a>` : ''}
      </td>
    </tr>`;
  }).join('');

  return c.html(pageShell({
    title: 'Financial Ledger', lang, user, activePage: 'ledger',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">📒 دفتر کل مالی</div>
        <div class="page-subtitle">Financial Ledger · All Sellers · Immutable Records</div>
      </div>
      <div class="btn-group">
        <a href="/dashboard?mode=financial" class="btn btn-outline btn-sm">💼 داشبورد مالی</a>
        ${user.role==='owner'?`<button onclick="document.getElementById('correction-modal').classList.add('open')" class="btn btn-primary btn-sm">+ ثبت تصحیح</button>`:''}
      </div>
    </div>

    <!-- SUMMARY BANNER -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.875rem;margin-bottom:1.25rem">
      <div class="stat-card">
        <div class="stat-card-accent" style="background:#7c3aed"></div>
        <div class="stat-label">📦 کل GB تخصیص</div>
        <div class="stat-value" style="color:#7c3aed">${formatGB(summary.total_gb_allocated)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:#0891b2"></div>
        <div class="stat-label">💰 قیمت کل</div>
        <div class="stat-value" style="color:#0891b2">${formatMoney(summary.total_price)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--success)"></div>
        <div class="stat-label">✅ پرداخت شده</div>
        <div class="stat-value success">${formatMoney(summary.total_paid)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:${remain>0?'var(--danger)':'var(--success)'}"></div>
        <div class="stat-label">⏳ باقی‌مانده</div>
        <div class="stat-value" style="color:${remain>0?'var(--danger)':'var(--success)'}">${formatMoney(Math.abs(remain))}</div>
        <div class="stat-sub">${remain>0?'کل بدهی فروشندگان':'اضافه‌پرداخت کل'}</div>
      </div>
    </div>

    <!-- SELLER BALANCES TABLE -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">👥 وضعیت مالی فروشندگان</div>
        <div style="font-size:.78rem;color:var(--text-muted)">کلیک روی نام = مشاهده دفتر کامل</div>
      </div>
      ${sellerBalances.length ? `
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>فروشنده</th>
            <th>GB تخصیص</th>
            <th>قیمت کل</th>
            <th>پرداختی</th>
            <th>مانده حساب</th>
            <th>پیشرفت پرداخت</th>
            <th>عملیات</th>
          </tr></thead>
          <tbody>${sellerRows}</tbody>
        </table>
      </div>` : `
      <div class="empty-state">
        <div class="empty-state-icon">📒</div>
        <h3>هنوز هیچ سابقه مالی ثبت نشده</h3>
        <p>با ثبت اولین تخصیص، دفتر کل به‌طور خودکار شروع به ثبت می‌کند.</p>
      </div>`}
    </div>

    <!-- CORRECTION MODAL -->
    ${user.role==='owner' ? `
    <div class="modal-overlay" id="correction-modal">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">⚙️ ثبت تصحیح دستی</div>
          <button class="modal-close" onclick="document.getElementById('correction-modal').classList.remove('open')">✕</button>
        </div>
        <form method="POST" action="/ledger/correction">
          <div class="form-row">
            <div class="form-group">
              <label>فروشنده *</label>
              <select name="seller_id" required>
                ${sellerBalances.map((s: any) => `<option value="${s.seller_id}">${s.seller_name}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>مبلغ تصحیح (+ یا −) *</label>
              <input type="number" name="amount" step="0.01" required placeholder="مثبت = بدهی بیشتر، منفی = کاهش بدهی"/>
              <div class="form-hint">مثال: +5000 = اضافه بدهی، −2000 = کاهش بدهی</div>
            </div>
          </div>
          <div class="form-group">
            <label>توضیحات (الزامی برای تصحیحات)</label>
            <textarea name="notes" rows="2" required placeholder="دلیل تصحیح را وارد کنید..."></textarea>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="document.getElementById('correction-modal').classList.remove('open')" class="btn btn-outline">لغو</button>
            <button type="submit" class="btn btn-warning">⚙️ ثبت تصحیح</button>
          </div>
        </form>
      </div>
    </div>` : ''}
    `
  }));
});

// ============================================================
// GET /ledger/seller/:id — Per-seller ledger detail
// ============================================================
ledger.get('/seller/:id', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const sellerId = parseInt(c.req.param('id'));

  // Sellers can only see their own ledger
  if (user.role === 'seller' && user.id !== sellerId) return c.redirect('/dashboard');

  const [sellerRow, entries, balance] = await Promise.all([
    c.env.DB.prepare('SELECT id, full_name, commission_rate FROM users WHERE id=? AND company_id=?')
      .bind(sellerId, user.company_id).first<any>(),
    getSellerLedger(c.env.DB, user.company_id, sellerId, 200),
    getSellerBalance(c.env.DB, user.company_id, sellerId),
  ]);

  if (!sellerRow) return c.html('<h1>Seller not found</h1>', 404);

  // Summary stats
  const totalAllocated = entries
    .filter((e: any) => e.transaction_type === 'allocation')
    .reduce((sum: number, e: any) => sum + e.money_amount, 0);
  const totalPaid = entries
    .filter((e: any) => e.transaction_type === 'payment')
    .reduce((sum: number, e: any) => sum + Math.abs(e.money_amount), 0);
  const totalGb = entries
    .filter((e: any) => e.transaction_type === 'allocation')
    .reduce((sum: number, e: any) => sum + (e.gb_amount || 0), 0);

  const balColor = balance > 0 ? 'var(--danger)' : balance < 0 ? 'var(--success)' : 'var(--text-muted)';

  const entryRows = entries.map((e: any) => {
    const isAlloc = e.transaction_type === 'allocation';
    const isPay   = e.transaction_type === 'payment';
    const sign    = e.money_amount >= 0 ? '+' : '';
    return `
    <tr>
      <td style="font-size:.8rem;white-space:nowrap">${fdate(e.created_at)}</td>
      <td>${txBadge(e.transaction_type)}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">
        ${e.ref_type === 'allocation_batch' ? `Batch #${e.ref_id}` : e.ref_type === 'payment' ? `Pay #${e.ref_id}` : 'Manual'}
      </td>
      <td class="text-primary">${isAlloc ? formatGB(e.gb_amount||0) : '—'}</td>
      <td style="font-weight:600;color:${e.money_amount > 0 ? 'var(--danger)' : e.money_amount < 0 ? 'var(--success)' : 'var(--text-muted)'}">
        ${sign}${formatMoney(Math.abs(e.money_amount))}
      </td>
      <td style="font-weight:600;color:${e.balance_after > 0 ? 'var(--danger)' : e.balance_after < 0 ? 'var(--success)' : 'var(--text-muted)'}">
        ${formatMoney(Math.abs(e.balance_after))}
        <span style="font-size:.68rem;color:var(--text-muted)">${e.balance_after > 0 ? 'بدهی' : e.balance_after < 0 ? 'اضافه' : 'تسویه'}</span>
      </td>
      <td style="font-size:.78rem;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.notes || '—'}</td>
    </tr>`;
  }).join('');

  return c.html(pageShell({
    title: `دفتر: ${sellerRow.full_name}`, lang, user, activePage: 'ledger',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">📒 دفتر مالی: ${sellerRow.full_name}</div>
        <div class="page-subtitle">Seller Ledger · کمیشن ${Math.round(sellerRow.commission_rate*100)}%</div>
      </div>
      <div class="btn-group">
        <a href="/ledger" class="btn btn-outline btn-sm">← بازگشت</a>
        <a href="/ledger/seller/${sellerId}/allocations" class="btn btn-outline btn-sm">🔀 تخصیص‌ها</a>
        <a href="/ledger/seller/${sellerId}/payments" class="btn btn-outline btn-sm">💳 پرداخت‌ها</a>
      </div>
    </div>

    <!-- SELLER KPI CARDS -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:1.25rem">
      <div class="stat-card">
        <div class="stat-card-accent" style="background:#7c3aed"></div>
        <div class="stat-label">📦 GB تخصیص</div>
        <div class="stat-value" style="color:#7c3aed">${formatGB(totalGb)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:#0891b2"></div>
        <div class="stat-label">💰 قیمت کل</div>
        <div class="stat-value" style="color:#0891b2">${formatMoney(totalAllocated)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--success)"></div>
        <div class="stat-label">✅ پرداخت شده</div>
        <div class="stat-value success">${formatMoney(totalPaid)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:${balance>0?'var(--danger)':'var(--success)'}"></div>
        <div class="stat-label">⚖️ مانده حساب</div>
        <div class="stat-value" style="color:${balColor}">
          ${balance > 0 ? '−' : balance < 0 ? '+' : ''}${formatMoney(Math.abs(balance))}
        </div>
        <div class="stat-sub">${balance > 0 ? 'بدهی به مالک' : balance < 0 ? 'مالک بدهکار' : 'تسویه'}</div>
      </div>
    </div>

    <!-- FORMULA ROW -->
    <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:10px;padding:.875rem 1.25rem;margin-bottom:1.25rem;display:flex;gap:1rem;flex-wrap:wrap;align-items:center;border:1px solid #334155;font-size:.88rem">
      <span style="color:#94a3b8;font-size:.72rem;font-weight:600;min-width:80px">مانده حساب:</span>
      <span style="color:#e2e8f0;font-weight:600">${formatMoney(totalAllocated)}</span>
      <span style="color:#475569">قیمت تخصیص</span>
      <span style="color:#475569">−</span>
      <span style="color:#34d399;font-weight:600">${formatMoney(totalPaid)}</span>
      <span style="color:#475569">پرداخت شده</span>
      <span style="color:#475569">=</span>
      <span style="color:${balColor};font-weight:700;font-size:1rem">${formatMoney(Math.abs(balance))}</span>
      <span style="color:${balColor}">${balance > 0 ? 'بدهی' : balance < 0 ? 'اضافه‌پرداخت' : 'تسویه'}</span>
    </div>

    <!-- LEDGER TABLE (immutable) -->
    <div class="card">
      <div class="card-header">
        <div class="card-title">📋 تاریخچه دفتر (غیرقابل تغییر)</div>
        <div style="font-size:.72rem;color:var(--text-muted);display:flex;gap:.4rem;align-items:center">
          🔒 تمام رکوردها دائمی هستند · تصحیحات فقط با ثبت رکورد جدید ممکن است
        </div>
      </div>
      ${entries.length ? `
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>تاریخ</th>
            <th>نوع</th>
            <th>مرجع</th>
            <th>GB</th>
            <th>مبلغ (+/−)</th>
            <th>مانده بعد از</th>
            <th>یادداشت</th>
          </tr></thead>
          <tbody>${entryRows}</tbody>
        </table>
      </div>` : `
      <div class="empty-state">
        <div class="empty-state-icon">📒</div>
        <h3>هنوز سابقه‌ای در دفتر ثبت نشده</h3>
        <p>با اولین تخصیص یا پرداخت، دفتر شروع به ثبت می‌کند.</p>
      </div>`}
    </div>
    `
  }));
});

// ============================================================
// GET /ledger/seller/:id/allocations — Seller allocation drill-down
// ============================================================
ledger.get('/seller/:id/allocations', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const sellerId = parseInt(c.req.param('id'));
  if (user.role === 'seller' && user.id !== sellerId) return c.redirect('/dashboard');

  const sellerRow = await c.env.DB.prepare('SELECT full_name FROM users WHERE id=? AND company_id=?')
    .bind(sellerId, user.company_id).first<any>();
  if (!sellerRow) return c.html('<h1>Not found</h1>', 404);

  const batches = await c.env.DB.prepare(`
    SELECT ab.id, ab.created_at, ab.total_gb, ab.total_gross, ab.total_commission, ab.total_net,
           ab.commission_rate, ab.notes, br.name as branch_name,
           (SELECT COUNT(*) FROM allocation_batch_lines WHERE batch_id=ab.id) as line_count
    FROM allocation_batches ab
    JOIN branches br ON br.id = ab.branch_id
    WHERE ab.company_id=? AND ab.seller_id=?
    ORDER BY ab.created_at DESC
  `).bind(user.company_id, sellerId).all<any>();

  const allocRows = (batches.results || []).map((b: any) => `
    <tr>
      <td style="font-size:.82rem">${fdate(b.created_at)}</td>
      <td>${b.branch_name}</td>
      <td><span class="badge badge-primary">${b.line_count} نوع</span></td>
      <td class="text-primary font-bold">${formatGB(b.total_gb)}</td>
      <td>${formatMoney(b.total_gross)}</td>
      <td class="text-warning">${formatMoney(b.total_commission)} <span class="badge badge-warning">${Math.round(b.commission_rate*100)}%</span></td>
      <td class="text-success font-bold">${formatMoney(b.total_net)}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${b.notes||'—'}</td>
    </tr>`).join('');

  const totals = (batches.results||[]).reduce((acc: any, b: any) => ({
    gb: acc.gb + b.total_gb,
    gross: acc.gross + b.total_gross,
    comm: acc.comm + b.total_commission,
    net: acc.net + b.total_net,
  }), { gb: 0, gross: 0, comm: 0, net: 0 });

  return c.html(pageShell({
    title: `تخصیص‌ها: ${sellerRow.full_name}`, lang, user, activePage: 'ledger',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">🔀 تخصیص‌های: ${sellerRow.full_name}</div>
        <div class="page-subtitle">Allocation History · All Batches</div>
      </div>
      <div class="btn-group">
        <a href="/ledger/seller/${sellerId}" class="btn btn-outline btn-sm">📒 دفتر</a>
        <a href="/ledger/seller/${sellerId}/payments" class="btn btn-outline btn-sm">💳 پرداخت‌ها</a>
      </div>
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:1rem">
      <div class="stat-card"><div class="stat-label">GB کل</div><div class="stat-value primary">${formatGB(totals.gb)}</div></div>
      <div class="stat-card"><div class="stat-label">Gross</div><div class="stat-value">${formatMoney(totals.gross)}</div></div>
      <div class="stat-card"><div class="stat-label">کمیشن</div><div class="stat-value warning">${formatMoney(totals.comm)}</div></div>
      <div class="stat-card"><div class="stat-label">خالص</div><div class="stat-value success">${formatMoney(totals.net)}</div></div>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>تاریخ</th><th>شعبه</th><th>بسته‌ها</th>
            <th>GB</th><th>Gross</th><th>کمیشن</th><th>خالص</th><th>یادداشت</th>
          </tr></thead>
          <tbody>${allocRows || `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">🔀</div><h3>بدون تخصیص</h3></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>`
  }));
});

// ============================================================
// GET /ledger/seller/:id/payments — Seller payments drill-down
// ============================================================
ledger.get('/seller/:id/payments', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const sellerId = parseInt(c.req.param('id'));
  if (user.role === 'seller' && user.id !== sellerId) return c.redirect('/dashboard');

  const sellerRow = await c.env.DB.prepare('SELECT full_name FROM users WHERE id=? AND company_id=?')
    .bind(sellerId, user.company_id).first<any>();
  if (!sellerRow) return c.html('<h1>Not found</h1>', 404);

  const payments = await c.env.DB.prepare(`
    SELECT p.*, b.name as branch_name
    FROM payments p
    LEFT JOIN branches b ON b.id = p.branch_id
    WHERE p.company_id=? AND p.seller_id=?
    ORDER BY p.payment_date DESC, p.created_at DESC
  `).bind(user.company_id, sellerId).all<any>();

  const totalPaid = (payments.results||[]).reduce((sum: number, p: any) => sum + p.amount, 0);

  const payRows = (payments.results||[]).map((p: any) => `
    <tr>
      <td style="font-size:.82rem">${p.payment_date}</td>
      <td>${p.branch_name||'—'}</td>
      <td><span class="badge badge-${p.type==='settlement'?'success':p.type==='commission'?'warning':'info'}">${p.type}</span></td>
      <td class="text-success font-bold">${formatMoney(p.amount)}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${p.notes||'—'}</td>
    </tr>`).join('');

  return c.html(pageShell({
    title: `پرداخت‌ها: ${sellerRow.full_name}`, lang, user, activePage: 'ledger',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">💳 پرداخت‌های: ${sellerRow.full_name}</div>
        <div class="page-subtitle">Payment History</div>
      </div>
      <div class="btn-group">
        <a href="/ledger/seller/${sellerId}" class="btn btn-outline btn-sm">📒 دفتر</a>
        <a href="/ledger/seller/${sellerId}/allocations" class="btn btn-outline btn-sm">🔀 تخصیص‌ها</a>
        ${user.role==='owner'?`<a href="/payments/add" class="btn btn-primary btn-sm">+ پرداخت جدید</a>`:''}
      </div>
    </div>
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-bottom:1rem">
      <div class="stat-card">
        <div class="stat-label">💳 تعداد پرداخت</div>
        <div class="stat-value primary">${(payments.results||[]).length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">✅ مجموع پرداختی</div>
        <div class="stat-value success">${formatMoney(totalPaid)}</div>
      </div>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>تاریخ</th><th>شعبه</th><th>نوع</th><th>مبلغ</th><th>یادداشت</th>
          </tr></thead>
          <tbody>${payRows || `<tr><td colspan="5"><div class="empty-state"><div class="empty-state-icon">💳</div><h3>بدون پرداخت</h3></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>`
  }));
});

// ============================================================
// POST /ledger/correction — Add manual correction (owner only)
// ============================================================
ledger.post('/correction', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Forbidden' }, 403);

  const form = await c.req.formData();
  const seller_id = parseInt(form.get('seller_id')?.toString() ?? '0');
  const amount = parseFloat(form.get('amount')?.toString() ?? '0');
  const notes = form.get('notes')?.toString()?.trim() ?? '';

  if (!seller_id || isNaN(amount) || !notes) {
    return new Response(null, { status: 302, headers: { 'Location': '/ledger?err=invalid' } });
  }

  // Verify seller belongs to company
  const sellerRow = await c.env.DB.prepare('SELECT id FROM users WHERE id=? AND company_id=? AND role=\'seller\'')
    .bind(seller_id, user.company_id).first<any>();
  if (!sellerRow) return new Response(null, { status: 302, headers: { 'Location': '/ledger?err=notfound' } });

  await createLedgerEntry(c.env.DB, {
    company_id:       user.company_id,
    seller_id:        seller_id,
    transaction_type: 'correction',
    ref_type:         'manual',
    ref_id:           undefined,
    gb_amount:        0,
    money_amount:     Math.round(amount * 100) / 100,
    notes:            `[تصحیح] ${notes}`,
    created_by:       user.id,
  });

  return new Response(null, { status: 302, headers: { 'Location': `/ledger/seller/${seller_id}?ok=correction` } });
});

export default ledger;
