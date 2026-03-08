// ============================================
// Super Admin Routes
// /sa/login, /sa/logout, /sa/dashboard
// /sa/companies, /sa/companies/add
// /sa/companies/:id, /sa/companies/:id/edit
// /sa/plans         - subscription plans CRUD
// /sa/subscriptions - company subscriptions
// /sa/revenue       - subscription revenue stats
// /sa/admins, /sa/settings
// ============================================
import { Hono } from 'hono';
import {
  hashPassword, parseCookies,
  createSuperAdminSession, getSuperAdminSession, deleteSuperAdminSession
} from '../lib/auth';
import { handlePlansGet, handleSubscriptionsGet, handleRevenueGet } from '../lib/sa_subscriptions';

type Bindings = { DB: D1Database };

const sa = new Hono<{ Bindings: Bindings }>();

// ============================================================
// SA Auth Middleware - MUST be first, before all routes
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
// Shell & Nav helpers
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
  <style>
    /* ─── SA Panel - Refined Dark Theme ─── */
    *{box-sizing:border-box;margin:0;padding:0}
    :root{
      --sa-bg:#0d1117;
      --sa-surface:#161b27;
      --sa-surface2:#1c2333;
      --sa-border:#21293d;
      --sa-border2:#2a3347;
      --sa-text:#cdd5e0;
      --sa-text2:#8892aa;
      --sa-text3:#4d5a72;
      --sa-accent:#6366f1;
      --sa-accent2:#818cf8;
      --sa-accent-glow:rgba(99,102,241,.2);
      --sa-r:10px;
      --sa-r2:14px;
    }
    html{scroll-behavior:smooth}
    body{font-family:'Inter',system-ui,sans-serif;background:var(--sa-bg);color:var(--sa-text);-webkit-font-smoothing:antialiased;line-height:1.55;font-size:14px}
    /* Layout */
    .sa-layout{display:flex;min-height:100vh}
    /* Sidebar */
    .sa-sidebar{
      width:248px;background:var(--sa-surface);display:flex;flex-direction:column;
      flex-shrink:0;border-right:1px solid var(--sa-border);
      position:sticky;top:0;height:100vh;overflow-y:auto;scrollbar-width:none;
    }
    .sa-sidebar::-webkit-scrollbar{display:none}
    .sa-sidebar-header{padding:1.25rem 1rem 1.125rem;border-bottom:1px solid var(--sa-border)}
    .sa-brand{display:flex;align-items:center;gap:.625rem;text-decoration:none}
    .sa-brand-icon{
      width:36px;height:36px;
      background:linear-gradient(135deg,#4338ca,#7c3aed);
      border-radius:10px;display:flex;align-items:center;justify-content:center;
      font-size:1.1rem;box-shadow:0 2px 10px rgba(99,102,241,.35);flex-shrink:0;
    }
    .sa-brand-name{color:#e2e8f0;font-size:.9rem;font-weight:700;letter-spacing:-.01em}
    .sa-brand-badge{
      background:rgba(99,102,241,.2);color:var(--sa-accent2);
      font-size:.58rem;font-weight:700;padding:2px 6px;border-radius:99px;
      letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(99,102,241,.3);
    }
    .sa-nav{flex:1;padding:.75rem .625rem;display:flex;flex-direction:column;gap:.15rem}
    .sa-nav-label{
      padding:.625rem .75rem .25rem;font-size:.63rem;font-weight:700;
      text-transform:uppercase;letter-spacing:.1em;color:var(--sa-text3);
    }
    .sa-nav-link{
      display:flex;align-items:center;gap:.625rem;padding:.525rem .75rem;
      border-radius:var(--sa-r);color:var(--sa-text2);text-decoration:none;
      font-size:.875rem;font-weight:500;transition:all .15s;position:relative;
    }
    .sa-nav-link:hover{background:var(--sa-surface2);color:#c7d2fe}
    .sa-nav-link.active{background:rgba(99,102,241,.15);color:var(--sa-accent2)}
    .sa-nav-link.active::before{
      content:'';position:absolute;left:0;top:20%;bottom:20%;
      width:3px;background:var(--sa-accent);border-radius:0 3px 3px 0;
    }
    .sa-nav-sep{height:1px;background:var(--sa-border);margin:.5rem 0}
    .sa-sidebar-footer{padding:.875rem .75rem;border-top:1px solid var(--sa-border)}
    .sa-user-info{display:flex;align-items:center;gap:.625rem;margin-bottom:.75rem}
    .sa-avatar{
      width:34px;height:34px;
      background:linear-gradient(135deg,#4f46e5,#7c3aed);
      border-radius:9px;display:flex;align-items:center;justify-content:center;
      color:#fff;font-size:.82rem;font-weight:700;flex-shrink:0;
      box-shadow:0 2px 8px rgba(99,102,241,.3);
    }
    .sa-user-name{color:#e2e8f0;font-size:.8rem;font-weight:600}
    .sa-user-role{color:var(--sa-text3);font-size:.68rem;margin-top:.1rem}
    .sa-logout{
      display:flex;align-items:center;gap:.5rem;width:100%;justify-content:center;
      padding:.4rem;border-radius:var(--sa-r);color:var(--sa-text2);
      text-decoration:none;font-size:.78rem;font-weight:500;
      border:1px solid var(--sa-border);transition:all .15s;
    }
    .sa-logout:hover{background:rgba(239,68,68,.1);color:#fca5a5;border-color:rgba(239,68,68,.3)}
    /* Main */
    .sa-main{flex:1;display:flex;flex-direction:column;overflow:auto;min-width:0;background:var(--sa-bg)}
    .sa-topbar{
      background:var(--sa-surface);padding:.875rem 1.5rem;
      border-bottom:1px solid var(--sa-border);
      display:flex;justify-content:space-between;align-items:center;
      gap:1rem;flex-wrap:wrap;position:sticky;top:0;z-index:50;
    }
    .sa-topbar-title{color:#e2e8f0;font-size:1rem;font-weight:700;letter-spacing:-.01em}
    .sa-content{flex:1;padding:1.5rem}
    /* Cards */
    .sa-card{
      background:var(--sa-surface);border:1px solid var(--sa-border);
      border-radius:var(--sa-r2);padding:1.25rem;
    }
    /* Table */
    .sa-table{width:100%;border-collapse:collapse}
    .sa-table th{
      color:var(--sa-text2);font-size:.7rem;font-weight:600;text-transform:uppercase;
      letter-spacing:.07em;padding:.7rem 1rem;text-align:left;
      border-bottom:1px solid var(--sa-border);white-space:nowrap;
      background:var(--sa-bg);
    }
    .sa-table td{
      color:var(--sa-text);font-size:.875rem;padding:.75rem 1rem;
      border-bottom:1px solid var(--sa-border);vertical-align:middle;
    }
    .sa-table tbody tr{transition:background .12s}
    .sa-table tbody tr:hover td{background:rgba(255,255,255,.02)}
    .sa-table tbody tr:last-child td{border-bottom:none}
    /* Badges */
    .badge-active{
      background:rgba(16,185,129,.15);color:#34d399;
      padding:3px 9px;border-radius:99px;font-size:.68rem;font-weight:600;
      white-space:nowrap;border:1px solid rgba(16,185,129,.25);
    }
    .badge-inactive{
      background:rgba(239,68,68,.12);color:#f87171;
      padding:3px 9px;border-radius:99px;font-size:.68rem;font-weight:600;
      white-space:nowrap;border:1px solid rgba(239,68,68,.25);
    }
    /* Buttons */
    .sa-btn{
      display:inline-flex;align-items:center;gap:.35rem;padding:.4rem .8rem;
      border-radius:8px;font-size:.8rem;font-weight:600;cursor:pointer;border:none;
      text-decoration:none;transition:all .15s;white-space:nowrap;letter-spacing:-.01em;
    }
    .sa-btn:active{transform:scale(.96)}
    .sa-btn-primary{background:var(--sa-accent);color:#fff;box-shadow:0 2px 8px var(--sa-accent-glow)}
    .sa-btn-primary:hover{background:#4338ca;box-shadow:0 4px 14px rgba(99,102,241,.35);transform:translateY(-1px)}
    .sa-btn-danger{background:rgba(239,68,68,.15);color:#f87171;border:1px solid rgba(239,68,68,.25)}
    .sa-btn-danger:hover{background:rgba(239,68,68,.25);color:#fca5a5;transform:translateY(-1px)}
    .sa-btn-warning{background:rgba(245,158,11,.15);color:#fbbf24;border:1px solid rgba(245,158,11,.25)}
    .sa-btn-warning:hover{background:rgba(245,158,11,.25);color:#fcd34d;transform:translateY(-1px)}
    .sa-btn-success{background:rgba(16,185,129,.15);color:#34d399;border:1px solid rgba(16,185,129,.25)}
    .sa-btn-success:hover{background:rgba(16,185,129,.25);color:#6ee7b7;transform:translateY(-1px)}
    .sa-btn-ghost{background:transparent;color:var(--sa-text2);border:1px solid var(--sa-border2)}
    .sa-btn-ghost:hover{background:var(--sa-surface2);color:#c7d2fe;border-color:rgba(99,102,241,.35)}
    .sa-btn-sm{padding:.25rem .6rem;font-size:.75rem;border-radius:6px}
    /* Forms */
    .sa-form-group{margin-bottom:.875rem}
    .sa-form-group label{display:block;color:var(--sa-text2);font-size:.78rem;font-weight:600;margin-bottom:.35rem;letter-spacing:.01em}
    .sa-form-group input,.sa-form-group select,.sa-form-group textarea{
      width:100%;padding:.6rem .875rem;background:var(--sa-bg);
      border:1.5px solid var(--sa-border2);border-radius:8px;color:#e2e8f0;
      font-size:.875rem;outline:none;font-family:inherit;transition:border-color .15s,box-shadow .15s;
    }
    .sa-form-group input:focus,.sa-form-group select:focus,.sa-form-group textarea:focus{
      border-color:var(--sa-accent);box-shadow:0 0 0 3px var(--sa-accent-glow);
    }
    .sa-form-group input:hover:not(:focus),.sa-form-group select:hover:not(:focus){border-color:#334155}
    .sa-form-row{display:grid;grid-template-columns:1fr 1fr;gap:.875rem}
    /* Alerts */
    .sa-alert{padding:.75rem 1rem;border-radius:var(--sa-r);margin-bottom:1rem;font-size:.875rem;border-left:3px solid}
    .sa-alert-error{background:rgba(239,68,68,.1);color:#fca5a5;border-color:#ef4444}
    .sa-alert-success{background:rgba(16,185,129,.1);color:#6ee7b7;border-color:#10b981}
    /* Login */
    .sa-login-wrap{min-height:100vh;background:var(--sa-bg);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
    .sa-login-wrap::before{
      content:'';position:absolute;inset:0;
      background:radial-gradient(circle at 30% 40%,rgba(99,102,241,.12) 0%,transparent 55%),
                 radial-gradient(circle at 70% 70%,rgba(139,92,246,.08) 0%,transparent 50%);
    }
    .sa-login-card{
      background:var(--sa-surface);border:1px solid var(--sa-border2);
      border-radius:20px;padding:2.5rem;width:100%;max-width:380px;
      box-shadow:0 20px 60px rgba(0,0,0,.4);position:relative;z-index:1;
    }
    /* KPI */
    .kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem}
    .kpi-card{
      background:var(--sa-surface);border:1px solid var(--sa-border);
      border-radius:var(--sa-r2);padding:1.25rem;
      transition:all .2s;position:relative;overflow:hidden;
    }
    .kpi-card:hover{border-color:var(--sa-border2);box-shadow:0 4px 20px rgba(0,0,0,.3)}
    .kpi-card::after{
      content:'';position:absolute;inset:0;
      background:linear-gradient(145deg,rgba(255,255,255,.02) 0%,transparent 60%);
      pointer-events:none;
    }
    .kpi-label{color:var(--sa-text2);font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.5rem}
    .kpi-value{font-size:1.9rem;font-weight:800;line-height:1;margin-bottom:.25rem;letter-spacing:-.02em}
    .kpi-sub{color:var(--sa-text3);font-size:.72rem}
    /* Search */
    .search-bar{position:relative;margin-bottom:1rem}
    .search-bar input{
      width:100%;padding:.65rem 1rem .65rem 2.5rem;
      background:var(--sa-bg);border:1.5px solid var(--sa-border2);
      border-radius:var(--sa-r);color:#e2e8f0;font-size:.875rem;outline:none;
      transition:border-color .15s,box-shadow .15s;
    }
    .search-bar input:focus{border-color:var(--sa-accent);box-shadow:0 0 0 3px var(--sa-accent-glow)}
    .search-bar::before{content:'🔍';position:absolute;left:.75rem;top:50%;transform:translateY(-50%);font-size:.82rem;pointer-events:none}
    /* Modals */
    .modal-overlay{
      display:none;position:fixed;inset:0;
      background:rgba(0,0,0,.6);backdrop-filter:blur(4px);
      align-items:center;justify-content:center;z-index:999;
    }
    .modal-overlay.open{display:flex}
    .modal-box{
      background:var(--sa-surface);border:1px solid var(--sa-border2);
      border-radius:18px;padding:2rem;width:100%;max-width:440px;
      max-height:90vh;overflow-y:auto;
      box-shadow:0 20px 60px rgba(0,0,0,.5);
      transform:scale(.96) translateY(8px);
      animation:modalIn .25s cubic-bezier(0.34,1.56,0.64,1) forwards;
    }
    @keyframes modalIn{to{transform:scale(1) translateY(0)}}
    .modal-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;padding-bottom:.875rem;border-bottom:1px solid var(--sa-border)}
    .modal-title{color:#e2e8f0;font-size:1rem;font-weight:700;letter-spacing:-.01em}
    .modal-close{
      background:none;border:none;color:var(--sa-text2);font-size:1.1rem;
      cursor:pointer;padding:.3rem;border-radius:6px;transition:all .15s;
      width:28px;height:28px;display:flex;align-items:center;justify-content:center;
    }
    .modal-close:hover{background:var(--sa-surface2);color:#e2e8f0}
  </style>
</head>
<body>
${body}
<script>
// Generic confirm+delete
function saDelete(url, name, cb) {
  if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
  fetch(url, {method:'DELETE'}).then(r=>r.json()).then(d=>{
    if(d.success) { if(cb) cb(); else location.reload(); }
    else alert(d.error || 'Error occurred');
  }).catch(()=>alert('Network error'));
}
// Toggle company active
function saToggleCompany(id, name, active) {
  const action = active ? 'deactivate' : 'activate';
  if (!confirm(action.charAt(0).toUpperCase()+action.slice(1)+' company "' + name + '"?')) return;
  fetch('/sa/api/companies/' + id + '/toggle', {method:'POST'}).then(r=>r.json()).then(d=>{
    if(d.success) location.reload();
    else alert(d.error || 'Error');
  });
}
// Open/close modal
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
// Live search table
function liveSearch(inputId, tableBodyId) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.addEventListener('input', function() {
    const q = this.value.toLowerCase().trim();
    document.querySelectorAll('#'+tableBodyId+' tr').forEach(tr => {
      tr.style.display = !q || tr.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}
document.addEventListener('DOMContentLoaded', function() {
  liveSearch('company-search', 'companies-tbody');
  // close modal on overlay click
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', function(e) { if(e.target===this) this.classList.remove('open'); });
  });
  // auto-hide alerts after 4s
  document.querySelectorAll('.sa-alert-success').forEach(a => {
    setTimeout(() => a.style.display='none', 4000);
  });
});
</script>
${scripts}
</body>
</html>`;
}

function saNav(active: string, adminName: string): string {
  const links = [
    { href: '/sa/dashboard',     label: '🏠 داشبورد',       key: 'dashboard' },
    { href: '/sa/companies',     label: '🏢 شرکت‌ها',       key: 'companies' },
    { href: '/sa/plans',         label: '📦 پلن‌های اشتراک', key: 'plans' },
    { href: '/sa/subscriptions', label: '🔖 اشتراک‌ها',     key: 'subscriptions' },
    { href: '/sa/revenue',       label: '💰 درآمد',          key: 'revenue' },
    { href: '/sa/admins',        label: '🔑 ادمین‌ها',       key: 'admins' },
    { href: '/sa/settings',      label: '⚙️ تنظیمات',       key: 'settings' },
  ];
  const navHtml = links.map(l =>
    `<a href="${l.href}" class="sa-nav-link ${active === l.key ? 'active' : ''}">${l.label}</a>`
  ).join('');

  return `
  <div class="sa-layout">
    <aside class="sa-sidebar">
      <div class="sa-sidebar-header">
        <div class="sa-brand">
          <div class="sa-brand-icon">📶</div>
          <div>
            <div class="sa-brand-name">HotSpot</div>
          </div>
          <span class="sa-brand-badge">SA</span>
        </div>
      </div>
      <nav class="sa-nav">
        ${navHtml}
        <div class="sa-nav-sep"></div>
        <a href="/login" class="sa-nav-link" style="font-size:.8rem;color:var(--sa-text3)">↩ Tenant Login</a>
      </nav>
      <div class="sa-sidebar-footer">
        <div class="sa-user-info">
          <div class="sa-avatar">${adminName.charAt(0).toUpperCase()}</div>
          <div>
            <div class="sa-user-name">${adminName}</div>
            <div class="sa-user-role">Super Administrator</div>
          </div>
        </div>
        <a href="/sa/logout" class="sa-logout">⏻ Logout</a>
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
      <div style="text-align:center;margin-bottom:2rem">
        <div style="width:64px;height:64px;background:linear-gradient(135deg,#4338ca,#7c3aed);border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto .875rem;font-size:1.75rem;box-shadow:0 8px 24px rgba(99,102,241,.4)">📶</div>
        <h1 style="color:#e2e8f0;font-size:1.25rem;font-weight:700;margin:0 0 .3rem;letter-spacing:-.02em">Super Admin</h1>
        <p style="color:var(--sa-text2);font-size:.82rem;margin:0">HotSpot Manager Platform</p>
      </div>
      ${errorMsg ? `<div class="sa-alert sa-alert-error">⚠ ${errorMsg}</div>` : ''}
      <form method="POST" action="/sa/login">
        <div class="sa-form-group">
          <label>Username</label>
          <input type="text" name="username" required autofocus placeholder="superadmin" autocomplete="username"/>
        </div>
        <div class="sa-form-group">
          <label>Password</label>
          <input type="password" name="password" required placeholder="••••••••" autocomplete="current-password"/>
        </div>
        <button type="submit" class="sa-btn sa-btn-primary" style="width:100%;justify-content:center;padding:.7rem 1rem;font-size:.9rem;margin-top:.5rem;border-radius:10px">Sign In →</button>
      </form>
      <div style="text-align:center;margin-top:1.5rem">
        <a href="/login" style="color:var(--sa-text3);font-size:.8rem;text-decoration:none">← Back to Tenant Login</a>
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
    return new Response(null, { status: 302, headers: { 'Location': '/sa/login?error=required' } });
  }

  const hash = await hashPassword(password);
  const admin = await c.env.DB.prepare(
    `SELECT id, username, full_name FROM super_admins WHERE username=? AND password_hash=? AND active=1`
  ).bind(username, hash).first<{ id: number; username: string; full_name: string }>();

  if (!admin) {
    return new Response(null, { status: 302, headers: { 'Location': '/sa/login?error=invalid' } });
  }

  const sessionId = await createSuperAdminSession(c.env.DB, admin.id);
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/sa/dashboard',
      'Set-Cookie': `sa_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`
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
      'Set-Cookie': 'sa_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    }
  });
});

// ============================================================
// SA Dashboard
// ============================================================
sa.get('/sa/dashboard', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const url = new URL(c.req.url);

  // KPI counts
  const [companiesRow, ownersRow, sellersRow, salesRow, allocRow, invRow, subKpi] = await Promise.all([
    c.env.DB.prepare('SELECT COUNT(*) as n FROM companies').first<{n:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) as n FROM users WHERE role='owner'").first<{n:number}>(),
    c.env.DB.prepare("SELECT COUNT(*) as n FROM users WHERE role='seller'").first<{n:number}>(),
    c.env.DB.prepare('SELECT COUNT(*) as n, COALESCE(SUM(gross_amount),0) as rev FROM sales').first<{n:number;rev:number}>(),
    c.env.DB.prepare('SELECT COALESCE(SUM(total_gb),0) as gb FROM allocation_batches').first<{gb:number}>(),
    c.env.DB.prepare('SELECT COALESCE(SUM(total_gb),0) as gb FROM inventory_batches').first<{gb:number}>(),
    c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(amount_paid),0) as total_revenue,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m',created_at)=strftime('%Y-%m','now') THEN amount_paid ELSE 0 END),0) as month_revenue,
        COUNT(CASE WHEN status='active' AND end_date>=date('now') THEN 1 END) as active_subs,
        COUNT(CASE WHEN end_date>=date('now') AND end_date<=date('now','+7 days') AND status='active' THEN 1 END) as expiring_soon
      FROM company_subscriptions`).first<{total_revenue:number;month_revenue:number;active_subs:number;expiring_soon:number}>(),
  ]);

  // Last 7 days activity
  const [last7Sales, last7Inv] = await Promise.all([
    c.env.DB.prepare(`
      SELECT date(created_at) as day, COUNT(*) as cnt, COALESCE(SUM(gross_amount),0) as rev
      FROM sales WHERE created_at >= datetime('now','-7 days')
      GROUP BY day ORDER BY day ASC`).all<any>(),
    c.env.DB.prepare(`
      SELECT date(created_at) as day, COALESCE(SUM(total_gb),0) as gb
      FROM inventory_batches WHERE created_at >= datetime('now','-7 days')
      GROUP BY day ORDER BY day ASC`).all<any>(),
  ]);

  // Top 5 companies by revenue
  const topCompanies = await c.env.DB.prepare(`
    SELECT c.id, c.name, c.slug,
      COALESCE(SUM(s.gross_amount),0) as revenue,
      COUNT(DISTINCT s.id) as sales_count,
      (SELECT COUNT(*) FROM users WHERE company_id=c.id) as user_count,
      (SELECT COALESCE(SUM(total_gb),0) FROM inventory_batches WHERE company_id=c.id) as total_gb
    FROM companies c
    LEFT JOIN sales s ON s.company_id = c.id
    GROUP BY c.id ORDER BY revenue DESC LIMIT 5`).all<any>();

  // Recent activity
  const [recentSales, recentInv] = await Promise.all([
    c.env.DB.prepare(`
      SELECT 'sale' as type, s.created_at, c.name as company, u.full_name as actor,
        s.gross_amount as amount, p.name as pkg_name, s.quantity
      FROM sales s
      JOIN companies c ON c.id=s.company_id
      JOIN users u ON u.id=s.seller_id
      JOIN packages p ON p.id=s.package_id
      ORDER BY s.created_at DESC LIMIT 5`).all<any>(),
    c.env.DB.prepare(`
      SELECT 'inv' as type, b.created_at, c.name as company,
        b.total_gb, b.total_gross as amount, br.name as branch_name
      FROM inventory_batches b
      JOIN companies c ON c.id=b.company_id
      JOIN branches br ON br.id=b.branch_id
      ORDER BY b.created_at DESC LIMIT 4`).all<any>(),
  ]);

  // Helpers
  const fm = (n: number) => '؋ ' + Math.round(n).toLocaleString();
  const fgb = (n: number) => n >= 1000 ? (n/1000).toFixed(1)+' TB' : n.toFixed(n%1===0?0:1)+' GB';
  const fdate = (d: string) => new Date(d).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'});
  const ftime = (d: string) => new Date(d).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

  // Build chart data (last 7 days)
  const days7: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days7.push(d.toISOString().split('T')[0]);
  }
  const salesMap = Object.fromEntries((last7Sales.results||[]).map((r:any) => [r.day, {cnt:r.cnt, rev:r.rev}]));
  const invMap   = Object.fromEntries((last7Inv.results||[]).map((r:any) => [r.day, r.gb]));
  const chartLabels = JSON.stringify(days7.map(d => new Date(d).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})));
  const chartSales  = JSON.stringify(days7.map(d => salesMap[d]?.cnt ?? 0));
  const chartRev    = JSON.stringify(days7.map(d => Math.round(salesMap[d]?.rev ?? 0)));
  const chartInvGB  = JSON.stringify(days7.map(d => +(invMap[d] ?? 0).toFixed(1)));

  // Top company rows
  const medals = ['🥇','🥈','🥉','4️⃣','5️⃣'];
  const topRows = (topCompanies.results||[]).map((co:any, i:number) => `
    <tr>
      <td style="font-size:1.1rem;text-align:center">${medals[i]||i+1}</td>
      <td>
        <div style="font-weight:600;color:#f1f5f9">${co.name}</div>
        <div style="font-size:.72rem;color:#64748b">${co.slug}</div>
      </td>
      <td style="color:#a78bfa;font-weight:700">${fm(co.revenue)}</td>
      <td style="color:#94a3b8">${co.sales_count}</td>
      <td style="color:#60a5fa">${fgb(co.total_gb)}</td>
      <td style="color:#94a3b8">${co.user_count}</td>
      <td><a href="/sa/companies/${co.id}" class="sa-btn sa-btn-ghost sa-btn-sm">View →</a></td>
    </tr>`).join('');

  // Activity feed
  const allActivity = [
    ...(recentSales.results||[]).map((r:any) => ({...r, _d: new Date(r.created_at).getTime()})),
    ...(recentInv.results||[]).map((r:any) => ({...r, _d: new Date(r.created_at).getTime()})),
  ].sort((a,b) => b._d - a._d).slice(0, 8);

  const activityHtml = allActivity.length ? allActivity.map((r:any) => {
    if (r.type === 'sale') return `
      <div style="display:flex;align-items:flex-start;gap:.75rem;padding:.75rem 0;border-bottom:1px solid #0f172a">
        <div style="width:32px;height:32px;background:#1e3a5f;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">💰</div>
        <div style="flex:1;min-width:0">
          <div style="color:#e2e8f0;font-size:.83rem"><strong>${r.actor}</strong> sold <strong>${r.quantity}× ${r.pkg_name}</strong></div>
          <div style="color:#64748b;font-size:.72rem">${r.company} · ${fdate(r.created_at)} ${ftime(r.created_at)}</div>
        </div>
        <div style="color:#4ade80;font-size:.83rem;font-weight:700;white-space:nowrap">${fm(r.amount)}</div>
      </div>`;
    return `
      <div style="display:flex;align-items:flex-start;gap:.75rem;padding:.75rem 0;border-bottom:1px solid #0f172a">
        <div style="width:32px;height:32px;background:#1a3a2f;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0">📦</div>
        <div style="flex:1;min-width:0">
          <div style="color:#e2e8f0;font-size:.83rem">Stock-in at <strong>${r.branch_name}</strong></div>
          <div style="color:#64748b;font-size:.72rem">${r.company} · ${fdate(r.created_at)} ${ftime(r.created_at)}</div>
        </div>
        <div style="color:#60a5fa;font-size:.83rem;font-weight:700;white-space:nowrap">${fgb(r.total_gb)}</div>
      </div>`;
  }).join('') : '<div style="color:#64748b;text-align:center;padding:2rem;font-size:.85rem">No activity yet</div>';

  const successMsg = url.searchParams.get('ok') === '1' ? `<div class="sa-alert sa-alert-success" style="margin-bottom:1rem">Company added successfully!</div>` : '';

  const html = saShell('Dashboard', saNav('dashboard', admin.full_name) + `
    <div class="sa-topbar">
      <div>
        <div class="sa-topbar-title">Platform Overview</div>
        <div style="color:#64748b;font-size:.78rem;margin-top:.1rem">Welcome back, ${admin.full_name}</div>
      </div>
      <a href="/sa/companies/add" class="sa-btn sa-btn-primary">+ Add Company</a>
    </div>
    <div class="sa-content">
      ${successMsg}

      <!-- KPI Grid -->
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">Companies</div>
          <div class="kpi-value" style="color:#818cf8">${companiesRow?.n??0}</div>
          <div class="kpi-sub"><a href="/sa/companies" style="color:#818cf8">View all →</a></div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Owners</div>
          <div class="kpi-value" style="color:#f1f5f9">${ownersRow?.n??0}</div>
          <div class="kpi-sub">${sellersRow?.n??0} sellers</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Total Sales</div>
          <div class="kpi-value" style="color:#f1f5f9">${salesRow?.n??0}</div>
          <div class="kpi-sub" style="color:#4ade80;font-weight:600">${fm(salesRow?.rev??0)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">GB In Stock</div>
          <div class="kpi-value" style="color:#60a5fa;font-size:1.5rem">${fgb(invRow?.gb??0)}</div>
          <div class="kpi-sub">Total stocked</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">GB Allocated</div>
          <div class="kpi-value" style="color:#a78bfa;font-size:1.5rem">${fgb(allocRow?.gb??0)}</div>
          <div class="kpi-sub">Given to sellers</div>
        </div>
        <div class="kpi-card" style="background:linear-gradient(135deg,#312e81,#1e1b4b);border-color:#4f46e5">
          <div class="kpi-label" style="color:#a5b4fc">Platform Revenue</div>
          <div class="kpi-value" style="color:#fff;font-size:1.3rem">${fm(salesRow?.rev??0)}</div>
          <div class="kpi-sub" style="color:#818cf8">All-time gross</div>
        </div>
      </div>

      <!-- Subscription Revenue Banner -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem;background:linear-gradient(135deg,#1e1035,#0f0a2a);border:1px solid #6d28d9;border-radius:12px;padding:1.25rem">
        <div style="border-right:1px solid #2e1065;padding-right:1.25rem">
          <div style="color:#a78bfa;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.35rem">💰 درآمد اشتراک (کل)</div>
          <div style="color:#e9d5ff;font-size:1.5rem;font-weight:700">${fm(subKpi?.total_revenue??0)}</div>
          <div style="color:#7c3aed;font-size:.72rem;margin-top:.2rem">از ابتدا تاکنون</div>
        </div>
        <div style="border-right:1px solid #2e1065;padding-right:1.25rem">
          <div style="color:#a78bfa;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.35rem">🗓 درآمد این ماه</div>
          <div style="color:#e9d5ff;font-size:1.5rem;font-weight:700">${fm(subKpi?.month_revenue??0)}</div>
          <div style="color:#7c3aed;font-size:.72rem;margin-top:.2rem">ماه جاری</div>
        </div>
        <div style="border-right:1px solid #2e1065;padding-right:1.25rem">
          <div style="color:#a78bfa;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.35rem">🔖 اشتراک‌های فعال</div>
          <div style="color:#6ee7b7;font-size:1.5rem;font-weight:700">${subKpi?.active_subs??0}</div>
          <div style="color:#7c3aed;font-size:.72rem;margin-top:.2rem">شرکت در حال اشتراک</div>
        </div>
        <div>
          <div style="color:#a78bfa;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.35rem">⚠️ رو به انقضا</div>
          <div style="color:${(subKpi?.expiring_soon??0) > 0 ? '#fcd34d' : '#6ee7b7'};font-size:1.5rem;font-weight:700">${subKpi?.expiring_soon??0}</div>
          <div style="color:#7c3aed;font-size:.72rem;margin-top:.2rem">
            ${(subKpi?.expiring_soon??0) > 0
              ? `<a href="/sa/subscriptions" style="color:#fcd34d">مشاهده →</a>`
              : 'اشتراک ۷ روز آینده'}
          </div>
        </div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:.5rem">
          <a href="/sa/plans" class="sa-btn sa-btn-ghost sa-btn-sm">📦 پلن‌ها</a>
          <a href="/sa/subscriptions" class="sa-btn sa-btn-ghost sa-btn-sm">🔖 اشتراک‌ها</a>
          <a href="/sa/revenue" class="sa-btn sa-btn-primary sa-btn-sm">📊 گزارش →</a>
        </div>
      </div>

      <!-- Charts + Activity -->
      <div style="display:grid;grid-template-columns:1fr 320px;gap:1rem;margin-bottom:1.5rem">
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:1.25rem">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.875rem;flex-wrap:wrap;gap:.5rem">
            <div style="color:#f1f5f9;font-weight:600">Activity — Last 7 Days</div>
            <div style="display:flex;gap:.75rem;font-size:.72rem">
              <span style="color:#818cf8">● Sales</span>
              <span style="color:#4ade80">● Revenue</span>
              <span style="color:#60a5fa">● GB stocked</span>
            </div>
          </div>
          <canvas id="actChart" height="150"></canvas>
        </div>
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:1.25rem;overflow:hidden">
          <div style="color:#f1f5f9;font-weight:600;margin-bottom:.75rem">🕐 Recent Activity</div>
          <div style="overflow-y:auto;max-height:270px">${activityHtml}</div>
        </div>
      </div>

      <!-- Top companies -->
      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:1rem 1.25rem;border-bottom:1px solid #334155">
          <div style="color:#f1f5f9;font-weight:600">🏆 Top Companies by Revenue</div>
          <a href="/sa/companies" class="sa-btn sa-btn-ghost sa-btn-sm">All →</a>
        </div>
        <table class="sa-table">
          <thead><tr><th>#</th><th>Company</th><th>Revenue</th><th>Sales</th><th>GB</th><th>Users</th><th></th></tr></thead>
          <tbody>${topRows||'<tr><td colspan="7" style="text-align:center;color:#64748b;padding:2rem">No companies yet</td></tr>'}</tbody>
        </table>
      </div>
    </div>
  </div></div>`,
  `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
  const ctx = document.getElementById('actChart');
  if (ctx) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ${chartLabels},
        datasets: [
          { label: 'Sales', data: ${chartSales}, backgroundColor: 'rgba(129,140,248,0.7)', borderColor: '#818cf8', borderWidth:1, borderRadius:4, yAxisID:'y' },
          { label: 'GB Stocked', data: ${chartInvGB}, backgroundColor: 'rgba(96,165,250,0.45)', borderColor: '#60a5fa', borderWidth:1, borderRadius:4, yAxisID:'y' },
          { type:'line', label:'Revenue', data: ${chartRev}, borderColor:'#4ade80', backgroundColor:'rgba(74,222,128,0.08)', borderWidth:2, pointRadius:3, tension:0.4, fill:true, yAxisID:'y2' }
        ]
      },
      options: {
        responsive:true, interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false}},
        scales:{
          x:{grid:{color:'#1e293b'},ticks:{color:'#64748b',font:{size:10}}},
          y:{type:'linear',position:'left',grid:{color:'#1e293b20'},ticks:{color:'#64748b',font:{size:10}}},
          y2:{type:'linear',position:'right',grid:{drawOnChartArea:false},ticks:{color:'#4ade80',font:{size:10},callback:v=>'؋'+Math.round(v).toLocaleString()}}
        }
      }
    });
  }
  </script>`);
  return c.html(html);
});

// ============================================================
// SA Companies List
// ============================================================
sa.get('/sa/companies', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const url = new URL(c.req.url);
  const added = url.searchParams.get('added');

  const items = await c.env.DB.prepare(`
    SELECT c.id, c.name, c.slug, c.default_language, c.created_at,
      COALESCE(c.active, 1) as active,
      (SELECT COUNT(*) FROM users WHERE company_id=c.id AND role='owner') as owner_count,
      (SELECT COUNT(*) FROM users WHERE company_id=c.id AND role='seller') as seller_count,
      (SELECT COUNT(*) FROM branches WHERE company_id=c.id) as branch_count,
      (SELECT COUNT(*) FROM sales WHERE company_id=c.id) as sale_count,
      (SELECT COALESCE(SUM(gross_amount),0) FROM sales WHERE company_id=c.id) as revenue,
      (SELECT COALESCE(SUM(total_gb),0) FROM inventory_batches WHERE company_id=c.id) as stock_gb,
      (SELECT cs.end_date FROM company_subscriptions cs WHERE cs.company_id=c.id AND cs.status='active' ORDER BY cs.end_date DESC LIMIT 1) as sub_end,
      (SELECT sp.name FROM company_subscriptions cs JOIN subscription_plans sp ON sp.id=cs.plan_id WHERE cs.company_id=c.id AND cs.status='active' ORDER BY cs.end_date DESC LIMIT 1) as sub_plan,
      (SELECT sp.color FROM company_subscriptions cs JOIN subscription_plans sp ON sp.id=cs.plan_id WHERE cs.company_id=c.id AND cs.status='active' ORDER BY cs.end_date DESC LIMIT 1) as sub_color
    FROM companies c ORDER BY c.created_at DESC`).all<any>();

  const fm = (n: number) => '؋ ' + Math.round(n).toLocaleString();
  const fgb = (n: number) => n >= 1000 ? (n/1000).toFixed(1)+' TB' : n.toFixed(n%1===0?0:1)+' GB';

  const rows = (items.results||[]).map((co: any) => {
    const isActive = co.active !== 0;
    // Subscription badge
    let subBadge = '<span style="color:#475569;font-size:.72rem">—</span>';
    if (co.sub_plan && co.sub_end) {
      const daysLeft = Math.ceil((new Date(co.sub_end).getTime() - Date.now()) / 86400000);
      if (daysLeft < 0) {
        subBadge = `<span style="background:#7f1d1d;color:#fca5a5;padding:2px 6px;border-radius:99px;font-size:.68rem;font-weight:600">منقضی</span>`;
      } else if (daysLeft <= 7) {
        subBadge = `<span style="background:#451a03;color:#fcd34d;padding:2px 6px;border-radius:99px;font-size:.68rem;font-weight:600">⚠ ${daysLeft}d</span>`;
      } else {
        subBadge = `<div style="display:flex;align-items:center;gap:.25rem"><div style="width:7px;height:7px;border-radius:50%;background:${co.sub_color||'#4f46e5'}"></div><span style="color:#c7d2fe;font-size:.72rem">${co.sub_plan}</span><span style="color:#475569;font-size:.68rem">${daysLeft}d</span></div>`;
      }
    }
    return `
    <tr>
      <td>
        <div style="font-weight:600;color:#f1f5f9">${co.name}</div>
        <div style="display:flex;gap:.4rem;align-items:center;margin-top:.2rem">
          <code style="color:#818cf8;font-size:.72rem;background:#1e1b4b;padding:1px 5px;border-radius:3px">${co.slug}</code>
          <span style="color:#64748b;font-size:.7rem">${new Date(co.created_at).toLocaleDateString('en-GB')}</span>
        </div>
      </td>
      <td style="color:#94a3b8;font-size:.82rem">${co.default_language.toUpperCase()}</td>
      <td style="color:#94a3b8;font-size:.82rem">${co.owner_count}+${co.seller_count}</td>
      <td style="color:#94a3b8">${co.branch_count}</td>
      <td style="color:#60a5fa;font-weight:600">${fgb(co.stock_gb)}</td>
      <td style="color:#94a3b8">${co.sale_count}</td>
      <td style="color:#4ade80;font-weight:600">${fm(co.revenue)}</td>
      <td>${subBadge}</td>
      <td><span class="${isActive ? 'badge-active' : 'badge-inactive'}">${isActive ? 'Active' : 'Inactive'}</span></td>
      <td>
        <div style="display:flex;gap:.3rem;flex-wrap:nowrap">
          <a href="/sa/companies/${co.id}" class="sa-btn sa-btn-ghost sa-btn-sm">👁</a>
          <a href="/sa/companies/${co.id}/edit" class="sa-btn sa-btn-ghost sa-btn-sm">✏️</a>
          <button onclick="saToggleCompany(${co.id},'${co.name.replace(/'/g,"\\'")}',${isActive?1:0})" class="sa-btn sa-btn-sm ${isActive ? 'sa-btn-warning' : 'sa-btn-success'}">${isActive ? '⏸' : '▶'}</button>
          <button onclick="saDelete('/sa/api/companies/${co.id}','${co.name.replace(/'/g,"\\'")}',null)" class="sa-btn sa-btn-danger sa-btn-sm">🗑</button>
        </div>
      </td>
    </tr>`;}).join('');

  const totalRev = (items.results||[]).reduce((s:number, r:any)=>s+r.revenue, 0);
  const totalGb  = (items.results||[]).reduce((s:number, r:any)=>s+r.stock_gb, 0);
  const activeCount = (items.results||[]).filter((r:any) => r.active !== 0).length;

  const html = saShell('Companies', saNav('companies', admin.full_name) + `
    <div class="sa-topbar">
      <div>
        <div class="sa-topbar-title">Manage Companies</div>
        <div style="color:#64748b;font-size:.78rem;margin-top:.1rem">${items.results?.length??0} total · ${activeCount} active · ${fm(totalRev)} revenue · ${fgb(totalGb)} stocked</div>
      </div>
      <a href="/sa/companies/add" class="sa-btn sa-btn-primary">+ Add Company</a>
    </div>
    <div class="sa-content">
      ${added==='1' ? '<div class="sa-alert sa-alert-success">✓ Company added successfully!</div>' : ''}
      <div class="search-bar" style="max-width:360px">
        <input id="company-search" type="text" placeholder="Search companies..."/>
      </div>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
        <table class="sa-table">
          <thead><tr>
            <th>Company</th><th>Lang</th><th>Users</th><th>Branches</th><th>GB</th><th>Sales</th><th>Revenue</th><th>اشتراک</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody id="companies-tbody">
            ${rows || '<tr><td colspan="10" style="text-align:center;color:#94a3b8;padding:2.5rem">No companies. <a href="/sa/companies/add" style="color:#818cf8">Add the first one →</a></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div></div>`);
  return c.html(html);
});

// ============================================================
// SA Add Company  ← MUST be before /sa/companies/:id
// ============================================================
sa.get('/sa/companies/add', (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const html = saShell('افزودن شرکت', saNav('companies', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">🏢 ثبت شرکت جدید</div>
      <a href="/sa/companies" class="sa-btn sa-btn-ghost">← برگشت</a>
    </div>
    <div class="sa-content">
      <div class="sa-card" style="max-width:540px">
        <div style="color:#f1f5f9;font-weight:700;font-size:.95rem;margin-bottom:1.25rem">🏢 مشخصات شرکت</div>
        <form method="POST" action="/sa/companies/add">
          <div class="sa-form-row">
            <div class="sa-form-group">
              <label>نام شرکت *</label>
              <input type="text" name="company_name" required placeholder="مثال: شرکت هات‌اسپات احمد"/>
            </div>
            <div class="sa-form-group">
              <label>شناسه (Slug) *</label>
              <input type="text" name="slug" required placeholder="ahmad-hotspot" pattern="[a-z0-9-]+" title="فقط حروف انگلیسی کوچک، اعداد و خط تیره"/>
            </div>
          </div>
          <div class="sa-form-group">
            <label>زبان پیش‌فرض</label>
            <select name="default_language">
              <option value="fa">دری (Dari)</option>
              <option value="ps">پښتو (Pashto)</option>
              <option value="en">English</option>
            </select>
          </div>
          <hr style="border-color:#334155;margin:1.25rem 0"/>
          <div style="color:#f1f5f9;font-weight:700;font-size:.95rem;margin-bottom:1rem">👤 حساب مالک</div>
          <div class="sa-form-row">
            <div class="sa-form-group">
              <label>نام کامل مالک *</label>
              <input type="text" name="full_name" required placeholder="احمد محمدی"/>
            </div>
            <div class="sa-form-group">
              <label>نام کاربری *</label>
              <input type="text" name="username" required placeholder="admin"/>
            </div>
          </div>
          <div class="sa-form-group">
            <label>رمز عبور *</label>
            <input type="password" name="password" required minlength="6" placeholder="حداقل ۶ کاراکتر"/>
          </div>
          <div style="display:flex;gap:.75rem;margin-top:1.25rem">
            <a href="/sa/companies" class="sa-btn sa-btn-ghost">لغو</a>
            <button type="submit" class="sa-btn sa-btn-primary" style="flex:1;justify-content:center">✓ ایجاد شرکت</button>
          </div>
        </form>
      </div>
    </div>
  </div></div>`);
  return c.html(html);
});

sa.post('/sa/companies/add', async (c) => {
  const form = await c.req.formData();
  const companyName = form.get('company_name')?.toString().trim() ?? '';
  const slug = form.get('slug')?.toString().trim().toLowerCase() ?? '';
  const defaultLanguage = form.get('default_language')?.toString() ?? 'fa';
  const fullName = form.get('full_name')?.toString().trim() ?? '';
  const username = form.get('username')?.toString().trim() ?? '';
  const password = form.get('password')?.toString() ?? '';

  if (!companyName || !slug || !fullName || !username || !password) {
    return c.html('<p style="color:red">فیلدهای ضروری خالی است</p><a href="/sa/companies/add">← برگشت</a>', 400);
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
    ).bind(company.id, 'شعبه اصلی').run();

    return new Response(null, { status: 302, headers: { 'Location': '/sa/companies?added=1' } });
  } catch (e: any) {
    return c.html(`<p style="color:red">خطا: ${e.message}</p><a href="/sa/companies/add">← برگشت</a>`, 400);
  }
});

// ============================================================
// SA Company Detail  /sa/companies/:id
// ============================================================
sa.get('/sa/companies/:id', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const id = c.req.param('id');

  const co = await c.env.DB.prepare('SELECT * FROM companies WHERE id=?').bind(id).first<any>();
  if (!co) return c.html('Company not found', 404);

  const fm = (n: number) => '؋ ' + Math.round(n).toLocaleString();
  const fgb = (n: number) => n >= 1000 ? (n/1000).toFixed(1)+' TB' : n.toFixed(n%1===0?0:1)+' GB';
  const fdate = (d: string) => new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});

  const [users, branches, packages, invStats, allocStats, salesStats, recentSales, recentInv, companySubs, activePlans] = await Promise.all([
    c.env.DB.prepare("SELECT id, full_name, username, role, commission_rate, active, created_at FROM users WHERE company_id=? ORDER BY role,created_at").bind(id).all<any>(),
    c.env.DB.prepare("SELECT id, name, active FROM branches WHERE company_id=? ORDER BY name").bind(id).all<any>(),
    c.env.DB.prepare("SELECT id, name, size_gb, sale_price_per_gb, active FROM packages WHERE company_id=? ORDER BY size_gb").bind(id).all<any>(),
    c.env.DB.prepare("SELECT COUNT(*) as batches, COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(total_gross),0) as val FROM inventory_batches WHERE company_id=?").bind(id).first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) as batches, COALESCE(SUM(total_gb),0) as gb, COALESCE(SUM(total_gross),0) as val FROM allocation_batches WHERE company_id=?").bind(id).first<any>(),
    c.env.DB.prepare("SELECT COUNT(*) as n, COALESCE(SUM(gross_amount),0) as rev, COALESCE(SUM(net_amount),0) as net FROM sales WHERE company_id=?").bind(id).first<any>(),
    c.env.DB.prepare(`SELECT s.created_at, u.full_name as seller, p.name as pkg, s.quantity, s.gross_amount
      FROM sales s JOIN users u ON u.id=s.seller_id JOIN packages p ON p.id=s.package_id
      WHERE s.company_id=? ORDER BY s.created_at DESC LIMIT 8`).bind(id).all<any>(),
    c.env.DB.prepare(`SELECT b.created_at, br.name as branch, b.total_gb, b.total_gross, b.notes
      FROM inventory_batches b JOIN branches br ON br.id=b.branch_id
      WHERE b.company_id=? ORDER BY b.created_at DESC LIMIT 6`).bind(id).all<any>(),
    c.env.DB.prepare(`
      SELECT cs.*, sp.name as plan_name, sp.color as plan_color
      FROM company_subscriptions cs
      JOIN subscription_plans sp ON sp.id=cs.plan_id
      WHERE cs.company_id=?
      ORDER BY cs.created_at DESC LIMIT 10`).bind(id).all<any>(),
    c.env.DB.prepare('SELECT id, name, color FROM subscription_plans WHERE is_active=1 ORDER BY sort_order').all<any>(),
  ]);

  const isActive = co.active !== 0;

  const userRows = (users.results||[]).map((u:any) => `
    <tr>
      <td style="color:#f1f5f9;font-weight:500">${u.full_name}</td>
      <td><code style="color:#94a3b8;font-size:.78rem">${u.username}</code></td>
      <td><span style="background:${u.role==='owner'?'#312e81':'#064e3b'};color:${u.role==='owner'?'#a5b4fc':'#6ee7b7'};padding:2px 7px;border-radius:99px;font-size:.7rem;font-weight:600">${u.role}</span></td>
      <td style="color:#94a3b8">${u.role==='seller'?Math.round(u.commission_rate*100)+'%':'—'}</td>
      <td><span style="color:${u.active?'#4ade80':'#f87171'};font-size:.8rem">${u.active?'✓':'✗'}</span></td>
      <td style="color:#64748b;font-size:.75rem">${fdate(u.created_at)}</td>
    </tr>`).join('');

  const saleRows = (recentSales.results||[]).map((s:any) => `
    <tr>
      <td style="color:#64748b;font-size:.75rem">${fdate(s.created_at)}</td>
      <td style="color:#e2e8f0">${s.seller}</td>
      <td style="color:#94a3b8">${s.pkg}</td>
      <td style="color:#94a3b8">${s.quantity}</td>
      <td style="color:#4ade80;font-weight:600">${fm(s.gross_amount)}</td>
    </tr>`).join('');

  const invRows = (recentInv.results||[]).map((b:any) => `
    <tr>
      <td style="color:#64748b;font-size:.75rem">${fdate(b.created_at)}</td>
      <td style="color:#e2e8f0">${b.branch}</td>
      <td style="color:#60a5fa;font-weight:600">${fgb(b.total_gb)}</td>
      <td style="color:#94a3b8">${fm(b.total_gross)}</td>
      <td style="color:#64748b;font-size:.75rem">${b.notes||'—'}</td>
    </tr>`).join('');

  const html = saShell(co.name, saNav('companies', admin.full_name) + `
    <div class="sa-topbar">
      <div>
        <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap">
          <a href="/sa/companies" style="color:#64748b;text-decoration:none;font-size:.85rem">← Companies</a>
          <span style="color:#334155">/</span>
          <div class="sa-topbar-title">${co.name}</div>
          <code style="background:#1e1b4b;color:#818cf8;padding:2px 8px;border-radius:4px;font-size:.75rem">${co.slug}</code>
          <span class="${isActive ? 'badge-active' : 'badge-inactive'}">${isActive ? 'Active' : 'Inactive'}</span>
        </div>
        <div style="color:#64748b;font-size:.75rem;margin-top:.2rem">Created ${fdate(co.created_at)} · ${co.default_language.toUpperCase()}</div>
      </div>
      <div style="display:flex;gap:.5rem">
        <button onclick="saToggleCompany(${id},'${co.name.replace(/'/g,"\\'")}',${isActive?1:0})" class="sa-btn ${isActive ? 'sa-btn-warning' : 'sa-btn-success'}">${isActive ? '⏸ Deactivate' : '▶ Activate'}</button>
        <a href="/sa/companies/${id}/edit" class="sa-btn sa-btn-ghost">✏️ Edit</a>
        <button onclick="saDelete('/sa/api/companies/${id}','${co.name.replace(/'/g,"\\'")}',()=>location.href='/sa/companies')" class="sa-btn sa-btn-danger">🗑 Delete</button>
      </div>
    </div>
    <div class="sa-content">
      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:.875rem;margin-bottom:1.5rem">
        <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:1rem;text-align:center">
          <div style="color:#94a3b8;font-size:.68rem;text-transform:uppercase;font-weight:600;letter-spacing:.06em">Users</div>
          <div style="color:#f1f5f9;font-size:1.6rem;font-weight:800">${users.results?.length??0}</div>
        </div>
        <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:1rem;text-align:center">
          <div style="color:#94a3b8;font-size:.68rem;text-transform:uppercase;font-weight:600;letter-spacing:.06em">GB Stocked</div>
          <div style="color:#60a5fa;font-size:1.3rem;font-weight:800">${fgb(invStats?.gb??0)}</div>
        </div>
        <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:1rem;text-align:center">
          <div style="color:#94a3b8;font-size:.68rem;text-transform:uppercase;font-weight:600;letter-spacing:.06em">GB Allocated</div>
          <div style="color:#a78bfa;font-size:1.3rem;font-weight:800">${fgb(allocStats?.gb??0)}</div>
        </div>
        <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:1rem;text-align:center">
          <div style="color:#94a3b8;font-size:.68rem;text-transform:uppercase;font-weight:600;letter-spacing:.06em">Sales</div>
          <div style="color:#f1f5f9;font-size:1.6rem;font-weight:800">${salesStats?.n??0}</div>
        </div>
        <div style="background:linear-gradient(135deg,#14532d,#052e16);border:1px solid #166534;border-radius:10px;padding:1rem;text-align:center">
          <div style="color:#86efac;font-size:.68rem;text-transform:uppercase;font-weight:600;letter-spacing:.06em">Revenue</div>
          <div style="color:#4ade80;font-size:1.2rem;font-weight:800">${fm(salesStats?.rev??0)}</div>
        </div>
      </div>

      <!-- Subscription Section -->
      ${(() => {
        const subList = companySubs.results || [];
        const activeSub = subList.find((s: any) => s.status === 'active' && new Date(s.end_date) >= new Date());
        const planOptions = (activePlans.results || []).map((p: any) => `<option value="${p.id}">${p.name}</option>`).join('');
        const subRows = subList.map((s: any) => {
          const dLeft = Math.ceil((new Date(s.end_date).getTime() - Date.now()) / 86400000);
          let badge = '';
          if (s.status === 'cancelled') badge = `<span style="background:#1e293b;color:#64748b;padding:2px 6px;border-radius:99px;font-size:.68rem">لغو</span>`;
          else if (dLeft < 0) badge = `<span style="background:#7f1d1d;color:#fca5a5;padding:2px 6px;border-radius:99px;font-size:.68rem">منقضی</span>`;
          else if (dLeft <= 7) badge = `<span style="background:#451a03;color:#fcd34d;padding:2px 6px;border-radius:99px;font-size:.68rem">⚠ ${dLeft}d</span>`;
          else badge = `<span style="background:#064e3b;color:#6ee7b7;padding:2px 6px;border-radius:99px;font-size:.68rem">✓ ${dLeft}d</span>`;
          return `<tr>
            <td><div style="display:flex;align-items:center;gap:.35rem"><div style="width:7px;height:7px;border-radius:50%;background:${s.plan_color}"></div><span style="color:#c7d2fe">${s.plan_name}</span></div></td>
            <td style="color:#94a3b8;font-size:.78rem">${new Date(s.start_date).toLocaleDateString('en-GB')}</td>
            <td style="color:#94a3b8;font-size:.78rem">${new Date(s.end_date).toLocaleDateString('en-GB')}</td>
            <td>${badge}</td>
            <td style="color:#fbbf24;font-weight:600">${fm(s.amount_paid)}</td>
            <td style="color:#64748b;font-size:.72rem">${s.payment_method||'cash'}</td>
          </tr>`;
        }).join('');
        const activeSubHtml = activeSub ? `
          <div style="display:flex;align-items:center;gap:.75rem;background:#0f172a;border-radius:8px;padding:.625rem 1rem;margin-bottom:.75rem">
            <div style="width:10px;height:10px;border-radius:50%;background:${activeSub.plan_color};flex-shrink:0"></div>
            <div style="flex:1">
              <div style="color:#e2e8f0;font-size:.85rem;font-weight:600">${activeSub.plan_name}</div>
              <div style="color:#64748b;font-size:.72rem">تا ${new Date(activeSub.end_date).toLocaleDateString('en-GB')} · ${Math.ceil((new Date(activeSub.end_date).getTime()-Date.now())/86400000)} روز مانده</div>
            </div>
            <span style="background:#064e3b;color:#6ee7b7;padding:3px 10px;border-radius:99px;font-size:.75rem;font-weight:600">فعال</span>
          </div>` : `<div style="color:#f87171;font-size:.82rem;background:#450a0a;border-radius:8px;padding:.5rem 1rem;margin-bottom:.75rem">⚠ اشتراک فعالی ندارد</div>`;
        return `
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden;margin-bottom:1rem">
          <div style="display:flex;justify-content:space-between;align-items:center;padding:.875rem 1rem;border-bottom:1px solid #334155">
            <div style="color:#f1f5f9;font-weight:600;font-size:.9rem">🔖 اشتراک‌ها (${subList.length})</div>
            <button onclick="openModal('add-sub-detail-modal')" class="sa-btn sa-btn-primary sa-btn-sm">+ اشتراک جدید</button>
          </div>
          <div style="padding:1rem">
            ${activeSubHtml}
            ${subRows ? `<div style="overflow-x:auto"><table class="sa-table"><thead><tr><th>پلن</th><th>شروع</th><th>پایان</th><th>وضعیت</th><th>مبلغ</th><th>روش</th></tr></thead><tbody>${subRows}</tbody></table></div>` : '<div style="color:#64748b;text-align:center;padding:1rem;font-size:.82rem">تاریخچه اشتراکی موجود نیست</div>'}
          </div>
        </div>

        <!-- ADD SUB MODAL for company detail -->
        <div class="modal-overlay" id="add-sub-detail-modal">
          <div class="modal-box" style="max-width:460px">
            <div class="modal-header">
              <div class="modal-title">➕ ثبت اشتراک برای ${co.name}</div>
              <button class="modal-close" onclick="closeModal('add-sub-detail-modal')">✕</button>
            </div>
            <form method="POST" action="/sa/subscriptions/add">
              <input type="hidden" name="company_id" value="${id}"/>
              <div class="sa-form-group">
                <label>پلن اشتراک *</label>
                <select name="plan_id" required onchange="updateDetailSubPrice(this)">${planOptions}</select>
              </div>
              <div class="sa-form-row">
                <div class="sa-form-group">
                  <label>تاریخ شروع *</label>
                  <input type="date" name="start_date" id="det-sub-start" required value="${new Date().toISOString().split('T')[0]}"/>
                </div>
                <div class="sa-form-group">
                  <label>مبلغ پرداخت (؋) *</label>
                  <input type="number" name="amount_paid" id="det-sub-amount" required min="0" step="50"/>
                </div>
              </div>
              <div class="sa-form-group">
                <label>روش پرداخت</label>
                <select name="payment_method">
                  <option value="cash">💵 نقد</option><option value="bank">🏦 بانک</option>
                  <option value="card">💳 کارت</option><option value="mobile">📱 موبایل‌پی</option>
                </select>
              </div>
              <div class="sa-form-group">
                <label>یادداشت</label>
                <input type="text" name="payment_note" placeholder="اختیاری" dir="rtl"/>
              </div>
              <div style="display:flex;gap:.75rem;justify-content:flex-end;margin-top:1rem">
                <button type="button" onclick="closeModal('add-sub-detail-modal')" class="sa-btn sa-btn-ghost">لغو</button>
                <button type="submit" class="sa-btn sa-btn-primary">💾 ثبت اشتراک</button>
              </div>
            </form>
          </div>
        </div>`;
      })()}

      <!-- Users + Packages/Branches -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
          <div style="padding:.875rem 1rem;border-bottom:1px solid #334155;color:#f1f5f9;font-weight:600;font-size:.9rem">👥 Users (${users.results?.length??0})</div>
          <div style="overflow-x:auto">
            <table class="sa-table">
              <thead><tr><th>Name</th><th>User</th><th>Role</th><th>Comm</th><th>Status</th><th>Joined</th></tr></thead>
              <tbody>${userRows||'<tr><td colspan="6" style="text-align:center;color:#64748b;padding:1.5rem">No users</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:1rem">
          <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
            <div style="padding:.75rem 1rem;border-bottom:1px solid #334155;color:#f1f5f9;font-weight:600;font-size:.88rem">🗂 Packages (${packages.results?.length??0})</div>
            <div style="padding:.625rem 1rem">
              ${(packages.results||[]).map((p:any) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:.35rem 0;border-bottom:1px solid #0f172a">
                  <span style="color:#e2e8f0;font-size:.83rem">${p.name}</span>
                  <div style="display:flex;gap:.5rem;align-items:center">
                    <span style="color:#60a5fa;font-size:.8rem">${p.size_gb}GB</span>
                    <span style="color:#94a3b8;font-size:.75rem">@ ؋${p.sale_price_per_gb}/GB</span>
                    <span style="color:${p.active?'#4ade80':'#f87171'};font-size:.7rem">${p.active?'✓':'✗'}</span>
                  </div>
                </div>`).join('')||'<div style="color:#64748b;font-size:.83rem;text-align:center;padding:.75rem">No packages</div>'}
            </div>
          </div>
          <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
            <div style="padding:.75rem 1rem;border-bottom:1px solid #334155;color:#f1f5f9;font-weight:600;font-size:.88rem">🏢 Branches (${branches.results?.length??0})</div>
            <div style="padding:.625rem 1rem">
              ${(branches.results||[]).map((b:any) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:.3rem 0">
                  <span style="color:#e2e8f0;font-size:.83rem">${b.name}</span>
                  <span style="color:${b.active?'#4ade80':'#f87171'};font-size:.7rem">${b.active?'✓':'✗'}</span>
                </div>`).join('')||'<div style="color:#64748b;font-size:.83rem;text-align:center;padding:.75rem">No branches</div>'}
            </div>
          </div>
        </div>
      </div>

      <!-- Sales + Inventory history -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
          <div style="padding:.875rem 1rem;border-bottom:1px solid #334155;color:#f1f5f9;font-weight:600;font-size:.9rem">💰 Recent Sales</div>
          <div style="overflow-x:auto">
            <table class="sa-table">
              <thead><tr><th>Date</th><th>Seller</th><th>Package</th><th>Qty</th><th>Amount</th></tr></thead>
              <tbody>${saleRows||'<tr><td colspan="5" style="text-align:center;color:#64748b;padding:1.5rem">No sales yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;overflow:hidden">
          <div style="padding:.875rem 1rem;border-bottom:1px solid #334155;color:#f1f5f9;font-weight:600;font-size:.9rem">📦 Recent Stock-In</div>
          <div style="overflow-x:auto">
            <table class="sa-table">
              <thead><tr><th>Date</th><th>Branch</th><th>GB</th><th>Value</th><th>Note</th></tr></thead>
              <tbody>${invRows||'<tr><td colspan="5" style="text-align:center;color:#64748b;padding:1.5rem">No inventory yet</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div></div>`, `<script>
  const DETAIL_PLAN_PRICES = ${JSON.stringify(Object.fromEntries((activePlans.results||[]).map((p:any)=>[p.id,p.price])))};
  function updateDetailSubPrice(sel) {
    const price = DETAIL_PLAN_PRICES[sel.value] || 0;
    const el = document.getElementById('det-sub-amount');
    if (el) el.value = price;
  }
  document.addEventListener('DOMContentLoaded', function() {
    const sel = document.querySelector('#add-sub-detail-modal select[name="plan_id"]');
    if (sel) updateDetailSubPrice(sel);
  });
  </script>`);
  return c.html(html);
});

// ============================================================
// SA Edit Company
// ============================================================
sa.get('/sa/companies/:id/edit', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const id = c.req.param('id');

  const co = await c.env.DB.prepare('SELECT * FROM companies WHERE id=?').bind(id).first<any>();
  if (!co) return c.html('Company not found', 404);

  const html = saShell('Edit Company', saNav('companies', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">Edit: ${co.name}</div>
      <a href="/sa/companies/${id}" class="sa-btn sa-btn-ghost">← Back</a>
    </div>
    <div class="sa-content">
      <div class="sa-card" style="max-width:480px">
        <form method="POST" action="/sa/companies/${id}/edit">
          <div class="sa-form-group">
            <label>Company Name *</label>
            <input type="text" name="company_name" required value="${co.name}"/>
          </div>
          <div class="sa-form-group">
            <label>Slug *</label>
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
          <div style="display:flex;gap:.75rem;margin-top:1.25rem">
            <a href="/sa/companies/${id}" class="sa-btn sa-btn-ghost">Cancel</a>
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
    return new Response(null, { status: 302, headers: { 'Location': '/sa/companies/${id}' } });
  } catch (e: any) {
    return c.html(`Error: ${e.message}`, 400);
  }
});

// ============================================================
// SA Toggle Company Active
// ============================================================
sa.post('/sa/api/companies/:id/toggle', async (c) => {
  const id = c.req.param('id');
  try {
    const co = await c.env.DB.prepare('SELECT COALESCE(active,1) as active FROM companies WHERE id=?').bind(id).first<{active:number}>();
    if (!co) return c.json({ success: false, error: 'Not found' }, 404);
    const newActive = co.active === 0 ? 1 : 0;
    await c.env.DB.prepare('UPDATE companies SET active=? WHERE id=?').bind(newActive, id).run();
    // When deactivating: immediately kill ALL active sessions for this company
    if (newActive === 0) {
      await c.env.DB.prepare('DELETE FROM sessions WHERE company_id=?').bind(id).run();
    }
    return c.json({ success: true, active: newActive });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================================
// SA Delete Company
// ============================================================
sa.delete('/sa/api/companies/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM sessions WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM payments WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM sales WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM allocation_batch_lines WHERE batch_id IN (SELECT id FROM allocation_batches WHERE company_id=?)').bind(id).run();
    await c.env.DB.prepare('DELETE FROM allocation_batches WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM allocations WHERE company_id=?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM inventory_batch_lines WHERE batch_id IN (SELECT id FROM inventory_batches WHERE company_id=?)').bind(id).run();
    await c.env.DB.prepare('DELETE FROM inventory_batches WHERE company_id=?').bind(id).run();
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
// SA Settings (change own password + profile)
// ============================================================
sa.get('/sa/settings', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const url = new URL(c.req.url);
  const ok = url.searchParams.get('ok');
  const err = url.searchParams.get('err');

  const target = await c.env.DB.prepare('SELECT * FROM super_admins WHERE id=?').bind(admin.id).first<any>();

  const html = saShell('Settings', saNav('settings', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">Account Settings</div>
    </div>
    <div class="sa-content">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;max-width:860px">

        <!-- Profile -->
        <div class="sa-card">
          <div style="color:#f1f5f9;font-weight:700;font-size:.95rem;margin-bottom:1.25rem">👤 Profile</div>
          ${ok==='profile' ? '<div class="sa-alert sa-alert-success">✓ Profile updated</div>' : ''}
          ${err==='profile' ? '<div class="sa-alert sa-alert-error">Error updating profile</div>' : ''}
          <form method="POST" action="/sa/settings/profile">
            <div class="sa-form-group">
              <label>Full Name</label>
              <input type="text" name="full_name" required value="${target?.full_name??''}"/>
            </div>
            <div class="sa-form-group">
              <label>Username</label>
              <input type="text" name="username" required value="${target?.username??''}"/>
            </div>
            <button type="submit" class="sa-btn sa-btn-primary" style="width:100%;justify-content:center">Save Profile</button>
          </form>
        </div>

        <!-- Change Password -->
        <div class="sa-card">
          <div style="color:#f1f5f9;font-weight:700;font-size:.95rem;margin-bottom:1.25rem">🔒 Change Password</div>
          ${ok==='password' ? '<div class="sa-alert sa-alert-success">✓ Password changed successfully</div>' : ''}
          ${err==='wrong' ? '<div class="sa-alert sa-alert-error">Current password is incorrect</div>' : ''}
          ${err==='mismatch' ? '<div class="sa-alert sa-alert-error">New passwords do not match</div>' : ''}
          ${err==='short' ? '<div class="sa-alert sa-alert-error">Password must be at least 6 characters</div>' : ''}
          <form method="POST" action="/sa/settings/password">
            <div class="sa-form-group">
              <label>Current Password *</label>
              <input type="password" name="current_password" required placeholder="••••••••"/>
            </div>
            <div class="sa-form-group">
              <label>New Password *</label>
              <input type="password" name="new_password" required placeholder="••••••••" minlength="6"/>
            </div>
            <div class="sa-form-group">
              <label>Confirm New Password *</label>
              <input type="password" name="confirm_password" required placeholder="••••••••"/>
            </div>
            <button type="submit" class="sa-btn sa-btn-primary" style="width:100%;justify-content:center">Change Password</button>
          </form>
        </div>

        <!-- Info card -->
        <div class="sa-card" style="grid-column:1/-1">
          <div style="color:#f1f5f9;font-weight:700;font-size:.95rem;margin-bottom:1rem">ℹ️ Account Info</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
            <div>
              <div style="color:#64748b;font-size:.75rem;margin-bottom:.25rem">Username</div>
              <div style="color:#f1f5f9;font-weight:600">${target?.username??''}</div>
            </div>
            <div>
              <div style="color:#64748b;font-size:.75rem;margin-bottom:.25rem">Full Name</div>
              <div style="color:#f1f5f9;font-weight:600">${target?.full_name??''}</div>
            </div>
            <div>
              <div style="color:#64748b;font-size:.75rem;margin-bottom:.25rem">Account Created</div>
              <div style="color:#f1f5f9;font-weight:600">${target?.created_at ? new Date(target.created_at).toLocaleDateString('en-GB') : '—'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div></div>`);
  return c.html(html);
});

sa.post('/sa/settings/profile', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number };
  const form = await c.req.formData();
  const fullName = form.get('full_name')?.toString().trim() ?? '';
  const username = form.get('username')?.toString().trim() ?? '';

  if (!fullName || !username) {
    return new Response(null, { status: 302, headers: { 'Location': '/sa/settings?err=profile' } });
  }
  try {
    await c.env.DB.prepare('UPDATE super_admins SET full_name=?, username=? WHERE id=?').bind(fullName, username, admin.id).run();
    return new Response(null, { status: 302, headers: { 'Location': '/sa/settings?ok=profile' } });
  } catch {
    return new Response(null, { status: 302, headers: { 'Location': '/sa/settings?err=profile' } });
  }
});

sa.post('/sa/settings/password', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number };
  const form = await c.req.formData();
  const currentPwd = form.get('current_password')?.toString() ?? '';
  const newPwd = form.get('new_password')?.toString() ?? '';
  const confirmPwd = form.get('confirm_password')?.toString() ?? '';

  if (newPwd.length < 6) {
    return new Response(null, { status: 302, headers: { 'Location': '/sa/settings?err=short' } });
  }
  if (newPwd !== confirmPwd) {
    return new Response(null, { status: 302, headers: { 'Location': '/sa/settings?err=mismatch' } });
  }

  const currentHash = await hashPassword(currentPwd);
  const row = await c.env.DB.prepare('SELECT id FROM super_admins WHERE id=? AND password_hash=?').bind(admin.id, currentHash).first();
  if (!row) {
    return new Response(null, { status: 302, headers: { 'Location': '/sa/settings?err=wrong' } });
  }

  const newHash = await hashPassword(newPwd);
  await c.env.DB.prepare('UPDATE super_admins SET password_hash=? WHERE id=?').bind(newHash, admin.id).run();
  return new Response(null, { status: 302, headers: { 'Location': '/sa/settings?ok=password' } });
});

// ============================================================
// SA Manage Super Admins
// ============================================================
sa.get('/sa/admins', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const url = new URL(c.req.url);
  const ok = url.searchParams.get('ok');

  const items = await c.env.DB.prepare(
    'SELECT id, username, full_name, active, created_at FROM super_admins ORDER BY created_at ASC'
  ).all<any>();

  const rows = (items.results||[]).map((a: any) => `
    <tr>
      <td><strong style="color:#f1f5f9">${a.full_name}</strong></td>
      <td><code style="color:#94a3b8">${a.username}</code></td>
      <td><span class="${a.active ? 'badge-active' : 'badge-inactive'}">${a.active ? 'Active' : 'Inactive'}</span></td>
      <td style="color:#64748b;font-size:.8rem">${new Date(a.created_at).toLocaleDateString('en-GB')}</td>
      <td>
        ${a.id !== admin.id
          ? `<div style="display:flex;gap:.3rem">
              <a href="/sa/admins/${a.id}/edit" class="sa-btn sa-btn-ghost sa-btn-sm">✏️ Edit</a>
              <button onclick="saDelete('/sa/api/admins/${a.id}','${a.username}')" class="sa-btn sa-btn-danger sa-btn-sm">🗑</button>
            </div>`
          : `<span style="color:#64748b;font-size:.78rem">You (current)</span>`}
      </td>
    </tr>`).join('');

  const html = saShell('Super Admins', saNav('admins', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">Super Administrators</div>
      <button onclick="openModal('add-admin-modal')" class="sa-btn sa-btn-primary">+ Add Super Admin</button>
    </div>
    <div class="sa-content">
      ${ok==='added' ? '<div class="sa-alert sa-alert-success">✓ Super admin added</div>' : ''}
      <div class="sa-card">
        <table class="sa-table">
          <thead><tr><th>Name</th><th>Username</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:2rem">No super admins</td></tr>'}</tbody>
        </table>
      </div>
      <div style="margin-top:1rem;padding:.875rem 1rem;background:#1e293b;border:1px solid #334155;border-radius:10px">
        <div style="color:#94a3b8;font-size:.8rem">💡 Tip: Super admins have full access to the platform. To change your own password, go to <a href="/sa/settings" style="color:#818cf8">Settings</a>.</div>
      </div>
    </div>
  </div></div>

  <!-- Add Admin Modal -->
  <div id="add-admin-modal" class="modal-overlay">
    <div class="modal-box">
      <div class="modal-header">
        <div class="modal-title">Add Super Admin</div>
        <button class="modal-close" onclick="closeModal('add-admin-modal')">✕</button>
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
        <div style="display:flex;gap:.75rem;margin-top:1rem">
          <button type="button" onclick="closeModal('add-admin-modal')" class="sa-btn sa-btn-ghost">Cancel</button>
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
    return new Response(null, { status: 302, headers: { 'Location': '/sa/admins?ok=added' } });
  } catch (e: any) {
    return c.html(`Error: ${e.message}`, 400);
  }
});

sa.get('/sa/admins/:id/edit', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const id = c.req.param('id');
  const target = await c.env.DB.prepare('SELECT * FROM super_admins WHERE id=?').bind(id).first<any>();
  if (!target) return c.html('Not found', 404);

  const html = saShell('Edit Admin', saNav('admins', admin.full_name) + `
    <div class="sa-topbar">
      <div class="sa-topbar-title">Edit Super Admin: ${target.full_name}</div>
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
          <div style="display:flex;gap:.75rem;margin-top:1.25rem">
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

// ============================================================
// SA Plans Routes
// ============================================================
sa.get('/sa/plans', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const url = new URL(c.req.url);
  return c.html(await handlePlansGet(c.env.DB, admin, url, saShell, saNav));
});

sa.post('/sa/plans/add', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number };
  const form = await c.req.formData();
  const name          = form.get('name')?.toString().trim() ?? '';
  const name_en       = form.get('name_en')?.toString().trim() ?? '';
  const price         = parseFloat(form.get('price')?.toString() ?? '0');
  const duration_days = parseInt(form.get('duration_days')?.toString() ?? '30');
  const max_sellers   = parseInt(form.get('max_sellers')?.toString() ?? '5');
  const max_branches  = parseInt(form.get('max_branches')?.toString() ?? '2');
  const color         = form.get('color')?.toString() ?? '#4f46e5';
  const sort_order    = parseInt(form.get('sort_order')?.toString() ?? '0');
  const featText      = form.get('features_text')?.toString() ?? '';
  const features      = JSON.stringify(featText.split('\n').map(s => s.trim()).filter(Boolean));

  if (!name) return new Response(null, { status: 302, headers: { 'Location': '/sa/plans?err=نام+پلن+الزامی+است' } });

  await c.env.DB.prepare(`
    INSERT INTO subscription_plans (name, name_en, price, duration_days, max_sellers, max_branches, features, color, sort_order)
    VALUES (?,?,?,?,?,?,?,?,?)`
  ).bind(name, name_en, price, duration_days, max_sellers, max_branches, features, color, sort_order).run();

  return new Response(null, { status: 302, headers: { 'Location': '/sa/plans?ok=1' } });
});

sa.post('/sa/plans/:id/edit', async (c) => {
  const id   = c.req.param('id');
  const form = await c.req.formData();
  const name          = form.get('name')?.toString().trim() ?? '';
  const name_en       = form.get('name_en')?.toString().trim() ?? '';
  const price         = parseFloat(form.get('price')?.toString() ?? '0');
  const duration_days = parseInt(form.get('duration_days')?.toString() ?? '30');
  const max_sellers   = parseInt(form.get('max_sellers')?.toString() ?? '5');
  const max_branches  = parseInt(form.get('max_branches')?.toString() ?? '2');
  const color         = form.get('color')?.toString() ?? '#4f46e5';
  const sort_order    = parseInt(form.get('sort_order')?.toString() ?? '0');
  const is_active     = form.get('is_active')?.toString() === '1' ? 1 : 0;
  const featText      = form.get('features_text')?.toString() ?? '';
  const features      = JSON.stringify(featText.split('\n').map(s => s.trim()).filter(Boolean));

  await c.env.DB.prepare(`
    UPDATE subscription_plans SET name=?, name_en=?, price=?, duration_days=?, max_sellers=?,
      max_branches=?, features=?, color=?, sort_order=?, is_active=? WHERE id=?`
  ).bind(name, name_en, price, duration_days, max_sellers, max_branches, features, color, sort_order, is_active, id).run();

  return new Response(null, { status: 302, headers: { 'Location': '/sa/plans?ok=1' } });
});

sa.post('/sa/plans/:id/delete', async (c) => {
  const id = c.req.param('id');
  try {
    // Don't delete if active subscriptions exist
    const active = await c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM company_subscriptions WHERE plan_id=? AND status='active' AND end_date>=date('now')`
    ).bind(id).first<{n:number}>();
    if ((active?.n ?? 0) > 0) {
      return c.json({ success: false, error: 'این پلن اشتراک‌های فعال دارد و قابل حذف نیست' });
    }
    await c.env.DB.prepare('DELETE FROM subscription_plans WHERE id=?').bind(id).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================================
// SA Subscriptions Routes
// ============================================================
sa.get('/sa/subscriptions', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const url = new URL(c.req.url);
  return c.html(await handleSubscriptionsGet(c.env.DB, admin, url, saShell, saNav));
});

sa.post('/sa/subscriptions/add', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number };
  const form = await c.req.formData();
  const company_id     = parseInt(form.get('company_id')?.toString() ?? '0');
  const plan_id        = parseInt(form.get('plan_id')?.toString() ?? '0');
  const start_date     = form.get('start_date')?.toString() ?? new Date().toISOString().split('T')[0];
  const amount_paid    = parseFloat(form.get('amount_paid')?.toString() ?? '0');
  const payment_method = form.get('payment_method')?.toString() ?? 'cash';
  const payment_note   = form.get('payment_note')?.toString() ?? '';

  if (!company_id || !plan_id) {
    return new Response(null, { status: 302, headers: { 'Location': '/sa/subscriptions?err=1' } });
  }

  // Get plan duration to calculate end_date
  const plan = await c.env.DB.prepare('SELECT duration_days FROM subscription_plans WHERE id=?').bind(plan_id).first<{duration_days:number}>();
  const durDays = plan?.duration_days ?? 30;
  const startDt = new Date(start_date);
  const endDt = new Date(startDt.getTime() + durDays * 24 * 60 * 60 * 1000);
  const end_date = endDt.toISOString().split('T')[0];

  // Mark previous active subscriptions for this company as expired
  await c.env.DB.prepare(
    `UPDATE company_subscriptions SET status='expired' WHERE company_id=? AND status='active'`
  ).bind(company_id).run();

  await c.env.DB.prepare(`
    INSERT INTO company_subscriptions (company_id, plan_id, start_date, end_date, amount_paid, payment_method, payment_note, status, created_by)
    VALUES (?,?,?,?,?,?,?,'active',?)`
  ).bind(company_id, plan_id, start_date, end_date, amount_paid, payment_method, payment_note || null, admin.id).run();

  return new Response(null, { status: 302, headers: { 'Location': '/sa/subscriptions?ok=1' } });
});

// ============================================================
// SA Delete Subscription
// ============================================================
sa.delete('/sa/api/subscriptions/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    if (!id) return c.json({ success: false, error: 'Invalid ID' }, 400);

    // Get subscription info before deleting
    const sub = await c.env.DB.prepare(
      `SELECT cs.*, c.name as company_name FROM company_subscriptions cs
       JOIN companies c ON c.id=cs.company_id WHERE cs.id=?`
    ).bind(id).first<any>();

    if (!sub) return c.json({ success: false, error: 'اشتراک یافت نشد' }, 404);

    await c.env.DB.prepare('DELETE FROM company_subscriptions WHERE id=?').bind(id).run();

    return c.json({ success: true, message: `اشتراک شرکت ${sub.company_name} حذف شد` });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

// ============================================================
// SA Revenue Route
// ============================================================
sa.get('/sa/revenue', async (c) => {
  const admin = c.get('sa_admin' as any) as { id: number; username: string; full_name: string };
  const url = new URL(c.req.url);
  return c.html(await handleRevenueGet(c.env.DB, admin, url, saShell, saNav));
});

export default sa;
