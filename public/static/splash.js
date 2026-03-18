// ================================================
// HotSpot Manager — Premium Splash Screen JS v2
// ================================================
(function() {
  'use strict';

  // Only show splash once per session
  if (sessionStorage.getItem('splashShown')) return;
  sessionStorage.setItem('splashShown', '1');

  // Create splash HTML using new CSS classes
  const splash = document.createElement('div');
  splash.id = 'hotspot-splash';
  splash.innerHTML = `
    <!-- Ambient orbs -->
    <div class="splash-orbs">
      <div class="splash-orb"></div>
      <div class="splash-orb"></div>
      <div class="splash-orb"></div>
    </div>

    <!-- Tiny stars -->
    <div class="splash-star" style="top:18%;left:12%;width:2px;height:2px;animation-delay:.3s;animation-duration:2.4s"></div>
    <div class="splash-star" style="top:25%;right:18%;width:3px;height:3px;animation-delay:.9s;animation-duration:3s"></div>
    <div class="splash-star" style="top:65%;left:8%;width:2px;height:2px;animation-delay:1.5s;animation-duration:2.8s"></div>
    <div class="splash-star" style="top:72%;right:14%;width:2px;height:2px;animation-delay:.6s;animation-duration:3.2s"></div>
    <div class="splash-star" style="top:40%;left:85%;width:2px;height:2px;animation-delay:1.2s;animation-duration:2.5s"></div>

    <!-- Main content -->
    <div class="splash-content">
      <!-- Logo with rings -->
      <div class="splash-logo-container">
        <div class="splash-ring"></div>
        <div class="splash-ring"></div>
        <div class="splash-ring"></div>

        <div class="splash-logo-icon">
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
            <path class="logo-wifi-arc" d="M 8 30 Q 32 10 56 30"
              fill="none" stroke="url(#splashWifi)" stroke-width="4.5"
              stroke-linecap="round" opacity="0.95"/>
            <path class="logo-wifi-arc" d="M 15 37 Q 32 20 49 37"
              fill="none" stroke="url(#splashWifi)" stroke-width="4.5"
              stroke-linecap="round" opacity="0.8"/>
            <path class="logo-wifi-arc" d="M 22 44 Q 32 30 42 44"
              fill="none" stroke="url(#splashWifi)" stroke-width="4.5"
              stroke-linecap="round" opacity="0.65"/>
            <circle class="logo-dot" cx="32" cy="52" r="4" fill="white"/>
            <g class="logo-coin">
              <circle cx="50" cy="50" r="12" fill="url(#splashCoin)"/>
              <text x="50" y="55" text-anchor="middle" font-family="Arial" font-weight="900" font-size="13" fill="#78350f">&#xFB1;</text>
            </g>
          </svg>
        </div>
      </div>

      <div class="splash-title">HotSpot Manager</div>
      <div class="splash-subtitle">سیستم مدیریت هات‌اسپات</div>

      <!-- Loading bar — inside content so whole block is truly centered -->
      <div class="splash-loader-wrap">
        <div class="splash-loader">
          <div class="splash-loader-bar"></div>
        </div>
        <div class="splash-loader-text">Loading</div>
      </div>
    </div>
  `;

  // Add to DOM
  document.body.insertBefore(splash, document.body.firstChild);

  // Auto-dismiss after 3.0 seconds
  const DISMISS_DELAY = 3000;

  function dismissSplash() {
    splash.classList.add('fade-out');
    setTimeout(() => {
      if (splash.parentNode) splash.parentNode.removeChild(splash);
    }, 700);
  }

  // Click to dismiss (after min 1.5s)
  let canDismiss = false;
  setTimeout(() => { canDismiss = true; }, 1500);
  splash.addEventListener('click', () => { if (canDismiss) dismissSplash(); });

  // Auto dismiss
  setTimeout(dismissSplash, DISMISS_DELAY);
})();
