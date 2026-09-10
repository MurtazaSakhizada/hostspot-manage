-- ============================================================
-- PPPoE Renewals — Phase 2 extension: store package details
-- Adds package_type, speed_mbps, quota_gb so the history
-- table records exactly what package each renewal covered.
-- SQLite: ALTER TABLE … ADD COLUMN (no NOT NULL without DEFAULT)
-- ============================================================

ALTER TABLE pppoe_renewals ADD COLUMN package_type TEXT    NOT NULL DEFAULT 'unlimited';
ALTER TABLE pppoe_renewals ADD COLUMN speed_mbps   INTEGER NOT NULL DEFAULT 4;
ALTER TABLE pppoe_renewals ADD COLUMN quota_gb     REAL;   -- NULL = unlimited
