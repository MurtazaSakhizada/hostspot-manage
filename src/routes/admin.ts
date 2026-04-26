// ============================================
// Admin Routes: Branches, Packages, Users
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';
import { formatMoney } from '../lib/calc';
import { hashPassword } from '../lib/auth';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const admin = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ============ BRANCHES ============
admin.get('/branches', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/dashboard');

  const items = await c.env.DB.prepare(`
    SELECT b.*,
      (SELECT COUNT(*) FROM sales WHERE branch_id=b.id AND company_id=b.company_id) as sale_count
    FROM branches b WHERE b.company_id=? ORDER BY b.created_at DESC`).bind(user.company_id).all<any>();

  const rows = (items.results||[]).map((b: any) => `
    <tr>
      <td><strong>${b.name}</strong></td>
      <td>${b.sale_count}</td>
      <td><span class="badge badge-${b.active?'success':'danger'}">${t(lang, b.active?'active':'inactive')}</span></td>
      <td>
        <button onclick="editBranch(${b.id},'${b.name.replace(/'/g,"\\'")}',${b.active})" class="btn btn-outline btn-sm">${t(lang,'edit')}</button>
        <button onclick="confirmDelete('/api/branches/${b.id}','${t(lang,'confirm_delete')}')" class="btn btn-danger btn-sm">${t(lang,'delete')}</button>
      </td>
    </tr>`).join('');

  return c.html(pageShell({
    title: t(lang,'branches'), lang, user, activePage: 'branches',
    body: `
    <div class="page-header">
      <div class="page-title">🏢 ${t(lang,'branches')}</div>
      <button onclick="document.getElementById('add-modal').classList.add('open')" class="btn btn-primary">+ ${t(lang,'add_branch')}</button>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>${t(lang,'name')}</th>
            <th>Sales</th>
            <th>${t(lang,'status')}</th>
            <th>${t(lang,'actions')}</th>
          </tr></thead>
          <tbody>${rows||`<tr><td colspan="4"><div class="empty-state"><div class="empty-state-icon">🏢</div><h3>${t(lang,'no_data')}</h3></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <!-- Add Modal -->
    <div class="modal-overlay" id="add-modal">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">+ ${t(lang,'add_branch')}</div>
          <button class="modal-close" onclick="document.getElementById('add-modal').classList.remove('open')">✕</button>
        </div>
        <form method="POST" action="/branches">
          <div class="form-group">
            <label>${t(lang,'name')}</label>
            <input type="text" name="name" required autofocus/>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="document.getElementById('add-modal').classList.remove('open')" class="btn btn-outline">${t(lang,'cancel')}</button>
            <button type="submit" class="btn btn-primary">${t(lang,'save')}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit Modal -->
    <div class="modal-overlay" id="edit-modal">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${t(lang,'edit')} ${t(lang,'branch')}</div>
          <button class="modal-close" onclick="document.getElementById('edit-modal').classList.remove('open')">✕</button>
        </div>
        <form id="edit-form" method="POST">
          <input type="hidden" name="_method" value="PUT"/>
          <div class="form-group">
            <label>${t(lang,'name')}</label>
            <input type="text" name="name" id="edit-name" required/>
          </div>
          <div class="form-group">
            <label>${t(lang,'status')}</label>
            <select name="active" id="edit-active">
              <option value="1">${t(lang,'active')}</option>
              <option value="0">${t(lang,'inactive')}</option>
            </select>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="document.getElementById('edit-modal').classList.remove('open')" class="btn btn-outline">${t(lang,'cancel')}</button>
            <button type="submit" class="btn btn-primary">${t(lang,'save')}</button>
          </div>
        </form>
      </div>
    </div>`,
    scripts: `<script>
    function editBranch(id, name, active) {
      document.getElementById('edit-name').value = name;
      document.getElementById('edit-active').value = active ? '1' : '0';
      document.getElementById('edit-form').action = '/branches/'+id;
      document.getElementById('edit-modal').classList.add('open');
    }
    </script>`
  }));
});

admin.post('/branches', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const form = await c.req.formData();
  const name = form.get('name')?.toString().trim() ?? '';
  if (!name) return c.redirect('/branches');
  await c.env.DB.prepare('INSERT INTO branches (company_id, name) VALUES (?, ?)').bind(user.company_id, name).run();
  return new Response(null, { status: 302, headers: { 'Location': '/branches' } });
});

admin.post('/branches/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  const form = await c.req.formData();
  const name = form.get('name')?.toString().trim() ?? '';
  const active = form.get('active')?.toString() === '1' ? 1 : 0;
  await c.env.DB.prepare('UPDATE branches SET name=?, active=? WHERE id=? AND company_id=?').bind(name, active, id, user.company_id).run();
  return new Response(null, { status: 302, headers: { 'Location': '/branches' } });
});

admin.delete('/api/branches/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM branches WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

// ============ PACKAGES ============
admin.get('/packages', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/dashboard');

  const items = await c.env.DB.prepare('SELECT * FROM packages WHERE company_id=? ORDER BY size_gb ASC').bind(user.company_id).all<any>();

  const rows = (items.results||[]).map((p: any) => `
    <tr>
      <td><strong>${p.name}</strong></td>
      <td class="text-primary font-bold">${p.size_gb} GB</td>
      <td><span class="badge badge-${p.active?'success':'danger'}">${t(lang, p.active?'active':'inactive')}</span></td>
      <td>
        <button onclick="editPkg(${p.id},'${p.name.replace(/'/g,"\\'")}',${p.size_gb},${p.active})" class="btn btn-outline btn-sm">${t(lang,'edit')}</button>
        <button onclick="confirmDelete('/api/packages/${p.id}','${t(lang,'confirm_delete')}')" class="btn btn-danger btn-sm">${t(lang,'delete')}</button>
      </td>
    </tr>`).join('');

  return c.html(pageShell({
    title: t(lang,'packages'), lang, user, activePage: 'packages',
    body: `
    <div class="page-header">
      <div class="page-title">🗂️ ${t(lang,'packages')}</div>
      <button onclick="document.getElementById('add-modal').classList.add('open')" class="btn btn-primary">+ ${t(lang,'add_package')}</button>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>${t(lang,'name')}</th>
            <th>${t(lang,'size_gb')}</th>
            <th>${t(lang,'status')}</th>
            <th>${t(lang,'actions')}</th>
          </tr></thead>
          <tbody>${rows||`<tr><td colspan="4"><div class="empty-state"><div class="empty-state-icon">🗂️</div><h3>${t(lang,'no_data')}</h3></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <!-- Add Modal -->
    <div class="modal-overlay" id="add-modal">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">+ ${t(lang,'add_package')}</div>
          <button class="modal-close" onclick="document.getElementById('add-modal').classList.remove('open')">✕</button>
        </div>
        <form method="POST" action="/packages">
          <div class="form-group">
            <label>${t(lang,'name')}</label>
            <input type="text" name="name" required placeholder="مثال: پکیج ۵ گیگ"/>
          </div>
          <div class="form-group">
            <label>${t(lang,'size_gb')} (GB)</label>
            <input type="number" name="size_gb" min="0.1" step="0.1" required placeholder="5"/>
          </div>
          <div style="padding:.5rem .75rem;background:var(--bg-secondary);border-radius:8px;font-size:.82rem;color:var(--text-muted);margin-bottom:.75rem">
            💡 قیمت فروش به ازای هر GB از <a href="/settings" style="color:var(--primary)">تنظیمات شرکت</a> محاسبه می‌شود.
          </div>
          <div class="modal-footer">
            <button type="button" onclick="document.getElementById('add-modal').classList.remove('open')" class="btn btn-outline">${t(lang,'cancel')}</button>
            <button type="submit" class="btn btn-primary">${t(lang,'save')}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit Modal -->
    <div class="modal-overlay" id="edit-modal">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${t(lang,'edit')} ${t(lang,'package')}</div>
          <button class="modal-close" onclick="document.getElementById('edit-modal').classList.remove('open')">✕</button>
        </div>
        <form id="edit-form" method="POST">
          <div class="form-group">
            <label>${t(lang,'name')}</label>
            <input type="text" name="name" id="edit-name" required/>
          </div>
          <div class="form-group">
            <label>${t(lang,'size_gb')} (GB)</label>
            <input type="number" name="size_gb" id="edit-gb" min="0.1" step="0.1" required/>
          </div>
          <div class="form-group">
            <label>${t(lang,'status')}</label>
            <select name="active" id="edit-active">
              <option value="1">${t(lang,'active')}</option>
              <option value="0">${t(lang,'inactive')}</option>
            </select>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="document.getElementById('edit-modal').classList.remove('open')" class="btn btn-outline">${t(lang,'cancel')}</button>
            <button type="submit" class="btn btn-primary">${t(lang,'save')}</button>
          </div>
        </form>
      </div>
    </div>`,
    scripts: `<script>
    function editPkg(id, name, gb, active) {
      document.getElementById('edit-name').value = name;
      document.getElementById('edit-gb').value = gb;
      document.getElementById('edit-active').value = active ? '1' : '0';
      document.getElementById('edit-form').action = '/packages/'+id;
      document.getElementById('edit-modal').classList.add('open');
    }
    </script>`
  }));
});

admin.post('/packages', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const form = await c.req.formData();
  const name = form.get('name')?.toString().trim() ?? '';
  const size_gb = parseFloat(form.get('size_gb')?.toString() ?? '0');
  // قیمت از تنظیمات شرکت — در DB ذخیره می‌کنیم ولی مقدار 0 (runtime از settings خوانده می‌شود)
  await c.env.DB.prepare('INSERT INTO packages (company_id, name, size_gb, sale_price_per_gb) VALUES (?,?,?,0)').bind(user.company_id, name, size_gb).run();
  return new Response(null, { status: 302, headers: { 'Location': '/packages' } });
});

admin.post('/packages/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  const form = await c.req.formData();
  const name = form.get('name')?.toString().trim() ?? '';
  const size_gb = parseFloat(form.get('size_gb')?.toString() ?? '0');
  const active = form.get('active')?.toString() === '1' ? 1 : 0;
  // قیمت از تنظیمات خوانده می‌شود — فیلد sale_price_per_gb را 0 نگه می‌داریم
  await c.env.DB.prepare('UPDATE packages SET name=?,size_gb=?,active=? WHERE id=? AND company_id=?').bind(name, size_gb, active, id, user.company_id).run();
  return new Response(null, { status: 302, headers: { 'Location': '/packages' } });
});

admin.delete('/api/packages/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM packages WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

// ============ USERS ============
admin.get('/users', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  if (user.role !== 'owner') return c.redirect('/dashboard');

  const [items, branches] = await Promise.all([
    c.env.DB.prepare(`
      SELECT u.*, br.name as branch_name,
        (SELECT COUNT(*) FROM sales WHERE seller_id=u.id AND company_id=u.company_id) as sale_count
      FROM users u
      LEFT JOIN branches br ON br.id = u.branch_id
      WHERE u.company_id=? ORDER BY u.created_at DESC`).bind(user.company_id).all<any>(),
    c.env.DB.prepare(`SELECT id, name FROM branches WHERE company_id=? AND active=1 ORDER BY name`)
      .bind(user.company_id).all<any>(),
  ]);

  const branchOpts = (branches.results||[]).map((b: any) =>
    `<option value="${b.id}">${b.name}</option>`).join('');

  const rows = (items.results||[]).map((u: any) => {
    const branchBadge = u.role==='seller'
      ? (u.branch_name
          ? `<span class="badge badge-info" style="font-size:.72rem">🏢 ${u.branch_name}</span>`
          : `<span style="color:var(--warning);font-size:.78rem">⚠️ بدون شعبه</span>`)
      : '—';
    return `
    <tr>
      <td><strong>${u.full_name}</strong></td>
      <td><code>${u.username}</code></td>
      <td><span class="badge badge-${u.role}">${t(lang, u.role==='owner'?'owner':'seller_role')}</span></td>
      <td>${u.role==='seller' ? `<span class="badge badge-warning">${Math.round(u.commission_rate*100)}%</span>` : '—'}</td>
      <td>${branchBadge}</td>
      <td>${u.sale_count}</td>
      <td><span class="badge badge-${u.active?'success':'danger'}">${t(lang,u.active?'active':'inactive')}</span></td>
      <td>
        ${u.id !== user.id ? `
        <button onclick="editUser(${u.id},'${u.full_name.replace(/'/g,"\\'")}','${u.username}','${u.role}',${u.commission_rate},'${u.language}',${u.active},${u.branch_id||0})" class="btn btn-outline btn-sm">${t(lang,'edit')}</button>
        <button onclick="confirmDelete('/api/users/${u.id}','${t(lang,'confirm_delete')}')" class="btn btn-danger btn-sm">${t(lang,'delete')}</button>` : '<span class="text-gray text-xs">Current user</span>'}
      </td>
    </tr>`;
  }).join('');

  return c.html(pageShell({
    title: t(lang,'users'), lang, user, activePage: 'users',
    body: `
    <div class="page-header">
      <div class="page-title">👥 ${t(lang,'users')}</div>
      <button onclick="document.getElementById('add-modal').classList.add('open')" class="btn btn-primary">+ ${t(lang,'add_user')}</button>
    </div>
    <div class="card">
      <div class="table-wrapper">
        <table>
          <thead><tr>
            <th>${t(lang,'full_name')}</th>
            <th>${t(lang,'username')}</th>
            <th>${t(lang,'role')}</th>
            <th>${t(lang,'commission_rate')}</th>
            <th>🏢 شعبه</th>
            <th>Sales</th>
            <th>${t(lang,'status')}</th>
            <th>${t(lang,'actions')}</th>
          </tr></thead>
          <tbody>${rows||`<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">👥</div><h3>${t(lang,'no_data')}</h3></div></td></tr>`}</tbody>
        </table>
      </div>
    </div>

    <!-- Add User Modal -->
    <div class="modal-overlay" id="add-modal">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">+ ${t(lang,'add_user')}</div>
          <button class="modal-close" onclick="document.getElementById('add-modal').classList.remove('open')">✕</button>
        </div>
        <form method="POST" action="/users">
          <div class="form-row">
            <div class="form-group">
              <label>${t(lang,'full_name')}</label>
              <input type="text" name="full_name" required/>
            </div>
            <div class="form-group">
              <label>${t(lang,'username')}</label>
              <input type="text" name="username" required/>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t(lang,'password')}</label>
              <input type="password" name="password" required minlength="4"/>
            </div>
            <div class="form-group">
              <label>${t(lang,'role')}</label>
              <select name="role" id="add-role" onchange="toggleCommission('add')">
                <option value="seller">${t(lang,'seller_role')}</option>
                <option value="owner">${t(lang,'owner')}</option>
              </select>
            </div>
          </div>
          <div class="form-group" id="add-comm-wrap">
            <label>${t(lang,'commission_rate')} (0–100%)</label>
            <input type="number" name="commission_rate" min="0" max="100" step="0.5" value="15" placeholder="15"/>
            <div class="form-hint">Enter as percentage, e.g. 15 = 15%</div>
          </div>
          <div class="form-group" id="add-branch-wrap">
            <label>🏢 شعبه اختصاصی فروشنده</label>
            <select name="branch_id">
              <option value="">— بدون محدودیت شعبه —</option>
              ${branchOpts}
            </select>
            <div class="form-hint" style="color:var(--warning)">فروشنده فقط در این شعبه می‌تواند فروش، پرداخت و مصرف ثبت کند.</div>
          </div>
          <div class="form-group">
            <label>${t(lang,'language')}</label>
            <select name="language">
              <option value="en">English</option>
              <option value="fa">دری</option>
              <option value="ps">پښتو</option>
            </select>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="document.getElementById('add-modal').classList.remove('open')" class="btn btn-outline">${t(lang,'cancel')}</button>
            <button type="submit" class="btn btn-primary">${t(lang,'save')}</button>
          </div>
        </form>
      </div>
    </div>

    <!-- Edit User Modal -->
    <div class="modal-overlay" id="edit-modal">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">${t(lang,'edit')} ${t(lang,'users')}</div>
          <button class="modal-close" onclick="document.getElementById('edit-modal').classList.remove('open')">✕</button>
        </div>
        <form id="edit-form" method="POST">
          <div class="form-row">
            <div class="form-group">
              <label>${t(lang,'full_name')}</label>
              <input type="text" name="full_name" id="edit-name" required/>
            </div>
            <div class="form-group">
              <label>${t(lang,'username')}</label>
              <input type="text" name="username" id="edit-uname" required/>
            </div>
          </div>
          <div class="form-group">
            <label>New ${t(lang,'password')} (leave blank to keep)</label>
            <input type="password" name="password" minlength="4"/>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t(lang,'role')}</label>
              <select name="role" id="edit-role" onchange="toggleCommission('edit')">
                <option value="seller">${t(lang,'seller_role')}</option>
                <option value="owner">${t(lang,'owner')}</option>
              </select>
            </div>
            <div class="form-group" id="edit-comm-wrap">
              <label>${t(lang,'commission_rate')} (%)</label>
              <input type="number" name="commission_rate" id="edit-comm" min="0" max="100" step="0.5"/>
            </div>
          </div>
          <div class="form-group" id="edit-branch-wrap">
            <label>🏢 شعبه اختصاصی فروشنده</label>
            <select name="branch_id" id="edit-branch">
              <option value="">— بدون محدودیت شعبه —</option>
              ${branchOpts}
            </select>
            <div class="form-hint" style="color:var(--warning)">فروشنده فقط در این شعبه می‌تواند فروش، پرداخت و مصرف ثبت کند.</div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>${t(lang,'language')}</label>
              <select name="language" id="edit-lang">
                <option value="en">English</option>
                <option value="fa">دری</option>
                <option value="ps">پښتو</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t(lang,'status')}</label>
              <select name="active" id="edit-active">
                <option value="1">${t(lang,'active')}</option>
                <option value="0">${t(lang,'inactive')}</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" onclick="document.getElementById('edit-modal').classList.remove('open')" class="btn btn-outline">${t(lang,'cancel')}</button>
            <button type="submit" class="btn btn-primary">${t(lang,'save')}</button>
          </div>
        </form>
      </div>
    </div>`,
    scripts: `<script>
    function toggleCommission(prefix) {
      const role = document.getElementById(prefix+'-role').value;
      const commWrap = document.getElementById(prefix+'-comm-wrap');
      const branchWrap = document.getElementById(prefix+'-branch-wrap');
      if (commWrap)   commWrap.style.display   = role === 'seller' ? 'block' : 'none';
      if (branchWrap) branchWrap.style.display = role === 'seller' ? 'block' : 'none';
    }
    function editUser(id, name, uname, role, rate, lang, active, branchId) {
      document.getElementById('edit-name').value   = name;
      document.getElementById('edit-uname').value  = uname;
      document.getElementById('edit-role').value   = role;
      document.getElementById('edit-comm').value   = Math.round(rate * 100);
      document.getElementById('edit-lang').value   = lang;
      document.getElementById('edit-active').value = active ? '1' : '0';
      const branchSel = document.getElementById('edit-branch');
      if (branchSel) branchSel.value = branchId || '';
      document.getElementById('edit-form').action = '/users/'+id;
      toggleCommission('edit');
      document.getElementById('edit-modal').classList.add('open');
    }
    toggleCommission('add');
    </script>`
  }));
});

admin.post('/users', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const form = await c.req.formData();
  const full_name      = form.get('full_name')?.toString().trim() ?? '';
  const username       = form.get('username')?.toString().trim() ?? '';
  const password       = form.get('password')?.toString() ?? '';
  const role           = form.get('role')?.toString() ?? 'seller';
  const commission_rate = parseFloat(form.get('commission_rate')?.toString() ?? '0') / 100;
  const language       = form.get('language')?.toString() ?? 'en';
  const branch_id_raw  = form.get('branch_id')?.toString() ?? '';
  const branch_id      = branch_id_raw ? parseInt(branch_id_raw) : null;

  const hash = await hashPassword(password);
  try {
    await c.env.DB.prepare(`
      INSERT INTO users (company_id, username, password_hash, full_name, role, commission_rate, language, branch_id)
      VALUES (?,?,?,?,?,?,?,?)`).bind(user.company_id, username, hash, full_name, role, commission_rate, language, branch_id).run();
  } catch (e: any) {
    return c.html(`Error: ${e.message}`, 400);
  }
  return new Response(null, { status: 302, headers: { 'Location': '/users' } });
});

admin.post('/users/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  const form = await c.req.formData();
  const full_name      = form.get('full_name')?.toString().trim() ?? '';
  const username       = form.get('username')?.toString().trim() ?? '';
  const password       = form.get('password')?.toString() ?? '';
  const role           = form.get('role')?.toString() ?? 'seller';
  const commission_rate = parseFloat(form.get('commission_rate')?.toString() ?? '0') / 100;
  const language       = form.get('language')?.toString() ?? 'en';
  const active         = form.get('active')?.toString() === '1' ? 1 : 0;
  const branch_id_raw  = form.get('branch_id')?.toString() ?? '';
  const branch_id      = branch_id_raw ? parseInt(branch_id_raw) : null;

  if (password) {
    const hash = await hashPassword(password);
    await c.env.DB.prepare(`
      UPDATE users SET full_name=?,username=?,password_hash=?,role=?,commission_rate=?,language=?,active=?,branch_id=?
      WHERE id=? AND company_id=?`).bind(full_name, username, hash, role, commission_rate, language, active, branch_id, id, user.company_id).run();
  } else {
    await c.env.DB.prepare(`
      UPDATE users SET full_name=?,username=?,role=?,commission_rate=?,language=?,active=?,branch_id=?
      WHERE id=? AND company_id=?`).bind(full_name, username, role, commission_rate, language, active, branch_id, id, user.company_id).run();
  }
  return new Response(null, { status: 302, headers: { 'Location': '/users' } });
});

admin.delete('/api/users/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM users WHERE id=? AND company_id=? AND id != ?').bind(id, user.company_id, user.id).run();
  return c.json({success:true});
});

// ============================================================
// Company Settings  GET/POST /settings
// ============================================================
admin.get('/settings', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');

  // Sellers see a personal settings page (change password only)
  if (user.role !== 'owner') {
    const ok  = c.req.query('ok');
    const err = c.req.query('err');
    const msgHtml = ok  ? `<div class="alert alert-success">✅ ${t(lang,'password_changed_success')}</div>`
      : err ? `<div class="alert alert-error">❌ ${t(lang,'password_wrong')}</div>` : '';
    return c.html(pageShell({
      title: t(lang,'settings'), lang, user, activePage: 'settings',
      body: `
      <div class="page-header">
        <div>
          <div class="page-title">⚙️ ${t(lang,'personal_settings')}</div>
          <div class="page-subtitle">${user.full_name}</div>
        </div>
      </div>
      ${msgHtml}
      <div class="card" style="max-width:480px">
        <div class="card-header">
          <div class="card-title">🔒 ${t(lang,'change_password')}</div>
        </div>
        <div style="padding:1.25rem">
          <form method="POST" action="/settings/change-password">
            <div class="form-group">
              <label>${t(lang,'current_password')}</label>
              <input type="password" name="current_password" required/>
            </div>
            <div class="form-group">
              <label>${t(lang,'new_password')}</label>
              <input type="password" name="new_password" required minlength="6"/>
            </div>
            <div class="form-group">
              <label>${t(lang,'confirm_password')}</label>
              <input type="password" name="confirm_password" required minlength="6"/>
            </div>
            <button type="submit" class="btn btn-primary">💾 ${t(lang,'save')}</button>
          </form>
        </div>
      </div>`    }));
  }

  const company = await c.env.DB.prepare('SELECT * FROM companies WHERE id=?')
    .bind(user.company_id).first<any>();
  const settings = JSON.parse(company?.settings || '{}');
  const purchasePrice = settings.purchase_price_per_gb ?? '';
  const dashMode = settings.dashboard_mode ?? 'owner';

  const ok  = c.req.query('ok');
  const err = c.req.query('err');
  const msgHtml = ok  ? `<div class="alert alert-success">✅ Settings saved successfully.</div>`
    : err === 'invalid' ? `<div class="alert alert-error">❌ Invalid value. Enter a positive number.</div>`
    : '';

  return c.html(pageShell({
    title: 'Company Settings', lang, user, activePage: 'settings',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">⚙️ Company Settings</div>
        <div class="page-subtitle">${company?.name ?? ''}</div>
      </div>
    </div>

    ${msgHtml}

    <!-- Purchase Price Card -->
    <div class="card" style="max-width:520px;margin-bottom:1.25rem">
      <div class="card-header">
        <div class="card-title">📦 Purchase Price Configuration</div>
      </div>
      <div style="padding:1.25rem">
        <form method="POST" action="/settings/purchase-price">
          <div class="form-group">
            <label style="font-weight:600">Purchase Price per GB (افغانی)</label>
            <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:.5rem">
              This is the cost you pay to buy 1 GB of internet from your supplier.
              Used to calculate net profit: <code>Gross Revenue − Commissions − Purchase Cost</code>
            </div>
            <div style="display:flex;gap:.75rem;align-items:center">
              <input type="number" name="purchase_price_per_gb" min="0" step="0.01"
                value="${purchasePrice}"
                placeholder="e.g. 8 or 7.5"
                style="max-width:160px"
                required/>
              <span style="color:var(--text-muted);font-size:.9rem">؋ per GB</span>
            </div>
          </div>
          ${purchasePrice ? `
          <div style="background:var(--bg-tertiary);border-radius:8px;padding:.875rem;margin-bottom:1rem;font-size:.85rem">
            <strong>Current formula example:</strong><br>
            If you sell 1,000 GB at ؋20/GB gross → Revenue = ؋20,000<br>
            Commission (e.g. 10%) = ؋2,000 → After comm: ؋18,000<br>
            Purchase cost (${purchasePrice} × 1,000) = ؋${(parseFloat(purchasePrice)*1000).toLocaleString()}<br>
            <strong style="color:var(--success)">Net Profit = ؋${(18000 - parseFloat(purchasePrice)*1000).toLocaleString()}</strong>
          </div>` : ''}
          <button type="submit" class="btn btn-primary">💾 Save Purchase Price</button>
        </form>
      </div>
    </div>

    <!-- Company Info Card -->
    <div class="card" style="max-width:520px">
      <div class="card-header">
        <div class="card-title">🏢 Company Information</div>
      </div>
      <div style="padding:1.25rem">
        <form method="POST" action="/settings/company-info">
          <div class="form-group">
            <label>Company Name</label>
            <input type="text" name="name" value="${company?.name ?? ''}" required/>
          </div>
          <div class="form-group">
            <label>Default Language</label>
            <select name="default_language">
              <option value="fa" ${company?.default_language==='fa'?'selected':''}>فارسی / دری</option>
              <option value="ps" ${company?.default_language==='ps'?'selected':''}>پښتو</option>
              <option value="en" ${company?.default_language==='en'?'selected':''}>English</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary">💾 Save Company Info</button>
        </form>
      </div>
    </div>

    <!-- Dashboard Mode Card -->
    <div class="card" style="max-width:520px;margin-top:1.25rem">
      <div class="card-header">
        <div class="card-title">📊 Dashboard Mode</div>
      </div>
      <div style="padding:1.25rem">
        <form method="POST" action="/settings/dashboard-mode">
          <div class="form-group">
            <label style="font-weight:600">Investor Dashboard Mode</label>
            <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:.75rem">
              Choose how the owner dashboard displays data. This does NOT affect any existing data.
            </div>
            <div style="display:flex;flex-direction:column;gap:.625rem">
              <label style="display:flex;align-items:flex-start;gap:.625rem;padding:.75rem;border-radius:10px;border:2px solid ${dashMode==='owner'?'var(--primary)':'var(--border)'};cursor:pointer;background:${dashMode==='owner'?'var(--primary-bg,rgba(99,102,241,.07))':'var(--bg-secondary)'}">
                <input type="radio" name="dashboard_mode" value="owner" ${dashMode==='owner'?'checked':''} style="margin-top:.15rem"/>
                <div>
                  <div style="font-weight:600">🏢 Owner Mode (پیش‌فرض)</div>
                  <div style="font-size:.78rem;color:var(--text-muted);margin-top:.2rem">نمای کامل کسب‌وکار: فروش، کمیشن، موجودی، سود خالص</div>
                </div>
              </label>
              <label style="display:flex;align-items:flex-start;gap:.625rem;padding:.75rem;border-radius:10px;border:2px solid ${dashMode==='financial'?'var(--primary)':'var(--border)'};cursor:pointer;background:${dashMode==='financial'?'var(--primary-bg,rgba(99,102,241,.07))':'var(--bg-secondary)'}">
                <input type="radio" name="dashboard_mode" value="financial" ${dashMode==='financial'?'checked':''} style="margin-top:.15rem"/>
                <div>
                  <div style="font-weight:600">💼 Financial Investor Mode</div>
                  <div style="font-size:.78rem;color:var(--text-muted);margin-top:.2rem">تخصیص و پرداخت: GB کل · قیمت کل · پرداختی · باقی‌مانده. بدون داده فروش.</div>
                </div>
              </label>
              <label style="display:flex;align-items:flex-start;gap:.625rem;padding:.75rem;border-radius:10px;border:2px solid ${dashMode==='performance'?'var(--primary)':'var(--border)'};cursor:pointer;background:${dashMode==='performance'?'var(--primary-bg,rgba(99,102,241,.07))':'var(--bg-secondary)'}">
                <input type="radio" name="dashboard_mode" value="performance" ${dashMode==='performance'?'checked':''} style="margin-top:.15rem"/>
                <div>
                  <div style="font-weight:600">📈 Performance Mode</div>
                  <div style="font-size:.78rem;color:var(--text-muted);margin-top:.2rem">تمرکز بر فروش، عملکرد فروشندگان، روند ماهانه</div>
                </div>
              </label>
            </div>
          </div>
          <button type="submit" class="btn btn-primary" style="margin-top:.875rem">💾 Save Dashboard Mode</button>
        </form>
      </div>
    </div>`
  }));
});

// ── POST /settings/change-password  (seller personal password change) ──
admin.post('/settings/change-password', async (c) => {
  const user = c.get('user');
  const form = await c.req.formData();
  const currentPw  = form.get('current_password')?.toString() ?? '';
  const newPw      = form.get('new_password')?.toString() ?? '';
  const confirmPw  = form.get('confirm_password')?.toString() ?? '';

  if (!newPw || newPw !== confirmPw || newPw.length < 6) {
    return new Response(null, { status: 302, headers: { 'Location': '/settings?err=mismatch' } });
  }

  // Verify current password
  const crypto = globalThis.crypto;
  const encoder = new TextEncoder();
  const currentHash = Array.from(new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(currentPw))
  )).map(b=>b.toString(16).padStart(2,'0')).join('');

  const dbUser = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id=?')
    .bind(user.id).first<{password_hash:string}>();
  if (!dbUser || dbUser.password_hash !== currentHash) {
    return new Response(null, { status: 302, headers: { 'Location': '/settings?err=wrong' } });
  }

  const newHash = Array.from(new Uint8Array(
    await crypto.subtle.digest('SHA-256', encoder.encode(newPw))
  )).map(b=>b.toString(16).padStart(2,'0')).join('');

  await c.env.DB.prepare('UPDATE users SET password_hash=? WHERE id=?')
    .bind(newHash, user.id).run();
  return new Response(null, { status: 302, headers: { 'Location': '/settings?ok=1' } });
});

admin.post('/settings/purchase-price', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.redirect('/dashboard');
  const form = await c.req.formData();
  const val = parseFloat(form.get('purchase_price_per_gb')?.toString() ?? '');
  if (isNaN(val) || val < 0) {
    return new Response(null, { status: 302, headers: { 'Location': '/settings?err=invalid' } });
  }
  // Read current settings and merge
  const company = await c.env.DB.prepare('SELECT settings FROM companies WHERE id=?')
    .bind(user.company_id).first<{settings:string}>();
  const settings = JSON.parse(company?.settings || '{}');
  settings.purchase_price_per_gb = val;
  await c.env.DB.prepare('UPDATE companies SET settings=? WHERE id=?')
    .bind(JSON.stringify(settings), user.company_id).run();
  return new Response(null, { status: 302, headers: { 'Location': '/settings?ok=1' } });
});

admin.post('/settings/company-info', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.redirect('/dashboard');
  const form = await c.req.formData();
  const name = form.get('name')?.toString().trim() ?? '';
  const lang = form.get('default_language')?.toString() ?? 'fa';
  if (!name) return new Response(null, { status: 302, headers: { 'Location': '/settings?err=invalid' } });
  await c.env.DB.prepare('UPDATE companies SET name=?, default_language=? WHERE id=?')
    .bind(name, lang, user.company_id).run();
  return new Response(null, { status: 302, headers: { 'Location': '/settings?ok=1' } });
});

// ── POST /settings/dashboard-mode ────────────────────────────
admin.post('/settings/dashboard-mode', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.redirect('/dashboard');
  const form = await c.req.formData();
  const mode = form.get('dashboard_mode')?.toString() ?? 'owner';
  const allowed = ['owner', 'financial', 'performance'];
  if (!allowed.includes(mode)) {
    return new Response(null, { status: 302, headers: { 'Location': '/settings?err=invalid' } });
  }
  const company = await c.env.DB.prepare('SELECT settings FROM companies WHERE id=?')
    .bind(user.company_id).first<{settings:string}>();
  const settings = JSON.parse(company?.settings || '{}');
  settings.dashboard_mode = mode;
  await c.env.DB.prepare('UPDATE companies SET settings=? WHERE id=?')
    .bind(JSON.stringify(settings), user.company_id).run();
  return new Response(null, { status: 302, headers: { 'Location': '/settings?ok=1' } });
});

export default admin;
