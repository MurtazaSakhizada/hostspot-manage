-- ============================================================
-- PPPoE Payments — track cash received from customers
-- Each row = one payment by a PPPoE customer.
-- Separate from pppoe_renewals (which tracks service periods).
-- ============================================================

CREATE TABLE IF NOT EXISTS pppoe_payments (
  id            INTEGER  PRIMARY KEY AUTOINCREMENT,
  customer_id   INTEGER  NOT NULL,
  company_id    INTEGER  NOT NULL,
  amount        REAL     NOT NULL DEFAULT 0,
  notes         TEXT,
  paid_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  recorded_by   INTEGER,                              -- user_id
  FOREIGN KEY (customer_id) REFERENCES pppoe_customers(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id)  REFERENCES companies(id),
  FOREIGN KEY (recorded_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pppoe_payments_customer ON pppoe_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_pppoe_payments_company  ON pppoe_payments(company_id);
