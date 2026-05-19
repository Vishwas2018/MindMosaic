# manifest-format.md — Content Import Manifest Format

> Specification for the JSON manifest accepted by `POST /content/import`.
> Schema source of truth: `packages/types/src/content.ts` `ImportManifestSchema`.
> Handler: `supabase/functions/content-svc/handlers.ts` `importItems`.
> Related: ADR-0041.

---

## §1 — Versioning

The manifest root must include `"manifest_version": "1.0"`. This field enables
forward-compatible schema evolution — a future `"1.1"` manifest can be routed
to a new handler without breaking existing `"1.0"` imports.

The Zod schema enforces `manifest_version: z.literal('1.0')`. A manifest with
absent or mismatched `manifest_version` fails `ImportManifestSchema.safeParse()`
and returns 422 at the router boundary before any item is processed.

---

## §2 — Top-level shape

```json
{
  "manifest_version": "1.0",
  "items": [ ...ImportManifestItem[] ]
}
```

| Field              | Type                  | Required | Notes                                          |
| ------------------ | --------------------- | -------- | ---------------------------------------------- |
| `manifest_version` | `"1.0"`               | yes      | z.literal('1.0') — 422 on absent or mismatch   |
| `items`            | `ImportManifestItem[]`| yes      | min 1, max 500 items per manifest submission   |

---

## §3 — Per-item fields

Each element of `items[]` must conform to `ImportManifestItemSchema`.

### Root-level (per item)

| Field                    | Type                          | Required | Notes                                                        |
| ------------------------ | ----------------------------- | -------- | ------------------------------------------------------------ |
| `external_key`           | `string`                      | yes      | Operator-supplied stable key. Min 1, max 200 chars. Intra-manifest dedup plane (§5). |
| `copyright_declaration`  | `"original"`                  | yes      | z.literal('original') — 422 on absent or any other value. See §4. |
| `item`                   | `object`                      | yes      | Item metadata. See §3.1.                                     |
| `version`                | `object`                      | yes      | Item version content. See §3.2.                              |
| `stimulus`               | `object`                      | no       | Optional associated stimulus. See §3.3.                      |

### §3.1 — item fields

| Field                | Type              | Required | Notes                                               |
| -------------------- | ----------------- | -------- | --------------------------------------------------- |
| `response_type`      | `string`          | yes      | e.g. `"multiple_choice"`, `"short_response"`        |
| `skill_ids`          | `string[]`        | yes      | Min 1. Must match skill-graph node IDs.             |
| `difficulty`         | `number`          | yes      | IRT difficulty parameter (θ scale; 0 = at level).  |
| `year_levels`        | `integer[]`       | yes      | Min 1. e.g. `[5]`.                                 |
| `exam_families`      | `string[]`        | yes      | Min 1. e.g. `["naplan"]`, `["icas"]`.              |
| `source_item_id`     | `string \| null`  | no       | Reference to source item if adapted.                |
| `stimulus_id`        | `string \| null`  | no       | UUID ref to existing stimulus row.                  |
| `discrimination`     | `number \| null`  | no       | IRT discrimination (a) parameter.                  |
| `expected_time_secs` | `integer \| null` | no       | Expected student time in seconds.                   |
| `programs`           | `string[]`        | no       | e.g. `["standard"]`.                               |
| `countries`          | `string[]`        | no       | ISO 3166-1 alpha-2. e.g. `["AU"]`.                 |
| `curricula`          | `string[]`        | no       | e.g. `["ac_v9"]`.                                  |
| `bloom_level`        | `string \| null`  | no       | Bloom's taxonomy level. e.g. `"apply"`.            |

### §3.2 — version fields

| Field                   | Type                           | Required | Notes                                                |
| ----------------------- | ------------------------------ | -------- | ---------------------------------------------------- |
| `stem`                  | `Record<string, unknown>`      | yes      | Rich text / structured question content. Keys are case-sensitive (§5). |
| `response_config`       | `Record<string, unknown>`      | yes      | Distractor set, correct answer, scoring config.      |
| `difficulty`            | `number`                       | yes      | Version-level difficulty (may differ from item-level after calibration). |
| `distractor_rationale`  | `Record<string, unknown> \| null` | no    | Per-distractor misconception explanation.            |
| `explanation`           | `Record<string, unknown> \| null` | no    | Worked solution for student-facing review.           |
| `discrimination`        | `number \| null`               | no       | Version-level discrimination parameter.              |

**NOT included:** `supersedes` — batch import creates fresh `draft` items only.
`supersedes` is a separate admin operation for relating a new `item_version` to
an existing item and is not an import concern. (T2 tightening — Q-1.1-6.8.)

### §3.3 — stimulus fields (optional)

Provide a `stimulus` block to create a new stimulus row alongside the item. To
reference an existing stimulus, use `item.stimulus_id` instead.

| Field                 | Type                           | Required | Notes                                          |
| --------------------- | ------------------------------ | -------- | ---------------------------------------------- |
| `type`                | `string`                       | yes      | e.g. `"passage"`, `"image"`, `"table"`.        |
| `content`             | `Record<string, unknown>`      | yes      | Stimulus body content.                         |
| `source_attribution`  | `string \| null`               | no       | Attribution for licensed stimulus material.    |
| `year_levels`         | `integer[]`                    | no       | Applicable year levels.                        |
| `exam_families`       | `string[]`                     | no       | Applicable exam families.                      |

---

## §4 — Copyright declaration

Every manifest item must include `"copyright_declaration": "original"`. This
is a machine-enforceable intake gate for the copyright constraint:

> NAPLAN and ICAS are real, copyrighted assessment products with protected
> names. The content operation produces **original items only** — written
> fresh to match the _format, year-level curriculum strand, difficulty band,
> and question type_ of those assessments, without reproducing any actual
> past-paper item. No scraping of past papers, no licensed-bank ingestion,
> no copying.

`z.literal('original')` rejects any other value (including absent field) with
422 at manifest parse. The `draft → review` lifecycle gate provides a second
enforcement layer requiring human review before any item can be activated. The
manifest field is the intake gate; the lifecycle gate is the quality gate.

**Template compliance.** All items authored to an approved spec template
(`docs/content/specs/`) must adhere to the template's copyright guardrails,
including the prohibition on AI-assisted authoring without human originality
review (§9.2 of the relevant template). The `copyright_declaration: "original"`
field attests that those guardrails were observed. Submitting a manifest with
`copyright_declaration: "original"` for items that violate the template's
AI-authoring clause constitutes a misrepresentation.

**Cross-reference.** For NAPLAN-style Year 5 Numeracy items, see
`docs/content/specs/australian-y5-numeracy.md §9.2` for the AI-authoring clause.

---

## §5 — Dedup model

### Intra-manifest dedup (S6)

Two dedup planes are checked within each submitted manifest. Both are evaluated
in a single forward pass before any DB writes begin.

**Stem SHA dedup (SHA Set):**

`normaliseStem(stem)` = `JSON.stringify(sortKeys(stem)).trim()`

- `sortKeys` recursively sorts object keys into a stable canonical order.
- **No case folding.** Casing is semantically significant in stem content:
  mathematical variables (`x` ≠ `X`), chemical notation (`pH` ≠ `PH`), SI
  units (`mL` ≠ `ML`). `normaliseStem` does not call `.toLowerCase()`.
- SHA-256 of the UTF-8-encoded normalised string.
- If item[i].version.stem hashes to a SHA already seen in this manifest,
  item[i] returns `status: "intra_manifest_duplicate"`.

**external_key dedup (Map):**

- A `Map<external_key, manifestIndex>` is built during the forward pass.
- If `external_key` is repeated, the second occurrence returns
  `status: "intra_manifest_duplicate"` with the index of the first occurrence.

### Cross-import dedup (deferred — ISSUE-0050)

Cross-import `external_key` dedup (Q-1.1-6.8 Option B) and cross-DB stem SHA
dedup (Q-1.1-6.7 Option C) are deferred to a post-launch upgrade. At S6 launch
the item bank contains 0 prior imports; cross-lookup against an empty set has
no implementation value. `DUPLICATE_STEM` and `DUPLICATE_EXTERNAL_KEY` outcome
codes are reserved in the response schema as upgrade-path hooks.

Upgrade tracked: ISSUE-0049 (fuzzy/embedding — pgvector approach) +
ISSUE-0050 (exact-match cross-DB SHA + cross-import external_key).

---

## §6 — Validation order

**Manifest-level** (blocks entire submission on failure):

1. JSON parse — malformed JSON → 400
2. `ImportManifestSchema.safeParse()` — schema error → 422 (first issue path + message)

**Per-item** (item-level outcome; other items continue):

3. Idempotency-Key replay check (non-dry-run only — replays if key already recorded)
4. Intra-manifest `external_key` dedup check
5. Intra-manifest stem SHA dedup check
6. *(dry-run path exits here — no DB writes)*
7. Optional stimulus write (if `stimulus` block present)
8. Item write
9. Item version write — per-item rollback on failure (best-effort `DELETE` of orphaned item row)

---

## §7 — Response shapes

### 200 — All items imported (rejected === 0)

```json
{
  "imported": 2,
  "rejected": 0,
  "skipped_duplicates": 0,
  "total": 2,
  "dry_run": false,
  "items": [
    { "external_key": "item-001", "status": "ok", "item_id": "uuid-a" },
    { "external_key": "item-002", "status": "ok", "item_id": "uuid-b" }
  ]
}
```

### 207 — Mixed results (rejected > 0 && rejected < total)

```json
{
  "imported": 1,
  "rejected": 1,
  "skipped_duplicates": 0,
  "total": 2,
  "dry_run": false,
  "items": [
    { "external_key": "item-001", "status": "ok", "item_id": "uuid-a" },
    { "external_key": "item-002", "status": "rejected", "reason": "DB write failed: ..." }
  ]
}
```

### 422 — All rejected OR manifest-level parse failure

`rejected === total` (every item failed), or manifest JSON / schema invalid.

Manifest-level 422 (copyright_declaration absent on item[1]):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "items.1.copyright_declaration: Invalid literal value, expected \"original\""
  }
}
```

---

## §8 — Dry-run mode

`?dry_run=true` query parameter enables pre-flight validation.

- Runs full manifest Zod parse + intra-manifest SHA dedup + external_key dedup.
- **No DB writes.** No stimulus, item, or item_version rows are inserted.
- Returns the same partial-failure shape as a live import with `"dry_run": true`.
- `Idempotency-Key` header: **optional** on dry-run (read-only; inherently idempotent).
- `Idempotency-Key` header: **required** on live non-dry-run imports.

Recommended import workflow:

```
POST /content/import?dry_run=true
  → inspect items[] outcomes
  → fix rejected items
  → POST /content/import  (with Idempotency-Key)
```

---

## §9 — Minimal manifest example

```json
{
  "manifest_version": "1.0",
  "items": [
    {
      "external_key": "naplan-y5-num-2026-001",
      "copyright_declaration": "original",
      "item": {
        "response_type": "multiple_choice",
        "skill_ids": ["num.fractions.compare"],
        "difficulty": 0.2,
        "year_levels": [5],
        "exam_families": ["naplan"],
        "curricula": ["ac_v9"],
        "countries": ["AU"]
      },
      "version": {
        "stem": {
          "type": "text",
          "content": "Which fraction is closest to 1?\n(A) 1/2\n(B) 3/4\n(C) 2/3\n(D) 5/8"
        },
        "response_config": {
          "options": ["A", "B", "C", "D"],
          "correct": "B",
          "scoring": { "correct": 1, "incorrect": 0 }
        },
        "difficulty": 0.2,
        "distractor_rationale": {
          "A": "1/2 = 0.5; closer to 0 than 1",
          "C": "2/3 ≈ 0.667; less than 3/4",
          "D": "5/8 = 0.625; less than 3/4"
        },
        "explanation": {
          "steps": [
            "Convert each fraction to a decimal: 1/2=0.5, 3/4=0.75, 2/3≈0.667, 5/8=0.625",
            "Compare to 1: distances are 0.5, 0.25, 0.333, 0.375",
            "3/4 has the smallest distance from 1"
          ],
          "answer": "B"
        }
      }
    }
  ]
}
```

---

## §10 — Partial-failure response example

Manifest with 3 items: item-001 valid, item-002 missing `exam_families`,
item-003 stem is a SHA-duplicate of item-001.

**Request body (abbreviated):**

```json
{
  "manifest_version": "1.0",
  "items": [
    { "external_key": "item-001", "copyright_declaration": "original", "item": { "response_type": "multiple_choice", "skill_ids": ["num.fractions.compare"], "difficulty": 0.2, "year_levels": [5], "exam_families": ["naplan"] }, "version": { "stem": { "type": "text", "content": "Q1 stem text" }, "response_config": {}, "difficulty": 0.2 } },
    { "external_key": "item-002", "copyright_declaration": "original", "item": { "response_type": "multiple_choice", "skill_ids": ["num.fractions.compare"], "difficulty": 0.3, "year_levels": [5], "exam_families": [] }, "version": { "stem": { "type": "text", "content": "Q2 stem text" }, "response_config": {}, "difficulty": 0.3 } },
    { "external_key": "item-003", "copyright_declaration": "original", "item": { "response_type": "multiple_choice", "skill_ids": ["num.fractions.compare"], "difficulty": 0.2, "year_levels": [5], "exam_families": ["naplan"] }, "version": { "stem": { "type": "text", "content": "Q1 stem text" }, "response_config": {}, "difficulty": 0.2 } }
  ]
}
```

**Response (207 — partial failure):**

```json
{
  "imported": 1,
  "rejected": 1,
  "skipped_duplicates": 1,
  "total": 3,
  "dry_run": false,
  "items": [
    { "external_key": "item-001", "status": "ok", "item_id": "550e8400-e29b-41d4-a716-446655440000" },
    { "external_key": "item-002", "status": "rejected", "reason": "exam_families: Array must contain at least 1 element(s)" },
    { "external_key": "item-003", "status": "intra_manifest_duplicate", "reason": "stem SHA matches sibling item in this manifest" }
  ]
}
```

Note: item-002 is rejected (schema violation); item-003 is `intra_manifest_duplicate` (dedup),
counted in `skipped_duplicates`, not `rejected`. Both are excluded from the DB write path.
