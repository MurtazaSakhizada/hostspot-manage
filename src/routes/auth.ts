// ============================================
// Auth Routes: Login, Logout
// Register is disabled - only Super Admin can create companies
// ============================================
import { Hono } from 'hono';
import { t } from '../lib/i18n';
import type { Lang } from '../lib/i18n';
import { hashPassword, createSession, deleteSession, parseCookies } from '../lib/auth';
import { pageShell } from '../lib/layout';

type Bindings = { DB: D1Database };

const auth = new Hono<{ Bindings: Bindings }>();

function loginPage(lang: Lang, error = '', info = '') {
  return pageShell({
    title: t(lang, 'login'),
    lang,
    body: `
    <div class="auth-card">
      <div class="auth-logo">
        <div class="logo-icon">📶</div>
        <h1>${t(lang, 'app_name')}</h1>
        <p>${t(lang, 'sign_in')}</p>
      </div>
      ${error ? `<div class="alert alert-error">${error}</div>` : ''}
      ${info ? `<div class="alert alert-success">${info}</div>` : ''}
      <form method="POST" action="/login">
        <div class="form-group">
          <label>${t(lang, 'username')}</label>
          <input type="text" name="username" required autofocus placeholder="${t(lang, 'username')}"/>
        </div>
        <div class="form-group">
          <label>${t(lang, 'password')}</label>
          <input type="password" name="password" required placeholder="${t(lang, 'password')}"/>
        </div>
        <button type="submit" class="btn btn-primary btn-full btn-lg">${t(lang, 'sign_in')}</button>
      </form>
    </div>`
  });
}

auth.get('/login', (c) => {
  const cookies = parseCookies(c.req.header('Cookie') ?? null);
  const lang = (cookies.lang as Lang) ?? 'en';
  const url = new URL(c.req.url);
  const info = url.searchParams.get('registered') === '1' ? 'Account created! Please log in.' : '';
  return c.html(loginPage(lang, '', info));
});

auth.post('/login', async (c) => {
  const cookies = parseCookies(c.req.header('Cookie') ?? null);
  const lang = (cookies.lang as Lang) ?? 'en';
  const form = await c.req.formData();
  const username = form.get('username')?.toString().trim() ?? '';
  const password = form.get('password')?.toString() ?? '';

  if (!username || !password) {
    return c.html(loginPage(lang, 'Username and password required'), 400);
  }

  const hash = await hashPassword(password);
  const user = await c.env.DB.prepare(
    `SELECT u.*, c.name as company_name, COALESCE(c.active,1) as company_active,
            COALESCE(c.seller_panel_enabled,1) as seller_panel_enabled
     FROM users u 
     JOIN companies c ON c.id = u.company_id 
     WHERE u.username = ? AND (u.password_hash = ? OR u.password_hash = ?) AND u.active = 1`
  ).bind(username, hash, password + '_hashed').first<any>();

  if (!user) {
    return c.html(loginPage(lang, 'Invalid username or password'), 401);
  }

  // Block login if company is deactivated by super admin
  if (!user.company_active || user.company_active === 0) {
    return c.html(loginPage(lang, lang === 'fa' ? 'حساب شرکت شما غیرفعال شده است. با مدیر سیستم تماس بگیرید.' : lang === 'ps' ? 'ستاسو شرکت غیر فعال شوی. د سیسټم مدیر سره اړیکه ونیسئ.' : 'Your company account has been deactivated. Contact the system administrator.'), 403);
  }

  // Block seller login if seller_panel_enabled = 0
  if (user.role === 'seller' && user.seller_panel_enabled === 0) {
    const msg = lang === 'fa'
      ? 'دسترسی فروشنده به سیستم توسط مدیر غیرفعال شده است.'
      : lang === 'ps'
      ? 'د پلورونکي لاسرسی د مدیر لخوا غیرفعال شوی.'
      : 'Seller access has been disabled by the administrator.';
    return c.html(loginPage(lang, msg), 403);
  }

  // Block login if company subscription has expired
  // Only check if the company has ever had a subscription
  const subCheck = await c.env.DB.prepare(`
    SELECT
      COUNT(*) as total_subs,
      MAX(CASE WHEN status='active' AND end_date >= date('now') THEN 1 ELSE 0 END) as has_active
    FROM company_subscriptions
    WHERE company_id = ?
  `).bind(user.company_id).first<{total_subs:number; has_active:number}>();

  if (subCheck && subCheck.total_subs > 0 && !subCheck.has_active) {
    // Has had subscriptions before but none active now → expired
    const msg = lang === 'fa'
      ? 'اشتراک شرکت شما منقضی شده است. لطفاً با مدیر سیستم برای تمدید اشتراک تماس بگیرید.'
      : lang === 'ps'
      ? 'ستاسو د شرکت اشتراک پای ته رسیدلی. د تمدید لپاره د سیسټم مدیر سره اړیکه ونیسئ.'
      : 'Your company subscription has expired. Please contact the system administrator to renew.';
    return c.html(loginPage(lang, msg), 403);
  }

  const sessionId = await createSession(c.env.DB, user.id, user.company_id);
  const userLang = user.language || 'en';

  // Use HTML-based redirect so cookies are set in first-party context
  // (plain 302 redirect fails in iframe preview because of third-party cookie blocking)
  const headers = new Headers({
    'Content-Type': 'text/html; charset=UTF-8',
    'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
  });
  headers.append('Set-Cookie', `lang=${userLang}; Path=/; SameSite=Lax; Max-Age=31536000`);
  return new Response(
    `<!DOCTYPE html><html><head>
    <meta http-equiv="refresh" content="0;url=/dashboard">
    <script>window.location.replace('/dashboard');</script>
    </head><body>Redirecting...</body></html>`,
    { status: 200, headers }
  );
});

auth.get('/logout', async (c) => {
  const cookies = parseCookies(c.req.header('Cookie') ?? null);
  if (cookies.session) {
    await deleteSession(c.env.DB, cookies.session);
  }
  return new Response(null, {
    status: 302,
    headers: {
      'Location': '/login',
      'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
    }
  });
});

// Language switcher
auth.get('/api/language/:lang', (c) => {
  const lang = c.req.param('lang');
  const referer = c.req.header('Referer') ?? '/dashboard';
  return new Response(null, {
    status: 302,
    headers: {
      'Location': referer,
      'Set-Cookie': `lang=${lang}; Path=/; Max-Age=31536000`
    }
  });
});

export default auth;
