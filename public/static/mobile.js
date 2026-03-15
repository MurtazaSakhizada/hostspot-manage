// ================================================
// HOTSPOT MANAGER — Mobile Enhancements
// Responsive tables, touch gestures, PWA
// ================================================
(function () {
  'use strict';

  var IS_MOBILE = window.innerWidth <= 768;

  // ── 1. Responsive Tables → Card View ────────
  function makeTablesMobileCards() {
    if (!IS_MOBILE) return;
    document.querySelectorAll('.table-wrapper table').forEach(function (table) {
      // get header labels
      var headers = [];
      table.querySelectorAll('thead th').forEach(function (th) {
        headers.push(th.textContent.trim());
      });
      if (!headers.length) return;
      // add data-label to each td
      table.querySelectorAll('tbody tr').forEach(function (tr) {
        tr.querySelectorAll('td').forEach(function (td, i) {
          if (headers[i]) td.setAttribute('data-label', headers[i]);
        });
      });
      table.classList.add('table-mobile-cards');
    });
  }

  // ── 2. Sidebar swipe to close ────────────────
  function initSidebarSwipe() {
    var sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    var startX = 0, startY = 0;

    sidebar.addEventListener('touchstart', function (e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }, { passive: true });

    sidebar.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      // swipe left (or right for RTL) to close
      var isRTL = document.body.classList.contains('rtl');
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
        if ((!isRTL && dx < 0) || (isRTL && dx > 0)) {
          closeSidebar();
        }
      }
    }, { passive: true });
  }

  function closeSidebar() {
    var sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  }

  // ── 3. Modal: close by dragging down ─────────
  function initModalDrag() {
    document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
      var modal = overlay.querySelector('.modal');
      if (!modal) return;
      var startY = 0;

      modal.addEventListener('touchstart', function (e) {
        if (modal.scrollTop === 0) startY = e.touches[0].clientY;
      }, { passive: true });

      modal.addEventListener('touchend', function (e) {
        var dy = e.changedTouches[0].clientY - startY;
        if (dy > 80) {
          // drag down to close
          overlay.classList.remove('open');
          document.body.style.overflow = '';
        }
      }, { passive: true });
    });
  }

  // ── 4. Bottom Navigation Bar (mobile only) ───
  function initBottomNav() {
    if (!IS_MOBILE) return;
    var currentPath = window.location.pathname;

    // only show for main app pages (not login/sa)
    if (currentPath.startsWith('/login') || currentPath.startsWith('/sa')) return;

    var navItems = [
      { icon: '📊', label: 'داشبورد', labelEn: 'Dashboard', path: '/dashboard' },
      { icon: '📦', label: 'موجودی', labelEn: 'Inventory', path: '/inventory' },
      { icon: '💰', label: 'فروش', labelEn: 'Sales', path: '/sales' },
      { icon: '💳', label: 'پرداخت', labelEn: 'Payments', path: '/payments' },
      { icon: '📋', label: 'گزارش', labelEn: 'Reports', path: '/reports' },
    ];

    var isRTL = document.body.classList.contains('rtl');
    var lang = document.cookie.match(/lang=([^;]+)/) ? document.cookie.match(/lang=([^;]+)/)[1] : 'fa';

    var nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.innerHTML = navItems.map(function (item) {
      var isActive = currentPath === item.path || currentPath.startsWith(item.path + '/');
      return '<a href="' + item.path + '" class="bottom-nav-item' + (isActive ? ' active' : '') + '">' +
        '<span class="bottom-nav-icon">' + item.icon + '</span>' +
        '<span class="bottom-nav-label">' + (lang === 'fa' || lang === 'dr' ? item.label : item.labelEn) + '</span>' +
        '</a>';
    }).join('');

    document.body.appendChild(nav);

    // Add padding to page content so it's not hidden behind bottom nav
    var pageContent = document.querySelector('.page-content');
    if (pageContent) pageContent.style.paddingBottom = '72px';
  }

  // ── 5. Fix input zoom on iOS ─────────────────
  function fixIOSInputZoom() {
    var meta = document.querySelector('meta[name="viewport"]');
    if (meta) {
      meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
    }
  }

  // ── 6. Add mobile-specific topbar behavior ───
  function initTopbarScroll() {
    if (!IS_MOBILE) return;
    var topbar = document.querySelector('.topbar');
    if (!topbar) return;
    var lastScroll = 0;
    window.addEventListener('scroll', function () {
      var current = window.pageYOffset;
      if (current > lastScroll && current > 60) {
        topbar.style.transform = 'translateY(-100%)';
      } else {
        topbar.style.transform = 'translateY(0)';
      }
      lastScroll = current;
    }, { passive: true });
    topbar.style.transition = 'transform 0.3s ease';
  }

  // ── 7. PWA Install banner ────────────────────
  var deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    showInstallBanner();
  });

  function showInstallBanner() {
    if (localStorage.getItem('pwaInstallDismissed')) return;
    var banner = document.createElement('div');
    banner.className = 'pwa-install-banner';
    var isRTL = document.body.classList.contains('rtl');
    banner.innerHTML =
      '<span class="pwa-install-icon">📱</span>' +
      '<span class="pwa-install-text">' + (isRTL ? 'این اپ را روی صفحه اصلی نصب کنید' : 'Install this app on your device') + '</span>' +
      '<button class="pwa-install-btn" onclick="window.__pwaInstall()">' + (isRTL ? 'نصب' : 'Install') + '</button>' +
      '<button class="pwa-dismiss-btn" onclick="window.__pwaDismiss()">✕</button>';
    document.body.appendChild(banner);
    setTimeout(function () { banner.classList.add('show'); }, 300);
  }

  window.__pwaInstall = function () {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; });
    }
    var b = document.querySelector('.pwa-install-banner');
    if (b) b.remove();
  };
  window.__pwaDismiss = function () {
    localStorage.setItem('pwaInstallDismissed', '1');
    var b = document.querySelector('.pwa-install-banner');
    if (b) b.classList.remove('show');
    setTimeout(function () { if (b) b.remove(); }, 300);
  };

  // ── 8. Touch-friendly dropdown close ─────────
  function initDropdownClose() {
    document.addEventListener('touchstart', function (e) {
      var notifDrop = document.querySelector('.notif-dropdown');
      if (notifDrop && notifDrop.style.display !== 'none') {
        if (!notifDrop.contains(e.target) && !document.querySelector('.notif-bell-btn').contains(e.target)) {
          notifDrop.style.display = 'none';
        }
      }
    }, { passive: true });
  }

  // ── Init ─────────────────────────────────────
  function init() {
    makeTablesMobileCards();
    initSidebarSwipe();
    initModalDrag();
    initBottomNav();
    fixIOSInputZoom();
    initTopbarScroll();
    initDropdownClose();

    // Re-check on resize
    window.addEventListener('resize', function () {
      IS_MOBILE = window.innerWidth <= 768;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
