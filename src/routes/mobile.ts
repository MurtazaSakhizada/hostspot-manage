// ============================================
// Mobile API Routes — JSON endpoints for app
// ============================================
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getSessionUser, parseCookies } from '../lib/auth';
import type { SessionUser } from '../lib/auth';
import type { Lang } from '../lib/i18n';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const mobileApi = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// CORS for mobile app
mobileApi.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Cookie'],
  credentials: true,
}));

// Auth middleware for mobile API
mobileApi.use('*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (path === '/mobile/login' || path === '/mobile/health') return next();

  const cookieHeader = c.req.header('Cookie') ?? '';
  const cookies = parseCookies(cookieHeader || null);
  const user = await getSessionUser(c.env.DB, cookies.session);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  c.set('user', user);
  c.set('lang', (cookies.lang as Lang) ?? 'fa');
  return next();
});

// ── POST /mobile/login ───────────────────────────
mobileApi.post('/login', async (c) => {
  const { username, password } = await c.req.json();
  if (!username || !password) return c.json({ error: 'Missing credentials' }, 400);

  const { hashPassword, generateSessionId } = await import('../lib/auth');
  const hash = await hashPassword(password);

  const user = await c.env.DB.prepare(
    `SELECT id, company_id, username, full_name, role, commission_rate, language
     FROM users WHERE username=? AND password_hash=? AND active=1`
  ).bind(username, hash).first<any>();

  if (!user) return c.json({ error: 'نام کاربری یا رمز اشتباه است' }, 401);

  // Check company is active
  const company = await c.env.DB.prepare(
    `SELECT active FROM companies WHERE id=?`
  ).bind(user.company_id).first<any>();
  if (!company || company.active === 0) {
    return c.json({ error: 'اکانت شرکت غیرفعال است' }, 403);
  }

  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, company_id, expires_at) VALUES (?,?,?,?)`
  ).bind(sessionId, user.id, user.company_id, expiresAt).run();

  return c.json({
    success: true,
    session: sessionId,
    user: {
      id: user.id,
      company_id: user.company_id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      commission_rate: user.commission_rate,
      language: user.language,
    }
  });
});

// ── GET /mobile/health ───────────────────────────
mobileApi.get('/health', (c) => c.json({ ok: true }));

// ── GET /mobile/dashboard ────────────────────────
mobileApi.get('/dashboard', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  const isOwner = user.role === 'owner';
  const sellerFilter = isOwner ? '' : `AND seller_id=${user.id}`;

  const [stats, recentSales, topSellers] = await Promise.all([
    // Main stats
    db.prepare(`
      SELECT
        COALESCE(SUM(s.quantity_gb),0) as total_gb,
        COALESCE(SUM(s.total_price),0) as total_gross,
        COALESCE(SUM(s.commission_amount),0) as total_commission,
        COALESCE(SUM(s.total_price - s.commission_amount),0) as total_net,
        COUNT(s.id) as total_txns
      FROM sales s
      WHERE s.company_id=? ${sellerFilter}
      AND date(s.sale_date) >= date('now','-30 days')
    `).bind(user.company_id).first<any>(),

    // Recent 5 sales
    db.prepare(`
      SELECT s.id, s.quantity_gb, s.total_price, s.sale_date,
             u.full_name as seller_name, p.name as package_name
      FROM sales s
      LEFT JOIN users u ON u.id=s.seller_id
      LEFT JOIN packages p ON p.id=s.package_id
      WHERE s.company_id=? ${sellerFilter}
      ORDER BY s.sale_date DESC LIMIT 5
    `).bind(user.company_id).all<any>(),

    // Top sellers (owner only)
    isOwner ? db.prepare(`
      SELECT u.full_name, COALESCE(SUM(s.quantity_gb),0) as gb,
             COALESCE(SUM(s.total_price),0) as gross
      FROM sales s JOIN users u ON u.id=s.seller_id
      WHERE s.company_id=? AND date(s.sale_date)>=date('now','-30 days')
      GROUP BY s.seller_id ORDER BY gb DESC LIMIT 5
    `).bind(user.company_id).all<any>() : Promise.resolve({ results: [] }),
  ]);

  // Debt summary
  const debt = isOwner ? null : await db.prepare(`
    SELECT COALESCE(SUM(gb_amount),0) as total_alloc,
           (SELECT COALESCE(SUM(quantity_gb),0) FROM sales WHERE seller_id=? AND company_id=?) as total_sold
    FROM allocations WHERE seller_id=? AND company_id=?
  `).bind(user.id, user.company_id, user.id, user.company_id).first<any>();

  return c.json({
    stats,
    recentSales: recentSales.results,
    topSellers: topSellers.results,
    debt,
    user: { role: user.role, full_name: user.full_name },
  });
});

// ── GET /mobile/inventory ────────────────────────
mobileApi.get('/inventory', async (c) => {
  const user = c.get('user');
  const { page = '1', limit = '20' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const rows = await c.env.DB.prepare(`
    SELECT i.id, i.quantity_gb, i.cost_price, i.purchase_date, i.notes,
           b.name as batch_name
    FROM inventory i
    LEFT JOIN inventory_batches b ON b.id=i.batch_id
    WHERE i.company_id=? AND i.is_sold=0
    ORDER BY i.purchase_date DESC LIMIT ? OFFSET ?
  `).bind(user.company_id, parseInt(limit), offset).all<any>();

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM inventory WHERE company_id=? AND is_sold=0`
  ).bind(user.company_id).first<any>();

  return c.json({ items: rows.results, total: total?.n ?? 0 });
});

// ── GET /mobile/allocations ──────────────────────
mobileApi.get('/allocations', async (c) => {
  const user = c.get('user');
  const isOwner = user.role === 'owner';
  const { page = '1', limit = '20', seller_id } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let filter = isOwner ? '' : `AND a.seller_id=${user.id}`;
  if (isOwner && seller_id) filter = `AND a.seller_id=${seller_id}`;

  const rows = await c.env.DB.prepare(`
    SELECT a.id, a.gb_amount, a.allocation_date, a.notes,
           u.full_name as seller_name
    FROM allocations a
    LEFT JOIN users u ON u.id=a.seller_id
    WHERE a.company_id=? ${filter}
    ORDER BY a.allocation_date DESC LIMIT ? OFFSET ?
  `).bind(user.company_id, parseInt(limit), offset).all<any>();

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM allocations WHERE company_id=?`
  ).bind(user.company_id).first<any>();

  return c.json({ items: rows.results, total: total?.n ?? 0 });
});

// ── POST /mobile/allocations ─────────────────────
mobileApi.post('/allocations', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Forbidden' }, 403);
  const { seller_id, gb_amount, notes } = await c.req.json();
  if (!seller_id || !gb_amount) return c.json({ error: 'Missing fields' }, 400);

  const result = await c.env.DB.prepare(`
    INSERT INTO allocations (company_id, seller_id, gb_amount, notes, allocation_date)
    VALUES (?,?,?,?,date('now'))
  `).bind(user.company_id, seller_id, gb_amount, notes ?? '').run();

  return c.json({ success: true, id: result.meta.last_row_id });
});

// ── GET /mobile/sales ────────────────────────────
mobileApi.get('/sales', async (c) => {
  const user = c.get('user');
  const isOwner = user.role === 'owner';
  const { page = '1', limit = '20', seller_id } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let filter = isOwner ? '' : `AND s.seller_id=${user.id}`;
  if (isOwner && seller_id) filter = `AND s.seller_id=${seller_id}`;

  const rows = await c.env.DB.prepare(`
    SELECT s.id, s.quantity_gb, s.total_price, s.commission_amount,
           s.sale_date, s.notes,
           u.full_name as seller_name,
           p.name as package_name, p.price_per_gb
    FROM sales s
    LEFT JOIN users u ON u.id=s.seller_id
    LEFT JOIN packages p ON p.id=s.package_id
    WHERE s.company_id=? ${filter}
    ORDER BY s.sale_date DESC LIMIT ? OFFSET ?
  `).bind(user.company_id, parseInt(limit), offset).all<any>();

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM sales WHERE company_id=?`
  ).bind(user.company_id).first<any>();

  return c.json({ items: rows.results, total: total?.n ?? 0 });
});

// ── POST /mobile/sales ───────────────────────────
mobileApi.post('/sales', async (c) => {
  const user = c.get('user');
  const { package_id, quantity_gb, notes } = await c.req.json();
  if (!package_id || !quantity_gb) return c.json({ error: 'Missing fields' }, 400);

  const pkg = await c.env.DB.prepare(
    `SELECT price_per_gb FROM packages WHERE id=? AND company_id=?`
  ).bind(package_id, user.company_id).first<any>();
  if (!pkg) return c.json({ error: 'Package not found' }, 404);

  const totalPrice = pkg.price_per_gb * quantity_gb;
  const commission = totalPrice * (user.commission_rate / 100);

  const result = await c.env.DB.prepare(`
    INSERT INTO sales (company_id, seller_id, package_id, quantity_gb, total_price, commission_amount, notes, sale_date)
    VALUES (?,?,?,?,?,?,?,date('now'))
  `).bind(user.company_id, user.id, package_id, quantity_gb, totalPrice, commission, notes ?? '').run();

  return c.json({ success: true, id: result.meta.last_row_id, total_price: totalPrice, commission });
});

// ── GET /mobile/payments ─────────────────────────
mobileApi.get('/payments', async (c) => {
  const user = c.get('user');
  const isOwner = user.role === 'owner';
  const { page = '1', limit = '20' } = c.req.query();
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const filter = isOwner ? '' : `AND p.seller_id=${user.id}`;

  const rows = await c.env.DB.prepare(`
    SELECT p.id, p.amount, p.payment_date, p.payment_method, p.notes,
           u.full_name as seller_name
    FROM payments p
    LEFT JOIN users u ON u.id=p.seller_id
    WHERE p.company_id=? ${filter}
    ORDER BY p.payment_date DESC LIMIT ? OFFSET ?
  `).bind(user.company_id, parseInt(limit), offset).all<any>();

  const total = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM payments WHERE company_id=?`
  ).bind(user.company_id).first<any>();

  return c.json({ items: rows.results, total: total?.n ?? 0 });
});

// ── POST /mobile/payments ────────────────────────
mobileApi.post('/payments', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Forbidden' }, 403);
  const { seller_id, amount, payment_method, notes } = await c.req.json();
  if (!seller_id || !amount) return c.json({ error: 'Missing fields' }, 400);

  const result = await c.env.DB.prepare(`
    INSERT INTO payments (company_id, seller_id, amount, payment_method, notes, payment_date)
    VALUES (?,?,?,?,?,date('now'))
  `).bind(user.company_id, seller_id, amount, payment_method ?? 'cash', notes ?? '').run();

  return c.json({ success: true, id: result.meta.last_row_id });
});

// ── GET /mobile/reports ──────────────────────────
mobileApi.get('/reports', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Forbidden' }, 403);
  const { from, to } = c.req.query();
  const dateFrom = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
  const dateTo = to || new Date().toISOString().split('T')[0];

  const [salesSummary, sellerStats, monthlyTrend, pkgStats, totalPayments] = await Promise.all([
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(quantity_gb),0) as total_gb,
             COALESCE(SUM(total_price),0) as total_gross,
             COALESCE(SUM(commission_amount),0) as total_commission,
             COUNT(*) as total_txns
      FROM sales WHERE company_id=?
      AND date(sale_date) BETWEEN ? AND ?
    `).bind(user.company_id, dateFrom, dateTo).first<any>(),

    c.env.DB.prepare(`
      SELECT u.full_name, u.commission_rate,
             COALESCE(SUM(s.quantity_gb),0) as gb,
             COALESCE(SUM(s.total_price),0) as gross,
             COALESCE(SUM(s.commission_amount),0) as commission
      FROM users u
      LEFT JOIN sales s ON s.seller_id=u.id
        AND s.company_id=? AND date(s.sale_date) BETWEEN ? AND ?
      WHERE u.company_id=? AND u.role='seller'
      GROUP BY u.id ORDER BY gb DESC
    `).bind(user.company_id, dateFrom, dateTo, user.company_id).all<any>(),

    c.env.DB.prepare(`
      SELECT strftime('%Y-%m', sale_date) as month,
             COALESCE(SUM(quantity_gb),0) as gb,
             COALESCE(SUM(total_price),0) as gross
      FROM sales WHERE company_id=?
      AND date(sale_date) >= date('now','-6 months')
      GROUP BY month ORDER BY month
    `).bind(user.company_id).all<any>(),

    c.env.DB.prepare(`
      SELECT p.name as package_name,
             COALESCE(SUM(s.quantity_gb),0) as total_gb,
             COALESCE(SUM(s.total_price),0) as total_gross,
             COUNT(s.id) as txn_count
      FROM sales s
      LEFT JOIN packages p ON p.id=s.package_id
      WHERE s.company_id=? AND date(s.sale_date) BETWEEN ? AND ?
      GROUP BY s.package_id ORDER BY total_gb DESC
    `).bind(user.company_id, dateFrom, dateTo).all<any>(),

    c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount),0) as total FROM payments
      WHERE company_id=? AND date(payment_date) BETWEEN ? AND ?
    `).bind(user.company_id, dateFrom, dateTo).first<any>(),
  ]);

  const summary = {
    ...salesSummary,
    total_payments: totalPayments?.total ?? 0,
    net_profit: (salesSummary?.total_gross ?? 0) - (salesSummary?.total_commission ?? 0),
  };

  return c.json({
    summary,
    topSellers: sellerStats.results,
    sellers: sellerStats.results,
    monthlyTrend: monthlyTrend.results,
    packages: pkgStats.results,
    dateFrom, dateTo,
  });
});

// ── GET /mobile/sellers ──────────────────────────
mobileApi.get('/sellers', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Forbidden' }, 403);
  const rows = await c.env.DB.prepare(
    `SELECT id, full_name, username, commission_rate, active FROM users WHERE company_id=? AND role='seller' ORDER BY full_name`
  ).bind(user.company_id).all<any>();
  return c.json({ sellers: rows.results });
});

// ── GET /mobile/packages ─────────────────────────
mobileApi.get('/packages', async (c) => {
  const user = c.get('user');
  const rows = await c.env.DB.prepare(
    `SELECT id, name, price_per_gb, description FROM packages WHERE company_id=? AND active=1 ORDER BY name`
  ).bind(user.company_id).all<any>();
  return c.json({ packages: rows.results });
});

// ── GET /mobile/me ───────────────────────────────
mobileApi.get('/me', async (c) => {
  const user = c.get('user');
  const db = c.env.DB;

  if (user.role === 'seller') {
    const stats = await db.prepare(`
      SELECT
        COALESCE((SELECT SUM(gb_amount) FROM allocations WHERE seller_id=? AND company_id=?),0) as total_allocated,
        COALESCE((SELECT SUM(quantity_gb) FROM sales WHERE seller_id=? AND company_id=?),0) as total_gb,
        COALESCE((SELECT SUM(total_price) FROM sales WHERE seller_id=? AND company_id=?),0) as total_gross,
        COALESCE((SELECT SUM(amount) FROM payments WHERE seller_id=? AND company_id=?),0) as total_paid,
        COALESCE((SELECT SUM(commission_amount) FROM sales WHERE seller_id=? AND company_id=?),0) as total_commission
    `).bind(
      user.id, user.company_id,
      user.id, user.company_id,
      user.id, user.company_id,
      user.id, user.company_id,
      user.id, user.company_id,
    ).first<any>();
    const debt = (stats?.total_allocated ?? 0) - (stats?.total_gb ?? 0);
    return c.json({ user, stats, debt });
  } else {
    // Owner stats
    const stats = await db.prepare(`
      SELECT
        COALESCE(SUM(total_price),0) as total_gross,
        COALESCE(SUM(quantity_gb),0) as total_gb,
        COALESCE(SUM(commission_amount),0) as total_commission,
        COUNT(DISTINCT seller_id) as seller_count
      FROM sales WHERE company_id=? AND date(sale_date) >= date('now','-30 days')
    `).bind(user.company_id).first<any>();
    return c.json({ user, stats });
  }
});

// ── DELETE /mobile/sales/:id ─────────────────────
mobileApi.delete('/sales/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM sales WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({ success: true });
});

// ── DELETE /mobile/payments/:id ──────────────────
mobileApi.delete('/payments/:id', async (c) => {
  const user = c.get('user');
  if (user.role !== 'owner') return c.json({ error: 'Forbidden' }, 403);
  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM payments WHERE id=? AND company_id=?').bind(id, user.company_id).run();
  return c.json({ success: true });
});

export default mobileApi;
