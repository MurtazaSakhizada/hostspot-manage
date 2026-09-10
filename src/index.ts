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
import superAdminRoutes from './routes/superadmin';
import notificationsRoutes from './routes/notifications';
import expensesRoutes from './routes/expenses';
import ledgerRoutes from './routes/ledger';
import mobileRoutes from './routes/mobile';
import pppoeRoutes from './routes/pppoe';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ---- Static Files ----
app.use('/static/*', serveStatic({ root: './' }));
// Serve manifest.json
app.get('/manifest.json', serveStatic({ root: './', path: '/public/manifest.json' }));
// Also serve files from public root
app.get('/favicon.svg', (c) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4338ca"/><stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
    <linearGradient id="wf" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#ffffff"/><stop offset="100%" style="stop-color:#c7d2fe"/>
    </linearGradient>
    <linearGradient id="coin" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#fde68a"/><stop offset="100%" style="stop-color:#f59e0b"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="8" fill="url(#bg)"/>
  <path d="M 4 14 Q 16 5 28 14" fill="none" stroke="url(#wf)" stroke-width="2.5" stroke-linecap="round" opacity="0.95"/>
  <path d="M 7.5 17.5 Q 16 10 24.5 17.5" fill="none" stroke="url(#wf)" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/>
  <path d="M 11 21 Q 16 15 21 21" fill="none" stroke="url(#wf)" stroke-width="2.5" stroke-linecap="round" opacity="0.65"/>
  <circle cx="16" cy="24" r="2.2" fill="white" opacity="0.95"/>
  <circle cx="25" cy="23" r="5.5" fill="url(#coin)"/>
  <text x="25" y="26" text-anchor="middle" font-family="Arial" font-weight="900" font-size="7" fill="#78350f">&#xFB1;</text>
</svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'max-age=86400' } });
});
app.get('/favicon.ico', (c) => c.redirect('/favicon.svg', 301));

// ---- Auth Middleware ----
const PUBLIC_PATHS = ['/login', '/logout', '/api/language'];

app.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  
  // Always allow public paths, static files, and super admin paths
  if (path.startsWith('/static') || path.startsWith('/favicon') ||
      path.startsWith('/sa/') || path === '/sa' ||
      path.startsWith('/mobile/') ||
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
app.route('/', superAdminRoutes); // Super Admin - no tenant auth required
app.route('/', authRoutes);
app.route('/dashboard', dashboardRoutes);
app.route('/inventory', inventoryRoutes);
app.route('/allocations', allocationsRoutes);
app.route('/sales', salesRoutes);
app.route('/payments', paymentsRoutes);
app.route('/reports', reportsRoutes);
app.route('/notifications', notificationsRoutes);
app.route('/expenses', expensesRoutes);
app.route('/ledger', ledgerRoutes);
app.route('/mobile', mobileRoutes);
app.route('/pppoe', pppoeRoutes);
app.route('/', adminRoutes);

// ---- API: Delete endpoints (re-mount under app root) ----
app.delete('/api/inventory/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM inventory WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success: true});
});

app.delete('/api/inventory-batch/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  const batch = await c.env.DB.prepare('SELECT * FROM inventory_batches WHERE id=? AND company_id=?').bind(id, user.company_id).first<any>();
  if (!batch) return c.json({error:'Not found'}, 404);
  await c.env.DB.prepare('DELETE FROM inventory_batch_lines WHERE batch_id=?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM inventory_batches WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success: true});
});

app.delete('/api/allocations/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM allocations WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({success:true});
});

app.delete('/api/allocation-batch/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = c.req.param('id');
  const batch = await c.env.DB.prepare('SELECT * FROM allocation_batches WHERE id=? AND company_id=?').bind(id, user.company_id).first<any>();
  if (!batch) return c.json({error:'Not found'}, 404);
  await c.env.DB.prepare('DELETE FROM allocation_batch_lines WHERE batch_id=?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM allocation_batches WHERE id=? AND company_id=?').bind(id, user.company_id).run();
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

// Delete personal expense (seller deletes own, owner deletes company expense)
app.delete('/api/expenses/:id', async (c) => {
  const user = c.get('user');
  const isOwner = user.role === 'owner';
  const id = c.req.param('id');
  const deleteFilter = isOwner
    ? ` AND (seller_id IS NULL OR seller_id = 0)`
    : ` AND seller_id = ${user.id}`;
  await c.env.DB.prepare(`DELETE FROM expenses WHERE id=? AND company_id=? ${deleteFilter}`)
    .bind(id, user.company_id).run();
  return c.json({ success: true });
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
  if (!user || user.role !== 'owner') return c.json({error:'Forbidden'},403);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({error:'Invalid id'},400);
  if (id === user.id) return c.json({error:'Cannot delete yourself'},400);
  try {
    const db = c.env.DB;
    // Verify target user belongs to same company
    const target = await db.prepare('SELECT id FROM users WHERE id=? AND company_id=?')
      .bind(id, user.company_id).first<{id:number}>();
    if (!target) return c.json({error:'User not found'},404);
    // Check if user has any financial records (sales or payments) — these are NOT NULL FKs
    const hasSales = await db.prepare('SELECT 1 FROM sales WHERE seller_id=? AND company_id=? LIMIT 1')
      .bind(id, user.company_id).first();
    const hasPayments = await db.prepare('SELECT 1 FROM payments WHERE seller_id=? AND company_id=? LIMIT 1')
      .bind(id, user.company_id).first();
    if (hasSales || hasPayments) {
      // Has financial history — deactivate instead of hard delete to preserve records
      await db.prepare('UPDATE users SET active=0 WHERE id=? AND company_id=?').bind(id, user.company_id).run();
      await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
      return c.json({success:true, deactivated:true});
    }
    // No financial records — safe to fully delete
    // 1. Delete sessions
    await db.prepare('DELETE FROM sessions WHERE user_id=?').bind(id).run();
    // 2. Delete notifications
    try { await db.prepare('DELETE FROM notifications WHERE user_id=?').bind(id).run(); } catch(_){}
    // 3. Delete allocations
    await db.prepare('DELETE FROM allocations WHERE seller_id=? AND company_id=?').bind(id, user.company_id).run();
    // 4. NULL-out nullable FKs
    try { await db.prepare('UPDATE inventory SET seller_id=NULL WHERE seller_id=? AND company_id=?').bind(id, user.company_id).run(); } catch(_){}
    try { await db.prepare('UPDATE batch_history SET seller_id=NULL WHERE seller_id=? AND company_id=?').bind(id, user.company_id).run(); } catch(_){}
    try { await db.prepare('UPDATE expenses SET seller_id=NULL WHERE seller_id=? AND company_id=?').bind(id, user.company_id).run(); } catch(_){}
    try { await db.prepare('UPDATE expenses SET created_by=NULL WHERE created_by=? AND company_id=?').bind(id, user.company_id).run(); } catch(_){}
    try { await db.prepare('UPDATE financial_ledger SET seller_id=NULL WHERE seller_id=? AND company_id=?').bind(id, user.company_id).run(); } catch(_){}
    try { await db.prepare('UPDATE financial_ledger SET created_by=NULL WHERE created_by=? AND company_id=?').bind(id, user.company_id).run(); } catch(_){}
    try { await db.prepare('UPDATE payment_edit_requests SET seller_id=NULL WHERE seller_id=? AND company_id=?').bind(id, user.company_id).run(); } catch(_){}
    try { await db.prepare('UPDATE payment_edit_requests SET reviewed_by=NULL WHERE reviewed_by=? AND company_id=?').bind(id, user.company_id).run(); } catch(_){}
    // 5. Finally delete the user
    await db.prepare('DELETE FROM users WHERE id=? AND company_id=?').bind(id, user.company_id).run();
    return c.json({success:true, deactivated:false});
  } catch(e: any) {
    console.error('DELETE /api/users/:id error:', e);
    return c.json({error: e?.message ?? 'Delete failed'}, 500);
  }
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
