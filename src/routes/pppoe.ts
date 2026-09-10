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
        <a href="/pppoe/${c.id}" style="font-weight:600;color:var(--primary);text-decoration:none" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${c.full_name}</a>
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
          <button onclick="openRenew(${c.id},'${c.full_name.replace(/'/g,"\\'")}','${c.expiry_date}','${c.package_type}',${c.speed_mbps},${c.quota_gb ?? 'null'},${c.monthly_price})"
            class="btn btn-sm" style="background:var(--primary);color:#fff">🔄 تمدید</button>
          <button onclick="openHistory(${c.id},'${c.full_name.replace(/'/g,"\\'")}')"
            class="btn btn-sm" style="background:var(--bg-secondary);color:var(--text);border:1px solid var(--border)">🕐 تاریخچه</button>
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
      <div class="modal" style="max-width:480px">
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

            <!-- Package type -->
            <div class="form-group">
              <label>نوع بسته <span style="color:var(--danger)">*</span></label>
              <div style="display:flex;gap:.6rem;margin-top:.25rem">
                <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;padding:.45rem .9rem;border:2px solid var(--border);border-radius:8px;flex:1;transition:border-color .15s" id="rl-unlimited">
                  <input type="radio" name="package_type" value="unlimited" id="r-pkg-unlimited" onchange="toggleRenewPkg()" style="accent-color:var(--primary)"/>
                  <span style="font-weight:500;font-size:.9rem">♾️ نامحدود</span>
                </label>
                <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;padding:.45rem .9rem;border:2px solid var(--border);border-radius:8px;flex:1;transition:border-color .15s" id="rl-limited">
                  <input type="radio" name="package_type" value="limited" id="r-pkg-limited" onchange="toggleRenewPkg()" style="accent-color:var(--primary)"/>
                  <span style="font-weight:500;font-size:.9rem">📊 محدود (حجمی)</span>
                </label>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>سرعت <span style="color:var(--danger)">*</span></label>
                <select name="speed_mbps" id="r-speed">
                  ${SPEEDS.map(s => `<option value="${s}">${s} Mbps</option>`).join('')}
                </select>
              </div>
              <div class="form-group" id="r-quota-group">
                <label>حجم (GB) <span style="color:var(--danger)">*</span></label>
                <input type="number" name="quota_gb" id="r-quota" min="1" step="1" placeholder="مثلاً: 50"/>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>قیمت این دوره (افغانی) <span style="color:var(--danger)">*</span></label>
                <input type="number" name="monthly_price" id="r-price" required min="0" step="1"/>
              </div>
              <div class="form-group">
                <label>تاریخ پایان جدید <span style="color:var(--danger)">*</span></label>
                <input type="date" name="new_expiry" id="renew-new-expiry" required/>
              </div>
            </div>
            <div class="form-hint" style="margin-top:-.5rem;margin-bottom:.75rem">
              <button type="button" class="btn btn-ghost btn-sm" onclick="setRenewPreset(1)">+۱ ماه</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="setRenewPreset(2)">+۲ ماه</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="setRenewPreset(3)">+۳ ماه</button>
            </div>

            <div class="form-group">
              <label>یادداشت</label>
              <input type="text" name="renew_notes" placeholder="مثلاً: پرداخت نقدی"/>
            </div>

            <div class="modal-footer" style="border:none;padding:0">
              <button type="button" onclick="closeRenew()" class="btn btn-outline">انصراف</button>
              <button type="submit" class="btn btn-primary">💾 ثبت تمدید</button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- History Modal -->
    <div class="modal-overlay" id="history-modal">
      <div class="modal" style="max-width:680px;width:95%">
        <div class="modal-header">
          <div class="modal-title">🕐 تاریخچه تمدیدها &mdash; <span id="history-cname" style="font-weight:400;font-size:.9em"></span></div>
          <button class="modal-close" onclick="closeHistory()">✕</button>
        </div>
        <div id="history-body" style="padding:1.25rem;min-height:120px">
          <div style="text-align:center;color:var(--text-muted);padding:2rem">در حال بارگذاری...</div>
        </div>
      </div>
    </div>`,

    scripts: `<script>
    let _renewCurrentExpiry = '';
    function openRenew(id, name, currentExpiry, pkgType, speed, quota, price) {
      _renewCurrentExpiry = currentExpiry;
      document.getElementById('renew-name').textContent = name;
      document.getElementById('renew-current-expiry').textContent = currentExpiry;
      document.getElementById('renew-form').action = '/pppoe/' + id + '/renew';

      // Pre-fill package type
      if (pkgType === 'limited') {
        document.getElementById('r-pkg-limited').checked = true;
      } else {
        document.getElementById('r-pkg-unlimited').checked = true;
      }
      toggleRenewPkg();

      // Pre-fill speed
      document.getElementById('r-speed').value = speed || 4;

      // Pre-fill quota
      if (quota && quota !== 'null') document.getElementById('r-quota').value = quota;
      else document.getElementById('r-quota').value = '';

      // Pre-fill price
      document.getElementById('r-price').value = price || '';

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
    function toggleRenewPkg() {
      const isLimited = document.getElementById('r-pkg-limited').checked;
      document.getElementById('r-quota-group').style.display = isLimited ? '' : 'none';
      document.getElementById('r-quota').required = isLimited;
      document.getElementById('rl-unlimited').style.borderColor = !isLimited ? 'var(--primary)' : 'var(--border)';
      document.getElementById('rl-limited').style.borderColor   =  isLimited ? 'var(--primary)' : 'var(--border)';
    }
    // Init on page load
    toggleRenewPkg();

    // ── History Modal ──────────────────────────────────────
    function openHistory(id, name) {
      document.getElementById('history-cname').textContent = name;
      document.getElementById('history-body').innerHTML =
        '<div style="text-align:center;color:var(--text-muted);padding:2rem">در حال بارگذاری...</div>';
      document.getElementById('history-modal').classList.add('open');

      fetch('/pppoe/' + id + '/renewals')
        .then(r => r.json())
        .then(data => {
          const rows = data.renewals;
          if (!rows || rows.length === 0) {
            document.getElementById('history-body').innerHTML =
              '<div style="text-align:center;padding:2.5rem">' +
              '<div style="font-size:2rem;margin-bottom:.5rem">🔄</div>' +
              '<div style="color:var(--text-muted)">هنوز تمدیدی ثبت نشده</div>' +
              '</div>';
            return;
          }
          let html = '<div class="table-wrapper" style="max-height:400px;overflow-y:auto">' +
            '<table>' +
            '<thead><tr>' +
            '<th style="width:32px">#</th>' +
            '<th>تاریخ تمدید</th>' +
            '<th>بسته</th>' +
            '<th>انقضای قبلی</th>' +
            '<th>انقضای جدید</th>' +
            '<th>قیمت</th>' +
            '<th>یادداشت</th>' +
            '</tr></thead><tbody>';
          rows.forEach((r, i) => {
            const renewDate = r.renewed_at ? r.renewed_at.split('T')[0] : '—';
            const price = Number(r.monthly_price).toLocaleString('fa-IR');
            const pkgLabel = r.package_type === 'limited'
              ? ('📊 ' + (r.quota_gb ? r.quota_gb + ' GB' : '?') + ' / ' + (r.speed_mbps||'?') + ' Mbps')
              : ('♾️ ' + (r.speed_mbps||'?') + ' Mbps');
            html += '<tr>' +
              '<td style="color:var(--text-muted);font-size:.78rem">' + (i+1) + '</td>' +
              '<td style="font-size:.82rem">' + renewDate + '</td>' +
              '<td style="font-size:.78rem;white-space:nowrap">' + pkgLabel + '</td>' +
              '<td><del style="color:var(--text-muted);font-size:.8rem">' + (r.previous_expiry||'—') + '</del></td>' +
              '<td><strong style="color:var(--success)">' + (r.new_expiry||'—') + '</strong></td>' +
              '<td style="color:var(--primary);font-weight:600;font-size:.85rem">' + price + ' افغانی</td>' +
              '<td style="font-size:.78rem;color:var(--text-muted)">' + (r.notes||'') + '</td>' +
              '</tr>';
          });
          html += '</tbody></table></div>';
          document.getElementById('history-body').innerHTML = html;
        })
        .catch(() => {
          document.getElementById('history-body').innerHTML =
            '<div style="text-align:center;color:var(--danger);padding:2rem">خطا در بارگذاری تاریخچه</div>';
        });
    }
    function closeHistory() {
      document.getElementById('history-modal').classList.remove('open');
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
// GET /pppoe/:id — Customer Detail & Renewal History
// ============================================================
pppoe.get('/:id', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.redirect('/pppoe');

  const [customer, renewals] = await Promise.all([
    c.env.DB.prepare(`
      SELECT pc.*, b.name as branch_name
      FROM pppoe_customers pc
      LEFT JOIN branches b ON b.id = pc.branch_id
      WHERE pc.id=? AND pc.company_id=?`)
      .bind(id, user.company_id).first<any>(),

    c.env.DB.prepare(`
      SELECT pr.*, u.name as renewed_by_name
      FROM pppoe_renewals pr
      LEFT JOIN users u ON u.id = pr.renewed_by
      WHERE pr.customer_id=?
      ORDER BY pr.renewed_at DESC
      LIMIT 50`)
      .bind(id).all<any>(),
  ]);

  if (!customer) return c.redirect('/pppoe');

  const expired = new Date(customer.expiry_date) < new Date();
  const diff = Math.ceil((new Date(customer.expiry_date).getTime() - Date.now()) / 86400000);

  // ── Renewal History Table ────────────────────────────────
  const renewalRows = (renewals.results || []).map((r: any, i: number) => {
    const pkgLabel = r.package_type === 'limited'
      ? `📊 ${r.quota_gb ?? '?'} GB / ${r.speed_mbps ?? '?'} Mbps`
      : `♾️ ${r.speed_mbps ?? '?'} Mbps`;
    return `
    <tr>
      <td style="color:var(--text-muted);font-size:.78rem">${i + 1}</td>
      <td><span style="font-size:.82rem">${r.renewed_at ? r.renewed_at.split('T')[0] : '—'}</span></td>
      <td style="font-size:.78rem;white-space:nowrap">${pkgLabel}</td>
      <td><del style="color:var(--text-muted);font-size:.8rem">${r.previous_expiry}</del></td>
      <td><strong style="color:var(--success)">${r.new_expiry}</strong></td>
      <td style="color:var(--primary);font-weight:600">${formatMoney(r.monthly_price)}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${r.renewed_by_name ?? '—'}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${r.notes ?? ''}</td>
    </tr>`;
  }).join('');

  const noRenewals = !renewals.results?.length;

  return c.html(pageShell({
    title: `${customer.full_name} — PPPoE`, lang, user, activePage: 'pppoe',
    body: `
    <!-- ── Breadcrumb ── -->
    <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:1rem">
      <a href="/pppoe" style="color:var(--primary);text-decoration:none">🌐 مشتریان PPPoE</a>
      <span style="margin:0 .4rem">›</span>
      <span>${customer.full_name}</span>
    </div>

    <!-- ── Header ── -->
    <div class="page-header">
      <div>
        <div class="page-title">${customer.full_name}</div>
        <div class="page-subtitle" style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
          <code style="background:var(--bg-secondary);padding:.1rem .45rem;border-radius:5px;font-size:.78rem">${customer.pppoe_username}</code>
          ${statusBadge(customer.status, customer.expiry_date)}
          ${customer.branch_name ? `<span class="badge badge-info" style="font-size:.7rem">🏢 ${customer.branch_name}</span>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <a href="/pppoe/${customer.id}/edit" class="btn btn-outline">✏️ ویرایش</a>
        <button onclick="openRenewDetail(${customer.id},'${customer.full_name.replace(/'/g,"\\'").replace(/"/g,'&quot;')}','${customer.expiry_date}')" class="btn btn-primary">🔄 تمدید</button>
      </div>
    </div>

    <!-- ── Info Cards ── -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem">

      <!-- Contact -->
      <div class="card" style="padding:1rem">
        <div style="font-size:.72rem;font-weight:600;text-transform:uppercase;color:var(--text-muted);margin-bottom:.6rem">📞 تماس</div>
        <div style="font-weight:600;font-size:.95rem">${customer.phone_primary}</div>
        ${customer.phone_secondary ? `<div style="font-size:.82rem;color:var(--text-muted);margin-top:.2rem">${customer.phone_secondary}</div>` : ''}
        ${customer.address ? `<div style="font-size:.8rem;margin-top:.4rem;color:var(--text-secondary)">📍 ${customer.address}</div>` : ''}
      </div>

      <!-- Package -->
      <div class="card" style="padding:1rem">
        <div style="font-size:.72rem;font-weight:600;text-transform:uppercase;color:var(--text-muted);margin-bottom:.6rem">📦 بسته</div>
        <div style="font-size:.95rem;font-weight:600">
          ${customer.package_type === 'unlimited'
            ? '♾️ نامحدود'
            : `📊 ${customer.quota_gb ?? '?'} GB`}
        </div>
        <div style="font-size:.82rem;color:var(--text-muted);margin-top:.2rem">⚡ ${customer.speed_mbps} Mbps</div>
      </div>

      <!-- Pricing -->
      <div class="card" style="padding:1rem">
        <div style="font-size:.72rem;font-weight:600;text-transform:uppercase;color:var(--text-muted);margin-bottom:.6rem">💰 قیمت ماهانه</div>
        <div style="font-size:1.15rem;font-weight:700;color:var(--success)">${formatMoney(customer.monthly_price)}</div>
        <div style="font-size:.78rem;color:var(--text-muted);margin-top:.2rem">افغانی / ماه</div>
      </div>

      <!-- Expiry -->
      <div class="card" style="padding:1rem">
        <div style="font-size:.72rem;font-weight:600;text-transform:uppercase;color:var(--text-muted);margin-bottom:.6rem">📅 انقضا</div>
        <div style="font-size:.95rem;font-weight:600;color:${expired ? 'var(--danger)' : diff <= 7 ? 'var(--warning)' : 'var(--text)'}"> ${customer.expiry_date}</div>
        <div style="margin-top:.3rem">${daysLeft(customer.expiry_date)}</div>
        ${customer.last_renewed_at ? `<div style="font-size:.72rem;color:var(--text-muted);margin-top:.25rem">آخرین تمدید: ${customer.last_renewed_at.split('T')[0]}</div>` : ''}
      </div>

    </div>

    ${customer.notes ? `
    <div class="card" style="padding:1rem;margin-bottom:1.5rem;border-right:3px solid var(--primary)">
      <div style="font-size:.75rem;font-weight:600;color:var(--text-muted);margin-bottom:.3rem">📝 یادداشت</div>
      <div style="font-size:.9rem">${customer.notes}</div>
    </div>` : ''}

    <!-- ── Renewal History ── -->
    <div class="card">
      <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <div style="font-weight:600;font-size:.95rem">🔄 تاریخچه تمدیدها</div>
        <span class="badge badge-info" style="font-size:.72rem">${renewals.results?.length ?? 0} بار</span>
      </div>
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th style="width:36px">#</th>
            <th>تاریخ تمدید</th>
            <th>بسته</th>
            <th>انقضای قبلی</th>
            <th>انقضای جدید</th>
            <th>قیمت</th>
            <th>توسط</th>
            <th>یادداشت</th>
          </tr></thead>
          <tbody>
            ${noRenewals
              ? `<tr><td colspan="8"><div class="empty-state" style="padding:2rem">
                  <div class="empty-state-icon">🔄</div>
                  <h3>هنوز تمدیدی ثبت نشده</h3>
                  <p style="font-size:.85rem;color:var(--text-muted)">اولین تمدید از دکمه بالا انجام دهید</p>
                </div></td></tr>`
              : renewalRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Renew Modal (inline on detail page) -->
    <div class="modal-overlay" id="renew-modal-detail">
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">🔄 تمدید بسته</div>
          <button class="modal-close" onclick="closeRenewDetail()">✕</button>
        </div>
        <div style="padding:1.25rem">
          <div style="margin-bottom:1rem">
            <strong id="renew-d-name"></strong>
            <div style="font-size:.82rem;color:var(--text-muted);margin-top:.25rem">
              انقضای فعلی: <span id="renew-d-current"></span>
            </div>
          </div>
          <form method="POST" id="renew-d-form">

            <!-- Package type -->
            <div class="form-group">
              <label>نوع بسته <span style="color:var(--danger)">*</span></label>
              <div style="display:flex;gap:.6rem;margin-top:.25rem">
                <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;padding:.45rem .9rem;border:2px solid var(--border);border-radius:8px;flex:1;transition:border-color .15s" id="dl-unlimited">
                  <input type="radio" name="package_type" value="unlimited" id="d-pkg-unlimited" onchange="toggleDetailPkg()" style="accent-color:var(--primary)"
                    ${customer.package_type !== 'limited' ? 'checked' : ''}/>
                  <span style="font-weight:500;font-size:.9rem">♾️ نامحدود</span>
                </label>
                <label style="display:flex;align-items:center;gap:.4rem;cursor:pointer;padding:.45rem .9rem;border:2px solid var(--border);border-radius:8px;flex:1;transition:border-color .15s" id="dl-limited">
                  <input type="radio" name="package_type" value="limited" id="d-pkg-limited" onchange="toggleDetailPkg()" style="accent-color:var(--primary)"
                    ${customer.package_type === 'limited' ? 'checked' : ''}/>
                  <span style="font-weight:500;font-size:.9rem">📊 محدود (حجمی)</span>
                </label>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>سرعت <span style="color:var(--danger)">*</span></label>
                <select name="speed_mbps" id="d-speed">
                  ${SPEEDS.map(s => `<option value="${s}" ${s === customer.speed_mbps ? 'selected' : ''}>${s} Mbps</option>`).join('')}
                </select>
              </div>
              <div class="form-group" id="d-quota-group" style="${customer.package_type !== 'limited' ? 'display:none' : ''}">
                <label>حجم (GB) <span style="color:var(--danger)">*</span></label>
                <input type="number" name="quota_gb" id="d-quota" min="1" step="1" value="${customer.quota_gb ?? ''}" placeholder="مثلاً: 50"/>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>قیمت این دوره (افغانی) <span style="color:var(--danger)">*</span></label>
                <input type="number" name="monthly_price" id="d-price" required min="0" step="1" value="${customer.monthly_price}"/>
              </div>
              <div class="form-group">
                <label>تاریخ پایان جدید <span style="color:var(--danger)">*</span></label>
                <input type="date" name="new_expiry" id="renew-d-new-expiry" required/>
              </div>
            </div>
            <div class="form-hint" style="margin-top:-.5rem;margin-bottom:.75rem">
              <button type="button" class="btn btn-ghost btn-sm" onclick="setDetailPreset(1)">+۱ ماه</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="setDetailPreset(2)">+۲ ماه</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="setDetailPreset(3)">+۳ ماه</button>
            </div>

            <div class="form-group">
              <label>یادداشت تمدید</label>
              <input type="text" name="renew_notes" placeholder="مثلاً: پرداخت نقدی" />
            </div>
            <div class="modal-footer" style="border:none;padding:0">
              <button type="button" onclick="closeRenewDetail()" class="btn btn-outline">انصراف</button>
              <button type="submit" class="btn btn-primary">💾 ثبت تمدید</button>
            </div>
          </form>
        </div>
      </div>
    </div>`,

    scripts: `<script>
    let _detailCurrentExpiry = '${customer.expiry_date}';
    function openRenewDetail(id, name, currentExpiry) {
      _detailCurrentExpiry = currentExpiry;
      document.getElementById('renew-d-name').textContent = name;
      document.getElementById('renew-d-current').textContent = currentExpiry;
      document.getElementById('renew-d-form').action = '/pppoe/' + id + '/renew';
      setDetailPreset(1);
      toggleDetailPkg();
      document.getElementById('renew-modal-detail').classList.add('open');
    }
    function closeRenewDetail() {
      document.getElementById('renew-modal-detail').classList.remove('open');
    }
    function setDetailPreset(months) {
      const base = _detailCurrentExpiry || new Date().toISOString().split('T')[0];
      const d = new Date(base);
      d.setMonth(d.getMonth() + months);
      document.getElementById('renew-d-new-expiry').value = d.toISOString().split('T')[0];
    }
    function toggleDetailPkg() {
      const isLimited = document.getElementById('d-pkg-limited').checked;
      document.getElementById('d-quota-group').style.display = isLimited ? '' : 'none';
      document.getElementById('d-quota').required = isLimited;
      document.getElementById('dl-unlimited').style.borderColor = !isLimited ? 'var(--primary)' : 'var(--border)';
      document.getElementById('dl-limited').style.borderColor   =  isLimited ? 'var(--primary)' : 'var(--border)';
    }
    // Init
    toggleDetailPkg();
    // Auto-show banners for redirect results
    const _params = new URLSearchParams(location.search);
    if (_params.get('renewed') === '1') {
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:1rem;left:50%;transform:translateX(-50%);background:var(--success);color:#fff;padding:.65rem 1.4rem;border-radius:10px;font-size:.9rem;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,.2)';
      banner.textContent = '✅ تمدید با موفقیت ثبت شد';
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 3500);
      history.replaceState(null, '', location.pathname);
    }
    if (_params.get('renew_error') === '1') {
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:1rem;left:50%;transform:translateX(-50%);background:var(--danger);color:#fff;padding:.65rem 1.4rem;border-radius:10px;font-size:.9rem;z-index:9999;box-shadow:0 4px 15px rgba(0,0,0,.2)';
      banner.textContent = '❌ خطا در ثبت تمدید — لطفاً دوباره تلاش کنید';
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 5000);
      history.replaceState(null, '', location.pathname);
    }
    </script>`
  }));
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
// POST /pppoe/:id/renew — Renew (advance expiry_date + log renewal)
// Phase 2: logs renewal into pppoe_renewals table.
// ============================================================
pppoe.post('/:id/renew', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));

  const form = await c.req.formData();
  const new_expiry    = form.get('new_expiry')?.toString() ?? '';
  if (!new_expiry) return c.redirect('/pppoe');

  // New package fields submitted from the renew modal
  const new_pkg_type  = form.get('package_type')?.toString() === 'limited' ? 'limited' : 'unlimited';
  const new_speed     = Math.min(10, Math.max(1, parseInt(form.get('speed_mbps')?.toString() ?? '4') || 4));
  const new_quota     = new_pkg_type === 'limited' ? (parseFloat(form.get('quota_gb')?.toString() ?? '0') || null) : null;
  const new_price     = parseFloat(form.get('monthly_price')?.toString() ?? '0') || 0;
  const renew_notes   = form.get('renew_notes')?.toString().trim() || null;

  // Fetch old values for history (also acts as ownership check)
  const oldCustomer = await c.env.DB.prepare(
    'SELECT expiry_date, monthly_price, package_type, speed_mbps, quota_gb FROM pppoe_customers WHERE id=? AND company_id=?'
  ).bind(id, user.company_id).first<{expiry_date:string; monthly_price:number; package_type:string; speed_mbps:number; quota_gb:number|null}>();
  if (!oldCustomer) return c.redirect('/pppoe');

  // Run both writes in batch for atomicity
  try {
    await c.env.DB.batch([
      // Update customer: expiry + package details + price
      c.env.DB.prepare(`
        UPDATE pppoe_customers
        SET expiry_date=?, package_type=?, speed_mbps=?, quota_gb=?,
            monthly_price=?, last_renewed_at=datetime('now'), status='active'
        WHERE id=? AND company_id=?`)
        .bind(new_expiry, new_pkg_type, new_speed, new_quota, new_price, id, user.company_id),

      // Log renewal with full package snapshot
      c.env.DB.prepare(`
        INSERT INTO pppoe_renewals
          (customer_id, company_id, previous_expiry, new_expiry,
           monthly_price, package_type, speed_mbps, quota_gb, notes, renewed_by)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .bind(id, user.company_id, oldCustomer.expiry_date, new_expiry,
              new_price, new_pkg_type, new_speed, new_quota, renew_notes, user.id),
    ]);
  } catch (e: any) {
    console.error('PPPoE renew error:', e);
    // Redirect back with error flag instead of crashing to 500 HTML
    return c.redirect(`/pppoe/${id}?renew_error=1`);
  }

  // Redirect back to detail page with success flag
  return c.redirect(`/pppoe/${id}?renewed=1`);
});

// ============================================================
// GET /pppoe/:id/renewals — JSON renewal history for modal
// (mounted at /pppoe, so full path = /pppoe/:id/renewals)
// ============================================================
pppoe.get('/:id/renewals', async (c) => {
  const user = c.get('user');
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const exists = await c.env.DB.prepare(
    'SELECT id FROM pppoe_customers WHERE id=? AND company_id=?'
  ).bind(id, user.company_id).first<{id:number}>();
  if (!exists) return c.json({ error: 'Not found' }, 404);

  const result = await c.env.DB.prepare(`
    SELECT renewed_at, previous_expiry, new_expiry,
           monthly_price, package_type, speed_mbps, quota_gb, notes
    FROM pppoe_renewals
    WHERE customer_id=?
    ORDER BY renewed_at DESC
    LIMIT 100`)
    .bind(id).all<any>();

  return c.json({ renewals: result.results ?? [] });
});

// NOTE: DELETE /api/pppoe/:id is handled in index.ts (app root)
// because pppoe.ts is mounted at /pppoe, so a delete defined here
// would resolve to /pppoe/api/pppoe/:id — never matching /api/pppoe/:id.

export default pppoe;
