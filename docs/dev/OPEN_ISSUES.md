# OPEN_ISSUES.md — living list

> Pruned on audit days (every 5 stages). Resolved → ## Resolved with date.
> Use the severity rubric in CLAUDE.md.

## Open

### ISSUE-0002 — SECURITY DEFINER helpers: Stage 2/3 helpers missing `REVOKE EXECUTE FROM anon`

- Status: open
- Severity: low
- Reported: 2026-05-02 (Stage 5)
- Area: backend, security
- Affected helpers: `auth_tenant_id`, `auth_user_id`, `auth_role`, `fn_user_in_my_tenant`,
  `fn_class_in_my_tenant` (Migration 0001); `fn_graph_version_is_published` (Migration 0002)
- Root cause: Supabase local dev applies `ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS
  TO anon` — all newly created functions automatically inherit EXECUTE for `anon`. Migrations
  0001/0002 used double `REVOKE FROM PUBLIC` (ADR-0005/ADR-0008 pattern) which strips the
  PUBLIC pseudo-role but leaves the explicit `anon` grant intact. Stage 5 introduced the
  triple-REVOKE pattern (PUBLIC × 2 + `anon` explicitly) after G16 tests exposed it.
- Practical exposure: nil — `anon` cannot acquire a Supabase JWT with `app_metadata.role`
  claims, so the policy USING expressions reject them regardless. Consistency with the
  established SECURITY DEFINER pattern is the motivation for remediation.
- Remediation: small follow-up migration adding `REVOKE EXECUTE ON FUNCTION <name> FROM anon`
  for each of the six helpers. Due before Stage 10 audit.
- Linked: BUG-C (Stage 5 DAILY_LOG), ADR-0008

## Resolved

### ISSUE-0001 — CI node-version: GitHub Actions Node 20 deprecation; upgrade to Node 22 LTS

- Status: resolved
- Severity: medium
- Reported: 2026-05-02 (Stage 3 morning reconciliation)
- Closed: 2026-05-02 (Stage 5 audit day)
- Resolution: Bumped `node-version` to `"22"` in all three CI runner jobs (lint, typecheck, unit);
  updated `package.json` `engines.node` to `>=22`; created `.nvmrc` with `22`.
  ADR-0010 filed. Commit: this audit day commit.

### ISSUE-0001 (original, 2026-05-01) — UTA-table SELECT policies: tenant-scoped only, per-role absent until Stage 5

- Status: wont-fix
- Severity: medium (at close)
- Reported: 2026-05-01 (Stage 2)
- Closed: 2026-05-02
- Rationale: Duplicate of ADR-0004 deferral. ADR-0004 fully documents the scope decision and
  the Stage 5 obligation. The same forward-flag is recorded in PROJECT_STATE.md "Notes for next
  session". A separate issue entry added noise without adding information. Node-runtime CI bump
  refiled as ISSUE-0001 — that issue has a hard external deadline (2026-06-02) that warrants
  an open issue; the RLS deferral does not (it is a planned Stage 5 deliverable, not a deadline risk).
