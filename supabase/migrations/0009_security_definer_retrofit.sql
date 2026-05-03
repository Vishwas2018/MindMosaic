-- =============================================================================
-- Migration 0009 — SECURITY DEFINER triple-REVOKE retrofit
-- Stage 10 audit day · 2026-05-03
-- ISSUE-0002 resolution.
--
-- Stage 2/3 helpers (Migrations 0001 + 0002) used single REVOKE FROM PUBLIC +
-- GRANT TO authenticated. Missing: REVOKE FROM authenticated + REVOKE FROM anon.
-- Supabase local dev applies ALTER DEFAULT PRIVILEGES GRANT EXECUTE TO anon on
-- all new functions, so anon had implicit EXECUTE on these helpers.
--
-- A1 canonical triple-REVOKE (BUILD_CONTRACT §6, PGTAP_PATTERNS P3):
--   REVOKE FROM PUBLIC;
--   REVOKE FROM authenticated;  ← was missing from 0001/0002
--   REVOKE FROM anon;            ← was missing from 0001/0002 (ISSUE-0002)
--   GRANT TO authenticated;
--
-- Net effect: authenticated retains EXECUTE (re-granted); anon loses EXECUTE.
-- =============================================================================

-- ── Migration 0001 helpers ────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.auth_tenant_id()          FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_tenant_id()          FROM anon;
GRANT  EXECUTE ON FUNCTION public.auth_tenant_id()          TO   authenticated;

REVOKE EXECUTE ON FUNCTION public.auth_user_id()            FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_user_id()            FROM anon;
GRANT  EXECUTE ON FUNCTION public.auth_user_id()            TO   authenticated;

REVOKE EXECUTE ON FUNCTION public.auth_role()               FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.auth_role()               FROM anon;
GRANT  EXECUTE ON FUNCTION public.auth_role()               TO   authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_user_in_my_tenant(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_user_in_my_tenant(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_user_in_my_tenant(uuid) TO   authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_class_in_my_tenant(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_class_in_my_tenant(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_class_in_my_tenant(uuid) TO   authenticated;

-- ── Migration 0002 helpers ────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.fn_graph_version_is_published(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_graph_version_is_published(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.fn_graph_version_is_published(uuid) TO   authenticated;
