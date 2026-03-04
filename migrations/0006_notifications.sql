-- ============================================
-- Migration 0006: Notifications System
-- ============================================

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  user_id INTEGER,           -- NULL = broadcast to all owners of company
  type TEXT NOT NULL,        -- 'info' | 'warning' | 'success' | 'error'
  category TEXT NOT NULL,    -- 'inventory' | 'allocation' | 'sale' | 'payment' | 'system'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,                 -- optional URL to related page
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_company ON notifications(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
