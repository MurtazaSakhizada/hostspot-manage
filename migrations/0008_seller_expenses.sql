-- ============================================
-- Migration 0008: Seller Personal Expenses
-- مصارف شخصی فروشنده
-- ============================================
-- Add seller_id to expenses so seller expenses can be
-- tracked separately from company (owner) expenses.
-- seller_id = NULL  → company/owner expense (مصرف شرکت)
-- seller_id = X     → personal expense of seller X (مصرف شخصی فروشنده)
-- Seller expenses do NOT affect debt calculation.
-- They are only for personal tracking by the seller.

ALTER TABLE expenses ADD COLUMN seller_id INTEGER REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_expenses_seller ON expenses(seller_id);
