-- =============================================================================
-- Down Migration 0003 — Assessment Configuration
-- Stage 4 · 2026-05-02
-- Reverses: 0003_assessment_config.sql
--
-- Drop order rationale:
-- 1. Tables in reverse FK dependency order (most-dependent first):
--      diagnostic_rule     (FK → skill_node from Migration 0002; no deps
--                           on other Stage 4 tables — safe to drop first)
--      assessment_profile  (FK → framework_config + blueprint)
--      pathway             (FK → framework_config)
--      blueprint           (no FKs within Stage 4 tables at this point)
--      framework_config    (no FKs within Stage 4 tables at this point)
--    Dropping each table also drops: its indexes, RLS policies, constraints.
--    No CASCADE needed when drop order respects FK dependency graph.
-- 2. No functions, views, or helpers to drop in this migration.
-- Note: session_record (Migration 0004) FKs pathway + assessment_profile.
--       Apply Migration 0004 down before this file if Migration 0004 is live.
-- =============================================================================

DROP TABLE IF EXISTS diagnostic_rule;
DROP TABLE IF EXISTS assessment_profile;
DROP TABLE IF EXISTS pathway;
DROP TABLE IF EXISTS blueprint;
DROP TABLE IF EXISTS framework_config;
