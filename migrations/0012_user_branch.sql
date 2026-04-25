-- Migration 0012: Add branch_id to users table
-- Each seller is locked to one branch at registration time

ALTER TABLE users ADD COLUMN branch_id INTEGER REFERENCES branches(id);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id);
