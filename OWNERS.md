# MindMosaic — Service Ownership Matrix (v1.0)

**Status:** Active for v1.
**Rule:** Any commit that changes writer ownership, adds a tenant-scoped table, or introduces a new endpoint MUST update this file. CI blocks merge if missing.
**Solo Note:** One developer owns all services. Logical boundaries are preserved for maintainability and future scaling.

Legend:
- `[v1]` — ships in the v1.
- `[v1.1]` — table exists in schema; service writer deferred to v1.1.
- `[DEFERRED]` — table/service not created until v1.1 or later.

---

## Service: `auth-svc` / `users-svc` (UTA) — [v1]
Path: `supabase/functions/auth-svc`, `supabase/functions/users-svc`

### Tables (WRITE)
- `tenant` — controlled mutable (auto-created on parent signup; school tenants by platform_admin script)
- `user_profile` — mutable
- `parent_student_link` — mutable
- `class_group` — mutable
- `class_student` — mutable
- `feature_flag` — mutable (seeded + admin script; **Stripe writer from Stage 42**)
- `admin_action_log` — append-only

### Endpoints Owned [v1]
- `POST /auth/signup` (parent-only auto-creates family tenant; see G1)
- `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/forgot-password`, `/auth/reset-password`
- `GET/PATCH /users/me`
- `GET /users/me/children`
- `POST /users/me/children` (parent creates student in own family tenant)
- `GET /users/me/classes` [v1 teacher only]

### Endpoints Deferred [v1.1]
- School tenant self-serve onboarding
- Bulk CSV invite
- SAML SSO

---

## Service: `content-svc` (CSG) — [v1]
Path: `supabase/functions/content-svc`

### Tables (WRITE)
- `skill_graph_version` — mutable (draft→published→archived; code-guarded per G4)
- `skill_node`, `skill_edge` — immutable within a graph version
- `skill_migration_map` — **[v1.1]** table exists but no writer in v1
- `misconception` — mutable (seeded in v1)
- `repair_sequence` — **[v1.1]** table exists but no writer in v1
- `stimulus` — mutable (seeded in v1)
- `item` — mutable
- `item_version` — immutable
- `pathway`, `framework_config`, `assessment_profile`, `blueprint`, `diagnostic_rule` — seeded in v1

### Endpoints Owned [v1]
- `GET /pathways` (entitlement-filtered)
- `GET /pathways/{slug}`
- `GET /assessment-profiles`
- `GET /skill-graphs/active`
- `GET /content/items/{id}`
- `POST /content/select` (blueprint-driven item selection — called by assessment-svc)
- `GET /content/search`
- `POST /content/import` (admin, dry-run mode for seed/test only in v1)

### Endpoints Deferred [v1.1]
- `POST /skill-graphs/{id}/publish` (requires migration worker)
- `GET /content/coverage`, `GET /content/quality-report` (L8 Content Intelligence)

---

## Service: `assessment-svc` (ASN) — [v1]
Path: `supabase/functions/assessment-svc`

### Tables (WRITE)
- `session_record` — controlled mutable (optimistic lock on state transitions only; checkpoints never bump version)
- `session_response` — immutable (written via `create_session_response_atomic`)
- `response_telemetry` — immutable
- `session_checkpoint` — mutable (upsert-only autosave)
- `learning_event` — immutable, partitioned monthly
- `api_idempotency_key` — append-only
- `outbox_event` — append-only

### Tables (READ)
- `user_profile`, `pathway`, `assessment_profile`, `blueprint`, `item`/`v_item_current`, `framework_config`, `feature_flag`
- `repair_sequence` — [v1.1] — no runtime use in v1

### Endpoints Owned [v1]
- `POST /sessions/create` (feature-gated per tier; idempotency-keyed; creates session_record + first_item)
- `POST /sessions/{id}/respond` (lock token + expected_version required; invokes `create_session_response_atomic`)
- `POST /sessions/{id}/submit` (terminal + outbox_event + inline sync pipeline; idempotency-keyed)
- `POST /sessions/{id}/checkpoint` (upsert only; never touches session_record.version)
- `GET /sessions/{id}/state` (resume)
- `POST /sessions/{id}/abandon`
- `GET /sessions/recent`
- `GET /sessions/{id}` (summary post-processing)

---

## Service: `intelligence-svc` (INT) — [v1 sync, v1 partial async]
Path: `supabase/functions/intelligence-svc`

### Tables (WRITE)
- `skill_mastery` — mutable
- `learning_velocity` — mutable
- `behaviour_profile` — mutable
- `student_misconception` — mutable (sync L3a in v1; async L3b from Stage 28)
- `repair_record` — **[v1.1]** table exists from Stage 6; writer deferred
- `intelligence_audit_log` — append-only, partitioned monthly
- `pipeline_event` — append-only

### Tables (READ)
- `session_record`, `session_response`, `response_telemetry`, `learning_event`
- `skill_node`, `skill_edge`, `misconception`

### Endpoints Owned [v1]
- `POST /intelligence/process-session/{id}` (service-role; sync L1+L2+L3a inline from submit)
- `GET /intelligence/learner-profile/{student_id}`
- `GET /intelligence/causal-map/{student_id}` (returns misconceptions; `repair_queue` is empty in v1)
- `GET /intelligence/behaviour-profile/{student_id}`
- `GET /intelligence/audit-log/{student_id}` (filterable)

### Endpoints Deferred [v1.1]
- `GET /intelligence/predictions/{student_id}/{pathway_slug}` — L5 hooks exist Stage 28; endpoint added in same day
- `GET /intelligence/stretch/{student_id}` — L6 deferred
- `GET /intelligence/explain/{decision_id}` — simplified explanation shape in v1; full explanation schema v1.1

---

## Service: `orchestration-svc` (ORC) — [v1 partial]
Path: `supabase/functions/orchestration-svc`

### Tables (WRITE)
- `learning_plan` — controlled mutable
- `plan_revision` — append-only
- `recommendation` — mutable
- `plan_override` — mutable

### Tables (READ)
- `skill_mastery`, `behaviour_profile`, `student_misconception`, `feature_flag`

### Endpoints Owned [v1]
- `GET /orchestration/plan/{student_id}/current`
- `POST /orchestration/generate-plan/{student_id}` (weekly plan only; L9 async)
- `POST /orchestration/overrides` (pin_skill, dismiss_recommendation)
- `DELETE /orchestration/overrides/{id}`
- `POST /orchestration/plan/{id}/feedback`

### Endpoints Deferred [v1.1]
- `POST /orchestration/exam-countdown/...`
- `POST /orchestration/pathway-switch/...`
- `POST /orchestration/long-term-plan/...`
- `GET /orchestration/milestones/...`

---

## Service: `analytics-svc` (ANL) — [v1 partial]
Path: `supabase/functions/analytics-svc`

### Tables (WRITE)
- `intervention_alert` — mutable (L7 async, from Stage 28)
- `cohort_metric_cache` — mutable

### Tables (READ)
- All tenant-scoped tables (read-only aggregation)

### Endpoints Owned [v1]
- `GET /analytics/cohort/{group_id}` (teacher-scoped)
- `GET /analytics/pathway-readiness/{student_id}/{pathway_slug}`
- `GET /analytics/auto-groups/{class_id}/{skill_id}` (L7 basic clustering)
- `GET /analytics/intervention-alerts` (teacher's own)
- `PATCH /analytics/intervention-alerts/{id}` (acknowledge/dismiss)
- `POST /analytics/generate-assignment` (for auto-generated assignments in v1)

### Endpoints Deferred [v1.1]
- `GET /analytics/misconception-prevalence/{cohort}`
- `POST /analytics/reports/export`

---

## Service: `assignments-svc` (ASG) — [v1]
Path: `supabase/functions/assignments-svc`

### Tables (WRITE)
- `assignment` — controlled mutable (draft → published → archived)
- `assignment_target` — mutable
- `assignment_session` — controlled mutable

### Tables (READ)
- `user_profile`, `class_group`, `class_student`, `skill_node`, `item`

### Endpoints Owned [v1]
- `POST /assignments` (idempotency-keyed)
- `GET /assignments/{id}`
- `PATCH /assignments/{id}` (pre-publish only)
- `POST /assignments/{id}/publish` (materialises assignment_session rows + outbox_event notifications)
- `POST /assignments/{id}/archive`
- `GET /assignments/for-student/{student_id}`
- `GET /assignments/for-class/{class_id}`
- `GET /assignments/{id}/tracking`
- `POST /assignments/{id}/start` (idempotency-keyed; creates session via assessment-svc)

---

## Service: `billing-svc` (BIL) — [v1 Days 51–58]
Path: `supabase/functions/billing-svc`

### Tables (WRITE)
- `subscription` — mutable (Stripe webhook is authoritative writer from Stage 42)
- `billing_customer` — mutable
- `invoice` — mutable (webhook writer)
- `billing_event` — append-only (immutable audit of every Stripe webhook)

### Tables (READ)
- `tenant`, `feature_flag`, `user_profile`

### Endpoints Owned [v1]
- `GET /billing/plans` (public)
- `POST /billing/checkout` (idempotency-keyed)
- `POST /billing/portal`
- `GET /billing/subscription`
- `POST /billing/subscription/cancel` (schedule cancel-at-period-end)
- `GET /billing/invoices`
- `POST /billing/webhook/stripe` (signature-verified)

### Endpoints Deferred [v1.1]
- Dunning reminder flow (§25.7)
- Refund audit workflow (§25.9)
- Institutional tier Stripe quote flow (§25.10)

---

## Service: `notifications-svc` (NTF) — [v1]
Path: `supabase/functions/notifications-svc`

### Tables (WRITE)
- `notification` — mutable (writer is the outbox-dispatcher → jobs-worker chain)

### Tables (READ)
- `user_profile`, `outbox_event`

### Endpoints Owned [v1]
- `GET /notifications/me?unread=`
- `PATCH /notifications/{id}/read`
- `POST /notifications/read-all`

### Notification types handled [v1]
- `assignment_assigned`, `plan_updated`, `intervention_alert`, `subscription_active`, `subscription_payment_failed` (Stage 42+), `access_downgraded` (Stage 42+)

### Deferred [v1.1]
- `repair_ready`, `achievement_earned`, `assignment_due_soon`, `assignment_overdue`, `system`
- Email transport (outbox_event subscribers)

---

## Service: `jobs-worker` (Platform) — [v1]
Path: `supabase/functions/jobs-worker`

### Tables (WRITE)
- `job_queue` (state transitions)
- `rate_limit_bucket`

### Tables (READ)
- `outbox_event`, `pipeline_event`

### Endpoints Owned [v1]
- `GET /admin/jobs?status=&job_type=` (platform_admin)
- `POST /admin/jobs/{id}/retry` (platform_admin)
- `GET /admin/jobs/dead-letter`

### Endpoints Deferred [v1.1]
- `GET /admin/pipeline-events?session_id=`
- `GET /admin/tenants/{id}/usage`
- `POST /admin/content-intelligence/recalibrate`

---

## Service: `outbox-dispatcher` (Platform) — [v1]
Path: `supabase/functions/outbox-dispatcher`

### Tables (WRITE)
- `outbox_event.processed_at` (transition only)
- `job_queue` (inserts dispatched from outbox)

### Tables (READ)
- `outbox_event WHERE processed_at IS NULL`

### Behaviour
- Invoked every 2s via Vercel Cron or Supabase Scheduled Trigger
- `FOR UPDATE SKIP LOCKED` batch of 100
- Type-mapping table: `session.submitted` → `pipeline.run_sync`; `assignment.published` → `notification.create`; etc.

---

## Services Deferred Entirely [v1.1]

- **`engagement-svc`** — `engagement_streak`, `achievement_definition`, `student_achievement`. Tables exist from Stage 8 migration 0007; no writer in v1.
- **`admin-svc` (full)** — only jobs admin endpoints exist in v1 via `jobs-worker`. Content-intelligence admin, tenant usage, feature flag override UI → 
- **Content Intelligence Loop (L8)** — `content.recalibration` cron exists Stage 9 but invokes a no-op function in v1.

---

### Mutability Legend (Backend Arch §1.3)
| Class | Rule |
|---|---|
| `Immutable` | Never `UPDATE` or `DELETE` after insert. |
| `Append-only` | Only `INSERT`. Cleanup via retention jobs. |
| `Controlled mutable` | Only specific columns may change. Transitions enforced by owning service. |
| `Mutable` | Standard `UPDATE` allowed by owner service. |

---

*End of OWNERS.md v1.0.*
