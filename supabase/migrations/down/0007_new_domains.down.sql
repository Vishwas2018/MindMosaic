-- =============================================================================
-- Migration 0007 DOWN — New Domains: Assignments + Billing + Engagement + Notifications
-- Stage 8 · 2026-05-03
-- Reverses 0007_new_domains.sql
--
-- Drop order (most-constrained first):
--   1. notification         — no downstream FKs
--   2. student_achievement  — no downstream FKs
--   3. achievement_definition — referenced by student_achievement (already dropped)
--   4. engagement_streak    — no downstream FKs
--   5. billing_event        — no downstream FKs
--   6. invoice              — no downstream FKs
--   7. billing_customer     — no downstream FKs
--   8. subscription         — no downstream FKs
--   9. ALTER TABLE session_record DROP CONSTRAINT fk_session_assignment (before assignment)
--  10. assignment_session   — references assignment + session_record
--  11. assignment_target    — references assignment
--  12. assignment           — base table; referenced by session_record FK (dropped above)
--  13. DROP FUNCTION fn_my_assignment_ids() — used by assignment policies (already dropped)
--
-- Indexes and RLS policies drop automatically with their tables.
-- =============================================================================

DROP TABLE IF EXISTS notification;
DROP TABLE IF EXISTS student_achievement;
DROP TABLE IF EXISTS achievement_definition;
DROP TABLE IF EXISTS engagement_streak;
DROP TABLE IF EXISTS billing_event;
DROP TABLE IF EXISTS invoice;
DROP TABLE IF EXISTS billing_customer;
DROP TABLE IF EXISTS subscription;
ALTER TABLE session_record DROP CONSTRAINT IF EXISTS fk_session_assignment;
DROP TABLE IF EXISTS assignment_session;
DROP TABLE IF EXISTS assignment_target;
DROP TABLE IF EXISTS assignment;
DROP FUNCTION IF EXISTS fn_my_assignment_ids();
