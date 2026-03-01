-- ============================================
-- Super Admin Table
-- Super admins manage all tenants (companies)
-- They are NOT tied to any company
-- ============================================

CREATE TABLE IF NOT EXISTS super_admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Super Admin Sessions (separate from tenant sessions)
CREATE TABLE IF NOT EXISTS super_admin_sessions (
  id TEXT PRIMARY KEY,
  super_admin_id INTEGER NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (super_admin_id) REFERENCES super_admins(id)
);

CREATE INDEX IF NOT EXISTS idx_super_admin_sessions_admin ON super_admin_sessions(super_admin_id);
