-- ============================================
-- Migration 0005: Add active column to companies
-- Enable/disable tenants from super admin panel
-- ============================================

-- Add active column to companies (default 1 = active)
ALTER TABLE companies ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
