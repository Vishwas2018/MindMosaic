# ADR-0009 — Platform-catalog tables: platform_admin write-only

- Status: accepted
- Date: 2026-05-02
- Stage: 4
- Tags: backend, security, data

## Context

Stage 4 creates 5 platform-catalog tables (`framework_config`, `pathway`, `blueprint`,
`assessment_profile`, `diagnostic_rule`). These hold global assessment configuration —
exam family rules, NAPLAN/ICAS blueprints, routing tables. They are not tenant-scoped.

The arch §3.2 Pattern F template lists both `org_admin` and `platform_admin` as write
roles. Stage 4 is the first stage to create a table with admin write policies (Stage 3
used service-role-only per ADR-0008). This ADR resolves which admin roles may write
platform-catalog content.

## Options considered

1. **org_admin + platform_admin write (arch §3.2 template verbatim)** — Follows the
   generic Pattern F template literally. Cons: org_admin is tenant-scoped per OWNERS.md
   and arch §3.1. An org_admin at School A could mutate NAPLAN framework rules, corrupting
   content for every other tenant on the same pathway.
2. **platform_admin write only (adopted)** — Restricts catalog mutations to the
   cross-tenant platform operator role. org_admin continues to manage tenant data
   (users, classes, assignments) per OWNERS.md, and has read access to catalog tables
   (SELECT policy USING (true) / USING (is_active = true)).

## Decision

Apply platform_admin-only write policies on all platform-catalog tables:

```sql
-- INSERT
WITH CHECK (auth_role() = 'platform_admin')
-- UPDATE
USING (auth_role() = 'platform_admin')
-- DELETE
USING (auth_role() = 'platform_admin')
```

SELECT policy varies by table:

| Table | SELECT filter | Reason |
|---|---|---|
| `pathway` | `USING (is_active = true)` | has is_active; inactive pathways must not surface to clients |
| `assessment_profile` | `USING (is_active = true)` | has is_active; same rationale |
| `framework_config` | `USING (true)` | no is_active column; all configs are canonical |
| `blueprint` | `USING (true)` | no is_active column |
| `diagnostic_rule` | `USING (true)` | no is_active column |

## Rationale

Assessment configuration is global catalog, not tenant-specific. org_admin is a
per-tenant administrative role (creates users, manages classes, configures assignments
within their tenant boundary). Allowing org_admin to mutate shared exam rules violates
the tenant isolation principle in arch §3.1 and OWNERS.md.

This decision sets a precedent: any future global catalog table (`achievement_definition`,
notification templates, etc.) must apply platform_admin-only write policies, not the
generic Pattern F template with org_admin.

## Consequences

- Positive: Tenant isolation preserved for global catalog. org_admin cannot corrupt
  shared exam rules. Pattern is clear and grep-verifiable for future stages.
- Negative: Minor deviation from arch §3.2 generic template (which listed org_admin).
  Documented here — the template is a starting point; this ADR is authoritative.
- Follow-ups: Stages 5+ with global catalog tables (e.g., `achievement_definition`
  in Stage 8) must use platform_admin-only write per this precedent. Include in §2A
  policy plan for those stages.

### Table-classification heuristic for Stages 5–10

A table is **platform-catalog** (apply ADR-0009: platform_admin write only) if its rows
are not tenant-bound — i.e., the same row is read identically by every tenant. A table is
**tenant-scoped** (apply tenant-isolation policies + role-specific write rules — see
ADR-0004 for v1.1 expansion) if its rows belong to a particular tenant. The presence or
absence of a `tenant_id` column is the canonical signal.

Examples in v1:
- Platform-catalog (no tenant_id) — apply ADR-0009 write pattern: `framework_config`,
  `blueprint`, `pathway`, `assessment_profile`, `diagnostic_rule`, `skill_node`,
  `skill_edge`, `misconception`, `repair_sequence`, `stimulus`, `item`, `item_version`
- Tenant-scoped — applied in Stage 2 with `auth_tenant_id()` pattern: `tenant`,
  `user_profile`, `parent_student_link`, `class_group`, `class_student`, `feature_flag`,
  `admin_action_log`

This makes Stage 5+ policy decisions mechanical: check for `tenant_id`, pick the pattern.

## Implementation notes

Files: `supabase/migrations/0003_assessment_config.sql` (RLS block)
Related: ADR-0008 (Stage 3 Pattern F; service-role-only write for content catalog),
OWNERS.md (org_admin scope definition), arch §3.1 (tenant isolation), arch §3.2 (Pattern F)
