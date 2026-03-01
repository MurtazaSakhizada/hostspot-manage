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
    `SELECT u.*, c.name as company_name FROM users u 
     JOIN companies c ON c.id = u.company_id 
     WHERE u.username = ? AND (u.password_hash = ? OR u.password_hash = ?) AND u.active = 1`
  ).bind(username, hash, password + '_hashed').first<any>();

  if (!user) {
    return c.html(loginPage(lang, 'Invalid username or password'), 401);
  }

  const sessionId = await createSession(c.env.DB, user.id, user.company_id);
  const userLang = user.language || 'en';
  
  const headers = new Headers({
    'Location': '/dashboard',
    'Set-Cookie': `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`,
  });
  headers.append('Set-Cookie', `lang=${userLang}; Path=/; Max-Age=31536000`);
  return new Response(null, { status: 302, headers });
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
      'Set-Cookie': 'session=; Path=/; HttpOnly; Max-Age=0'
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
