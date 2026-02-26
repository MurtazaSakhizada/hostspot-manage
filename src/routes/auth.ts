// ============================================
// Auth Routes: Login, Logout, Register
// ============================================
import { Hono } from 'hono';
import { t } from '../lib/i18n';
import type { Lang } from '../lib/i18n';
import { hashPassword, createSession, deleteSession, parseCookies } from '../lib/auth';
import { pageShell } from '../lib/layout';

type Bindings = { DB: D1Database };

const auth = new Hono<{ Bindings: Bindings }>();

function loginPage(lang: Lang, error = '') {
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
      <div style="text-align:center;margin-top:1.5rem;">
        <a href="/register" style="color:var(--primary);font-size:0.875rem;">${t(lang, 'register_company')}</a>
      </div>
    </div>`
  });
}

auth.get('/login', (c) => {
  const cookies = parseCookies(c.req.header('Cookie') ?? null);
  const lang = (cookies.lang as Lang) ?? 'en';
  return c.html(loginPage(lang));
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
  // Also set lang cookie from user preference
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

// ---- Register Company ----
auth.get('/register', (c) => {
  const cookies = parseCookies(c.req.header('Cookie') ?? null);
  const lang = (cookies.lang as Lang) ?? 'en';
  return c.html(pageShell({
    title: t(lang, 'register_company'), lang,
    body: `
    <div class="auth-card" style="max-width:480px">
      <div class="auth-logo">
        <div class="logo-icon">📶</div>
        <h1>${t(lang, 'register_company')}</h1>
        <p>Create your HotSpot business account</p>
      </div>
      <form method="POST" action="/register">
        <div class="form-group">
          <label>${t(lang, 'company')} Name</label>
          <input type="text" name="company_name" required placeholder="My HotSpot Business"/>
        </div>
        <div class="form-group">
          <label>${t(lang, 'slug')} (unique ID)</label>
          <input type="text" name="slug" required placeholder="my-hotspot" pattern="[a-z0-9-]+" title="lowercase letters, numbers, hyphens only"/>
          <div class="form-hint">Lowercase letters, numbers, hyphens only</div>
        </div>
        <hr class="divider"/>
        <div class="form-group">
          <label>Owner ${t(lang, 'full_name')}</label>
          <input type="text" name="full_name" required placeholder="Your Name"/>
        </div>
        <div class="form-group">
          <label>${t(lang, 'username')}</label>
          <input type="text" name="username" required placeholder="admin"/>
        </div>
        <div class="form-group">
          <label>${t(lang, 'password')}</label>
          <input type="password" name="password" required minlength="6"/>
        </div>
        <button type="submit" class="btn btn-primary btn-full btn-lg">${t(lang, 'create_company')}</button>
      </form>
      <div style="text-align:center;margin-top:1rem;">
        <a href="/login" style="color:var(--primary);font-size:0.875rem;">${t(lang, 'back_to_login')}</a>
      </div>
    </div>`
  }));
});

auth.post('/register', async (c) => {
  const cookies = parseCookies(c.req.header('Cookie') ?? null);
  const lang = (cookies.lang as Lang) ?? 'en';
  const form = await c.req.formData();
  const companyName = form.get('company_name')?.toString().trim() ?? '';
  const slug = form.get('slug')?.toString().trim().toLowerCase() ?? '';
  const fullName = form.get('full_name')?.toString().trim() ?? '';
  const username = form.get('username')?.toString().trim() ?? '';
  const password = form.get('password')?.toString() ?? '';

  if (!companyName || !slug || !fullName || !username || !password) {
    return c.html('Missing fields', 400);
  }

  const hash = await hashPassword(password);
  try {
    const company = await c.env.DB.prepare(
      'INSERT INTO companies (name, slug, default_language) VALUES (?, ?, ?) RETURNING id'
    ).bind(companyName, slug, lang).first<{id:number}>();
    
    if (!company) throw new Error('Failed to create company');

    await c.env.DB.prepare(
      'INSERT INTO users (company_id, username, password_hash, full_name, role, commission_rate, language) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(company.id, username, hash, fullName, 'owner', 0, lang).run();

    // Also create a default branch
    await c.env.DB.prepare(
      'INSERT INTO branches (company_id, name) VALUES (?, ?)'
    ).bind(company.id, 'Main Branch').run();

    return new Response(null, { status: 302, headers: { 'Location': '/login?registered=1' } });
  } catch (e: any) {
    return c.html(`Error: ${e.message}. Slug might already exist.`, 400);
  }
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
