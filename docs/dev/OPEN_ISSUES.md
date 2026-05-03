# OPEN_ISSUES.md — living list

> Pruned on audit days (every 5 stages). Resolved → ## Resolved with date.
> Use the severity rubric in CLAUDE.md.

## Open

### ISSUE-0004 — outbox_event 7-day cleanup not wired (arch §5.6)

- Status: open
- Severity: low
- Reported: 2026-05-03 (Stage 10)
- Deadline: Stage 14 close
- Area: backend
- Tags: data | cron

Arch §5.6 specifies that processed `outbox_event` rows are purged after 7 days. Migration 0010
does not add a cleanup cron job. Without it, the `outbox_event` table grows unbounded but
correctness is unaffected (processed events are never re-picked by `fn_drain_outbox_batch`).
Resolution: Stage 14 — add a pg_cron job (e.g., `outbox.cleanup`) that DELETEs rows where
`processed_at < now() - interval '7 days'`.

## Resolved

### ISSUE-0003 — GitHub Actions internal Node.js 20 runtime — upstream action upgrade required before 2026-06-02

- Status: resolved
- Severity: medium
- Reported: 2026-05-02 (post Stage 5 close)
- Closed: 2026-05-03 (Stage 10 audit day)
- Resolution: Bumped `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` from @v4
  to @v5 in `.github/workflows/ci.yml`. All 4 jobs (lint, typecheck, unit, migration-dryrun)
  updated. No ADR filed — no non-trivial behavior change (version bump only).
  Commit: 9eb2f4b. Well ahead of 2026-06-02 forced-upgrade deadline.

### ISSUE-0002 — SECURITY DEFINER helpers: Stage 2/3 helpers missing `REVOKE EXECUTE FROM anon`

- Status: resolved
- Severity: low
- Reported: 2026-05-02 (Stage 5)
- Closed: 2026-05-03 (Stage 10 audit day)
- Resolution: Migration 0009 adds REVOKE FROM authenticated + REVOKE FROM anon + GRANT TO
  authenticated for all 6 Stage 2/3 SECURITY DEFINER helpers. 009_security_definer_retrofit.sql
  pgTAP tests confirm anon denial + authenticated access (440/440 green). No ADR filed —
  A1 triple-REVOKE pattern already documented in BUILD_CONTRACT §6 and PGTAP_PATTERNS P3.
  Commit: 75ac299.

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
