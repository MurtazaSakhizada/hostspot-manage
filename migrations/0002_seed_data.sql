-- Seed: Demo Company and Users for Testing
INSERT OR IGNORE INTO companies (id, name, slug, default_language) VALUES
  (1, 'HotSpot Pro', 'hotspot-pro', 'en');

-- password: admin123 (sha256 hash stored as hex)
INSERT OR IGNORE INTO users (id, company_id, username, password_hash, full_name, role, commission_rate, language) VALUES
  (1, 1, 'admin', 'admin123_hashed', 'System Owner', 'owner', 0.0, 'en'),
  (2, 1, 'seller1', 'seller123_hashed', 'Ahmad Seller', 'seller', 0.15, 'en'),
  (3, 1, 'seller2', 'seller123_hashed', 'Khalid Seller', 'seller', 0.20, 'fa');

INSERT OR IGNORE INTO branches (id, company_id, name) VALUES
  (1, 1, 'Main Branch'),
  (2, 1, 'North Branch'),
  (3, 1, 'South Branch');

INSERT OR IGNORE INTO packages (id, company_id, name, size_gb, sale_price_per_gb) VALUES
  (1, 1, '1GB Package', 1.0, 50.0),
  (2, 1, '3GB Package', 3.0, 45.0),
  (3, 1, '5GB Package', 5.0, 40.0),
  (4, 1, '10GB Package', 10.0, 35.0),
  (5, 1, '20GB Package', 20.0, 30.0);
