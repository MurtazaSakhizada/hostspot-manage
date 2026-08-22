-- Migration 0013: Add seller_panel_enabled feature flag to companies
-- When 1 (default): sellers can log in, record sales, view their own panel
-- When 0: seller login is blocked; sales can only be recorded by owner; seller credentials are auto-generated
ALTER TABLE companies ADD COLUMN seller_panel_enabled BOOLEAN NOT NULL DEFAULT 1;
