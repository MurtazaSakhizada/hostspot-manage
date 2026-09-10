// ============================================
// Notifications Routes
// Mounted at /notifications in index.ts
// ============================================
import { Hono } from 'hono';
import { t, type Lang } from '../lib/i18n';
import type { SessionUser } from '../lib/auth';
import { pageShell } from '../lib/layout';

type Bindings = { DB: D1Database };
type Variables = { user: SessionUser; lang: Lang };

const notifications = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Icon & color helpers ────────────────────────────────────
export function notifIcon(category: string): string {
  const map: Record<string, string> = {
    inventory: '📦', allocation: '🔀', sale: '💰',
    payment: '💳', system: '⚙️', report: '📊', pppoe: '🌐'
  };
  return map[category] ?? '🔔';
}
export function notifColor(type: string): string {
  const map: Record<string, string> = {
    info: 'var(--primary)', warning: 'var(--warning)',
    success: 'var(--success)', error: 'var(--danger)'
  };
  return map[type] ?? 'var(--primary)';
}

// ── Public helper: create a notification ─────────────────────
export async function createNotification(
  db: D1Database,
  opts: {
    company_id: number;
    user_id?: number | null;
    type: 'info' | 'warning' | 'success' | 'error';
    category: 'inventory' | 'allocation' | 'sale' | 'payment' | 'system' | 'report' | 'pppoe';
    title: string;
    message: string;
    link?: string;
  }
) {
  try {
    await db.prepare(
      `INSERT INTO notifications (company_id, user_id, type, category, title, message, link)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      opts.company_id,
      opts.user_id ?? null,
      opts.type,
      opts.category,
      opts.title,
      opts.message,
      opts.link ?? null
    ).run();
  } catch (e) {
    // Silently fail if notifications table doesn't exist yet
    console.error('createNotification error:', e);
  }
}

// ── GET /notifications/ ─────────────────────────────────────
notifications.get('/', async (c) => {
  const user = c.get('user');
  const lang = c.get('lang');
  const filter = c.req.query('filter') ?? 'all';

  let whereExtra = '';
  if (filter === 'unread') whereExtra = ' AND is_read=0';
  else if (filter !== 'all') whereExtra = ` AND category='${filter}'`;

  const items = await c.env.DB.prepare(`
    SELECT n.*, u.full_name as sender_name
    FROM notifications n
    LEFT JOIN users u ON u.id = n.user_id
    WHERE n.company_id=?
      AND (n.user_id IS NULL OR n.user_id=?)
      ${whereExtra}
    ORDER BY n.created_at DESC
    LIMIT 100`
  ).bind(user.company_id, user.id).all<any>();

  const unreadRow = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM notifications
     WHERE company_id=? AND (user_id IS NULL OR user_id=?) AND is_read=0`
  ).bind(user.company_id, user.id).first<{n:number}>();
  const unreadCount = unreadRow?.n ?? 0;

  function fdate(d: string) {
    const dt = new Date(d);
    const now = new Date();
    const diff = Math.floor((now.getTime() - dt.getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff/60)}m`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h`;
    return dt.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
  }

  const filterTabs = [
    {key:'all',       label: t(lang,'filter_all')},
    {key:'unread',    label: `${t(lang,'filter_unread')}${unreadCount>0?` (${unreadCount})`:''}`},
    {key:'sale',      label: t(lang,'filter_sales')},
    {key:'inventory', label: t(lang,'filter_inventory')},
    {key:'allocation',label: t(lang,'filter_allocations')},
    {key:'payment',   label: t(lang,'filter_payments')},
    {key:'system',    label: t(lang,'filter_system')},
    {key:'pppoe',     label: '🌐 PPPoE'},
  ];

  const tabsHtml = filterTabs.map(tab => `
    <a href="/notifications?filter=${tab.key}"
       class="btn btn-sm ${filter===tab.key?'btn-primary':'btn-outline'}"
       style="white-space:nowrap">${tab.label}</a>
  `).join('');

  const listHtml = (items.results||[]).length === 0
    ? `<div class="empty-state">
         <div class="empty-state-icon">🔔</div>
         <h3>${t(lang,'no_notifications')}</h3>
         <p>${t(lang,'all_caught_up')}</p>
       </div>`
    : (items.results||[]).map((n: any) => `
      <div class="notif-item ${n.is_read ? '' : 'notif-unread'}" id="notif-${n.id}"
           onclick="markRead(${n.id}, '${n.link ?? ''}')">
        <div class="notif-icon" style="background:${notifColor(n.type)}22;color:${notifColor(n.type)}">
          ${notifIcon(n.category)}
        </div>
        <div class="notif-body">
          <div class="notif-title">${n.title}</div>
          <div class="notif-msg">${n.message}</div>
          <div class="notif-meta">
            <span>${fdate(n.created_at)}</span>
            ${n.link ? `<a href="${n.link}" onclick="event.stopPropagation()" style="color:var(--primary);font-size:.75rem">${t(lang,'notif_view')}</a>` : ''}
          </div>
        </div>
        <div class="notif-actions">
          ${!n.is_read ? `<div class="notif-dot"></div>` : ''}
          <button onclick="event.stopPropagation();deleteNotif(${n.id})" class="notif-del-btn" title="${t(lang,'notif_delete')}">✕</button>
        </div>
      </div>`).join('');

  return c.html(pageShell({
    title: t(lang,'notifications'), lang, user, activePage: 'notifications',
    body: `
    <div class="page-header">
      <div>
        <div class="page-title">${t(lang,'notifications_title')}</div>
        <div class="page-subtitle">${unreadCount} ${t(lang,'unread_notifications')}</div>
      </div>
      <div class="btn-group">
        <button onclick="markAllRead()" class="btn btn-outline btn-sm">✓ ${t(lang,'mark_all_read')}</button>
        <button onclick="clearAll()" class="btn btn-outline btn-sm" style="color:var(--danger)">${t(lang,'clear_all')}</button>
      </div>
    </div>

    <!-- Filter tabs -->
    <div class="btn-group" style="flex-wrap:wrap;gap:.4rem;margin-bottom:1.25rem">
      ${tabsHtml}
    </div>

    <!-- Notification list -->
    <div class="card" style="padding:0;overflow:hidden">
      <div id="notif-list">${listHtml}</div>
    </div>`,
    scripts: `
    <style>
      .notif-item {
        display:flex;align-items:flex-start;gap:.875rem;
        padding:1rem 1.25rem;border-bottom:1px solid var(--border);
        cursor:pointer;transition:background .15s;
      }
      .notif-item:last-child{border-bottom:none}
      .notif-item:hover{background:var(--bg-tertiary)}
      .notif-unread{background:var(--bg-secondary)}
      .notif-icon{
        width:38px;height:38px;border-radius:10px;
        display:flex;align-items:center;justify-content:center;
        font-size:1.1rem;flex-shrink:0;
      }
      .notif-body{flex:1;min-width:0}
      .notif-title{color:var(--text-primary);font-weight:600;font-size:.875rem;margin-bottom:.2rem}
      .notif-msg{color:var(--text-secondary);font-size:.82rem;line-height:1.4;margin-bottom:.35rem}
      .notif-meta{display:flex;align-items:center;gap:.75rem;font-size:.75rem;color:var(--text-muted)}
      .notif-actions{display:flex;flex-direction:column;align-items:center;gap:.4rem;flex-shrink:0}
      .notif-dot{width:8px;height:8px;background:var(--primary);border-radius:50%}
      .notif-del-btn{
        background:none;border:none;cursor:pointer;
        color:var(--text-muted);font-size:.8rem;
        padding:.2rem .35rem;border-radius:4px;
        opacity:0;transition:opacity .15s;
      }
      .notif-item:hover .notif-del-btn{opacity:1}
      .notif-del-btn:hover{background:var(--danger-bg,rgba(239,68,68,.1));color:var(--danger)}
    </style>
    <script>
    async function markRead(id, link) {
      await fetch('/notifications/read/' + id, {method:'POST'});
      const el = document.getElementById('notif-'+id);
      if(el){
        el.classList.remove('notif-unread');
        const dot = el.querySelector('.notif-dot');
        if(dot) dot.remove();
      }
      updateNotifBadge();
      if(link) setTimeout(()=>location.href=link, 200);
    }
    async function deleteNotif(id) {
      await fetch('/notifications/'+id, {method:'DELETE'});
      const el = document.getElementById('notif-'+id);
      if(el) el.remove();
      updateNotifBadge();
    }
    async function markAllRead() {
      await fetch('/notifications/read-all', {method:'POST'});
      document.querySelectorAll('.notif-unread').forEach(el=>{
        el.classList.remove('notif-unread');
        const dot = el.querySelector('.notif-dot');
        if(dot) dot.remove();
      });
      updateNotifBadge();
    }
    async function clearAll() {
      if(!confirm('${t(lang,'delete_all_confirm')}')) return;
      await fetch('/notifications/clear', {method:'DELETE'});
      document.getElementById('notif-list').innerHTML =
        '<div class="empty-state"><div class="empty-state-icon">🔔</div><h3>${t(lang,'no_notifications')}</h3><p>${t(lang,'all_caught_up')}</p></div>';
      updateNotifBadge();
    }
    </script>`
  }));
});

// ── GET /notifications/count ─────────────────────────────────
notifications.get('/count', async (c) => {
  const user = c.get('user');
  const row = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM notifications
     WHERE company_id=? AND (user_id IS NULL OR user_id=?) AND is_read=0`
  ).bind(user.company_id, user.id).first<{n:number}>();
  return c.json({ count: row?.n ?? 0 });
});

// ── GET /notifications/recent ─────────────────────────────────
notifications.get('/recent', async (c) => {
  const user = c.get('user');
  const items = await c.env.DB.prepare(`
    SELECT id, type, category, title, message, link, is_read, created_at
    FROM notifications
    WHERE company_id=? AND (user_id IS NULL OR user_id=?)
    ORDER BY created_at DESC LIMIT 8`
  ).bind(user.company_id, user.id).all<any>();
  const unread = (items.results||[]).filter((n:any)=>!n.is_read).length;
  return c.json({ items: items.results||[], unread });
});

// ── POST /notifications/read/:id ─────────────────────────────
notifications.post('/read/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `UPDATE notifications SET is_read=1 WHERE id=? AND company_id=?`
  ).bind(id, user.company_id).run();
  return c.json({ success: true });
});

// ── POST /notifications/read-all ─────────────────────────────
notifications.post('/read-all', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(
    `UPDATE notifications SET is_read=1 WHERE company_id=? AND (user_id IS NULL OR user_id=?)`
  ).bind(user.company_id, user.id).run();
  return c.json({ success: true });
});

// ── DELETE /notifications/clear ───────────────────────────────
notifications.delete('/clear', async (c) => {
  const user = c.get('user');
  await c.env.DB.prepare(
    `DELETE FROM notifications WHERE company_id=? AND (user_id IS NULL OR user_id=?)`
  ).bind(user.company_id, user.id).run();
  return c.json({ success: true });
});

// ── DELETE /notifications/:id ─────────────────────────────────
// Must come after /clear to avoid route conflict
notifications.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  await c.env.DB.prepare(
    `DELETE FROM notifications WHERE id=? AND company_id=?`
  ).bind(id, user.company_id).run();
  return c.json({ success: true });
});

export default notifications;
