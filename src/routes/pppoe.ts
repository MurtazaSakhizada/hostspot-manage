// ============================================================
// PPPoE Customers — Phase 1: Standalone CRUD
// Owner-only access. No connection to financial ledger or
// notifications in this phase.
// ============================================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatMoney } from '../lib/calc';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const pppoe = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Owner-only guard (applied to every route in this file) ──
pppoe.use('*', async (c, next) => {
  const user = c.get('user');
  if (!user || user.role !== 'owner') {
    return c.redirect('/dashboard');
  }
  return next();
});

// ── Helpers ──────────────────────────────────────────────────
const SPEEDS = [1,2,3,4,5,6,7,8,9,10];

function speedOpts(selected: number) {
  return SPEEDS.map(s =>
    `<option value="${s}" ${s === selected ? 'selected' : ''}>${s} Mbps</option>`
  ).join('');
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function statusBadge(status: string, expiry: string): string {
  const expired = new Date(expiry) < new Date();
  if (status === 'inactive') return `<span class="badge badge-danger">غیرفعال</span>`;
  if (expired)               return `<span class="badge badge-warning">منقضی</span>`;
  return                            `<span class="badge badge-success">فعال</span>`;
}

function daysLeft(expiry: string): string {
  const diff = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (diff < 0)  return `<span style="color:var(--danger);font-size:.78rem">منقضی ${Math.abs(diff)} روز پیش</span>`;
  if (diff <= 5) return `<span style="color:var(--warning);font-size:.78rem">⚠️ ${diff} روز مانده</span>`;
  return                `<span style="color:var(--text-muted);font-size:.78rem">${diff} روز مانده</span>`;
}

// ── Shared form HTML ──────────────────────────────────────────
function buildForm(opts: {
  action: string;
  branches: any[];
  lang: Lang;
  v?: any;              // existing values for edit mode
}) {
  const { action, branches, lang, v } = opts;
  const isEdit = !!v;
  const branchOpts = branches.map((b: any) =>
    `<option value="${b.id}" ${v?.branch_id === b.id ? 'selected' : ''}>${b.name}</option>`
  ).join('');

  const today = todayStr();
  const defaultExpiry = addMonths(today, 1);

  return `
  <form method="POST" action="${action}" id="pppoe-form">
    <div class="form-row">
      <div class="form-group">
        <label>نام کامل <span style="color:var(--danger)">*</span></label>
        <input type="text" name="full_name" required value="${v?.full_name ?? ''}" placeholder="نام و نام خانوادگی"/>
      </div>
      <div class="form-group">
        <label>نام کاربری PPPoE <span style="color:var(--danger)">*</span></label>
        <input type="text" name="pppoe_username" required value="${v?.pppoe_username ?? ''}" placeholder="مثلاً: user001"/>
        <div class="form-hint">فقط یادداشت — لاگین سیستم نیست</div>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>شماره تماس اصلی <span style="color:var(--danger)">*</span></label>
        <input type="tel" name="phone_primary" required value="${v?.phone_primary ?? ''}" placeholder="07XX-XXX-XXXX"/>
      </div>
      <div class="form-group">
        <label>شماره تماس دوم</label>
        <input type="tel" name="phone_secondary" value="${v?.phone_secondary ?? ''}" placeholder="اختیاری"/>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>آدرس</label>
        <input type="text" name="address" value="${v?.address ?? ''}" placeholder="آدرس محل نصب (اختیاری)"/>
      </div>
      <div class="form-group">
        <label>شعبه</label>
        <select name="branch_id">
          <option value="">— بدون شعبه —</option>
          ${branchOpts}
        </select>
      </div>
    </div>

    <!-- Package Type Toggle -->
    <div class="form-group">
      <label>نوع بسته <span style="color:var(--danger)">*</span></label>
      <div style="display:flex;gap:.75rem;margin-top:.25rem">
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;padding:.5rem 1rem;border:2px solid var(--border);border-radius:8px;flex:1;transition:all .15s" id="lbl-unlimited">
          <input type="radio" name="package_type" value="unlimited" id="pkg-unlimited"
            ${(!v || v.package_type === 'unlimited') ? 'checked' : ''}
            onchange="togglePkgType()" style="accent-color:var(--primary)"/>
          <span style="font-weight:500">♾️ نامحدود</span>
        </label>
        <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;padding:.5rem 1rem;border:2px solid var(--border);border-radius:8px;flex:1;transition:all .15s" id="lbl-limited">
          <input type="radio" name="package_type" value="limited" id="pkg-limited"
            ${v?.package_type === 'limited' ? 'checked' : ''}
            onchange="togglePkgType()" style="accent-color:var(--primary)"/>
          <span style="font-weight:500">📊 محدود (حجمی)</span>
        </label>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>سرعت <span style="color:var(--danger)">*</span></label>
        <select name="speed_mbps" required>
          ${speedOpts(v?.speed_mbps ?? 4)}
        </select>
      </div>
      <div class="form-group" id="quota-group" style="${(!v || v.package_type !== 'limited') ? 'display:none' : ''}">
        <label>حجم (GB) <span style="color:var(--danger)" id="quota-req">*</span></label>
        <input type="number" name="quota_gb" id="quota-input" min="1" step="1"
          value="${v?.quota_gb ?? ''}" placeholder="مثلاً: 50"/>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>قیمت ماهانه (افغانی) <span style="color:var(--danger)">*</span></label>
        <input type="number" name="monthly_price" required min="0" step="1"
          value="${v?.monthly_price ?? ''}" placeholder="مثلاً: 1500"/>
      </div>
      <div class="form-group">
        <label>وضعیت</label>
        <select name="status">
          <option value="active"   ${(!v || v.status==='active')   ? 'selected' : ''}>✅ فعال</option>
          <option value="inactive" ${v?.status==='inactive' ? 'selected' : ''}>🔴 غیرفعال</option>
        </select>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label>تاریخ شروع <span style="color:var(--danger)">*</span></label>
        <input type="date" name="start_date" required value="${v?.start_date ?? today}"
          id="start-date" oninput="autoExpiry()"/>
      </div>
      <div class="form-group">
        <label>تاریخ پایان بسته <span style="color:var(--danger)">*</span></label>
        <input type="date" name="expiry_date" required value="${v?.expiry_date ?? defaultExpiry}"
          id="expiry-date"/>
        <div class="form-hint">یا <button type="button" class="btn btn-ghost btn-sm" onclick="autoExpiry()">+۱ ماه از شروع</button></div>
      </div>
    </div>

    <div class="form-group">
      <label>یادداشت</label>
      <textarea name="notes" rows="2" placeholder="هر توضیح اضافه...">${v?.notes ?? ''}</textarea>
    </div>

    <div class="modal-footer" style="border:none;padding:0;margin-top:1.25rem">
      <a href="/pppoe" class="btn btn-outline">${t(lang,'cancel')}</a>
      <button type="submit" class="btn btn-primary">💾 ${isEdit ? t(lang,'save_changes') : 'ثبت مشتری'}</button>
    </div>
  </form>

  <script>
  function togglePkgType() {
    const isLimited = document.getElementById('pkg-limited').checked;
    const qg = document.getElementById('quota-group');
    const qi = document.getElementById('quota-input');
    qg.style.display = isLimited ? '' : 'none';
    qi.required = isLimited;
    // style active radio label
    document.getElementById('lbl-unlimited').style.borderColor = !isLimited ? 'var(--primary)' : 'var(--border)';
    document.getElementById('lbl-limited').style.borderColor   =  isLimited ? 'var(--primary)' : 'var(--border)';
  }
  function autoExpiry() {
    const s = document.getElementById('start-date').value;
    if (!s) return;
    const d = new Date(s); d.setMonth(d.getMonth()+1);
    document.getElementById('expiry-date').value = d.toISOString().split('T')[0];
  }
  // Init on load
  togglePkgType();
  </script>`;
}

// ============================================================
// GET /pppoe — Customer List
// ============================================================
pppoe.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');

  const statusFilter = c.req.query('status') ?? 'all';
  const branchFilter = c.req.query('branch') ?? '';

  let where = 'WHERE pc.company_id=?';
  const binds: any[] = [user.company_id];

  if (statusFilter === 'active') {
    where += ` AND pc.status='active' AND date(pc.expiry_date) >= date('now')`;
  } else if (statusFilter === 'inactive') {
    where += ` AND (pc.status='inactive' OR date(pc.expiry_date) < date('now'))`;
  } else if (statusFilter === 'expiring') {
    where += ` AND pc.status='active' AND date(pc.expiry_date) BETWEEN date('now') AND date('now','+7 days')`;
  }
  if (branchFilter) {
    where += ` AND pc.branch_id=?`;
    binds.push(parseInt(branchFilter));
  }

  const [customers, branches, summary] = await Promise.all([
    c.env.DB.prepare(`
      SELECT pc.*, b.name as branch_name
      FROM pppoe_customers pc
      LEFT JOIN branches b ON b.id = pc.branch_id
      ${where}
      ORDER BY pc.expiry_date ASC`)
      .bind(...binds).all<any>(),

    c.env.DB.prepare(`SELECT id, name FROM branches WHERE company_id=? AND active=1 ORDER BY name`)
      .bind(user.company_id).all<any>(),

    c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status='active' AND date(expiry_date) >= date('now') THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status='active' AND date(expiry_date) < date('now')  THEN 1 ELSE 0 END) as expired_count,
        SUM(CASE WHEN status='active' AND date(expiry_date) BETWEEN date('now') AND date('now','+7 days') THEN 1 ELSE 0 END) as expiring_soon,
        COALESCE(SUM(monthly_price),0) as total_monthly_revenue
      FROM pppoe_customers WHERE company_id=?`)
      .bind(user.company_id).first<any>(),
  ]);

  const branchSelectOpts = (branches.results || []).map((b: any) =>
    `<option value="${b.id}" ${branchFilter === String(b.id) ? 'selected' : ''}>${b.name}</option>`
  ).join('');

  const rows = (customers.results || []).map((c: any) => `
    <tr>
      <td>
        <div style="font-weight:600">${c.full_name}</div>
        <div style="font-size:.75rem;color:var(--text-muted)">${c.pppoe_username}</div>
      </td>
      <td>
        <div>${c.phone_primary}</div>
        ${c.phone_secondary ? `<div style="font-size:.75rem;color:var(--text-muted)">${c.phone_secondary}</div>` : ''}
      </td>
      <td>
        <span class="badge ${c.package_type === 'unlimited' ? 'badge-info' : 'badge-warning'}">
          ${c.package_type === 'unlimited' ? '♾️ نامحدود' : `📊 ${c.quota_gb ?? '?'} GB`}
        </span>
        <div style="font-size:.75rem;color:var(--text-muted);margin-top:.2rem">${c.speed_mbps} Mbps</div>
      </td>
      <td class="font-bold" style="color:var(--success)">${formatMoney(c.monthly_price)}</td>
      <td>
        ${c.branch_name ? `<span class="badge badge-info" style="font-size:.7rem">🏢 ${c.branch_name}</span>` : '<span style="color:var(--text-muted)">—</span>'}
      </td>
      <td>
        ${statusBadge(c.status, c.expiry_date)}
        <div style="margin-top:.2rem">${daysLeft(c.expiry_date)}</div>
        <div style="font-size:.72rem;color:var(--text-muted)">${c.expiry_date}</div>
      </td>
      <td>
        <div style="display:flex;flex-wrap:wrap;gap:.3rem">
          <a href="/pppoe/${c.id}/edit" class="btn btn-outline btn-sm">✏️ ویرایش</a>
          <button onclick="openRenew(${c.id},'${c.full_name.replace(/'/g,"\\'")}','${c.expiry_date}')"
            class="btn btn-sm" style="background:var(--primary);color:#fff">🔄 تمدید</button>
          <button onclick="confirmDelete('/api/pppoe/${c.id}','حذف ${c.full_name.replace(/'/g,"\\'")}؟')"
            class="btn btn-danger btn-sm">🗑️</button>
        </div>
      </td>
    </tr>`).join('');

  return c.html(pageShell({
    title: 'مشتریان PPPoE', lang, user, activePage: 'pppoe',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">🌐 مشتریان PPPoE</div>
        <div class="page-subtitle">اینترنت خانگی · ${summary?.total ?? 0} مشتری</div>
      </div>
      <a href="/pppoe/add" class="btn btn-primary">+ افزودن مشتری</a>
    </div>

    <!-- KPI Cards -->
    <div class="stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(140px,1fr));margin-bottom:1.25rem">
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--success)"></div>
        <div class="stat-label">فعال</div>
        <div class="stat-value success">${summary?.active_count ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--warning)"></div>
        <div class="stat-label">به‌زودی منقضی (۷ روز)</div>
        <div class="stat-value warning">${summary?.expiring_soon ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--danger)"></div>
        <div class="stat-label">منقضی‌شده</div>
        <div class="stat-value" style="color:var(--danger)">${summary?.expired_count ?? 0}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-accent" style="background:var(--primary)"></div>
        <div class="stat-label">درآمد ماهانه (کل)</div>
        <div class="stat-value primary">${formatMoney(summary?.total_monthly_revenue ?? 0)}</div>
      </div>
    </div>

    <!-- Filters -->
    <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem;align-items:center">
      <a href="/pppoe?status=all${branchFilter?'&branch='+branchFilter:''}"
        class="btn btn-sm ${statusFilter==='all'?'btn-primary':'btn-outline'}">همه</a>
      <a href="/pppoe?status=active${branchFilter?'&branch='+branchFilter:''}"
        class="btn btn-sm ${statusFilter==='active'?'btn-primary':'btn-outline'}">✅ فعال</a>
      <a href="/pppoe?status=expiring${branchFilter?'&branch='+branchFilter:''}"
        class="btn btn-sm ${statusFilter==='expiring'?'btn-primary':'btn-outline'}">⚠️ به‌زودی منقضی</a>
      <a href="/pppoe?status=inactive${branchFilter?'&branch='+branchFilter:''}"
        class="btn btn-sm ${statusFilter==='inactive'?'btn-primary':'btn-outline'}">🔴 غیرفعال/منقضی</a>
      <select onchange="location.href='/pppoe?status=${statusFilter}&branch='+this.value"
        style="height:34px;padding:.3rem .6rem;border:1px solid var(--border);border-radius:8px;font-size:.82rem">
        <option value="">همه شعبه‌ها</option>
        ${branchSelectOpts}
      </select>
    </div>

    <!-- Table -->
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>مشتری</th>
            <th>تماس</th>
            <th>بسته</th>
            <th>قیمت/ماه</th>
            <th>شعبه</th>
            <th>وضعیت / انقضا</th>
            <th>عملیات</th>
          </tr></thead>
          <tbody>
            ${rows || `<tr><td colspan="7"><div class="empty-state">
              <div class="empty-state-icon">🌐</div>
              <h3>هنوز مشتری‌ای ثبت نشده</h3>
              <a href="/pppoe/add" class="btn btn-primary" style="margin-top:.75rem">+ افزودن اولین مشتری</a>
            </div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Renew Modal -->
    <div class="modal-overlay" id="renew-modal">
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <div class="modal-title">🔄 تمدید بسته</div>
          <button class="modal-close" onclick="closeRenew()">✕</button>
        </div>
        <div style="padding:1.25rem">
          <div style="margin-bottom:1rem">
            <strong id="renew-name"></strong>
            <div style="font-size:.82rem;color:var(--text-muted);margin-top:.25rem">
              انقضای فعلی: <span id="renew-current-expiry"></span>
            </div>
          </div>
          <form method="POST" id="renew-form">
            <input type="hidden" name="_method" value="RENEW"/>
            <div class="form-group">
              <label>تاریخ پایان جدید <span style="color:var(--danger)">*</span></label>
              <input type="date" name="new_expiry" id="renew-new-expiry" required/>
              <div class="form-hint">
                <button type="button" class="btn btn-ghost btn-sm" onclick="setRenewPreset(1)">+۱ ماه</button>
                <button type="button" class="btn btn-ghost btn-sm" onclick="setRenewPreset(2)">+۲ ماه</button>
                <button type="button" class="btn btn-ghost btn-sm" onclick="setRenewPreset(3)">+۳ ماه</button>
              </div>
            </div>
            <div class="modal-footer" style="border:none;padding:0">
              <button type="button" onclick="closeRenew()" class="btn btn-outline">انصراف</button>
              <button type="submit" class="btn btn-primary">💾 ثبت تمدید</button>
            </div>
          </form>
        </div>
      </div>
    </div>`,

    scripts: `<script>
    let _renewCurrentExpiry = '';
    function openRenew(id, name, currentExpiry) {
      _renewCurrentExpiry = currentExpiry;
      document.getElementById('renew-name').textContent = name;
      document.getElementById('renew-current-expiry').textContent = currentExpiry;
      document.getElementById('renew-form').action = '/pppoe/' + id + '/renew';
      // Default: +1 month from current expiry
      setRenewPreset(1);
      document.getElementById('renew-modal').classList.add('open');
    }
    function closeRenew() {
      document.getElementById('renew-modal').classList.remove('open');
    }
    function setRenewPreset(months) {
      const base = _renewCurrentExpiry || new Date().toISOString().split('T')[0];
      const d = new Date(base);
      d.setMonth(d.getMonth() + months);
      document.getElementById('renew-new-expiry').value = d.toISOString().split('T')[0];
    }
    </script>`
  }));
});

// ============================================================
// GET /pppoe/add — Add Customer Form
// ============================================================
pppoe.get('/add', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');

  const branches = await c.env.DB.prepare(
    'SELECT id, name FROM branches WHERE company_id=? AND active=1 ORDER BY name'
  ).bind(user.company_id).all<any>();

  return c.html(pageShell({
    title: 'افزودن مشتری PPPoE', lang, user, activePage: 'pppoe',
    body: `
    <div class="page-header">
      <div class="page-title">🌐 افزودن مشتری PPPoE</div>
    </div>
    <div class="card" style="max-width:720px">
      ${buildForm({ action: '/pppoe', branches: branches.results ?? [], lang })}
    </div>`
  }));
});

// ============================================================
// POST /pppoe — Create Customer
// ============================================================
pppoe.post('/', async (c) => {
  const user = c.get('user');
  const form = await c.req.formData();

  const full_name      = form.get('full_name')?.toString().trim() ?? '';
  const pppoe_username = form.get('pppoe_username')?.toString().trim() ?? '';
  const phone_primary  = form.get('phone_primary')?.toString().trim() ?? '';
  const phone_secondary = form.get('phone_secondary')?.toString().trim() || null;
  const address        = form.get('address')?.toString().trim() || null;
  const branch_id      = parseInt(form.get('branch_id')?.toString() ?? '0') || null;
  const package_type   = form.get('package_type')?.toString() === 'limited' ? 'limited' : 'unlimited';
  const speed_mbps     = Math.min(10, Math.max(1, parseInt(form.get('speed_mbps')?.toString() ?? '4') || 4));
  const quota_gb       = package_type === 'limited' ? (parseFloat(form.get('quota_gb')?.toString() ?? '0') || null) : null;
  const monthly_price  = parseFloat(form.get('monthly_price')?.toString() ?? '0') || 0;
  const start_date     = form.get('start_date')?.toString() || todayStr();
  const expiry_date    = form.get('expiry_date')?.toString() || addMonths(start_date, 1);
  const status         = form.get('status')?.toString() === 'inactive' ? 'inactive' : 'active';
  const notes          = form.get('notes')?.toString().trim() || null;

  if (!full_name || !pppoe_username || !phone_primary) {
    return c.redirect('/pppoe/add');
  }

  await c.env.DB.prepare(`
    INSERT INTO pppoe_customers
      (company_id, branch_id, full_name, phone_primary, phone_secondary, address,
       pppoe_username, package_type, speed_mbps, quota_gb, monthly_price,
       start_date, expiry_date, status, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(
      user.company_id, branch_id, full_name, phone_primary, phone_secondary, address,
      pppoe_username, package_type, speed_mbps, quota_gb, monthly_price,
      start_date, expiry_date, status, notes
    ).run();

  return c.redirect('/pppoe');
});

// ============================================================
// GET /pppoe/:id/edit — Edit Form
// ============================================================
pppoe.get('/:id/edit', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const id = parseInt(c.req.param('id'));

  const [customer, branches] = await Promise.all([
    c.env.DB.prepare('SELECT * FROM pppoe_customers WHERE id=? AND company_id=?')
      .bind(id, user.company_id).first<any>(),
    c.env.DB.prepare('SELECT id, name FROM branches WHERE company_id=? AND active=1 ORDER BY name')
      .bind(user.company_id).all<any>(),
  ]);

  if (!customer) return c.redirect('/pppoe');

  return c.html(pageShell({
    title: 'ویرایش مشتری PPPoE', lang, user, activePage: 'pppoe',
    body: `
    <div class="page-header">
      <div class="page-title">✏️ ویرایش: ${customer.full_name}</div>
    </div>
    <div class="card" style="max-width:720px">
      ${buildForm({
        action: `/pppoe/${id}/edit`,
        branches: branches.results ?? [],
        lang,
        v: customer,
      })}
    </div>`
  }));
});

// ============================================================
// POST /pppoe/:id/edit — Update Customer
// ============================================================
pppoe.post('/:id/edit', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));

  // Verify ownership
  const existing = await c.env.DB.prepare(
    'SELECT id FROM pppoe_customers WHERE id=? AND company_id=?'
  ).bind(id, user.company_id).first<{id:number}>();
  if (!existing) return c.redirect('/pppoe');

  const form = await c.req.formData();

  const full_name       = form.get('full_name')?.toString().trim() ?? '';
  const pppoe_username  = form.get('pppoe_username')?.toString().trim() ?? '';
  const phone_primary   = form.get('phone_primary')?.toString().trim() ?? '';
  const phone_secondary = form.get('phone_secondary')?.toString().trim() || null;
  const address         = form.get('address')?.toString().trim() || null;
  const branch_id       = parseInt(form.get('branch_id')?.toString() ?? '0') || null;
  const package_type    = form.get('package_type')?.toString() === 'limited' ? 'limited' : 'unlimited';
  const speed_mbps      = Math.min(10, Math.max(1, parseInt(form.get('speed_mbps')?.toString() ?? '4') || 4));
  const quota_gb        = package_type === 'limited' ? (parseFloat(form.get('quota_gb')?.toString() ?? '0') || null) : null;
  const monthly_price   = parseFloat(form.get('monthly_price')?.toString() ?? '0') || 0;
  const start_date      = form.get('start_date')?.toString() || todayStr();
  const expiry_date     = form.get('expiry_date')?.toString() || addMonths(start_date, 1);
  const status          = form.get('status')?.toString() === 'inactive' ? 'inactive' : 'active';
  const notes           = form.get('notes')?.toString().trim() || null;

  await c.env.DB.prepare(`
    UPDATE pppoe_customers SET
      branch_id=?, full_name=?, phone_primary=?, phone_secondary=?, address=?,
      pppoe_username=?, package_type=?, speed_mbps=?, quota_gb=?, monthly_price=?,
      start_date=?, expiry_date=?, status=?, notes=?
    WHERE id=? AND company_id=?`)
    .bind(
      branch_id, full_name, phone_primary, phone_secondary, address,
      pppoe_username, package_type, speed_mbps, quota_gb, monthly_price,
      start_date, expiry_date, status, notes,
      id, user.company_id
    ).run();

  return c.redirect('/pppoe');
});

// ============================================================
// POST /pppoe/:id/renew — Renew (advance expiry_date)
// Phase 1: no ledger entry. Phase 2 will add financial record.
// ============================================================
pppoe.post('/:id/renew', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));

  const existing = await c.env.DB.prepare(
    'SELECT id FROM pppoe_customers WHERE id=? AND company_id=?'
  ).bind(id, user.company_id).first<{id:number}>();
  if (!existing) return c.redirect('/pppoe');

  const form = await c.req.formData();
  const new_expiry = form.get('new_expiry')?.toString() ?? '';
  if (!new_expiry) return c.redirect('/pppoe');

  await c.env.DB.prepare(`
    UPDATE pppoe_customers
    SET expiry_date=?, last_renewed_at=datetime('now'), status='active'
    WHERE id=? AND company_id=?`)
    .bind(new_expiry, id, user.company_id).run();

  return c.redirect('/pppoe');
});

// ============================================================
// DELETE /api/pppoe/:id — Delete Customer
// ============================================================
pppoe.delete('/api/pppoe/:id', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  try {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM pppoe_customers WHERE id=? AND company_id=?'
    ).bind(id, user.company_id).first<{id:number}>();
    if (!existing) return c.json({ error: 'Not found' }, 404);

    await c.env.DB.prepare('DELETE FROM pppoe_customers WHERE id=? AND company_id=?')
      .bind(id, user.company_id).run();

    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e?.message ?? 'Delete failed' }, 500);
  }
});

export default pppoe;
