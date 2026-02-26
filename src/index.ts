// ============================================
// Main Application Entry - HotSpot Manager
// Multi-Tenant SaaS with RBAC
// ============================================
import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';
import { getSessionUser, parseCookies } from './lib/auth';
import type { SessionUser } from './lib/auth';
import type { Lang } from './lib/i18n';

// Route imports
import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import inventoryRoutes from './routes/inventory';
import allocationsRoutes from './routes/allocations';
import salesRoutes from './routes/sales';
import paymentsRoutes from './routes/payments';
import reportsRoutes from './routes/reports';
import adminRoutes from './routes/admin';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ---- Static Files ----
app.use('/static/*', serveStatic({ root: './' }));
// Favicon - serve inline SVG
app.get('/favicon.ico', (c) => {
  return new Response('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="26" font-size="28">📶</text></svg>', {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' }
  });
});

// ---- Auth Middleware ----
const PUBLIC_PATHS = ['/login', '/logout', '/register', '/api/language'];

app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  
  // Always allow public paths and static files
  if (path.startsWith('/static') || path.startsWith('/favicon') ||
      PUBLIC_PATHS.some(p => path === p || path.startsWith(p))) {
    return next();
  }

  const cookies = parseCookies(c.req.header('Cookie') ?? null);
  const lang = (cookies.lang as Lang) ?? 'en';

  // Check session
  const user = await getSessionUser(c.env.DB, cookies.session);
  if (!user) {
    return new Response(null, {
      status: 302,
      headers: { 'Location': '/login' }
    });
  }

  // Update user's preferred language from cookie or user setting
  const userLang = (cookies.lang as Lang) ?? (user.language as Lang) ?? 'en';

  c.set('user', user);
  c.set('lang', userLang);

  return next();
});

// ---- Root Redirect ----
app.get('/', (c) => {
  return new Response(null, { status: 302, headers: { 'Location': '/dashboard' } });
});

// ---- Mount Routes ----
app.route('/', authRoutes);
app.route('/dashboard', dashboardRoutes);
app.route('/inventory', inventoryRoutes);
app.route('/allocations', allocationsRoutes);
app.route('/sales', salesRoutes);
app.route('/payments', paymentsRoutes);
app.route('/reports', reportsRoutes);
app.route('/', adminRoutes);

// ---- API: Delete endpoints (re-mount under app root) ----
app.delete('/api/inventory/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM inventory WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success: true});
});

app.delete('/api/allocations/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM allocations WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

app.delete('/api/sales/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM sales WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

app.delete('/api/payments/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM payments WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

app.delete('/api/branches/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM branches WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

app.delete('/api/packages/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM packages WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

app.delete('/api/users/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM users WHERE id=? AND company_id=? AND id != ?').bind(id, user.company_id, user.id).run();
  return c.json({success:true});
});

// ---- Language API (no auth required) ----
app.get('/api/language/:lang', (c) => {
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

// ---- Health check ----
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() });
});

// ---- 404 ----
app.notFound((c) => {
  return c.html(`
    <html><body style="font-family:sans-serif;text-align:center;padding:4rem">
      <h1 style="font-size:4rem">404</h1>
      <p>Page not found</p>
      <a href="/dashboard">← Back to Dashboard</a>
    </body></html>`, 404);
});

export default app;
