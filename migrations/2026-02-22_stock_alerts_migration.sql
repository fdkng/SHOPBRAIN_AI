-- Migration: stock_alert_settings safe update for multi-product unique constraint
-- Date: 2026-02-22
-- Instructions: Copy-paste this entire script into the Supabase SQL editor and run.
-- It will:
-- 1) create a backup table (if not exists)
-- 2) show duplicates (so you can inspect)
-- 3) delete duplicates keeping the most recent row per (user_id, product_id)
-- 4) normalize NULLs and apply defaults
-- 5) add a UNIQUE constraint on (user_id, product_id) if missing
-- 6) create helpful indexes and show a summary at the end

-- NOTE: If your project needs a different deduplication rule (keep earliest, keep highest threshold, etc.), stop and ask before running.

BEGIN;

-- 1) Backup (safe, idempotent)
CREATE TABLE IF NOT EXISTS stock_alert_settings_backup_20260222 AS
SELECT * FROM stock_alert_settings;

-- 2) List duplicates for manual inspection
-- Run this and check results BEFORE proceeding if you want to review duplicates.
-- You can comment out the DELETE step below and run only up to this SELECT to inspect.

SELECT user_id, product_id, array_agg(id ORDER BY created_at DESC) AS ids, count(*) AS cnt
FROM stock_alert_settings
GROUP BY user_id, product_id
HAVING count(*) > 1;

-- 3) Deduplicate: keep the most recent (by created_at, then by id)
-- This deletes rows where row_number > 1 for a (user_id, product_id) partition.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, product_id ORDER BY created_at DESC, id DESC) AS rn
  FROM stock_alert_settings
)
DELETE FROM stock_alert_settings
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 4) Normalize NULLs and enforce sensible defaults
UPDATE stock_alert_settings SET threshold = 0 WHERE threshold IS NULL;
UPDATE stock_alert_settings SET enabled = true WHERE enabled IS NULL;

-- 5) Add UNIQUE constraint on (user_id, product_id) if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'stock_alert_settings'::regclass
      AND contype = 'u'
    AND pg_get_constraintdef(oid) LIKE '%(user_id, product_id)%'
  ) THEN
    ALTER TABLE stock_alert_settings
      ADD CONSTRAINT stock_alert_settings_user_product_unique
      UNIQUE (user_id, product_id);
  END IF;
END$$;

-- 6) Ensure an index exists for fast lookup by user (non-blocking)
CREATE INDEX IF NOT EXISTS idx_stock_alert_settings_user_id ON stock_alert_settings(user_id);

COMMIT;

-- Summary queries: run these after the migration to verify
-- Total rows
SELECT count(*) AS total_settings FROM stock_alert_settings;
-- Sample rows per user (first 20)
SELECT user_id, count(*) AS cnt FROM stock_alert_settings GROUP BY user_id ORDER BY cnt DESC LIMIT 20;

-- Check that the constraint exists
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'stock_alert_settings'::regclass
  AND contype = 'u';

-- End of migration
