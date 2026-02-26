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

// Simple hash (for demo - in production use bcrypt via external service)
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
    WHERE s.id = ? AND s.expires_at > datetime('now') AND u.active = 1
  `).bind(sessionId).first<SessionUser>();
  return row ?? null;
}

export async function deleteSession(db: D1Database, sessionId: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), decodeURIComponent(v.join('='))];
    })
  );
}
