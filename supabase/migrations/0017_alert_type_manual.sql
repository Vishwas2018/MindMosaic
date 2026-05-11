-- Migration 0017 — add 'manual' value to alert_type enum
-- Required for Stage 38 POST /analytics/intervention-alerts (teacher manual flag).
-- ALTER TYPE ... ADD VALUE is non-transactional in Postgres 12+; safe to run standalone.
ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'manual';
