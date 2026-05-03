-- =============================================================================
-- pgTAP Test: 009_security_definer_retrofit.sql
-- Stage 10 audit day · 2026-05-03
-- plan(12) — ISSUE-0002 resolution verification
--
-- Groups:
--   G_anon   anon CANNOT execute (REVOKE FROM anon retrofit)          =  6
--   G_auth   authenticated CAN execute (GRANT TO authenticated intact) =  6
--                                                             TOTAL   = 12
-- Cumulative: 428 (prior) + 12 = 440
--
-- Tests that Stage 2/3 SECURITY DEFINER helpers now satisfy P3 assertion 5
-- (PGTAP_PATTERNS P3): anon cannot execute any of the 6 retrofitted helpers.
-- G_auth tests confirm authenticated access was not accidentally revoked.
-- =============================================================================

BEGIN;

SELECT plan(12);

-- =============================================================================
-- G_anon — anon cannot execute Stage 2/3 SECURITY DEFINER helpers (6 tests)
-- PGTAP_PATTERNS P3 assertion 5; ISSUE-0002 resolution check.
-- =============================================================================

SELECT is(
  has_function_privilege('anon', 'public.auth_tenant_id()', 'execute'),
  false,
  'G_anon.1: auth_tenant_id — anon cannot execute (retrofit REVOKE FROM anon)');

SELECT is(
  has_function_privilege('anon', 'public.auth_user_id()', 'execute'),
  false,
  'G_anon.2: auth_user_id — anon cannot execute (retrofit REVOKE FROM anon)');

SELECT is(
  has_function_privilege('anon', 'public.auth_role()', 'execute'),
  false,
  'G_anon.3: auth_role — anon cannot execute (retrofit REVOKE FROM anon)');

SELECT is(
  has_function_privilege('anon', 'public.fn_user_in_my_tenant(uuid)', 'execute'),
  false,
  'G_anon.4: fn_user_in_my_tenant — anon cannot execute (retrofit REVOKE FROM anon)');

SELECT is(
  has_function_privilege('anon', 'public.fn_class_in_my_tenant(uuid)', 'execute'),
  false,
  'G_anon.5: fn_class_in_my_tenant — anon cannot execute (retrofit REVOKE FROM anon)');

SELECT is(
  has_function_privilege('anon', 'public.fn_graph_version_is_published(uuid)', 'execute'),
  false,
  'G_anon.6: fn_graph_version_is_published — anon cannot execute (retrofit REVOKE FROM anon)');

-- =============================================================================
-- G_auth — authenticated CAN execute (GRANT TO authenticated intact) (6 tests)
-- Verifies that REVOKE FROM authenticated + re-GRANT did not break RLS helper access.
-- =============================================================================

SELECT is(
  has_function_privilege('authenticated', 'public.auth_tenant_id()', 'execute'),
  true,
  'G_auth.1: auth_tenant_id — authenticated retains EXECUTE after retrofit');

SELECT is(
  has_function_privilege('authenticated', 'public.auth_user_id()', 'execute'),
  true,
  'G_auth.2: auth_user_id — authenticated retains EXECUTE after retrofit');

SELECT is(
  has_function_privilege('authenticated', 'public.auth_role()', 'execute'),
  true,
  'G_auth.3: auth_role — authenticated retains EXECUTE after retrofit');

SELECT is(
  has_function_privilege('authenticated', 'public.fn_user_in_my_tenant(uuid)', 'execute'),
  true,
  'G_auth.4: fn_user_in_my_tenant — authenticated retains EXECUTE after retrofit');

SELECT is(
  has_function_privilege('authenticated', 'public.fn_class_in_my_tenant(uuid)', 'execute'),
  true,
  'G_auth.5: fn_class_in_my_tenant — authenticated retains EXECUTE after retrofit');

SELECT is(
  has_function_privilege('authenticated', 'public.fn_graph_version_is_published(uuid)', 'execute'),
  true,
  'G_auth.6: fn_graph_version_is_published — authenticated retains EXECUTE after retrofit');

SELECT * FROM finish();
ROLLBACK;
