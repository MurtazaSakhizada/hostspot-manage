-- ============================================================
-- PPPoE Renewals Log — Phase 2: Track renewal history
-- Each renewal by the owner writes one row here.
-- ============================================================

CREATE TABLE IF NOT EXISTS pppoe_renewals (
  id                INTEGER  PRIMARY KEY AUTOINCREMENT,
  customer_id       INTEGER  NOT NULL,
  company_id        INTEGER  NOT NULL,
  previous_expiry   TEXT     NOT NULL,   -- ISO date YYYY-MM-DD
  new_expiry        TEXT     NOT NULL,   -- ISO date YYYY-MM-DD
  monthly_price     REAL     NOT NULL DEFAULT 0,  -- price at time of renewal
  notes             TEXT,
  renewed_by        INTEGER,             -- user_id who performed renewal
  renewed_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES pppoe_customers(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id)  REFERENCES companies(id),
  FOREIGN KEY (renewed_by)  REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pppoe_renewals_customer ON pppoe_renewals(customer_id);
CREATE INDEX IF NOT EXISTS idx_pppoe_renewals_company  ON pppoe_renewals(company_id);
