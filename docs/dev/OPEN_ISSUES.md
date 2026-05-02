# OPEN_ISSUES.md — living list

> Pruned on audit days (every 5 stages). Resolved → ## Resolved with date.
> Use the severity rubric in CLAUDE.md.

## Open

### ISSUE-0001 — CI node-version: GitHub Actions Node 20 deprecation; upgrade to Node 22 LTS required

- Severity: medium
- Reported: 2026-05-02 (Stage 3 morning reconciliation)
- Deadline: Stage 5 audit day (hard deadline: before 2026-06-02)
- Area: infra
- Tags: ci

GitHub Actions deprecated Node 20; the hard deadline is 2026-06-02. `.github/workflows/ci.yml`
pins `node-version: '20'` across all four CI jobs (lint, typecheck, unit, migration-dryrun).
After 2026-06-02 these will emit deprecation errors and are at risk of breaking the CI matrix.

The root package.json `engines` field already allows `node >=20`, so bumping CI to Node 22 LTS
is a one-line change per job with no downstream code changes required.

Root commit: Stage 1 CI scaffold.

- Resolution: Stage 5 audit day (upgrade `node-version` to `'22'` in `.github/workflows/ci.yml`)

## Resolved

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
