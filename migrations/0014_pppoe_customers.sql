-- ============================================================
-- PPPoE Customers (Home Internet) — Phase 1: Standalone
-- Fully isolated from financial ledger, sales, and notifications.
-- ============================================================

CREATE TABLE IF NOT EXISTS pppoe_customers (
  id                INTEGER  PRIMARY KEY AUTOINCREMENT,
  company_id        INTEGER  NOT NULL,
  branch_id         INTEGER,                              -- nullable, optional link to branch
  full_name         TEXT     NOT NULL,
  phone_primary     TEXT     NOT NULL,
  phone_secondary   TEXT,                                 -- nullable
  address           TEXT,                                 -- nullable
  pppoe_username    TEXT     NOT NULL,                   -- memo field only, not a system login
  package_type      TEXT     NOT NULL DEFAULT 'unlimited'
                    CHECK(package_type IN ('unlimited','limited')),
  speed_mbps        INTEGER  NOT NULL DEFAULT 4
                    CHECK(speed_mbps BETWEEN 1 AND 10),
  quota_gb          REAL,                                 -- nullable, only for limited packages
  monthly_price     REAL     NOT NULL DEFAULT 0,
  start_date        TEXT     NOT NULL,                   -- ISO date YYYY-MM-DD
  expiry_date       TEXT     NOT NULL,                   -- ISO date YYYY-MM-DD
  last_renewed_at   TEXT,                                 -- nullable, filled on renewal
  status            TEXT     NOT NULL DEFAULT 'active'
                    CHECK(status IN ('active','inactive')),
  notes             TEXT,                                 -- nullable
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (branch_id)  REFERENCES branches(id)
);

CREATE INDEX IF NOT EXISTS idx_pppoe_company   ON pppoe_customers(company_id);
CREATE INDEX IF NOT EXISTS idx_pppoe_status    ON pppoe_customers(company_id, status);
CREATE INDEX IF NOT EXISTS idx_pppoe_expiry    ON pppoe_customers(company_id, expiry_date);
CREATE INDEX IF NOT EXISTS idx_pppoe_branch    ON pppoe_customers(branch_id);
