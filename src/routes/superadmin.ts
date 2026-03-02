// ============================================
// Super Admin Routes
// /sa/login, /sa/logout, /sa/dashboard
// /sa/companies, /sa/companies/add
// /sa/companies/:id/toggle
// /sa/admins (manage super admins themselves)
// ============================================
import { Hono } from 'hono';
import {
  hashPassword, parseCookies,
  createSuperAdminSession, getSuperAdminSession, deleteSuperAdminSession
} from '../lib/auth';

type Bindings = { DB: D1Database };

const sa = new Hono<{ Bindings: Bindings }>();

// ============================================================
// SA Auth Middleware - MUST be first, before all routes
// Allows /sa/login and /sa/logout without auth
// ============================================================
sa.use('/sa/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/sa/login' || path === '/sa/logout') return next();

  const cookies = parseCookies(c.req.header('Cookie') ?? null);
  const admin = await getSuperAdminSession(c.env.DB, cookies.sa_session);
  if (!admin) {
    return new Response(null, { status: 302, headers: { 'Location': '/sa/login' } });
  }
  c.set('sa_admin' as any, admin);
  return next();
});

// ============================================================
// Helper: Shell for super admin pages (standalone, no sidebar)
// ============================================================
function saShell(title: string, body: string, scripts = ''): string {
  return `<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title} — Super Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/static/style.css"/>
  <style>
    .sa-layout { display:flex; min-height:100vh; background:#0f172a; }
    .sa-sidebar {
      width:240px; background:#1e293b; padding:0;
      display:flex; flex-direction:column; flex-shrink:0;
      border-right:1px solid #334155;
    }
    .sa-sidebar-header {
      padding:1.5rem 1.25rem 1rem;
      border-bottom:1px solid #334155;
    }
    .sa-brand { display:flex; align-items:center; gap:.6rem; color:#f1f5f9; font-size:1rem; font-weight:700; }
    .sa-brand-icon { font-size:1.4rem; }
    .sa-badge { background:#7c3aed; color:#fff; font-size:.6rem; font-weight:700; padding:2px 6px; border-radius:99px; letter-spacing:.04em; text-transform:uppercase; }
    .sa-nav { flex:1; padding:.75rem .75rem; display:flex; flex-direction:column; gap:.25rem; }
    .sa-nav-link {
      display:flex; align-items:center; gap:.625rem; padding:.55rem .875rem;
      border-radius:8px; color:#94a3b8; text-decoration:none; font-size:.875rem; font-weight:500;
      transition:all .15s;
    }
    .sa-nav-link:hover { background:#334155; color:#f1f5f9; }
    .sa-nav-link.active { background:#4f46e5; color:#fff; }
    .sa-sidebar-footer { padding:1rem .75rem; border-top:1px solid #334155; }
    .sa-user { display:flex; align-items:center; gap:.6rem; margin-bottom:.75rem; }
    .sa-avatar { width:34px; height:34px; background:#7c3aed; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-size:.85rem; font-weight:700; flex-shrink:0; }
    .sa-user-name { color:#f1f5f9; font-size:.85rem; font-weight:600; }
    .sa-user-role { color:#94a3b8; font-size:.7rem; }
    .sa-main { flex:1; display:flex; flex-direction:column; overflow:auto; }
    .sa-topbar { background:#1e293b; padding:.875rem 1.5rem; border-bottom:1px solid #334155; display:flex; justify-content:space-between; align-items:center; }
    .sa-topbar-title { color:#f1f5f9; font-size:1rem; font-weight:600; }
    .sa-content { flex:1; padding:1.5rem; }
    .sa-card { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:1.25rem; }
    .sa-card-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; }
    .sa-card-title { color:#f1f5f9; font-size:.95rem; font-weight:600; }
    .sa-stat-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; margin-bottom:1.5rem; }
    .sa-stat { background:#1e293b; border:1px solid #334155; border-radius:12px; padding:1.25rem; }
    .sa-stat-label { color:#94a3b8; font-size:.75rem; font-weight:500; text-transform:uppercase; letter-spacing:.05em; margin-bottom:.5rem; }
    .sa-stat-value { color:#f1f5f9; font-size:1.75rem; font-weight:700; }
    .sa-table { width:100%; border-collapse:collapse; }
    .sa-table th { color:#94a3b8; font-size:.75rem; font-weight:600; text-transform:uppercase; letter-spacing:.05em; padding:.625rem .875rem; text-align:left; border-bottom:1px solid #334155; }
    .sa-table td { color:#e2e8f0; font-size:.875rem; padding:.75rem .875rem; border-bottom:1px solid #1e293b; }
    .sa-table tr:hover td { background:#0f172a40; }
    .sa-badge-active { background:#064e3b; color:#6ee7b7; padding:2px 8px; border-radius:99px; font-size:.7rem; font-weight:600; }
    .sa-badge-inactive { background:#7f1d1d; color:#fca5a5; padding:2px 8px; border-radius:99px; font-size:.7rem; font-weight:600; }
    .sa-btn { display:inline-flex; align-items:center; gap:.35rem; padding:.4rem .75rem; border-radius:6px; font-size:.8rem; font-weight:600; cursor:pointer; border:none; text-decoration:none; transition:all .15s; }
    .sa-btn-primary { background:#4f46e5; color:#fff; }
    .sa-btn-primary:hover { background:#4338ca; }
    .sa-btn-danger { background:#7f1d1d; color:#fca5a5; }
    .sa-btn-danger:hover { background:#991b1b; color:#fff; }
    .sa-btn-warning { background:#451a03; color:#fcd34d; }
    .sa-btn-warning:hover { background:#78350f; color:#fff; }
    .sa-btn-success { background:#064e3b; color:#6ee7b7; }
    .sa-btn-success:hover { background:#065f46; color:#fff; }
    .sa-btn-ghost { background:transparent; color:#94a3b8; border:1px solid #334155; }
    .sa-btn-ghost:hover { background:#334155; color:#f1f5f9; }
    .sa-form-group { margin-bottom:1rem; }
    .sa-form-group label { display:block; color:#94a3b8; font-size:.8rem; font-weight:500; margin-bottom:.4rem; }
    .sa-form-group input, .sa-form-group select {
      width:100%; padding:.6rem .875rem; background:#0f172a; border:1px solid #334155;
      border-radius:8px; color:#f1f5f9; font-size:.875rem; outline:none;
    }
    .sa-form-group input:focus, .sa-form-group select:focus { border-color:#4f46e5; }
    .sa-form-row { display:grid; grid-template-columns:1fr 1fr; gap:.875rem; }
    .sa-alert { padding:.75rem 1rem; border-radius:8px; margin-bottom:1rem; font-size:.875rem; }
    .sa-alert-error { background:#7f1d1d; color:#fca5a5; border:1px solid #991b1b; }
    .sa-alert-success { background:#064e3b; color:#6ee7b7; border:1px solid #065f46; }
    /* Login page */
    .sa-login-wrap { min-height:100vh; background:#0f172a; display:flex; align-items:center; justify-content:center; }
    .sa-login-card { background:#1e293b; border:1px solid #334155; border-radius:16px; padding:2.5rem; width:100%; max-width:380px; }
    .sa-login-logo { text-align:center; margin-bottom:2rem; }
    .sa-login-logo .icon { font-size:2.5rem; display:block; margin-bottom:.75rem; }
    .sa-login-logo h1 { color:#f1f5f9; font-size:1.3rem; font-weight:700; margin:0 0 .25rem; }
    .sa-login-logo p { color:#94a3b8; font-size:.85rem; margin:0; }
  </style>
</head>
<body>
${body}
<script>
function saConfirmToggle(url, name, action) {
  if (confirm('Are you sure you want to ' + action + ' company "' + name + '"?')) {
    fetch(url, {method:'POST'}).then(r=>r.json()).then(d=>{
      if(d.success) location.reload();
      else alert(d.error||'Error');
    });
  }
}
function saConfirmDelete(url, name) {
  if (confirm('Permanently delete "' + name + '"? This cannot be undone.')) {
    fetch(url, {method:'DELETE'}).then(r=>r.json()).then(d=>{
      if(d.success) location.reload();
      else alert(d.error||'Error');
    });
  }
}
</script>
${scripts}
</body>
</html>`;
}

function saNav(active: string, adminName: string): string {
  const links = [
    { href: '/sa/dashboard', label: '🏠 Dashboard', key: 'dashboard' },
    { href: '/sa/companies', label: '🏢 Companies', key: 'companies' },
    { href: '/sa/admins', label: '🔑 Super Admins', key: 'admins' },
  ];
  const navHtml = links.map(l =>
    `<a href="${l.href}" class="sa-nav-link ${active === l.key ? 'active' : ''}">${l.label}</a>`
  ).join('');

  return `
  <div class="sa-layout">
    <aside class="sa-sidebar">
      <div class="sa-sidebar-header">
        <div class="sa-brand">
          <span class="sa-brand-icon">📶</span>
          <span>HotSpot</span>
          <span class="sa-badge">SUPER</span>
        </div>
      </div>
      <nav class="sa-nav">${navHtml}</nav>
      <div class="sa-sidebar-footer">
        <div class="sa-user">
          <div class="sa-avatar">${adminName.charAt(0).toUpperCase()}</div>
          <div>
            <div class="sa-user-name">${adminName}</div>
            <div class="sa-user-role">Super Administrator</div>
          </div>
        </div>
        <a href="/sa/logout" class="sa-btn sa-btn-ghost" style="width:100%;justify-content:center;">⏻ Logout</a>
      </div>
    </aside>
    <div class="sa-main">`;
}

// ============================================================
// SA Login
// ============================================================
sa.get('/sa/login', (c) => {
  const url = new URL(c.req.url);
  const error = url.searchParams.get('error') ?? '';
  const errorMsg = error === 'invalid' ? 'Invalid username or password'
    : error === 'required' ? 'Username and password required' : '';
  const html = saShell('Login', `
  <div class="sa-login-wrap">
    <div class="sa-login-card">
      <div class="sa-login-logo">
        <span class="icon">⚙️</span>
        <h1>Super Admin</h1>
        <p>HotSpot Manager Platform</p>
      </div>
      ${errorMsg ? `<div class="sa-alert sa-alert-error">${errorMsg}</div>` : ''}
      <form method="POST" action="/sa/login">
        <div class="sa-form-group">
          <label>Username</label>
          <input type="text" name="username" required autofocus placeholder="super_admin" autocomplete="username"/>
        </div>
        <div class="sa-form-group">
          <label>Password</label>
          <input type="password" name="password" required placeholder="••••••••" autocomplete="current-password"/>
        </div>
        <button type="submit" class="sa-btn sa-btn-primary" style="width:100%;justify-content:center;padding:.7rem;font-size:.9rem;">Sign In</button>
      </form>
      <div style="text-align:center;margin-top:1.5rem;">
        <a href="/login" style="color:#94a3b8;font-size:.8rem;">← Back to Tenant Login</a>
      </div>
    </div>
  </div>`);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=UTF-8' } });
});

sa.post('/sa/login', async (c) => {
  const form = await c.req.formData();
  const username = form.get('username')?.toString().trim() ?? '';
  const password = form.get('password')?.toString() ?? '';

  if (!username || !password) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/sa/login?error=required' }
    });
  }

  const hash = await hashPassword(password);
  const admin = await c.env.DB.prepare(
    `SELECT id, username, full_name FROM super_admins WHERE username=? AND password_hash=? AND active=1`
  ).bind(username, hash).first<{ id: number; username: string; full_name: string }>();

  if (!admin) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/sa/login?error=invalid' }
    });
  }

  const sessionId = await createSuperAdminSession(c.env.DB, admin.id);
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/sa/dashboard',
      'Set-Cookie': `sa_session=${sessionId}; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=604800`
    }
  });
});

sa.get('/sa/logout', async (c) => {
  const cookies = parseCookies(c.req.header('Cookie') ?? null);
  if (cookies.sa_session) {
    await deleteSuperAdminSession(c.env.DB, cookies.sa_session);
  }
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/sa/login',
      'Set-Cookie': 'sa_session=; Path=/; HttpOnly; SameSite=None; Secure; Max-Age=0'
    }
  });
});

// ============================================================
// SA Dashboard
// ============================================================
sa.get('/sa/dashboard', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };

  const [companiesRow, usersRow, salesRow] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as count FROM companies').first<{count:number}>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{count:number}>(),
    c.env.DB.prepare('SELECT COUNT(*) as count FROM sales').first<{count:number}>(),
  ]);

  const recentCompanies = await c.env.DB.prepare(`
    SELECT c.id, c.name, c.slug, c.default_language, c.created_at,
      (SELECT COUNT(*) FROM users WHERE company_id=c.id) as user_count,
      (SELECT COUNT(*) FROM sales WHERE company_id=c.id) as sale_count
    FROM companies c ORDER BY c.created_at DESC LIMIT 5`).all<any>();

  const rows = (recentCompanies.results||[]).map((co: any) => `
    <tr>
      <td><strong style="color:#f1f5f9">${co.name}</strong></td>
      <td><code style="color:#94a3b8;font-size:.8rem">${co.slug}</code></td>
      <td style="color:#94a3b8">${co.user_count}</td>
      <td style="color:#94a3b8">${co.sale_count}</td>
      <td><a href="/sa/companies" class="sa-btn sa-btn-ghost" style="padding:.25rem .6rem;font-size:.75rem">Manage</a></td>
    </tr>`).join('');

  const html = saShell('Dashboard', saNav('dashboard', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">Platform Overview</div>
      <a href="/sa/companies/add" class="sa-btn sa-btn-primary">+ Add Company</a>
    </div>
    <div class="sa-content">
      <div class="sa-stat-grid">
        <div class="sa-stat">
          <div class="sa-stat-label">Total Companies</div>
          <div class="sa-stat-value">${companiesRow?.count ?? 0}</div>
        </div>
        <div class="sa-stat">
          <div class="sa-stat-label">Total Users</div>
          <div class="sa-stat-value">${usersRow?.count ?? 0}</div>
        </div>
        <div class="sa-stat">
          <div class="sa-stat-label">Total Sales</div>
          <div class="sa-stat-value">${salesRow?.count ?? 0}</div>
        </div>
      </div>
      <div class="sa-card">
        <div class="sa-card-header">
          <div class="sa-card-title">Recent Companies</div>
          <a href="/sa/companies" class="sa-btn sa-btn-ghost" style="font-size:.8rem">View All →</a>
        </div>
        <table class="sa-table">
          <thead><tr>
            <th>Company</th><th>Slug</th><th>Users</th><th>Sales</th><th>Actions</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:2rem">No companies yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </div></div>`);
  return c.html(html);
});

// ============================================================
// SA Companies List
// ============================================================
sa.get('/sa/companies', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };

  const items = await c.env.DB.prepare(`
    SELECT c.id, c.name, c.slug, c.default_language, c.created_at,
      (SELECT COUNT(*) FROM users WHERE company_id=c.id) as user_count,
      (SELECT COUNT(*) FROM branches WHERE company_id=c.id) as branch_count,
      (SELECT COUNT(*) FROM sales WHERE company_id=c.id) as sale_count
    FROM companies c ORDER BY c.created_at DESC`).all<any>();

  const rows = (items.results||[]).map((co: any) => `
    <tr>
      <td>
        <strong style="color:#f1f5f9">${co.name}</strong><br/>
        <span style="color:#64748b;font-size:.75rem">${new Date(co.created_at).toLocaleDateString()}</span>
      </td>
      <td><code style="color:#818cf8;font-size:.82rem">${co.slug}</code></td>
      <td style="color:#94a3b8">${co.default_language.toUpperCase()}</td>
      <td style="color:#94a3b8">${co.user_count}</td>
      <td style="color:#94a3b8">${co.branch_count}</td>
      <td style="color:#94a3b8">${co.sale_count}</td>
      <td>
        <a href="/sa/companies/${co.id}/edit" class="sa-btn sa-btn-ghost" style="margin-right:.4rem">✏️ Edit</a>
        <button onclick="saConfirmDelete('/sa/api/companies/${co.id}','${co.name.replace(/'/g, "\\'")}')" class="sa-btn sa-btn-danger">🗑 Delete</button>
      </td>
    </tr>`).join('');

  const html = saShell('Companies', saNav('companies', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">Manage Companies (Tenants)</div>
      <a href="/sa/companies/add" class="sa-btn sa-btn-primary">+ Add Company</a>
    </div>
    <div class="sa-content">
      <div class="sa-card">
        <table class="sa-table">
          <thead><tr>
            <th>Company</th><th>Slug</th><th>Lang</th><th>Users</th><th>Branches</th><th>Sales</th><th>Actions</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:2rem">No companies yet. <a href="/sa/companies/add" style="color:#818cf8">Add the first one →</a></td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </div></div>`);
  return c.html(html);
});

// ============================================================
// SA Add Company (GET)
// ============================================================
sa.get('/sa/companies/add', (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const html = saShell('Add Company', saNav('companies', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">Add New Company</div>
      <a href="/sa/companies" class="sa-btn sa-btn-ghost">← Back</a>
    </div>
    <div class="sa-content">
      <div class="sa-card" style="max-width:520px">
        <div class="sa-card-title" style="margin-bottom:1.25rem">🏢 Company Details</div>
        <form method="POST" action="/sa/companies/add">
          <div class="sa-form-row">
            <div class="sa-form-group">
              <label>Company Name *</label>
              <input type="text" name="company_name" required placeholder="My HotSpot Co."/>
            </div>
            <div class="sa-form-group">
              <label>Slug (unique URL ID) *</label>
              <input type="text" name="slug" required placeholder="my-hotspot" pattern="[a-z0-9-]+" title="lowercase, numbers, hyphens"/>
            </div>
          </div>
          <div class="sa-form-group">
            <label>Default Language</label>
            <select name="default_language">
              <option value="en">English</option>
              <option value="fa">دری (Dari)</option>
              <option value="ps">پښتو (Pashto)</option>
            </select>
          </div>
          <hr style="border-color:#334155;margin:1.25rem 0"/>
          <div class="sa-card-title" style="margin-bottom:1rem">👤 Owner Account</div>
          <div class="sa-form-row">
            <div class="sa-form-group">
              <label>Owner Full Name *</label>
              <input type="text" name="full_name" required placeholder="John Doe"/>
            </div>
            <div class="sa-form-group">
              <label>Username *</label>
              <input type="text" name="username" required placeholder="owner"/>
            </div>
          </div>
          <div class="sa-form-group">
            <label>Password *</label>
            <input type="password" name="password" required minlength="6" placeholder="Min 6 characters"/>
          </div>
          <div style="display:flex;gap:.75rem;margin-top:1.5rem">
            <a href="/sa/companies" class="sa-btn sa-btn-ghost">Cancel</a>
            <button type="submit" class="sa-btn sa-btn-primary" style="flex:1;justify-content:center">✓ Create Company</button>
          </div>
        </form>
      </div>
    </div>
  </div></div>`);
  return c.html(html);
});

// ============================================================
// SA Add Company (POST)
// ============================================================
sa.post('/sa/companies/add', async (c) => {
  const form = await c.req.formData();
  const companyName = form.get('company_name')?.toString().trim() ?? '';
  const slug = form.get('slug')?.toString().trim().toLowerCase() ?? '';
  const defaultLanguage = form.get('default_language')?.toString() ?? 'en';
  const fullName = form.get('full_name')?.toString().trim() ?? '';
  const username = form.get('username')?.toString().trim() ?? '';
  const password = form.get('password')?.toString() ?? '';

  if (!companyName || !slug || !fullName || !username || !password) {
    return c.html('Missing required fields', 400);
  }

  const hash = await hashPassword(password);
  try {
    const company = await c.env.DB.prepare(
      'INSERT INTO companies (name, slug, default_language) VALUES (?, ?, ?) RETURNING id'
    ).bind(companyName, slug, defaultLanguage).first<{id:number}>();

    if (!company) throw new Error('Failed to create company');

    await c.env.DB.prepare(
      'INSERT INTO users (company_id, username, password_hash, full_name, role, commission_rate, language) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(company.id, username, hash, fullName, 'owner', 0, defaultLanguage).run();

    await c.env.DB.prepare(
      'INSERT INTO branches (company_id, name) VALUES (?, ?)'
    ).bind(company.id, 'Main Branch').run();

    return new Response(null, { status: 302, headers: { 'Location': '/sa/companies?added=1' } });
  } catch (e: any) {
    return c.html(`<p style="color:red">Error: ${e.message}. Slug might already exist.</p><a href="/sa/companies/add">← Go back</a>`, 400);
  }
});

// ============================================================
// SA Edit Company (GET)
// ============================================================
sa.get('/sa/companies/:id/edit', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const id = c.req.param('id');

  const co = await c.env.DB.prepare('SELECT * FROM companies WHERE id=?').bind(id).first<any>();
  if (!co) return c.html('Company not found', 404);

  const html = saShell('Edit Company', saNav('companies', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">Edit Company: ${co.name}</div>
      <a href="/sa/companies" class="sa-btn sa-btn-ghost">← Back</a>
    </div>
    <div class="sa-content">
      <div class="sa-card" style="max-width:480px">
        <form method="POST" action="/sa/companies/${id}/edit">
          <div class="sa-form-group">
            <label>Company Name *</label>
            <input type="text" name="company_name" required value="${co.name}"/>
          </div>
          <div class="sa-form-group">
            <label>Slug</label>
            <input type="text" name="slug" required value="${co.slug}" pattern="[a-z0-9-]+" title="lowercase, numbers, hyphens"/>
          </div>
          <div class="sa-form-group">
            <label>Default Language</label>
            <select name="default_language">
              <option value="en" ${co.default_language==='en'?'selected':''}>English</option>
              <option value="fa" ${co.default_language==='fa'?'selected':''}>دری (Dari)</option>
              <option value="ps" ${co.default_language==='ps'?'selected':''}>پښتو (Pashto)</option>
            </select>
          </div>
          <div style="display:flex;gap:.75rem;margin-top:1.5rem">
            <a href="/sa/companies" class="sa-btn sa-btn-ghost">Cancel</a>
            <button type="submit" class="sa-btn sa-btn-primary" style="flex:1;justify-content:center">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  </div></div>`);
  return c.html(html);
});

sa.post('/sa/companies/:id/edit', async (c) => {
  const id = c.req.param('id');
  const form = await c.req.formData();
  const companyName = form.get('company_name')?.toString().trim() ?? '';
  const slug = form.get('slug')?.toString().trim().toLowerCase() ?? '';
  const defaultLanguage = form.get('default_language')?.toString() ?? 'en';

  try {
    await c.env.DB.prepare(
      'UPDATE companies SET name=?, slug=?, default_language=? WHERE id=?'
    ).bind(companyName, slug, defaultLanguage, id).run();
    return new Response(null, { status: 302, headers: { 'Location': '/sa/companies' } });
  } catch (e: any) {
    return c.html(`Error: ${e.message}`, 400);
  }
});

// ============================================================
// SA Delete Company (API)
// ============================================================
sa.delete('/sa/api/companies/:id', async (c) => {
  const id = c.req.param('id');
  try {
    // Delete all related data
    await c.env.DB.prepare('DELETE FROM sessions WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM payments WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM sales WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM allocations WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM inventory WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM packages WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM branches WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM users WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM companies WHERE id=?').bind(id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================================
// SA Manage Super Admins
// ============================================================
sa.get('/sa/admins', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };

  const items = await c.env.DB.prepare(
    'SELECT id, username, full_name, active, created_at FROM super_admins ORDER BY created_at DESC'
  ).all<any>();

  const rows = (items.results||[]).map((a: any) => `
    <tr>
      <td><strong style="color:#f1f5f9">${a.full_name}</strong></td>
      <td><code style="color:#94a3b8">${a.username}</code></td>
      <td><span class="${a.active ? 'sa-badge-active' : 'sa-badge-inactive'}">${a.active ? 'Active' : 'Inactive'}</span></td>
      <td style="color:#64748b;font-size:.8rem">${new Date(a.created_at).toLocaleDateString()}</td>
      <td>
        ${a.id !== admin.id ? `
        <a href="/sa/admins/${a.id}/edit" class="sa-btn sa-btn-ghost" style="margin-right:.4rem">✏️ Edit</a>
        <button onclick="saConfirmDelete('/sa/api/admins/${a.id}','${a.username}')" class="sa-btn sa-btn-danger">🗑 Delete</button>
        ` : '<span style="color:#64748b;font-size:.8rem">Current admin</span>'}
      </td>
    </tr>`).join('');

  const html = saShell('Super Admins', saNav('admins', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">Super Administrators</div>
      <button onclick="document.getElementById('add-admin-modal').style.display='flex'" class="sa-btn sa-btn-primary">+ Add Super Admin</button>
    </div>
    <div class="sa-content">
      <div class="sa-card">
        <table class="sa-table">
          <thead><tr><th>Name</th><th>Username</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:2rem">No super admins</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </div></div>

  <!-- Add Admin Modal -->
  <div id="add-admin-modal" style="display:none;position:fixed;inset:0;background:#00000080;align-items:center;justify-content:center;z-index:999">
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px;padding:2rem;width:100%;max-width:420px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem">
        <h3 style="color:#f1f5f9;margin:0">Add Super Admin</h3>
        <button onclick="document.getElementById('add-admin-modal').style.display='none'" style="background:none;border:none;color:#94a3b8;font-size:1.2rem;cursor:pointer">✕</button>
      </div>
      <form method="POST" action="/sa/admins/add">
        <div class="sa-form-group">
          <label>Full Name *</label>
          <input type="text" name="full_name" required placeholder="Admin Name"/>
        </div>
        <div class="sa-form-row">
          <div class="sa-form-group">
            <label>Username *</label>
            <input type="text" name="username" required placeholder="superadmin2"/>
          </div>
          <div class="sa-form-group">
            <label>Password *</label>
            <input type="password" name="password" required minlength="6" placeholder="••••••••"/>
          </div>
        </div>
        <div style="display:flex;gap:.75rem;margin-top:1.25rem">
          <button type="button" onclick="document.getElementById('add-admin-modal').style.display='none'" class="sa-btn sa-btn-ghost">Cancel</button>
          <button type="submit" class="sa-btn sa-btn-primary" style="flex:1;justify-content:center">Create</button>
        </div>
      </form>
    </div>
  </div>`);
  return c.html(html);
});

sa.post('/sa/admins/add', async (c) => {
  const form = await c.req.formData();
  const fullName = form.get('full_name')?.toString().trim() ?? '';
  const username = form.get('username')?.toString().trim() ?? '';
  const password = form.get('password')?.toString() ?? '';

  if (!fullName || !username || !password) {
    return c.html('Missing fields', 400);
  }

  const hash = await hashPassword(password);
  try {
    await c.env.DB.prepare(
      'INSERT INTO super_admins (username, password_hash, full_name) VALUES (?, ?, ?)'
    ).bind(username, hash, fullName).run();
    return new Response(null, { status: 302, headers: { 'Location': '/sa/admins' } });
  } catch (e: any) {
    return c.html(`Error: ${e.message}`, 400);
  }
});

sa.get('/sa/admins/:id/edit', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const id = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT * FROM super_admins WHERE id=?').bind(id).first<any>();
  if (!target) return c.html('Not found', 404);

  const html = saShell('Edit Super Admin', saNav('admins', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">Edit Super Admin</div>
      <a href="/sa/admins" class="sa-btn sa-btn-ghost">← Back</a>
    </div>
    <div class="sa-content">
      <div class="sa-card" style="max-width:420px">
        <form method="POST" action="/sa/admins/${id}/edit">
          <div class="sa-form-group">
            <label>Full Name *</label>
            <input type="text" name="full_name" required value="${target.full_name}"/>
          </div>
          <div class="sa-form-group">
            <label>Username *</label>
            <input type="text" name="username" required value="${target.username}"/>
          </div>
          <div class="sa-form-group">
            <label>New Password (leave blank to keep)</label>
            <input type="password" name="password" minlength="6" placeholder="••••••••"/>
          </div>
          <div class="sa-form-group">
            <label>Status</label>
            <select name="active">
              <option value="1" ${target.active?'selected':''}>Active</option>
              <option value="0" ${!target.active?'selected':''}>Inactive</option>
            </select>
          </div>
          <div style="display:flex;gap:.75rem;margin-top:1.5rem">
            <a href="/sa/admins" class="sa-btn sa-btn-ghost">Cancel</a>
            <button type="submit" class="sa-btn sa-btn-primary" style="flex:1;justify-content:center">Save</button>
          </div>
        </form>
      </div>
    </div>
  </div></div>`);
  return c.html(html);
});

sa.post('/sa/admins/:id/edit', async (c) => {
  const id = c.req.param('id');
  const form = await c.req.formData();
  const fullName = form.get('full_name')?.toString().trim() ?? '';
  const username = form.get('username')?.toString().trim() ?? '';
  const password = form.get('password')?.toString() ?? '';
  const active = form.get('active')?.toString() === '1' ? 1 : 0;

  if (password) {
    const hash = await hashPassword(password);
    await c.env.DB.prepare(
      'UPDATE super_admins SET full_name=?,username=?,password_hash=?,active=? WHERE id=?'
    ).bind(fullName, username, hash, active, id).run();
  } else {
    await c.env.DB.prepare(
      'UPDATE super_admins SET full_name=?,username=?,active=? WHERE id=?'
    ).bind(fullName, username, active, id).run();
  }
  return new Response(null, { status: 302, headers: { 'Location': '/sa/admins' } });
});

sa.delete('/sa/api/admins/:id', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number };
  const id = parseInt(c.req.param('id'));
  if (id === admin.id) return c.json({ success: false, error: 'Cannot delete yourself' }, 400);
  await c.env.DB.prepare('DELETE FROM super_admins WHERE id=?').bind(id).run();
  return c.json({ success: true });
});

export default sa;
