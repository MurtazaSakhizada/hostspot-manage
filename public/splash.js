// ================================================
// HOTSPOT MANAGER — ANIMATED SPLASH SCREEN JS
// ================================================

(function() {
  'use strict';

  // Only show splash once per session
  if (sessionStorage.getItem('splashShown')) return;
  sessionStorage.setItem('splashShown', '1');

  // Create splash HTML
  const splash = document.createElement('div');
  splash.id = 'hotspot-splash';
  splash.innerHTML = `
    <!-- Background particles -->
    <div class="splash-particles" id="splashParticles"></div>

    <!-- Sparkles -->
    <div class="sparkle" style="top:20%;left:15%;animation-delay:0.3s;width:3px;height:3px"></div>
    <div class="sparkle" style="top:30%;right:20%;animation-delay:0.7s;width:2px;height:2px"></div>
    <div class="sparkle" style="top:60%;left:10%;animation-delay:1.1s;width:4px;height:4px"></div>
    <div class="sparkle" style="top:70%;right:12%;animation-delay:0.5s;width:3px;height:3px"></div>
    <div class="sparkle" style="top:15%;right:30%;animation-delay:1.3s;width:2px;height:2px"></div>
    <div class="sparkle" style="bottom:20%;left:25%;animation-delay:0.9s;width:3px;height:3px"></div>

    <!-- WiFi rings -->
    <div class="splash-wifi-container">
      <div class="wifi-ring"></div>
      <div class="wifi-ring"></div>
      <div class="wifi-ring"></div>

      <!-- Logo box -->
      <div class="splash-logo-wrap">
        <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <linearGradient id="splashWifi" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#ffffff"/>
              <stop offset="100%" style="stop-color:#c7d2fe"/>
            </linearGradient>
            <linearGradient id="splashCoin" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style="stop-color:#fde68a"/>
              <stop offset="100%" style="stop-color:#f59e0b"/>
            </linearGradient>
          </defs>
          <!-- WiFi arcs (animated draw) -->
          <path class="logo-wifi-arc" d="M 8 30 Q 32 10 56 30"
            fill="none" stroke="url(#splashWifi)" stroke-width="4.5"
            stroke-linecap="round" opacity="0.95"/>
          <path class="logo-wifi-arc" d="M 15 37 Q 32 20 49 37"
            fill="none" stroke="url(#splashWifi)" stroke-width="4.5"
            stroke-linecap="round" opacity="0.8"/>
          <path class="logo-wifi-arc" d="M 22 44 Q 32 30 42 44"
            fill="none" stroke="url(#splashWifi)" stroke-width="4.5"
            stroke-linecap="round" opacity="0.65"/>
          <!-- Center dot -->
          <circle class="logo-dot" cx="32" cy="52" r="4" fill="white"/>
          <!-- Coin badge -->
          <g class="logo-coin">
            <circle cx="50" cy="50" r="12" fill="url(#splashCoin)"/>
            <text x="50" y="55" text-anchor="middle" font-family="Arial" font-weight="900" font-size="13" fill="#78350f">؋</text>
          </g>
        </svg>
      </div>
    </div>

    <!-- App name -->
    <div class="splash-title">HotSpot Manager</div>
    <div class="splash-subtitle">سیستم مدیریت هات‌اسپات</div>

    <!-- Loading bar -->
    <div class="splash-loader">
      <div class="splash-loader-bar"></div>
    </div>
  `;

  // Inject CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/splash.css';
  document.head.appendChild(link);

  // Add to DOM
  document.body.insertBefore(splash, document.body.firstChild);

  // Generate floating particles
  const particlesEl = document.getElementById('splashParticles');
  if (particlesEl) {
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = Math.random() * 60 + 20;
      p.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        left: ${Math.random() * 100}%;
        bottom: -${size}px;
        animation-duration: ${Math.random() * 8 + 6}s;
        animation-delay: ${Math.random() * 4}s;
      `;
      particlesEl.appendChild(p);
    }
  }

  // Auto-dismiss after 3.2 seconds
  const DISMISS_DELAY = 3200;

  function dismissSplash() {
    splash.classList.add('fade-out');
    setTimeout(() => {
      if (splash.parentNode) {
        splash.parentNode.removeChild(splash);
      }
    }, 700);
  }

  // Dismiss on click/tap (after min 1.5s)
  let canDismiss = false;
  setTimeout(() => { canDismiss = true; }, 1500);
  splash.addEventListener('click', () => {
    if (canDismiss) dismissSplash();
  });

  // Auto dismiss
  setTimeout(dismissSplash, DISMISS_DELAY);
})();
