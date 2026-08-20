// ============================================================
// People Routes — Per-person breakdown (Owner only)
// GET /people          → list all sellers with summary KPIs
// GET /people/:id      → full drill-down for one person
// ============================================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatGB, formatMoney } from '../lib/calc';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const people = new Hono<{ Bindings: Bindings; Variables: Variables }>();

function fdate(d: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function ftime(d: string): string {
  if (!d) return '';
  return new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function badge(type: string): string {
  const map: Record<string, string> = {
    allocation: 'badge-info',
    payment: 'badge-success',
    correction: 'badge-warning',
    cash: 'badge-success',
    bank: 'badge-primary',
    cheque: 'badge-warning',
  };
  return map[type] ?? 'badge-secondary';
}

// ============================================================
// GET /people — List all sellers (owner only)
// ============================================================
people.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/dashboard');

  // All sellers with aggregated stats
  const sellers = await c.env.DB.prepare(`
    SELECT
      u.id, u.full_name, u.email, u.commission_rate, u.active,
      br.name as branch_name,
      COALESCE(alloc.total_gb,   0) as alloc_gb,
      COALESCE(alloc.total_net,  0) as alloc_net,
      COALESCE(alloc.batches,    0) as alloc_batches,
      COALESCE(sales.total_gb,   0) as sales_gb,
      COALESCE(sales.cnt,        0) as sales_cnt,
      COALESCE(pay.total_paid,   0) as total_paid,
      COALESCE(pay.pay_cnt,      0) as pay_cnt
    FROM users u
    LEFT JOIN branches br ON br.id = u.branch_id
    LEFT JOIN (
      SELECT seller_id,
        SUM(total_gb) as total_gb, SUM(total_net) as total_net, COUNT(*) as batches
      FROM allocation_batches WHERE company_id=?
      GROUP BY seller_id
    ) alloc ON alloc.seller_id = u.id
    LEFT JOIN (
      SELECT seller_id,
        SUM(total_gb) as total_gb, COUNT(*) as cnt
      FROM sales WHERE company_id=?
      GROUP BY seller_id
    ) sales ON sales.seller_id = u.id
    LEFT JOIN (
      SELECT seller_id,
        SUM(amount) as total_paid, COUNT(*) as pay_cnt
      FROM payments WHERE company_id=?
      GROUP BY seller_id
    ) pay ON pay.seller_id = u.id
    WHERE u.company_id=? AND u.role='seller'
    ORDER BY alloc_gb DESC, u.full_name ASC
  `).bind(user.company_id, user.company_id, user.company_id, user.company_id).all<any>();

  const sellerCards = (sellers.results ?? []).map((s: any) => {
    const balance = s.alloc_net - s.total_paid;
    const balColor = balance > 0 ? 'var(--danger)' : balance < 0 ? 'var(--success)' : 'var(--text-muted)';
    const balLabel = balance > 0 ? '⚠️ بدهکار' : balance < 0 ? '✅ بستانکار' : '⚖️ تسویه';
    const pct = s.alloc_gb > 0 ? Math.min(100, Math.round((s.sales_gb / s.alloc_gb) * 100)) : 0;

    return `
    <div class="card" style="padding:0;overflow:hidden;transition:box-shadow .2s;cursor:pointer"
      onclick="location.href='/people/${s.id}'"
      onmouseenter="this.style.boxShadow='0 4px 24px rgba(79,70,229,.18)'"
      onmouseleave="this.style.boxShadow=''">

      <!-- Header -->
      <div style="padding:1rem 1.25rem;display:flex;align-items:center;gap:.875rem;border-bottom:1px solid var(--border)">
        <div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#4338ca,#7c3aed);
          display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.15rem;flex-shrink:0">
          ${s.full_name.charAt(0).toUpperCase()}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${s.full_name}</div>
          <div style="font-size:.74rem;color:var(--text-muted)">${s.branch_name ?? '—'} · ${Math.round((s.commission_rate ?? 0) * 100)}% کمیسیون</div>
        </div>
        <div>
          <span class="badge badge-${s.active ? 'success' : 'secondary'}" style="font-size:.7rem">${s.active ? 'فعال' : 'غیرفعال'}</span>
        </div>
      </div>

      <!-- KPI Grid -->
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0;text-align:center">
        <div style="padding:.75rem .5rem;border-left:1px solid var(--border)">
          <div style="font-size:.68rem;color:var(--text-muted);margin-bottom:.2rem">تخصیص GB</div>
          <div style="font-weight:700;color:var(--primary);font-size:.95rem">${formatGB(s.alloc_gb)}</div>
          <div style="font-size:.68rem;color:var(--text-muted)">${s.alloc_batches} دسته</div>
        </div>
        <div style="padding:.75rem .5rem;border-left:1px solid var(--border)">
          <div style="font-size:.68rem;color:var(--text-muted);margin-bottom:.2rem">فروش GB</div>
          <div style="font-weight:700;color:var(--success);font-size:.95rem">${formatGB(s.sales_gb)}</div>
          <div style="font-size:.68rem;color:var(--text-muted)">${s.sales_cnt} فروش</div>
        </div>
        <div style="padding:.75rem .5rem">
          <div style="font-size:.68rem;color:var(--text-muted);margin-bottom:.2rem">پرداخت‌شده</div>
          <div style="font-weight:700;color:var(--success);font-size:.95rem">${formatMoney(s.total_paid)}</div>
          <div style="font-size:.68rem;color:var(--text-muted)">${s.pay_cnt} بار</div>
        </div>
      </div>

      <!-- Progress bar -->
      <div style="padding:.5rem 1rem;border-top:1px solid var(--border)">
        <div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--text-muted);margin-bottom:.3rem">
          <span>فروش از تخصیص: ${pct}%</span>
          <span style="color:${balColor};font-weight:600">${balLabel}: ${formatMoney(Math.abs(balance))}</span>
        </div>
        <div style="background:var(--gray-200);border-radius:4px;height:5px;overflow:hidden">
          <div style="width:${pct}%;background:var(--success);height:100%;border-radius:4px;transition:width .4s"></div>
        </div>
      </div>

      <!-- View button -->
      <div style="padding:.625rem 1rem;background:var(--gray-50);text-align:center;font-size:.82rem;color:var(--primary);font-weight:600">
        📊 مشاهده تمام داده‌ها ←
      </div>
    </div>`;
  }).join('');

  const totalAlloc = (sellers.results ?? []).reduce((s: number, r: any) => s + r.alloc_net, 0);
  const totalPaid  = (sellers.results ?? []).reduce((s: number, r: any) => s + r.total_paid, 0);
  const totalBal   = totalAlloc - totalPaid;

  return c.html(pageShell({
    title: 'افراد', lang, user, activePage: 'people',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">👥 افراد</div>
        <div class="page-subtitle">پروفایل و بریک‌داون کامل هر فروشنده</div>
      </div>
      <a href="/search" class="btn btn-outline">🔍 جستجو</a>
    </div>

    <!-- Company summary -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr));margin-bottom:1.5rem">
      <div class="stat-card">
        <div class="stat-label">👥 مجموع فروشندگان</div>
        <div class="stat-value primary">${sellers.results?.length ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">💰 مجموع طلب شرکت</div>
        <div class="stat-value">${formatMoney(totalAlloc)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">✅ مجموع دریافت‌شده</div>
        <div class="stat-value success">${formatMoney(totalPaid)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">⚖️ مانده کل</div>
        <div class="stat-value" style="color:${totalBal > 0 ? 'var(--danger)' : 'var(--success)'}">${formatMoney(Math.abs(totalBal))}</div>
      </div>
    </div>

    <!-- Seller cards grid -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem">
      ${sellerCards || `
      <div class="card" style="grid-column:1/-1;padding:2.5rem;text-align:center;color:var(--text-muted)">
        <div style="font-size:3rem">👥</div>
        <h3>هیچ فروشنده‌ای ثبت نشده</h3>
        <a href="/users" class="btn btn-primary" style="margin-top:.75rem">افزودن فروشنده</a>
      </div>`}
    </div>`
  }));
});

// ============================================================
// GET /people/:id — Full breakdown for one person
// ============================================================
people.get('/:id', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/dashboard');

  const pid = parseInt(c.req.param('id'));
  const tab = c.req.query('tab') ?? 'overview';

  const person = await c.env.DB.prepare(`
    SELECT u.*, br.name as branch_name
    FROM users u LEFT JOIN branches br ON br.id = u.branch_id
    WHERE u.id=? AND u.company_id=? AND u.role='seller'
  `).bind(pid, user.company_id).first<any>();
  if (!person) return c.redirect('/people');

  // ── Load all data in parallel ───────────────────────────
  const [
    allocBatches, allocLines,
    salesData,
    paymentsData,
    ledgerData,
    expensesData,
  ] = await Promise.all([

    // Allocation batches
    c.env.DB.prepare(`
      SELECT ab.*, br.name as branch_name
      FROM allocation_batches ab
      JOIN branches br ON br.id = ab.branch_id
      WHERE ab.company_id=? AND ab.seller_id=?
      ORDER BY ab.created_at DESC
    `).bind(user.company_id, pid).all<any>(),

    // Allocation batch lines
    c.env.DB.prepare(`
      SELECT abl.*, ab.created_at as batch_date, p.name as pkg_name
      FROM allocation_batch_lines abl
      JOIN allocation_batches ab ON ab.id = abl.batch_id
      JOIN packages p ON p.id = abl.package_id
      WHERE abl.company_id=? AND ab.seller_id=?
      ORDER BY ab.created_at DESC
    `).bind(user.company_id, pid).all<any>(),

    // Sales
    c.env.DB.prepare(`
      SELECT s.*, p.name as pkg_name, b.name as branch_name
      FROM sales s
      JOIN packages p ON p.id = s.package_id
      JOIN branches b ON b.id = s.branch_id
      WHERE s.company_id=? AND s.seller_id=?
      ORDER BY s.snapshot_time DESC
    `).bind(user.company_id, pid).all<any>(),

    // Payments
    c.env.DB.prepare(`
      SELECT p.*, b.name as branch_name
      FROM payments p
      LEFT JOIN branches b ON b.id = p.branch_id
      WHERE p.company_id=? AND p.seller_id=?
      ORDER BY p.payment_date DESC
    `).bind(user.company_id, pid).all<any>(),

    // Ledger
    c.env.DB.prepare(`
      SELECT * FROM financial_ledger
      WHERE company_id=? AND seller_id=?
      ORDER BY created_at DESC
    `).bind(user.company_id, pid).all<any>(),

    // Expenses
    c.env.DB.prepare(`
      SELECT * FROM expenses
      WHERE company_id=? AND seller_id=?
      ORDER BY expense_date DESC
    `).bind(user.company_id, pid).all<any>(),
  ]);

  // ── Aggregate KPIs ──────────────────────────────────────
  const allocs  = allocBatches.results ?? [];
  const sales   = salesData.results    ?? [];
  const pays    = paymentsData.results ?? [];
  const ledger  = ledgerData.results   ?? [];
  const exps    = expensesData.results ?? [];

  const totalAllocGb  = allocs.reduce((s: number, r: any) => s + r.total_gb,         0);
  const totalAllocNet = allocs.reduce((s: number, r: any) => s + r.total_net,        0);
  const totalSalesGb  = sales.reduce ((s: number, r: any) => s + r.total_gb,         0);
  const totalSalesNet = sales.reduce ((s: number, r: any) => s + r.net_amount,       0);
  const totalPaid     = pays.reduce  ((s: number, r: any) => s + r.amount,           0);
  const totalExp      = exps.reduce  ((s: number, r: any) => s + r.amount,           0);
  const balance       = totalAllocNet - totalPaid;
  const remainGb      = Math.max(0, totalAllocGb - totalSalesGb);
  const commRate      = Math.round((person.commission_rate ?? 0) * 100);

  // ── Tab content builders ────────────────────────────────

  // Overview tab
  const overviewHtml = `
  <div class="stats-grid" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-bottom:1.25rem">
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#7c3aed"></div>
      <div class="stat-label">📦 تخصیص GB</div>
      <div class="stat-value" style="color:#7c3aed">${formatGB(totalAllocGb)}</div>
      <div class="stat-sub">${allocs.length} دسته</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--success)"></div>
      <div class="stat-label">💰 فروش GB</div>
      <div class="stat-value success">${formatGB(totalSalesGb)}</div>
      <div class="stat-sub">${sales.length} فروش</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--primary)"></div>
      <div class="stat-label">🟢 موجودی مانده</div>
      <div class="stat-value primary">${formatGB(remainGb)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:var(--warning)"></div>
      <div class="stat-label">💸 طلب شرکت</div>
      <div class="stat-value warning">${formatMoney(totalAllocNet)}</div>
      <div class="stat-sub">${commRate}% کمیسیون</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:#22c55e"></div>
      <div class="stat-label">✅ پرداخت‌شده</div>
      <div class="stat-value" style="color:#22c55e">${formatMoney(totalPaid)}</div>
      <div class="stat-sub">${pays.length} بار</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-accent" style="background:${balance > 0 ? 'var(--danger)' : 'var(--success)'}"></div>
      <div class="stat-label">⚖️ مانده حساب</div>
      <div class="stat-value" style="color:${balance > 0 ? 'var(--danger)' : 'var(--success)'}">
        ${balance > 0 ? '−' : '+'}${formatMoney(Math.abs(balance))}
      </div>
      <div class="stat-sub">${balance > 0 ? 'بدهکار' : balance < 0 ? 'بستانکار' : 'تسویه'}</div>
    </div>
  </div>

  <!-- Timeline of recent activity -->
  <div class="card">
    <div style="padding:.75rem 1rem;border-bottom:1px solid var(--border);font-weight:600">🕐 آخرین فعالیت‌ها</div>
    <div style="padding:.5rem 0">
      ${buildTimeline(allocs, sales, pays, exps)}
    </div>
  </div>`;

  // Allocations tab
  const allocHtml = buildAllocTab(allocs, allocLines.results ?? [], user);

  // Sales tab
  const salesHtml = buildSalesTab(sales, commRate);

  // Payments tab
  const paysHtml = buildPaysTab(pays, totalPaid, totalAllocNet, balance);

  // Ledger tab
  const ledgerHtml = buildLedgerTab(ledger);

  // Expenses tab
  const expHtml = buildExpTab(exps, totalExp);

  // Tab switcher
  const tabs = [
    { key: 'overview',    label: '📊 خلاصه',      count: null },
    { key: 'allocations', label: '🔀 تخصیص‌ها',   count: allocs.length },
    { key: 'sales',       label: '💰 فروش',         count: sales.length },
    { key: 'payments',    label: '💳 پرداختی‌ها',  count: pays.length },
    { key: 'ledger',      label: '📒 دفتر مالی',   count: ledger.length },
    { key: 'expenses',    label: '💸 هزینه‌ها',    count: exps.length },
  ];

  const tabNav = tabs.map(tb => `
    <a href="/people/${pid}?tab=${tb.key}"
      style="padding:.5rem 1rem;border-bottom:2px solid ${tab === tb.key ? 'var(--primary)' : 'transparent'};
        color:${tab === tb.key ? 'var(--primary)' : 'var(--text-muted)'};
        font-weight:${tab === tb.key ? '600' : '400'};font-size:.875rem;
        white-space:nowrap;text-decoration:none;transition:all .2s">
      ${tb.label}${tb.count !== null ? ` <span style="font-size:.7rem;background:var(--gray-200);border-radius:99px;padding:1px 6px;margin-right:2px">${tb.count}</span>` : ''}
    </a>`).join('');

  const activeTabHtml =
    tab === 'allocations' ? allocHtml :
    tab === 'sales'       ? salesHtml :
    tab === 'payments'    ? paysHtml  :
    tab === 'ledger'      ? ledgerHtml :
    tab === 'expenses'    ? expHtml   :
    overviewHtml;

  return c.html(pageShell({
    title: person.full_name, lang, user, activePage: 'people',
    body: `
    <!-- Breadcrumb -->
    <div style="margin-bottom:1rem;font-size:.82rem;color:var(--text-muted)">
      <a href="/people" style="color:var(--primary)">👥 افراد</a>
      <span style="margin:0 .4rem">›</span>
      <strong style="color:var(--text-primary)">${person.full_name}</strong>
    </div>

    <!-- Person header -->
    <div class="card" style="padding:1.25rem;margin-bottom:1.25rem;display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
      <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#4338ca,#7c3aed);
        display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:1.5rem;flex-shrink:0">
        ${person.full_name.charAt(0).toUpperCase()}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:1.2rem">${person.full_name}</div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-top:.25rem">
          ${person.email ?? '—'} · 🏢 ${person.branch_name ?? '—'} · 💸 ${commRate}% کمیسیون
        </div>
      </div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <span class="badge badge-${person.active ? 'success' : 'secondary'}">${person.active ? '✅ فعال' : '❌ غیرفعال'}</span>
        <a href="/users" class="btn btn-outline btn-sm">✏️ ویرایش</a>
        <a href="/allocations/add" class="btn btn-primary btn-sm">+ تخصیص جدید</a>
      </div>
    </div>

    <!-- Tab navigation -->
    <div class="card" style="padding:0;margin-bottom:1.25rem">
      <div style="display:flex;gap:0;overflow-x:auto;padding:.25rem .5rem;border-bottom:1px solid var(--border)">
        ${tabNav}
      </div>
    </div>

    <!-- Tab content -->
    ${activeTabHtml}`
  }));
});

// ── Tab builders ─────────────────────────────────────────────

function buildTimeline(allocs: any[], sales: any[], pays: any[], exps: any[]): string {
  type Event = { date: string; type: string; label: string; value: string; icon: string };
  const events: Event[] = [
    ...allocs.slice(0, 5).map(a => ({ date: a.created_at, type: 'alloc', icon: '📦',
      label: `تخصیص — ${a.branch_name}`, value: formatGB(a.total_gb) + ' · ' + formatMoney(a.total_net) })),
    ...sales.slice(0, 5).map(s => ({ date: s.snapshot_time, type: 'sale', icon: '💰',
      label: `فروش ${s.pkg_name}`, value: formatGB(s.total_gb) + ' · ' + formatMoney(s.net_amount) })),
    ...pays.slice(0, 5).map(p => ({ date: p.payment_date, type: 'pay', icon: '✅',
      label: `پرداخت — ${p.type}`, value: formatMoney(p.amount) })),
    ...exps.slice(0, 3).map(e => ({ date: e.expense_date, type: 'exp', icon: '💸',
      label: `هزینه — ${e.name}`, value: formatMoney(e.amount) })),
  ];
  events.sort((a, b) => b.date.localeCompare(a.date));
  if (!events.length) return `<div style="padding:1.5rem;text-align:center;color:var(--text-muted)">فعالیتی ثبت نشده</div>`;
  return events.slice(0, 12).map(ev => `
    <div style="display:flex;gap:.75rem;align-items:flex-start;padding:.5rem 1rem;border-bottom:1px solid var(--border)">
      <div style="font-size:1.1rem;flex-shrink:0;margin-top:.1rem">${ev.icon}</div>
      <div style="flex:1">
        <div style="font-size:.85rem;font-weight:500">${ev.label}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${fdate(ev.date)} ${ftime(ev.date)}</div>
      </div>
      <div style="font-weight:600;font-size:.85rem;text-align:left;white-space:nowrap">${ev.value}</div>
    </div>`).join('');
}

function buildAllocTab(allocs: any[], lines: any[], user: SessionUser): string {
  if (!allocs.length) return `<div class="card" style="padding:2rem;text-align:center;color:var(--text-muted)">
    <div style="font-size:2.5rem">📦</div><div>هیچ تخصیصی ثبت نشده</div></div>`;

  // Group lines by batch_id
  const linesByBatch: Record<number, any[]> = {};
  for (const l of lines) {
    if (!linesByBatch[l.batch_id]) linesByBatch[l.batch_id] = [];
    linesByBatch[l.batch_id].push(l);
  }

  const rows = allocs.map((b: any, i: number) => {
    const batchLines = linesByBatch[b.id] ?? [];
    const lineHtml = batchLines.map((l: any) => `
      <div style="display:flex;gap:.75rem;align-items:center;padding:.3rem 0;border-bottom:1px solid var(--border)">
        <span class="badge badge-primary" style="min-width:70px;text-align:center;font-size:.72rem">${l.pkg_name}</span>
        <span style="font-size:.82rem">${l.quantity} × ${l.size_gb}GB</span>
        <span class="text-primary font-bold" style="font-size:.82rem">= ${formatGB(l.total_gb)}</span>
        <span style="margin-left:auto;font-size:.82rem;color:var(--text-muted)">${formatMoney(l.net_amount)}</span>
      </div>`).join('');

    return `
    <tr>
      <td>
        <div class="font-bold">${fdate(b.created_at)}</div>
        <div style="font-size:.72rem;color:var(--text-muted)">${ftime(b.created_at)}</div>
      </td>
      <td>${b.branch_name}</td>
      <td class="text-primary font-bold">${formatGB(b.total_gb)}</td>
      <td>${formatMoney(b.total_gross)}</td>
      <td class="text-warning">${formatMoney(b.total_commission)} <span style="font-size:.7rem">${Math.round((b.commission_rate ?? 0) * 100)}%</span></td>
      <td class="text-success font-bold">${formatMoney(b.total_net)}</td>
      <td style="max-width:140px;font-size:.78rem;color:var(--text-muted)">${b.notes || '—'}</td>
      <td>
        <button onclick="toggleRow('ab-${i}')" class="btn btn-outline btn-sm">📋 جزئیات</button>
        <a href="/allocations/${b.id}/edit" class="btn btn-outline btn-sm">✏️</a>
      </td>
    </tr>
    <tr id="ab-${i}" class="hidden">
      <td colspan="8" style="background:var(--gray-50);padding:.75rem 1rem">
        ${lineHtml || '<div style="color:var(--text-muted);font-size:.82rem">جزئیات پکیج در دسترس نیست</div>'}
      </td>
    </tr>`;
  }).join('');

  return `<div class="card">
    <div class="table-wrapper"><table>
      <thead><tr>
        <th>تاریخ</th><th>شعبه</th><th>GB</th><th>ناخالص</th><th>کمیسیون</th><th>خالص</th><th>یادداشت</th><th>عملیات</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

function buildSalesTab(sales: any[], commRate: number): string {
  if (!sales.length) return `<div class="card" style="padding:2rem;text-align:center;color:var(--text-muted)">
    <div style="font-size:2.5rem">💰</div><div>هیچ فروشی ثبت نشده</div></div>`;

  const rows = sales.map((s: any) => `
  <tr>
    <td>
      <div class="font-bold">${fdate(s.snapshot_time)}</div>
      <div style="font-size:.72rem;color:var(--text-muted)">${ftime(s.snapshot_time)}</div>
    </td>
    <td><strong>${s.pkg_name}</strong></td>
    <td>${s.branch_name}</td>
    <td class="text-center">${s.quantity ?? 1}</td>
    <td class="text-primary font-bold">${formatGB(s.total_gb)}</td>
    <td>${formatMoney(s.gross_amount)}</td>
    <td class="text-warning">${formatMoney(s.commission_amount)} <span style="font-size:.7rem">${commRate}%</span></td>
    <td class="text-success font-bold">${formatMoney(s.net_amount)}</td>
    <td style="font-size:.75rem;color:var(--text-muted);max-width:120px">${s.notes || '—'}</td>
  </tr>`).join('');

  return `<div class="card">
    <div class="table-wrapper"><table>
      <thead><tr>
        <th>تاریخ</th><th>پکیج</th><th>شعبه</th><th>تعداد</th><th>GB</th><th>ناخالص</th><th>کمیسیون</th><th>خالص</th><th>یادداشت</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

function buildPaysTab(pays: any[], totalPaid: number, totalAlloc: number, balance: number): string {
  const rows = pays.length
    ? pays.map((p: any) => `
      <tr>
        <td>
          <div class="font-bold">${fdate(p.payment_date)}</div>
        </td>
        <td class="text-success font-bold">${formatMoney(p.amount)}</td>
        <td><span class="badge badge-${badge(p.type)}">${p.type}</span></td>
        <td>${p.branch_name || '—'}</td>
        <td style="font-size:.78rem;color:var(--text-muted);max-width:180px">${p.notes || '—'}</td>
      </tr>`).join('')
    : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem">هیچ پرداختی ثبت نشده</td></tr>`;

  return `
  <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:1rem">
    <div class="stat-card">
      <div class="stat-label">💰 طلب شرکت</div>
      <div class="stat-value warning">${formatMoney(totalAlloc)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">✅ پرداخت‌شده</div>
      <div class="stat-value success">${formatMoney(totalPaid)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">⚖️ مانده</div>
      <div class="stat-value" style="color:${balance > 0 ? 'var(--danger)' : 'var(--success)'}">
        ${balance > 0 ? '−' : '+'}${formatMoney(Math.abs(balance))}
      </div>
    </div>
  </div>
  <div class="card">
    <div class="table-wrapper"><table>
      <thead><tr><th>تاریخ</th><th>مبلغ</th><th>نوع</th><th>شعبه</th><th>یادداشت</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

function buildLedgerTab(ledger: any[]): string {
  if (!ledger.length) return `<div class="card" style="padding:2rem;text-align:center;color:var(--text-muted)">
    <div style="font-size:2.5rem">📒</div><div>دفتر مالی خالی است</div></div>`;

  const txIcon: Record<string, string> = { allocation: '📦', payment: '✅', correction: '⚙️' };
  const txColor: Record<string, string> = { allocation: 'var(--primary)', payment: 'var(--success)', correction: 'var(--warning)' };

  const rows = ledger.map((l: any) => `
  <tr>
    <td style="font-size:.8rem">${fdate(l.created_at)}</td>
    <td>
      <span style="background:rgba(99,102,241,.1);padding:2px 8px;border-radius:6px;font-size:.74rem;font-weight:600;color:${txColor[l.transaction_type] ?? 'var(--text-muted)'}">
        ${txIcon[l.transaction_type] ?? '•'} ${l.transaction_type === 'allocation' ? 'تخصیص' : l.transaction_type === 'payment' ? 'پرداخت' : 'تصحیح'}
      </span>
    </td>
    <td class="text-primary">${l.gb_amount > 0 ? formatGB(l.gb_amount) : '—'}</td>
    <td class="font-bold">${formatMoney(l.money_amount)}</td>
    <td style="font-size:.78rem;color:var(--text-muted);max-width:200px">${l.notes || '—'}</td>
  </tr>`).join('');

  return `<div class="card">
    <div class="table-wrapper"><table>
      <thead><tr><th>تاریخ</th><th>نوع تراکنش</th><th>GB</th><th>مبلغ</th><th>یادداشت</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

function buildExpTab(exps: any[], totalExp: number): string {
  if (!exps.length) return `<div class="card" style="padding:2rem;text-align:center;color:var(--text-muted)">
    <div style="font-size:2.5rem">💸</div><div>هیچ هزینه‌ای ثبت نشده</div></div>`;

  const rows = exps.map((e: any) => `
  <tr>
    <td style="font-size:.8rem">${fdate(e.expense_date)}</td>
    <td><strong>${e.name}</strong></td>
    <td class="text-danger font-bold">${formatMoney(e.amount)}</td>
    <td style="font-size:.78rem;color:var(--text-muted);max-width:220px">${e.description || '—'}</td>
  </tr>`).join('');

  return `
  <div class="stats-grid" style="grid-template-columns:repeat(2,1fr);margin-bottom:1rem">
    <div class="stat-card">
      <div class="stat-label">💸 مجموع هزینه‌ها</div>
      <div class="stat-value danger">${formatMoney(totalExp)}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">تعداد</div>
      <div class="stat-value">${exps.length} ردیف</div>
    </div>
  </div>
  <div class="card">
    <div class="table-wrapper"><table>
      <thead><tr><th>تاریخ</th><th>نام هزینه</th><th>مبلغ</th><th>توضیحات</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </div>`;
}

export default people;
