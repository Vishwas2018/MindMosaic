-- =============================================================================
-- Down Migration 0009 — SECURITY DEFINER triple-REVOKE retrofit (reverse)
-- Restores anon EXECUTE on Stage 2/3 helpers (pre-audit state).
-- WARNING: restores the insecure pre-audit state; do not run in production.
-- =============================================================================

GRANT EXECUTE ON FUNCTION public.fn_graph_version_is_published(uuid) TO anon;

GRANT EXECUTE ON FUNCTION public.fn_class_in_my_tenant(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.fn_user_in_my_tenant(uuid)  TO anon;

GRANT EXECUTE ON FUNCTION public.auth_role()        TO anon;
GRANT EXECUTE ON FUNCTION public.auth_user_id()     TO anon;
GRANT EXECUTE ON FUNCTION public.auth_tenant_id()   TO anon;
