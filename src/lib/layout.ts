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

  const navLinks = user ? `
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
    <a href="/payments" class="nav-link ${activePage === 'payments' ? 'active' : ''}">
      <i class="icon-card"></i><span>${t(lang, 'payments')}</span>
    </a>
    <a href="/reports" class="nav-link ${activePage === 'reports' ? 'active' : ''}">
      <i class="icon-file"></i><span>${t(lang, 'reports')}</span>
    </a>
    ${isOwner ? `
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title} — ${t(lang, 'app_name')}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Vazirmatn:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/static/style.css"/>
  ${extraHead}
</head>
<body class="${isRTL ? 'rtl' : 'ltr'}">
${user ? `
<div class="app-layout">
  <!-- Sidebar -->
  <aside class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <div class="logo">
        <div class="logo-icon">📶</div>
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
</script>
${scripts}
</body>
</html>`;
}
