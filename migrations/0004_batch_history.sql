-- ============================================
-- Batch History for Inventory & Allocations
-- Each batch groups multiple package lines
-- ============================================

-- Inventory Batches (a single stock-in event with multiple packages)
CREATE TABLE IF NOT EXISTS inventory_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  total_gb REAL NOT NULL DEFAULT 0,
  total_gross REAL NOT NULL DEFAULT 0,
  total_net REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Inventory Batch Lines (one row per package in the batch)
CREATE TABLE IF NOT EXISTS inventory_batch_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  package_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  size_gb REAL NOT NULL DEFAULT 0,
  total_gb REAL NOT NULL DEFAULT 0,
  price_per_gb REAL NOT NULL DEFAULT 0,
  gross_amount REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id),
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (package_id) REFERENCES packages(id)
);

-- Allocation Batches (a single allocation event: owner → one seller, multiple packages)
CREATE TABLE IF NOT EXISTS allocation_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL,
  seller_id INTEGER NOT NULL,
  branch_id INTEGER NOT NULL,
  commission_rate REAL NOT NULL DEFAULT 0,
  total_gb REAL NOT NULL DEFAULT 0,
  total_gross REAL NOT NULL DEFAULT 0,
  total_commission REAL NOT NULL DEFAULT 0,
  total_net REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (seller_id) REFERENCES users(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

-- Allocation Batch Lines (one row per package in the allocation batch)
CREATE TABLE IF NOT EXISTS allocation_batch_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL,
  package_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  size_gb REAL NOT NULL DEFAULT 0,
  total_gb REAL NOT NULL DEFAULT 0,
  price_per_gb REAL NOT NULL DEFAULT 0,
  gross_amount REAL NOT NULL DEFAULT 0,
  commission_amount REAL NOT NULL DEFAULT 0,
  net_amount REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (batch_id) REFERENCES allocation_batches(id),
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (package_id) REFERENCES packages(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inv_batches_company ON inventory_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_batch_lines_batch ON inventory_batch_lines(batch_id);
CREATE INDEX IF NOT EXISTS idx_alloc_batches_company ON allocation_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_alloc_batches_seller ON allocation_batches(seller_id);
CREATE INDEX IF NOT EXISTS idx_alloc_batch_lines_batch ON allocation_batch_lines(batch_id);
