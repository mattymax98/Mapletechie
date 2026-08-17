-- Migration 0002: engagement signal columns + new tables (task #232)
-- Idempotent — safe to re-run.

-- New columns on page_views added by the engagement tracking feature
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS scroll_depth     SMALLINT;
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS duration_ms      INTEGER;
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS device_type      VARCHAR(20);
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS browser          VARCHAR(40);
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS is_returning     BOOLEAN;
ALTER TABLE page_views ADD COLUMN IF NOT EXISTS reading_time_sec SMALLINT;

-- Search queries table
CREATE TABLE IF NOT EXISTS search_queries (
  id         SERIAL PRIMARY KEY,
  query      TEXT NOT NULL,
  path       TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS search_queries_created_at_idx ON search_queries (created_at);

-- Link clicks table
CREATE TABLE IF NOT EXISTS link_clicks (
  id         SERIAL PRIMARY KEY,
  link_type  TEXT NOT NULL,
  href       TEXT NOT NULL,
  post_slug  TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS link_clicks_created_at_idx          ON link_clicks (created_at);
CREATE INDEX IF NOT EXISTS link_clicks_post_slug_created_at_idx ON link_clicks (post_slug, created_at);
