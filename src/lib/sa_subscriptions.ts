// ============================================================
// SA Subscription Plans & Company Subscriptions Routes
// /sa/plans          - list + add + edit + delete plans
// /sa/subscriptions  - list all company subscriptions
// /sa/subscriptions/add - assign subscription to company
// /sa/revenue        - revenue stats from subscriptions
// ============================================================

// ── Helpers ─────────────────────────────────────────────────
const fm  = (n: number) => '؋ ' + Math.round(n).toLocaleString();
const fdate = (d: string) => d ? new Date(d).toLocaleDateString('fa-IR') : '—';
const fdateEn = (d: string) => d ? new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—';

function daysLeft(endDate: string): number {
  if (!endDate) return 0;
  const diff = new Date(endDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function subStatusBadge(status: string, endDate: string): string {
  const dl = daysLeft(endDate);
  if (status === 'cancelled') return `<span style="background:#1e293b;color:#64748b;padding:2px 8px;border-radius:99px;font-size:.7rem;font-weight:600">لغو شده</span>`;
  if (status === 'expired' || dl < 0) return `<span style="background:#7f1d1d;color:#fca5a5;padding:2px 8px;border-radius:99px;font-size:.7rem;font-weight:600">منقضی</span>`;
  if (dl <= 7) return `<span style="background:#451a03;color:#fcd34d;padding:2px 8px;border-radius:99px;font-size:.7rem;font-weight:600">⚠️ ${dl} روز</span>`;
  return `<span style="background:#064e3b;color:#6ee7b7;padding:2px 8px;border-radius:99px;font-size:.7rem;font-weight:600">✓ ${dl} روز مانده</span>`;
}

// ── GET /sa/plans ────────────────────────────────────────────
export async function handlePlansGet(db: any, admin: any, url: URL, saShell: Function, saNav: Function): Promise<string> {
  const ok  = url.searchParams.get('ok');
  const err = url.searchParams.get('err');

  const plans = await db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM company_subscriptions cs WHERE cs.plan_id=p.id) as total_subs,
      (SELECT COUNT(*) FROM company_subscriptions cs WHERE cs.plan_id=p.id AND cs.status='active' AND cs.end_date >= date('now')) as active_subs,
      (SELECT COALESCE(SUM(cs.amount_paid),0) FROM company_subscriptions cs WHERE cs.plan_id=p.id) as total_revenue
    FROM subscription_plans p
    ORDER BY p.sort_order, p.id`).all<any>();

  const rows = (plans.results || []).map((p: any) => {
    const features = (() => { try { return JSON.parse(p.features); } catch { return []; } })();
    return `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:.6rem">
          <div style="width:12px;height:12px;border-radius:50%;background:${p.color};flex-shrink:0"></div>
          <div>
            <div style="font-weight:600;color:#f1f5f9">${p.name}</div>
            <div style="font-size:.72rem;color:#64748b">${p.name_en}</div>
          </div>
        </div>
      </td>
      <td style="color:#fbbf24;font-weight:700">${fm(p.price)}</td>
      <td style="color:#94a3b8">${p.duration_days} روز</td>
      <td style="color:#94a3b8">${p.max_sellers >= 999 ? '∞' : p.max_sellers} فروشنده · ${p.max_branches >= 999 ? '∞' : p.max_branches} شعبه</td>
      <td>
        <div style="display:flex;flex-wrap:wrap;gap:.25rem">
          ${features.slice(0,2).map((f: string) => `<span style="background:#0f172a;border:1px solid #334155;border-radius:4px;padding:1px 6px;font-size:.68rem;color:#94a3b8">${f}</span>`).join('')}
          ${features.length > 2 ? `<span style="color:#64748b;font-size:.72rem">+${features.length-2}</span>` : ''}
        </div>
      </td>
      <td style="color:#6ee7b7">${p.active_subs}</td>
      <td style="color:#a78bfa;font-weight:600">${fm(p.total_revenue)}</td>
      <td><span class="${p.is_active ? 'badge-active' : 'badge-inactive'}">${p.is_active ? 'فعال' : 'غیرفعال'}</span></td>
      <td>
        <div style="display:flex;gap:.35rem">
          <button onclick="openEditPlan(${JSON.stringify(JSON.stringify(p))})" class="sa-btn sa-btn-ghost sa-btn-sm">✏️ ویرایش</button>
          <button onclick="saDeletePlan(${p.id},'${p.name}')" class="sa-btn sa-btn-danger sa-btn-sm">🗑️</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  const body = saNav('plans', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">📦 مدیریت پلن‌های اشتراک</div>
      <button onclick="openModal('add-plan-modal')" class="sa-btn sa-btn-primary">+ پلن جدید</button>
    </div>
    <div class="sa-content">
      ${ok === '1' ? '<div class="sa-alert sa-alert-success">✅ پلن با موفقیت ذخیره شد</div>' : ''}
      ${ok === 'd' ? '<div class="sa-alert sa-alert-success">🗑️ پلن حذف شد</div>' : ''}
      ${err ? `<div class="sa-alert sa-alert-error">❌ ${err}</div>` : ''}

      <div class="sa-card" style="overflow:auto">
        <table class="sa-table">
          <thead><tr>
            <th>نام پلن</th><th>قیمت ماهانه</th><th>مدت</th><th>محدودیت</th>
            <th>امکانات</th><th>اشتراک‌های فعال</th><th>درآمد کل</th><th>وضعیت</th><th>عملیات</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="9" style="text-align:center;color:#64748b;padding:2rem">هنوز پلنی ثبت نشده</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ADD PLAN MODAL -->
  <div class="modal-overlay" id="add-plan-modal">
    <div class="modal-box" style="max-width:560px">
      <div class="modal-header">
        <div class="modal-title">➕ افزودن پلن جدید</div>
        <button class="modal-close" onclick="closeModal('add-plan-modal')">✕</button>
      </div>
      <form method="POST" action="/sa/plans/add">
        <div class="sa-form-row">
          <div class="sa-form-group">
            <label>نام پلن (فارسی) *</label>
            <input type="text" name="name" required placeholder="مثال: پلن پایه" dir="rtl"/>
          </div>
          <div class="sa-form-group">
            <label>Plan Name (English)</label>
            <input type="text" name="name_en" placeholder="e.g. Basic Plan"/>
          </div>
        </div>
        <div class="sa-form-row">
          <div class="sa-form-group">
            <label>قیمت (افغانی ؋) *</label>
            <input type="number" name="price" required min="0" step="50" placeholder="1000"/>
          </div>
          <div class="sa-form-group">
            <label>مدت اعتبار (روز) *</label>
            <input type="number" name="duration_days" required min="1" value="30"/>
          </div>
        </div>
        <div class="sa-form-row">
          <div class="sa-form-group">
            <label>حداکثر فروشنده</label>
            <input type="number" name="max_sellers" min="1" value="5"/>
          </div>
          <div class="sa-form-group">
            <label>حداکثر شعبه</label>
            <input type="number" name="max_branches" min="1" value="2"/>
          </div>
        </div>
        <div class="sa-form-group">
          <label>امکانات (هر خط یک مورد)</label>
          <textarea name="features_text" rows="3" dir="rtl" placeholder="تا ۵ فروشنده&#10;تا ۲ شعبه&#10;پشتیبانی ایمیل"></textarea>
        </div>
        <div class="sa-form-row">
          <div class="sa-form-group">
            <label>رنگ نشان</label>
            <input type="color" name="color" value="#4f46e5" style="height:40px;padding:.2rem"/>
          </div>
          <div class="sa-form-group">
            <label>ترتیب نمایش</label>
            <input type="number" name="sort_order" min="0" value="0"/>
          </div>
        </div>
        <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:1rem">
          <button type="button" onclick="closeModal('add-plan-modal')" class="sa-btn sa-btn-ghost">لغو</button>
          <button type="submit" class="sa-btn sa-btn-primary">💾 ذخیره پلن</button>
        </div>
      </form>
    </div>
  </div>

  <!-- EDIT PLAN MODAL -->
  <div class="modal-overlay" id="edit-plan-modal">
    <div class="modal-box" style="max-width:560px">
      <div class="modal-header">
        <div class="modal-title">✏️ ویرایش پلن</div>
        <button class="modal-close" onclick="closeModal('edit-plan-modal')">✕</button>
      </div>
      <form method="POST" id="edit-plan-form" action="">
        <div class="sa-form-row">
          <div class="sa-form-group">
            <label>نام پلن (فارسی) *</label>
            <input type="text" name="name" id="ep-name" required dir="rtl"/>
          </div>
          <div class="sa-form-group">
            <label>Plan Name (English)</label>
            <input type="text" name="name_en" id="ep-name-en"/>
          </div>
        </div>
        <div class="sa-form-row">
          <div class="sa-form-group">
            <label>قیمت (افغانی ؋) *</label>
            <input type="number" name="price" id="ep-price" required min="0" step="50"/>
          </div>
          <div class="sa-form-group">
            <label>مدت اعتبار (روز) *</label>
            <input type="number" name="duration_days" id="ep-duration" required min="1"/>
          </div>
        </div>
        <div class="sa-form-row">
          <div class="sa-form-group">
            <label>حداکثر فروشنده</label>
            <input type="number" name="max_sellers" id="ep-sellers" min="1"/>
          </div>
          <div class="sa-form-group">
            <label>حداکثر شعبه</label>
            <input type="number" name="max_branches" id="ep-branches" min="1"/>
          </div>
        </div>
        <div class="sa-form-group">
          <label>امکانات (هر خط یک مورد)</label>
          <textarea name="features_text" id="ep-features" rows="3" dir="rtl"></textarea>
        </div>
        <div class="sa-form-row">
          <div class="sa-form-group">
            <label>رنگ نشان</label>
            <input type="color" name="color" id="ep-color" style="height:40px;padding:.2rem"/>
          </div>
          <div class="sa-form-group">
            <label>ترتیب نمایش</label>
            <input type="number" name="sort_order" id="ep-sort" min="0"/>
          </div>
        </div>
        <div class="sa-form-group">
          <label>وضعیت</label>
          <select name="is_active" id="ep-active">
            <option value="1">✅ فعال</option>
            <option value="0">⏸ غیرفعال</option>
          </select>
        </div>
        <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:1rem">
          <button type="button" onclick="closeModal('edit-plan-modal')" class="sa-btn sa-btn-ghost">لغو</button>
          <button type="submit" class="sa-btn sa-btn-primary">💾 ذخیره تغییرات</button>
        </div>
      </form>
    </div>
  </div>`;

  return saShell('Plans', body, `<script>
function openEditPlan(jsonStr) {
  const p = JSON.parse(jsonStr);
  document.getElementById('edit-plan-form').action = '/sa/plans/' + p.id + '/edit';
  document.getElementById('ep-name').value = p.name || '';
  document.getElementById('ep-name-en').value = p.name_en || '';
  document.getElementById('ep-price').value = p.price || 0;
  document.getElementById('ep-duration').value = p.duration_days || 30;
  document.getElementById('ep-sellers').value = p.max_sellers || 5;
  document.getElementById('ep-branches').value = p.max_branches || 2;
  document.getElementById('ep-color').value = p.color || '#4f46e5';
  document.getElementById('ep-sort').value = p.sort_order || 0;
  document.getElementById('ep-active').value = p.is_active ? '1' : '0';
  try {
    const feats = JSON.parse(p.features || '[]');
    document.getElementById('ep-features').value = feats.join('\\n');
  } catch { document.getElementById('ep-features').value = ''; }
  openModal('edit-plan-modal');
}
function saDeletePlan(id, name) {
  if (!confirm('حذف پلن "' + name + '"؟ اشتراک‌های فعال تحت تأثیر قرار نمی‌گیرند.')) return;
  fetch('/sa/plans/' + id + '/delete', {method:'POST'}).then(r=>r.json()).then(d=>{
    if(d.success) location.href='/sa/plans?ok=d';
    else alert(d.error || 'خطا');
  });
}
</script>`);
}

// ── GET /sa/subscriptions ─────────────────────────────────────
export async function handleSubscriptionsGet(db: any, admin: any, url: URL, saShell: Function, saNav: Function): Promise<string> {
  const ok  = url.searchParams.get('ok');
  const filterStatus = url.searchParams.get('status') ?? 'all';
  const filterCompany = url.searchParams.get('company') ?? '';

  let whereClause = 'WHERE 1=1';
  const binds: any[] = [];
  if (filterStatus === 'active') { whereClause += ` AND cs.status='active' AND cs.end_date >= date('now')`; }
  else if (filterStatus === 'expired') { whereClause += ` AND (cs.status='expired' OR cs.end_date < date('now'))`; }
  else if (filterStatus === 'cancelled') { whereClause += ` AND cs.status='cancelled'`; }
  if (filterCompany) { whereClause += ` AND c.name LIKE ?`; binds.push('%' + filterCompany + '%'); }

  const [subs, plans, companies] = await Promise.all([
    db.prepare(`
      SELECT cs.*, c.name as company_name, p.name as plan_name, p.color as plan_color,
        p.price as plan_price, p.duration_days
      FROM company_subscriptions cs
      JOIN companies c ON c.id=cs.company_id
      JOIN subscription_plans p ON p.id=cs.plan_id
      ${whereClause}
      ORDER BY cs.created_at DESC LIMIT 200`).bind(...binds).all<any>(),
    db.prepare('SELECT id, name, color FROM subscription_plans WHERE is_active=1 ORDER BY sort_order').all<any>(),
    db.prepare('SELECT id, name FROM companies ORDER BY name').all<any>(),
  ]);

  // KPI totals
  const kpi = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status='active' AND end_date >= date('now') THEN 1 ELSE 0 END) as active_count,
      SUM(CASE WHEN end_date < date('now') THEN 1 ELSE 0 END) as expired_count,
      SUM(amount_paid) as total_revenue,
      SUM(CASE WHEN end_date >= date('now') AND end_date <= date('now','+7 days') AND status='active' THEN 1 ELSE 0 END) as expiring_soon
    FROM company_subscriptions`).first<any>();

  const rows = (subs.results || []).map((s: any) => `
    <tr>
      <td>
        <div style="font-weight:600;color:#f1f5f9">${s.company_name}</div>
      </td>
      <td>
        <div style="display:flex;align-items:center;gap:.4rem">
          <div style="width:8px;height:8px;border-radius:50%;background:${s.plan_color};flex-shrink:0"></div>
          <span style="color:#c7d2fe">${s.plan_name}</span>
        </div>
      </td>
      <td style="color:#94a3b8;font-size:.82rem">${fdateEn(s.start_date)}</td>
      <td style="color:#94a3b8;font-size:.82rem">${fdateEn(s.end_date)}</td>
      <td>${subStatusBadge(s.status, s.end_date)}</td>
      <td style="color:#fbbf24;font-weight:600">${fm(s.amount_paid)}</td>
      <td style="color:#64748b;font-size:.78rem">${s.payment_method || 'cash'}</td>
      <td style="color:#64748b;font-size:.78rem;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.payment_note || '—'}</td>
      <td>
        <div style="display:flex;gap:.35rem;align-items:center">
          <button onclick="openRenewModal(${s.company_id},'${s.company_name.replace(/\'/g,"\\\\\'")}',${s.plan_id})" 
                  class="sa-btn sa-btn-success sa-btn-sm">🔄 تمدید</button>
          <button data-sub-id="${s.id}" onclick="saDeleteSub(${s.id},'${s.company_name.replace(/\'/g,"\\\\\'")}')"
                  class="sa-btn sa-btn-danger sa-btn-sm" title="حذف اشتراک">🗑️</button>
        </div>
      </td>
    </tr>`).join('');

  const companyOptions = (companies.results || []).map((c: any) =>
    `<option value="${c.id}">${c.name}</option>`).join('');
  const planOptions = (plans.results || []).map((p: any) =>
    `<option value="${p.id}">${p.name}</option>`).join('');

  const body = saNav('subscriptions', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">🔖 مدیریت اشتراک‌ها</div>
      <button onclick="openModal('add-sub-modal')" class="sa-btn sa-btn-primary">+ اشتراک جدید</button>
    </div>
    <div class="sa-content">
      ${ok === '1' ? '<div class="sa-alert sa-alert-success">✅ اشتراک با موفقیت ثبت شد</div>' : ''}

      <!-- KPIs -->
      <div class="kpi-grid" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:1.25rem">
        <div class="kpi-card">
          <div class="kpi-label">کل اشتراک‌ها</div>
          <div class="kpi-value" style="color:#a78bfa">${kpi?.total ?? 0}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">اشتراک‌های فعال</div>
          <div class="kpi-value" style="color:#6ee7b7">${kpi?.active_count ?? 0}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">منقضی شده</div>
          <div class="kpi-value" style="color:#fca5a5">${kpi?.expired_count ?? 0}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">رو به انقضا (۷ روز)</div>
          <div class="kpi-value" style="color:#fcd34d">${kpi?.expiring_soon ?? 0}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">درآمد کل</div>
          <div class="kpi-value" style="color:#fbbf24;font-size:1.4rem">${fm(kpi?.total_revenue ?? 0)}</div>
        </div>
      </div>

      <!-- Filters -->
      <div style="display:flex;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap;align-items:center">
        <form method="GET" style="display:flex;gap:.5rem;flex-wrap:wrap">
          <input type="text" name="company" value="${filterCompany}" placeholder="جستجو شرکت..."
            style="padding:.45rem .75rem;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#f1f5f9;font-size:.82rem"/>
          <select name="status" style="padding:.45rem .75rem;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#f1f5f9;font-size:.82rem">
            <option value="all" ${filterStatus==='all'?'selected':''}>همه وضعیت‌ها</option>
            <option value="active" ${filterStatus==='active'?'selected':''}>فعال</option>
            <option value="expired" ${filterStatus==='expired'?'selected':''}>منقضی</option>
            <option value="cancelled" ${filterStatus==='cancelled'?'selected':''}>لغو شده</option>
          </select>
          <button type="submit" class="sa-btn sa-btn-ghost sa-btn-sm">🔍 فیلتر</button>
        </form>
      </div>

      <div class="sa-card" style="overflow:auto">
        <table class="sa-table">
          <thead><tr>
            <th>شرکت</th><th>پلن</th><th>شروع</th><th>پایان</th>
            <th>وضعیت</th><th>مبلغ</th><th>روش</th><th>یادداشت</th><th style="min-width:140px">عملیات</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="9" style="text-align:center;color:#64748b;padding:2rem">اشتراکی ثبت نشده</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- ADD SUBSCRIPTION MODAL -->
  <div class="modal-overlay" id="add-sub-modal">
    <div class="modal-box" style="max-width:500px">
      <div class="modal-header">
        <div class="modal-title">➕ ثبت اشتراک جدید</div>
        <button class="modal-close" onclick="closeModal('add-sub-modal')">✕</button>
      </div>
      <form method="POST" action="/sa/subscriptions/add">
        <div class="sa-form-group">
          <label>شرکت *</label>
          <select name="company_id" required id="new-sub-company">${companyOptions}</select>
        </div>
        <div class="sa-form-group">
          <label>پلن اشتراک *</label>
          <select name="plan_id" required id="new-sub-plan" onchange="updatePlanPrice(this)">${planOptions}</select>
        </div>
        <div class="sa-form-row">
          <div class="sa-form-group">
            <label>تاریخ شروع *</label>
            <input type="date" name="start_date" id="new-sub-start" required value="${new Date().toISOString().split('T')[0]}"/>
          </div>
          <div class="sa-form-group">
            <label>مبلغ پرداخت شده (؋) *</label>
            <input type="number" name="amount_paid" id="new-sub-amount" required min="0" step="50" placeholder="مبلغ"/>
          </div>
        </div>
        <div class="sa-form-group">
          <label>روش پرداخت</label>
          <select name="payment_method">
            <option value="cash">💵 نقد</option>
            <option value="bank">🏦 بانک</option>
            <option value="card">💳 کارت</option>
            <option value="mobile">📱 موبایل‌پی</option>
            <option value="other">سایر</option>
          </select>
        </div>
        <div class="sa-form-group">
          <label>یادداشت</label>
          <input type="text" name="payment_note" placeholder="اختیاری" dir="rtl"/>
        </div>
        <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:1rem">
          <button type="button" onclick="closeModal('add-sub-modal')" class="sa-btn sa-btn-ghost">لغو</button>
          <button type="submit" class="sa-btn sa-btn-primary">💾 ثبت اشتراک</button>
        </div>
      </form>
    </div>
  </div>

  <!-- RENEW MODAL -->
  <div class="modal-overlay" id="renew-sub-modal">
    <div class="modal-box" style="max-width:500px">
      <div class="modal-header">
        <div class="modal-title">🔄 تمدید اشتراک</div>
        <button class="modal-close" onclick="closeModal('renew-sub-modal')">✕</button>
      </div>
      <form method="POST" action="/sa/subscriptions/add" id="renew-form">
        <input type="hidden" name="company_id" id="renew-company-id"/>
        <div class="sa-form-group">
          <label>شرکت</label>
          <input type="text" id="renew-company-name" readonly style="background:#0f172a;color:#94a3b8"/>
        </div>
        <div class="sa-form-group">
          <label>پلن اشتراک *</label>
          <select name="plan_id" id="renew-plan" onchange="updateRenewPrice(this)">${planOptions}</select>
        </div>
        <div class="sa-form-row">
          <div class="sa-form-group">
            <label>تاریخ شروع *</label>
            <input type="date" name="start_date" id="renew-start" required value="${new Date().toISOString().split('T')[0]}"/>
          </div>
          <div class="sa-form-group">
            <label>مبلغ پرداخت شده (؋) *</label>
            <input type="number" name="amount_paid" id="renew-amount" required min="0" step="50"/>
          </div>
        </div>
        <div class="sa-form-group">
          <label>روش پرداخت</label>
          <select name="payment_method">
            <option value="cash">💵 نقد</option>
            <option value="bank">🏦 بانک</option>
            <option value="card">💳 کارت</option>
            <option value="mobile">📱 موبایل‌پی</option>
            <option value="other">سایر</option>
          </select>
        </div>
        <div class="sa-form-group">
          <label>یادداشت</label>
          <input type="text" name="payment_note" placeholder="اختیاری" dir="rtl"/>
        </div>
        <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:1rem">
          <button type="button" onclick="closeModal('renew-sub-modal')" class="sa-btn sa-btn-ghost">لغو</button>
          <button type="submit" class="sa-btn sa-btn-success">🔄 تمدید اشتراک</button>
        </div>
      </form>
    </div>
  </div>`;

  // Plan prices for JS
  const planPricesJs = JSON.stringify(
    Object.fromEntries((plans.results || []).map((p: any) => [p.id, p.price]))
  );

  return saShell('Subscriptions', body, `<script>
const PLAN_PRICES = ${planPricesJs};
function updatePlanPrice(sel) {
  const price = PLAN_PRICES[sel.value] || 0;
  document.getElementById('new-sub-amount').value = price;
}
function updateRenewPrice(sel) {
  const price = PLAN_PRICES[sel.value] || 0;
  document.getElementById('renew-amount').value = price;
}
function openRenewModal(companyId, companyName, planId) {
  document.getElementById('renew-company-id').value = companyId;
  document.getElementById('renew-company-name').value = companyName;
  const planSel = document.getElementById('renew-plan');
  if (planSel) { planSel.value = planId; updateRenewPrice(planSel); }
  openModal('renew-sub-modal');
}
// Auto-set price on page load
document.addEventListener('DOMContentLoaded', function() {
  const planSel = document.getElementById('new-sub-plan');
  if (planSel) updatePlanPrice(planSel);
});
function saDeleteSub(id, companyName) {
  if (!confirm('حذف اشتراک شرکت "' + companyName + '"?\nاین عملیات قابل بازگشت نیست.')) return;
  fetch('/sa/api/subscriptions/' + id, { method: 'DELETE' })
    .then(r => r.json())
    .then(d => {
      if (d.success) {
        const btn = document.querySelector('[data-sub-id="' + id + '"]');
        if (btn) btn.closest('tr').remove();
        else location.reload();
      } else {
        alert(d.error || 'خطا در حذف اشتراک');
      }
    })
    .catch(() => alert('خطا در اتصال به سرور'));
}
</script>`);
}

// ── GET /sa/revenue ──────────────────────────────────────────
export async function handleRevenueGet(db: any, admin: any, url: URL, saShell: Function, saNav: Function): Promise<string> {
  const year = parseInt(url.searchParams.get('year') ?? new Date().getFullYear().toString());

  const [kpi, byPlan, byMonth, recentSubs, topCompanies] = await Promise.all([
    // Overall KPIs
    db.prepare(`
      SELECT
        COALESCE(SUM(amount_paid),0) as total_revenue,
        COALESCE(SUM(CASE WHEN strftime('%Y',created_at)=? THEN amount_paid ELSE 0 END),0) as year_revenue,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m',created_at)=strftime('%Y-%m','now') THEN amount_paid ELSE 0 END),0) as month_revenue,
        COUNT(*) as total_subs,
        COUNT(CASE WHEN status='active' AND end_date>=date('now') THEN 1 END) as active_subs
      FROM company_subscriptions`).bind(year.toString()).first<any>(),

    // Revenue by plan
    db.prepare(`
      SELECT p.name, p.color, p.price,
        COUNT(cs.id) as sub_count,
        COALESCE(SUM(cs.amount_paid),0) as revenue
      FROM subscription_plans p
      LEFT JOIN company_subscriptions cs ON cs.plan_id=p.id
      GROUP BY p.id ORDER BY revenue DESC`).all<any>(),

    // Monthly revenue (selected year)
    db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month,
        COALESCE(SUM(amount_paid),0) as revenue,
        COUNT(*) as cnt
      FROM company_subscriptions
      WHERE strftime('%Y', created_at) = ?
      GROUP BY month ORDER BY month ASC`).bind(year.toString()).all<any>(),

    // Recent 10 subscriptions
    db.prepare(`
      SELECT cs.amount_paid, cs.payment_method, cs.created_at, cs.start_date, cs.end_date,
        c.name as company_name, p.name as plan_name, p.color as plan_color
      FROM company_subscriptions cs
      JOIN companies c ON c.id=cs.company_id
      JOIN subscription_plans p ON p.id=cs.plan_id
      ORDER BY cs.created_at DESC LIMIT 10`).all<any>(),

    // Top 5 companies by subscription spend
    db.prepare(`
      SELECT c.name,
        COALESCE(SUM(cs.amount_paid),0) as total_paid,
        COUNT(cs.id) as sub_count,
        MAX(cs.end_date) as latest_end
      FROM companies c
      LEFT JOIN company_subscriptions cs ON cs.company_id=c.id
      GROUP BY c.id ORDER BY total_paid DESC LIMIT 5`).all<any>(),
  ]);

  // Chart: monthly revenue array (12 months)
  const months12 = Array.from({length:12}, (_,i) => `${year}-${String(i+1).padStart(2,'0')}`);
  const monthMap = Object.fromEntries((byMonth.results||[]).map((r:any) => [r.month, r]));
  const chartRevData = JSON.stringify(months12.map(m => Math.round(monthMap[m]?.revenue ?? 0)));
  const chartCntData = JSON.stringify(months12.map(m => monthMap[m]?.cnt ?? 0));
  const chartLabels  = JSON.stringify(['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند']);

  // Plan revenue bars
  const planBars = (byPlan.results||[]).map((p:any) => {
    const pct = kpi?.total_revenue > 0 ? Math.round((p.revenue / kpi.total_revenue) * 100) : 0;
    return `
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.75rem">
      <div style="width:12px;height:12px;border-radius:50%;background:${p.color};flex-shrink:0"></div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;margin-bottom:.25rem">
          <span style="color:#e2e8f0;font-size:.82rem;font-weight:600">${p.name}</span>
          <span style="color:#fbbf24;font-size:.82rem;font-weight:700">${fm(p.revenue)}</span>
        </div>
        <div style="height:6px;background:#0f172a;border-radius:3px">
          <div style="width:${pct}%;height:100%;background:${p.color};border-radius:3px;transition:width .5s"></div>
        </div>
        <div style="color:#64748b;font-size:.72rem;margin-top:.2rem">${p.sub_count} اشتراک · ${pct}% از کل</div>
      </div>
    </div>`;
  }).join('');

  const recentRows = (recentSubs.results||[]).map((s:any) => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:.4rem">
          <div style="width:8px;height:8px;border-radius:50%;background:${s.plan_color};flex-shrink:0"></div>
          <span style="color:#f1f5f9;font-weight:600">${s.company_name}</span>
        </div>
      </td>
      <td style="color:#c7d2fe">${s.plan_name}</td>
      <td style="color:#fbbf24;font-weight:700">${fm(s.amount_paid)}</td>
      <td style="color:#94a3b8;font-size:.78rem">${s.payment_method || 'cash'}</td>
      <td style="color:#94a3b8;font-size:.78rem">${fdateEn(s.start_date)} → ${fdateEn(s.end_date)}</td>
      <td style="color:#64748b;font-size:.78rem">${fdateEn(s.created_at)}</td>
    </tr>`).join('');

  const topRows = (topCompanies.results||[]).map((c:any, i:number) => {
    const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
    return `
    <tr>
      <td style="text-align:center;font-size:1rem">${medals[i]||i+1}</td>
      <td style="color:#f1f5f9;font-weight:600">${c.name}</td>
      <td style="color:#fbbf24;font-weight:700">${fm(c.total_paid)}</td>
      <td style="color:#94a3b8">${c.sub_count} اشتراک</td>
      <td style="color:#94a3b8;font-size:.78rem">${c.latest_end ? fdateEn(c.latest_end) : '—'}</td>
    </tr>`;
  }).join('');

  const yearOptions = [year-1, year, year+1].map(y =>
    `<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('');

  const body = saNav('revenue', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">📊 آمار درآمد اشتراک‌ها</div>
      <form method="GET" style="display:flex;align-items:center;gap:.5rem">
        <label style="color:#94a3b8;font-size:.82rem">سال:</label>
        <select name="year" onchange="this.form.submit()"
          style="padding:.35rem .65rem;background:#0f172a;border:1px solid #334155;border-radius:6px;color:#f1f5f9;font-size:.82rem">
          ${yearOptions}
        </select>
      </form>
    </div>
    <div class="sa-content">

      <!-- KPIs -->
      <div class="kpi-grid">
        <div class="kpi-card" style="border-color:#7c3aed50">
          <div class="kpi-label">💰 کل درآمد</div>
          <div class="kpi-value" style="color:#a78bfa;font-size:1.6rem">${fm(kpi?.total_revenue ?? 0)}</div>
          <div class="kpi-sub">از ابتدا تاکنون</div>
        </div>
        <div class="kpi-card" style="border-color:#059669">
          <div class="kpi-label">📅 درآمد ${year}</div>
          <div class="kpi-value" style="color:#6ee7b7;font-size:1.6rem">${fm(kpi?.year_revenue ?? 0)}</div>
          <div class="kpi-sub">سال جاری</div>
        </div>
        <div class="kpi-card" style="border-color:#0891b2">
          <div class="kpi-label">🗓 درآمد این ماه</div>
          <div class="kpi-value" style="color:#67e8f9;font-size:1.6rem">${fm(kpi?.month_revenue ?? 0)}</div>
          <div class="kpi-sub">ماه جاری</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">🔖 اشتراک‌های فعال</div>
          <div class="kpi-value" style="color:#fbbf24">${kpi?.active_subs ?? 0}</div>
          <div class="kpi-sub">از ${kpi?.total_subs ?? 0} کل</div>
        </div>
      </div>

      <!-- Charts + Plan breakdown -->
      <div style="display:grid;grid-template-columns:1fr 340px;gap:1rem;margin-bottom:1.5rem">
        <!-- Monthly Chart -->
        <div class="sa-card">
          <div style="color:#94a3b8;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:1rem">
            📈 درآمد ماهانه — ${year}
          </div>
          <canvas id="revenueChart" height="160"></canvas>
        </div>
        <!-- Plan breakdown -->
        <div class="sa-card">
          <div style="color:#94a3b8;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:1rem">
            📦 درآمد بر اساس پلن
          </div>
          ${planBars || '<p style="color:#64748b;font-size:.85rem">داده‌ای موجود نیست</p>'}
        </div>
      </div>

      <!-- Recent + Top Companies -->
      <div style="display:grid;grid-template-columns:1fr 380px;gap:1rem">
        <!-- Recent subscriptions -->
        <div class="sa-card">
          <div style="color:#94a3b8;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:1rem">
            🕐 آخرین اشتراک‌های ثبت شده
          </div>
          <div style="overflow:auto">
            <table class="sa-table">
              <thead><tr>
                <th>شرکت</th><th>پلن</th><th>مبلغ</th><th>روش</th><th>دوره</th><th>تاریخ</th>
              </tr></thead>
              <tbody>${recentRows || '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:1rem">داده‌ای موجود نیست</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <!-- Top companies -->
        <div class="sa-card">
          <div style="color:#94a3b8;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin-bottom:1rem">
            🏆 برترین شرکت‌ها (درآمدزا)
          </div>
          <table class="sa-table">
            <thead><tr><th>#</th><th>شرکت</th><th>پرداخت کل</th><th>اشتراک</th><th>پایان</th></tr></thead>
            <tbody>${topRows || '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:1rem">داده‌ای موجود نیست</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;

  return saShell('Revenue', body, `
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
  const ctx = document.getElementById('revenueChart');
  if(ctx) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${chartLabels},
        datasets: [
          { label: 'درآمد (؋)', data: ${chartRevData},
            backgroundColor: 'rgba(124,58,237,.6)', borderColor: '#7c3aed',
            borderWidth: 1.5, borderRadius: 4, yAxisID: 'y' },
          { label: 'تعداد', data: ${chartCntData},
            type: 'line', borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,.15)',
            borderWidth: 2, tension: 0.4, fill: true, yAxisID: 'y2' }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
        scales: {
          x: { grid: { color: '#334155' }, ticks: { color: '#64748b', font: { size: 10 } } },
          y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8', font: { size: 10 },
            callback: v => '؋' + Math.round(v).toLocaleString() }, position: 'left' },
          y2: { grid: { display: false }, ticks: { color: '#fbbf24', font: { size: 10 } }, position: 'right' }
        }
      }
    });
  }
  </script>`);
}
