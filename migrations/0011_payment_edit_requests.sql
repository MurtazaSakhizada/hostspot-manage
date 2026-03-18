-- ============================================
-- Payment Edit Requests (Seller → Admin approval flow)
-- ============================================

-- Table: seller submits a request to edit an existing payment
CREATE TABLE IF NOT EXISTS payment_edit_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  payment_id INTEGER NOT NULL,           -- the payment to be changed
  seller_id INTEGER NOT NULL,            -- who submitted the request
  -- proposed new values
  new_amount REAL NOT NULL,
  new_type TEXT NOT NULL CHECK(new_type IN ('commission','advance','settlement','other')),
  new_payment_date DATE NOT NULL,
  new_notes TEXT,
  -- original snapshot (so admin can compare)
  old_amount REAL NOT NULL,
  old_type TEXT NOT NULL,
  old_payment_date DATE NOT NULL,
  old_notes TEXT,
  -- workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  admin_notes TEXT,
  reviewed_by INTEGER,                   -- owner user_id who reviewed
  reviewed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id)  REFERENCES companies(id),
  FOREIGN KEY (payment_id)  REFERENCES payments(id),
  FOREIGN KEY (seller_id)   REFERENCES users(id),
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_per_company  ON payment_edit_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_per_payment  ON payment_edit_requests(payment_id);
CREATE INDEX IF NOT EXISTS idx_per_seller   ON payment_edit_requests(seller_id);
CREATE INDEX IF NOT EXISTS idx_per_status   ON payment_edit_requests(status);
