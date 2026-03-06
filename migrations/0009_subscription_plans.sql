-- ============================================
-- Migration 0009: Subscription Plans System
-- سیستم پلن‌های اشتراک برای سوپر ادمین
-- ============================================

-- Subscription Plans (defined by super admin)
-- پلن‌های اشتراک تعریف شده توسط سوپر ادمین
CREATE TABLE IF NOT EXISTS subscription_plans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,           -- e.g. "پلن پایه", "پلن حرفه‌ای", "پلن شرکتی"
  name_en     TEXT    NOT NULL DEFAULT '', -- English name
  price       REAL    NOT NULL DEFAULT 0, -- monthly price in Afghani (؋)
  duration_days INTEGER NOT NULL DEFAULT 30, -- plan duration in days
  max_sellers INTEGER NOT NULL DEFAULT 5,   -- max sellers allowed
  max_branches INTEGER NOT NULL DEFAULT 2,  -- max branches allowed
  features    TEXT    NOT NULL DEFAULT '{}', -- JSON array of feature strings
  color       TEXT    NOT NULL DEFAULT '#4f46e5', -- badge color
  is_active   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Company Subscriptions (history of subscriptions per company)
-- تاریخچه اشتراک‌های هر شرکت
CREATE TABLE IF NOT EXISTS company_subscriptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id   INTEGER NOT NULL REFERENCES companies(id),
  plan_id      INTEGER NOT NULL REFERENCES subscription_plans(id),
  start_date   DATE    NOT NULL DEFAULT (date('now')),
  end_date     DATE    NOT NULL,            -- start_date + duration_days
  amount_paid  REAL    NOT NULL DEFAULT 0,  -- actual amount paid (may differ from plan price)
  payment_method TEXT  DEFAULT 'cash',      -- cash, bank, card, other
  payment_note TEXT    DEFAULT '',
  status       TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','cancelled')),
  created_by   INTEGER REFERENCES super_admins(id),
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_subs_company   ON company_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subs_plan      ON company_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subs_end_date  ON company_subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_subs_status    ON company_subscriptions(status);

-- Seed default subscription plans
INSERT INTO subscription_plans (name, name_en, price, duration_days, max_sellers, max_branches, features, color, sort_order) VALUES
  ('پلن آزمایشی', 'Trial Plan',    0,    14,  2, 1, '["تا ۲ فروشنده","تا ۱ شعبه","پشتیبانی محدود"]', '#64748b', 1),
  ('پلن پایه',    'Basic Plan',  1000,   30,  5, 2, '["تا ۵ فروشنده","تا ۲ شعبه","گزارشات پایه","پشتیبانی ایمیل"]', '#0891b2', 2),
  ('پلن حرفه‌ای', 'Pro Plan',    2500,   30, 15, 5, '["تا ۱۵ فروشنده","تا ۵ شعبه","گزارشات کامل","پشتیبانی اولویت‌دار"]', '#4f46e5', 3),
  ('پلن شرکتی',  'Enterprise',  5000,   30, 999,999,'["فروشندگان نامحدود","شعب نامحدود","گزارشات پیشرفته","پشتیبانی ۲۴/۷"]', '#7c3aed', 4);
