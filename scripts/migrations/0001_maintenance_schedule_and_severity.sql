-- Migration: add maintenance scheduling windows and severity/mode field
-- Task #23: maintenanceStartsAt, maintenanceEndsAt
-- Task #24: maintenanceSeverity ('full' | 'banner')
-- All statements are idempotent.

ALTER TABLE site_settings
  ADD COLUMN IF NOT EXISTS maintenance_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS maintenance_ends_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS maintenance_severity  VARCHAR(10) NOT NULL DEFAULT 'full';
