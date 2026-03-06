// ============================================
// Auth Utilities
// ============================================
import type { D1Database } from '@cloudflare/workers-types';

export interface SessionUser {
  id: number;
  company_id: number;
  username: string;
  full_name: string;
  role: 'owner' | 'seller';
  commission_rate: number;
  language: string;
}

export interface SuperAdminUser {
  id: number;
  username: string;
  full_name: string;
}

// Simple hash (SHA-256 via Web Crypto)
export async function hashPassword(password: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSessionId(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- Tenant Session ----
export async function createSession(db: D1Database, userId: number, companyId: number): Promise<string> {
  const sessionId = generateSessionId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(
    'INSERT INTO sessions (id, user_id, company_id, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(sessionId, userId, companyId, expiresAt).run();
  return sessionId;
}

export async function getSessionUser(db: D1Database, sessionId: string | undefined): Promise<SessionUser | null> {
  if (!sessionId) return null;
  const row = await db.prepare(`
    SELECT u.id, u.company_id, u.username, u.full_name, u.role, u.commission_rate, u.language
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    JOIN companies c ON c.id = u.company_id
    WHERE s.id = ? AND s.expires_at > datetime('now')
      AND u.active = 1
      AND COALESCE(c.active, 1) = 1
  `).bind(sessionId).first<SessionUser>();
  if (!row) return null;

  // Block mid-session if subscription has expired
  // Only enforced if the company has ever been assigned a subscription
  const subCheck = await db.prepare(`
    SELECT
      COUNT(*) as total_subs,
      MAX(CASE WHEN status='active' AND end_date >= date('now') THEN 1 ELSE 0 END) as has_active
    FROM company_subscriptions
    WHERE company_id = ?
  `).bind(row.company_id).first<{total_subs:number; has_active:number}>();

  if (subCheck && subCheck.total_subs > 0 && !subCheck.has_active) {
    // Subscription existed but is now expired → treat as logged-out
    return null;
  }

  return row;
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

// ---- Super Admin Session ----
export async function createSuperAdminSession(db: D1Database, superAdminId: number): Promise<string> {
  const sessionId = 'sa_' + generateSessionId();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await db.prepare(
    'INSERT INTO super_admin_sessions (id, super_admin_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, superAdminId, expiresAt).run();
  return sessionId;
}

export async function getSuperAdminSession(db: D1Database, sessionId: string | undefined): Promise<SuperAdminUser | null> {
  if (!sessionId || !sessionId.startsWith('sa_')) return null;
  const row = await db.prepare(`
    SELECT sa.id, sa.username, sa.full_name
    FROM super_admin_sessions s
    JOIN super_admins sa ON sa.id = s.super_admin_id
    WHERE s.id = ? AND s.expires_at > datetime('now') AND sa.active = 1
  `).bind(sessionId).first<SuperAdminUser>();
  return row ?? null;
}

export async function deleteSuperAdminSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM super_admin_sessions WHERE id = ?').bind(sessionId).run();
}

// ---- Cookie Utility ----
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), decodeURIComponent(v.join('='))];
    })
  );
}
