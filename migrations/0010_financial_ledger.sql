-- ============================================================
-- Financial Ledger System
-- Immutable ledger tracking all financial movements per seller
-- Every allocation and payment creates an entry.
-- Corrections are added as new records only.
-- ============================================================

CREATE TABLE IF NOT EXISTS financial_ledger (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER NOT NULL,
  seller_id       INTEGER NOT NULL,
  -- transaction type: allocation | payment | correction
  transaction_type TEXT NOT NULL CHECK(transaction_type IN ('allocation','payment','correction')),
  -- Reference to source record
  ref_type        TEXT,  -- 'allocation_batch' | 'payment' | 'manual'
  ref_id          INTEGER, -- id in the referenced table
  -- Financial values
  gb_amount       REAL    NOT NULL DEFAULT 0,   -- GB moved (only for allocations)
  money_amount    REAL    NOT NULL DEFAULT 0,   -- +money for allocation debt, -money for payment
  balance_after   REAL    NOT NULL DEFAULT 0,   -- running balance (debt owed to owner by seller)
  notes           TEXT,
  created_by      INTEGER,  -- user_id who created the entry
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (seller_id)  REFERENCES users(id)
);

-- Index for fast per-seller lookups
CREATE INDEX IF NOT EXISTS idx_ledger_company_seller ON financial_ledger(company_id, seller_id);
CREATE INDEX IF NOT EXISTS idx_ledger_ref           ON financial_ledger(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created       ON financial_ledger(created_at);

-- ============================================================
-- Backfill: create ledger entries for ALL existing allocations
-- (in chronological order, running balance per seller)
-- ============================================================
-- We insert existing allocation_batches as ledger entries
-- balance = cumulative net_amount from allocations - cumulative payments
INSERT OR IGNORE INTO financial_ledger
  (company_id, seller_id, transaction_type, ref_type, ref_id, gb_amount, money_amount, balance_after, notes, created_at)
SELECT
  ab.company_id,
  ab.seller_id,
  'allocation',
  'allocation_batch',
  ab.id,
  ab.total_gb,
  ab.total_net,  -- net owed to owner by seller
  0,             -- balance_after will be recalculated below (placeholder)
  'Backfilled from existing allocation',
  ab.created_at
FROM allocation_batches ab
ORDER BY ab.created_at ASC;

-- Backfill: create ledger entries for existing payments
INSERT OR IGNORE INTO financial_ledger
  (company_id, seller_id, transaction_type, ref_type, ref_id, gb_amount, money_amount, balance_after, notes, created_at)
SELECT
  p.company_id,
  p.seller_id,
  'payment',
  'payment',
  p.id,
  0,
  -p.amount,     -- negative = reduces debt
  0,
  'Backfilled from existing payment',
  p.created_at
FROM payments p
ORDER BY p.created_at ASC;

-- Note: balance_after is set to 0 for backfilled records.
-- The application always calculates current balance by SUM(money_amount)
-- which is the correct running total without needing per-row recalculation.
