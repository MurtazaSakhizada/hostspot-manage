-- ============================================
-- Migration 0007: Purchase Cost + Expenses
-- ============================================

-- Add purchase_cost column to inventory_batches
-- purchase_cost = total_gb * purchase_price_per_gb at time of entry
ALTER TABLE inventory_batches ADD COLUMN purchase_cost REAL NOT NULL DEFAULT 0;
ALTER TABLE inventory_batches ADD COLUMN purchase_price_per_gb REAL NOT NULL DEFAULT 0;

-- Expenses table (مصارف)
CREATE TABLE IF NOT EXISTS expenses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id  INTEGER NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general', -- 'rent','salary','utilities','maintenance','other','general'
  title       TEXT NOT NULL,
  amount      REAL NOT NULL DEFAULT 0,
  expense_date TEXT NOT NULL DEFAULT (date('now')),
  notes       TEXT,
  created_by  INTEGER,  -- user_id who created
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
