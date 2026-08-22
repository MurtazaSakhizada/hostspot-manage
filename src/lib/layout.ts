// ============================================
// HTML Layout Builder
// ============================================
import type { Lang } from './i18n';
import { t, getDir, LANGUAGES } from './i18n';
import type { SessionUser } from './auth';

export function pageShell(opts: {
  title: string;
  lang: Lang;
  user?: SessionUser | null;
  body: string;
  scripts?: string;
  extraHead?: string;
  activePage?: string;
}): string {
  const { title, lang, user, body, scripts = '', extraHead = '', activePage = '' } = opts;
  const dir = getDir(lang);
  const isRTL = dir === 'rtl';
  const isOwner = user?.role === 'owner';
  const sellerPanelEnabled = (user?.seller_panel_enabled ?? 1) !== 0;
  // When seller_panel_enabled=0: seller cannot be logged in (auth blocks it),
  // but owner nav is fully shown. Seller-exclusive links hidden as a safety measure.
  const showSellerLinks = isOwner || sellerPanelEnabled;

  const navLinks = user ? `
    <!-- ── ALL USERS ─────────────────────────── -->
    <a href="/dashboard" class="nav-link ${activePage === 'dashboard' ? 'active' : ''}">
      <i class="icon-chart"></i><span>${t(lang, 'dashboard')}</span>
    </a>
    <a href="/inventory" class="nav-link ${activePage === 'inventory' ? 'active' : ''}">
      <i class="icon-box"></i><span>${t(lang, 'inventory')}</span>
    </a>
    <a href="/allocations" class="nav-link ${activePage === 'allocations' ? 'active' : ''}">
      <i class="icon-share"></i><span>${t(lang, 'allocations')}</span>
    </a>
    <a href="/sales" class="nav-link ${activePage === 'sales' ? 'active' : ''}">
      <i class="icon-dollar"></i><span>${t(lang, 'sales')}</span>
    </a>
    ${showSellerLinks ? `
    <a href="/payments" class="nav-link ${activePage === 'payments' ? 'active' : ''}">
      <i class="icon-card"></i><span>${t(lang, 'payments')}</span>
    </a>` : ''}
    <a href="/reports" class="nav-link ${activePage === 'reports' ? 'active' : ''}">
      <i class="icon-file"></i><span>${t(lang, 'reports')}</span>
    </a>
    <a href="/expenses" class="nav-link ${activePage === 'expenses' ? 'active' : ''}">
      <i class="icon-minus">💸</i><span>${t(lang, 'expenses')}</span>
    </a>
    <a href="/ledger" class="nav-link ${activePage === 'ledger' ? 'active' : ''}">
      <i class="icon-ledger">📒</i><span>دفتر مالی</span>
    </a>
    ${isOwner ? `
    <a href="/notifications" class="nav-link ${activePage === 'notifications' ? 'active' : ''}" style="position:relative">
      <i class="icon-bell">🔔</i><span>${t(lang, 'notifications')}</span>
    </a>` : ''}
    <a href="/settings" class="nav-link ${activePage === 'settings' ? 'active' : ''}">
      <i class="icon-gear">⚙️</i><span>${t(lang, 'settings')}</span>
    </a>

    ${isOwner ? `
    <div style="margin:.5rem 1rem .25rem;font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;color:var(--text-muted);font-weight:600">
      ${t(lang, 'management')}
    </div>
    <a href="/branches" class="nav-link ${activePage === 'branches' ? 'active' : ''}">
      <i class="icon-building"></i><span>${t(lang, 'branches')}</span>
    </a>
    <a href="/packages" class="nav-link ${activePage === 'packages' ? 'active' : ''}">
      <i class="icon-pkg"></i><span>${t(lang, 'packages')}</span>
    </a>
    <a href="/users" class="nav-link ${activePage === 'users' ? 'active' : ''}">
      <i class="icon-people"></i><span>${t(lang, 'users')}</span>
    </a>` : ''}
  ` : '';

  const langSwitcher = LANGUAGES.map(l => `
    <a href="/api/language/${l.code}" class="lang-btn ${lang === l.code ? 'active' : ''}">${l.label}</a>
  `).join('');

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"/>
  <meta name="mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <meta name="apple-mobile-web-app-status-bar-style" content="default"/>
  <meta name="theme-color" content="#4f46e5"/>
  <title>${title} — ${t(lang, 'app_name')}</title>
  <link rel="icon" type="image/svg+xml" href="/favicon.svg"/>
  <link rel="shortcut icon" href="/favicon.svg"/>
  <link rel="apple-touch-icon" href="/static/logo.svg"/>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Vazirmatn:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="manifest" href="/manifest.json"/>
  <link rel="stylesheet" href="/static/style.css"/>
  <link rel="stylesheet" href="/static/splash.css"/>
  ${extraHead}
</head>
<body class="${isRTL ? 'rtl' : 'ltr'}">
<script src="/static/splash.js"></script>
${user ? `
<div class="app-layout">
  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="logo">
        <div class="logo-icon" style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;background:linear-gradient(135deg,#4338ca,#7c3aed);border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(67,56,202,0.4)">
          <img src="/static/logo.svg" alt="Logo" style="width:30px;height:30px;object-fit:contain" onerror="this.parentNode.innerHTML='📶'"/>
        </div>
        <span class="logo-text">${t(lang, 'app_name')}</span>
      </div>
      <button class="sidebar-toggle" onclick="toggleSidebar()">☰</button>
    </div>
    <nav class="sidebar-nav">
      ${navLinks}
    </nav>
    <div class="sidebar-footer">
      <div class="user-info">
        <div class="user-avatar">${user.full_name.charAt(0).toUpperCase()}</div>
        <div class="user-details">
          <div class="user-name">${user.full_name}</div>
          <div class="user-role badge badge-${user.role}">${t(lang, user.role === 'owner' ? 'owner' : 'seller_role')}</div>
        </div>
      </div>
      <div class="lang-switcher">${langSwitcher}</div>
      <a href="/logout" class="btn btn-ghost btn-sm logout-btn">
        <i class="icon-logout"></i> ${t(lang, 'logout')}
      </a>
    </div>
  </aside>
  <!-- Main Content -->
  <main class="main-content">
    <div class="topbar">
      <button class="mobile-menu-btn" onclick="toggleSidebar()">☰</button>
      <div class="topbar-right">
        <div class="lang-switcher-mobile">${langSwitcher}</div>
        <!-- Notification Bell (owners only) -->
        ${isOwner ? `<div class="notif-bell-wrap" id="notif-bell-wrap">
          <button class="notif-bell-btn" onclick="toggleNotifDropdown()" title="Notifications">
            🔔
            <span class="notif-badge" id="notif-badge" style="display:none">0</span>
          </button>
          <!-- Dropdown -->
          <div class="notif-dropdown" id="notif-dropdown" style="display:none">
            <div class="notif-drop-header">
              <span style="font-weight:600;color:var(--text-primary)">${t(lang, 'notif_dropdown_title')}</span>
              <a href="/notifications" style="font-size:.75rem;color:var(--primary)">${t(lang, 'notif_view_all')}</a>
            </div>
            <div id="notif-drop-list">
              <div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:.85rem">${t(lang, 'loading')}</div>
            </div>
            <div class="notif-drop-footer">
              <button onclick="markAllReadDrop()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:.78rem">${t(lang, 'notif_mark_all')}</button>
              <a href="/notifications" style="font-size:.78rem;color:var(--primary)">${t(lang, 'notif_view_all')} →</a>
            </div>
          </div>
        </div>` : ''}
      </div>
    </div>
    <div class="page-content">
      ${body}
    </div>
  </main>
</div>
` : `
<div class="auth-layout">
  <div class="lang-switcher-auth">${langSwitcher}</div>
  ${body}
</div>
`}
<style>
/* ── Notification Bell ─────────────────────────── */
.notif-bell-wrap{position:relative}
.notif-bell-btn{
  position:relative;background:none;border:none;cursor:pointer;
  font-size:1.2rem;padding:.4rem .5rem;border-radius:8px;
  transition:background .15s;line-height:1;
}
.notif-bell-btn:hover{background:var(--bg-tertiary)}
.notif-badge{
  position:absolute;top:-2px;right:-4px;
  background:var(--danger);color:#fff;
  font-size:.6rem;font-weight:700;min-width:16px;height:16px;
  border-radius:99px;display:flex;align-items:center;justify-content:center;
  padding:0 3px;pointer-events:none;
}
.notif-dropdown{
  position:absolute;top:calc(100% + 8px);right:0;
  width:340px;background:var(--bg-secondary);
  border:1px solid var(--border);border-radius:12px;
  box-shadow:0 8px 32px rgba(0,0,0,.35);z-index:999;
  overflow:hidden;
}
.notif-drop-header{
  display:flex;justify-content:space-between;align-items:center;
  padding:.75rem 1rem;border-bottom:1px solid var(--border);
}
.notif-drop-footer{
  display:flex;justify-content:space-between;align-items:center;
  padding:.625rem 1rem;border-top:1px solid var(--border);
  background:var(--bg-tertiary);
}
.notif-drop-item{
  display:flex;align-items:flex-start;gap:.625rem;
  padding:.75rem 1rem;border-bottom:1px solid var(--border);
  cursor:pointer;transition:background .12s;
}
.notif-drop-item:hover{background:var(--bg-tertiary)}
.notif-drop-item:last-child{border-bottom:none}
.notif-drop-unread{background:var(--bg-primary)}
.notif-drop-icon{
  width:30px;height:30px;border-radius:8px;
  display:flex;align-items:center;justify-content:center;
  font-size:.9rem;flex-shrink:0;
}
.notif-drop-title{color:var(--text-primary);font-size:.82rem;font-weight:600;margin-bottom:.15rem}
.notif-drop-msg{color:var(--text-secondary);font-size:.75rem;line-height:1.35}
.notif-drop-time{color:var(--text-muted);font-size:.7rem;margin-top:.2rem}
</style>
<script>
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.body.classList.toggle('sidebar-open');
}
function showToast(msg, type='success') {
  const t = document.createElement('div');
  t.className = 'toast toast-'+type;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=> t.classList.add('show'), 10);
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(), 300); }, 3000);
}
function confirmDelete(url, msg) {
  if (confirm(msg || 'Are you sure?')) {
    fetch(url, {method:'DELETE'}).then(r => r.json()).then(d => {
      if(d.success) { showToast('Deleted'); setTimeout(()=>location.reload(),500); }
      else showToast(d.error||'Error','error');
    });
  }
}
function toggleRow(id) {
  const el = document.getElementById(id);
  if(el) el.classList.toggle('hidden');
}

// ── Notification Bell Logic ────────────────────
let notifDropOpen = false;
function toggleNotifDropdown() {
  const drop = document.getElementById('notif-dropdown');
  if (!drop) return;
  notifDropOpen = !notifDropOpen;
  drop.style.display = notifDropOpen ? 'block' : 'none';
  if (notifDropOpen) loadNotifDropdown();
}
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('notif-bell-wrap');
  if(wrap && !wrap.contains(e.target)) {
    const drop = document.getElementById('notif-dropdown');
    if(drop) drop.style.display = 'none';
    notifDropOpen = false;
  }
});
function notifIconMap(cat) {
  return {inventory:'📦',allocation:'🔀',sale:'💰',payment:'💳',system:'⚙️',report:'📊'}[cat]||'🔔';
}
function notifColorMap(type) {
  return {info:'var(--primary)',warning:'var(--warning)',success:'var(--success)',error:'var(--danger)'}[type]||'var(--primary)';
}
function fRelTime(d) {
  const diff = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if(diff<60) return diff+'s ago';
  if(diff<3600) return Math.floor(diff/60)+'m ago';
  if(diff<86400) return Math.floor(diff/3600)+'h ago';
  return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short'});
}
async function loadNotifDropdown() {
  const list = document.getElementById('notif-drop-list');
  if(!list) return;
  try {
    const res = await fetch('/notifications/recent');
    const data = await res.json();
    if(!data.items || data.items.length===0) {
      list.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);font-size:.85rem">${t(lang, 'no_notif_dropdown')}</div>';
      return;
    }
    list.innerHTML = data.items.map(n => \`
      <div class="notif-drop-item \${n.is_read?'':'notif-drop-unread'}" onclick="notifDropClick(\${n.id},'\${n.link||''}')">
        <div class="notif-drop-icon" style="background:\${notifColorMap(n.type)}22;color:\${notifColorMap(n.type)}">\${notifIconMap(n.category)}</div>
        <div style="flex:1;min-width:0">
          <div class="notif-drop-title">\${n.title}</div>
          <div class="notif-drop-msg">\${n.message}</div>
          <div class="notif-drop-time">\${fRelTime(n.created_at)}</div>
        </div>
        \${!n.is_read?'<div style="width:7px;height:7px;background:var(--primary);border-radius:50%;margin-top:.35rem;flex-shrink:0"></div>':''}
      </div>
    \`).join('');
  } catch(e) {
    list.innerHTML = '<div style="text-align:center;padding:1rem;color:var(--danger);font-size:.82rem">${t(lang, 'failed_to_load')}</div>';
  }
}
async function notifDropClick(id, link) {
  await fetch('/notifications/read/'+id, {method:'POST'});
  updateNotifBadge();
  if(link) location.href = link;
  else { const drop=document.getElementById('notif-dropdown'); if(drop) drop.style.display='none'; notifDropOpen=false; }
}
async function markAllReadDrop() {
  await fetch('/notifications/read-all', {method:'POST'});
  updateNotifBadge();
  loadNotifDropdown();
}
async function updateNotifBadge() {
  try {
    const res = await fetch('/notifications/count');
    const d = await res.json();
    const badge = document.getElementById('notif-badge');
    if(badge){
      if(d.count>0){badge.textContent=d.count>99?'99+':d.count;badge.style.display='flex';}
      else badge.style.display='none';
    }
  } catch(e){}
}
// Poll badge every 30 seconds
document.addEventListener('DOMContentLoaded', function() {
  updateNotifBadge();
  setInterval(updateNotifBadge, 30000);
});
</script>
${scripts}
<script src="/static/mobile.js"></script>
</body>
</html>`;
}
