# australian-y5-numeracy.md — NAPLAN-Style Year 5 Numeracy Authoring Spec

> Pilot authoring template for `docs/content/specs/`. Legal review required
> before bulk authoring runs (S7.1 gate — operator-side). See ADR-0041 §Decision 4.
>
> **Copyright guardrail (binding):** All items authored to this template must be
> original works. Format alignment to NAPLAN Year 5 Numeracy is permitted;
> reproduction of any actual past-paper item is not. See §8 for full guardrails.

---

## §0 — Non-affiliation disclaimer

MindMosaic is not affiliated with, endorsed by, or sponsored by ACARA,
NAPLAN, or ICAS. References are used solely for curriculum-alignment and
assessment-format interoperability purposes.

---

## §1 — Target format

**Assessment family:** NAPLAN (National Assessment Program — Literacy and Numeracy)
**Year level:** Year 5
**Subject:** Numeracy
**Curriculum alignment:** Australian Curriculum v9.0 (AC v9.0) Mathematics
**Delivery format:** Multiple choice + short response (paper-based equivalent;
  digital adaptive format not targeted at S7.1)
**Item count per pilot batch (S7.1):** ~50 items
**Lifecycle at import:** `draft` (all imports land as draft per ADR-0041 §Decision 6)

---

## §2 — AC v9.0 strand IDs

Verified against ACARA Australian Curriculum v9.0 Mathematics Year 5. Authors
must verify strand codes against current ACARA documentation before authoring;
this table is a reference starting point, not a substitute for the primary source.

| Strand                  | AC v9.0 Strand Prefix | MindMosaic skill_ids prefix | Notes                               |
| ----------------------- | --------------------- | --------------------------- | ----------------------------------- |
| Number                  | `AC9M5N`              | `num.`                      | Whole numbers, fractions, decimals  |
| Algebra                 | `AC9M5A`              | `alg.`                      | Patterns, equivalence               |
| Measurement             | `AC9M5M`              | `meas.`                     | Length, area, volume, time, mass    |
| Space                   | `AC9M5SP`             | `space.`                    | 2D/3D shapes, location, symmetry   |
| Statistics              | `AC9M5ST`             | `stats.`                    | Data representation, interpretation |
| Probability             | `AC9M5P`              | `prob.`                     | Chance, likelihood                  |

### Recommended strand mix per 50-item pilot batch (S7.1)

| Strand      | Item count | Rationale                                   |
| ----------- | ---------- | ------------------------------------------- |
| Number      | 20         | Core NAPLAN weight; highest test coverage   |
| Measurement | 10         | Second highest NAPLAN weight                |
| Statistics  | 7          | Interpreting graphs and tables              |
| Algebra     | 6          | Patterns and number sentences               |
| Space       | 5          | Shape properties, angles                   |
| Probability | 2          | Lower NAPLAN weight at Year 5              |

---

## §3 — Difficulty bands

IRT difficulty parameter (θ scale; 0 = NAPLAN Band 5 Year 5 benchmark).

| Band | Label         | θ range      | Description                                    |
| ---- | ------------- | ------------ | ---------------------------------------------- |
| B1   | Foundation    | ≤ −1.5       | Well below year level; consolidation items     |
| B2   | Developing    | −1.5 to −0.5 | Below year level; approaching benchmark        |
| B3   | At benchmark  | −0.5 to 0.5  | NAPLAN Band 5 target range; majority of items  |
| B4   | Above         | 0.5 to 1.5   | Above year level; stretch items                |
| B5   | Extending     | > 1.5        | Well above; high-ability items                 |

**Pilot batch (S7.1) recommended distribution:**

| Band | Items | % |
| ---- | ----- | --- |
| B1   | 3     | 6%  |
| B2   | 10    | 20% |
| B3   | 22    | 44% |
| B4   | 12    | 24% |
| B5   | 3     | 6%  |

---

## §4 — Question-type mix

| Response type         | `response_type` value | Items | % | Notes                                   |
| --------------------- | --------------------- | ----- | --- | --------------------------------------- |
| Multiple choice (4-opt) | `"multiple_choice"` | 32  | 64% | Standard NAPLAN MC; 1 correct, 3 distractors |
| Short response (numeric) | `"short_response"` | 15  | 30% | Fill-in numeric answer; no distractors   |
| Complex MC / ordering | `"multiple_choice"`   | 3   | 6%  | Ranked or multi-step MC                 |

All items for S7.1 pilot: `response_type: "multiple_choice"` or `"short_response"` only.

---

## §5 — stem field structure

The `version.stem` field is a `Record<string, unknown>`. Recommended structure:

```json
{
  "type": "text",
  "content": "<plain text question body>",
  "format": "plaintext"
}
```

For items with embedded mathematical notation:

```json
{
  "type": "text",
  "content": "What is the value of 3 × (4 + 2)?",
  "format": "plaintext"
}
```

For items referencing a stimulus (table, graph, passage):

```json
{
  "type": "text",
  "content": "Using the table, what is the total number of students who chose blue?",
  "format": "plaintext",
  "stimulus_ref": true
}
```

**Case sensitivity note (T1):** The `normaliseStem` SHA function does not fold
case. `"What is the value of x?"` and `"What is the value of X?"` produce
distinct SHAs. Maintain consistent casing within your authored items.

---

## §6 — response_config structure

### Multiple choice

```json
{
  "options": [
    { "key": "A", "text": "<option A text>" },
    { "key": "B", "text": "<option B text>" },
    { "key": "C", "text": "<option C text>" },
    { "key": "D", "text": "<option D text>" }
  ],
  "correct": "B",
  "scoring": { "correct": 1, "incorrect": 0 }
}
```

Requirements:
- Exactly 4 options (A, B, C, D) for NAPLAN-style MC.
- Exactly 1 correct answer.
- Distractors must represent plausible wrong answers (see §7 for rationale spec).

### Short response (numeric)

```json
{
  "answer": "24",
  "answer_type": "integer",
  "units": null,
  "scoring": { "correct": 1, "incorrect": 0 }
}
```

For answers requiring units:

```json
{
  "answer": "3.5",
  "answer_type": "decimal",
  "units": "kg",
  "scoring": { "correct": 1, "incorrect": 0 }
}
```

---

## §7 — Distractor-rationale specification

Every `multiple_choice` item **must** include a `version.distractor_rationale`
block. Each distractor must represent a specific, named misconception.

```json
{
  "A": { "misconception": "halving error", "description": "Student divides by 2 instead of multiplying; 24 ÷ 2 = 12" },
  "C": { "misconception": "addition instead of multiplication", "description": "Student adds 4 + 2 + 3 = 9 instead of 3 × 6 = 18" },
  "D": { "misconception": "order of operations ignored", "description": "Student computes left-to-right: 3 × 4 = 12, 12 + 2 = 14" }
}
```

Requirements:
- Describe the **specific error pathway** a student would take to reach this answer.
- Name the misconception type (halving error, BODMAS ignored, place-value confusion, etc.).
- Each distractor must be the result of a plausible arithmetic or conceptual error — not a random wrong number.
- For `short_response` items: `distractor_rationale` may be null (no distractors).

---

## §8 — Worked-solution specification

Every item **should** include a `version.explanation` block. This powers the
student-facing worked solution displayed in the review phase.

```json
{
  "steps": [
    "Identify the operation inside the brackets: 4 + 2 = 6",
    "Multiply the result: 3 × 6 = 18",
    "The answer is 18"
  ],
  "answer": "B",
  "tip": "Always evaluate expressions inside brackets first (BODMAS/BIDMAS)."
}
```

Requirements:
- Minimum 2 steps; maximum 5 steps.
- Each step is a single, complete sentence a Year 5 student can follow.
- Final step states the answer explicitly.
- Optional `tip`: one sentence pedagogical note (not a repeat of the working).
- For `short_response` items, `answer` is the numeric string (matches `response_config.answer`).

---

## §9 — Copyright guardrails (verbatim — binding)

The following constraint is reproduced verbatim from v1.1-phase-plan.md §Critical constraint:

> NAPLAN and ICAS are real, copyrighted assessment products with protected
> names. The content operation produces **original items only** — written
> fresh to match the _format, year-level curriculum strand, difficulty band,
> and question type_ of those assessments, without reproducing any actual
> past-paper item. No scraping of past papers, no licensed-bank ingestion,
> no copying. This constraint shapes every part of S6 and S7. It is not
> optional and not negotiable; treat it with the same weight as the child-
> safety and security non-negotiables in CLAUDE.md.

### §9.1 — Prohibited authoring methods (enumerated)

The following methods are explicitly prohibited regardless of how substantially
the output is modified:

1. **Scraping** — automated or manual extraction of content from past NAPLAN or
   ICAS paper websites, PDFs, or digitised archives.
2. **OCR extraction** — optical character recognition of printed or scanned
   past-paper materials.
3. **Manual transcription** — copying question stems, options, or scenarios by
   hand from past papers.
4. **Paraphrase rewriting** — rewriting a protected item by synonym substitution
   or structural rearrangement that preserves the original question's structure
   or scenario.
5. **Answer-bank transformation** — deriving new items from protected items by
   substituting numbers, names, or surface features while retaining the
   underlying question structure.
6. **Synthetic regeneration from copyrighted prompts** — using protected item
   text as a prompt to a generative AI tool and treating the output as original
   content without originality review.

### §9.2 — AI-assisted authoring

AI-assisted authoring tools may be used only as drafting aids. All generated
content must undergo human originality review and must not reproduce or closely
paraphrase protected assessment materials. Similarity scanning, plagiarism
review, and reviewer sign-off are required before activation.

**Practical checklist for every authored item:**

- [ ] The question stem is not copied or paraphrased from a known past NAPLAN paper.
- [ ] The numbers, context, and scenario are original (not lifted from a public example).
- [ ] The skill being tested (strand + descriptor) is correctly mapped to AC v9.0.
- [ ] The difficulty band assignment matches the item's expected cognitive load.
- [ ] All 4 MC options are plausible; no distractor is obviously ridiculous.
- [ ] `copyright_declaration: "original"` is set in the manifest.
- [ ] The item has been reviewed by a second person before setting to `review` in the lifecycle FSM.

**Lifecycle gate:** Items land as `draft`. No item may be set to `active` without
passing the `draft → review → active` lifecycle transition, which requires human
sign-off. The `review` state exists specifically to gate copyright review.

**Legal review gate (S7.1 pre-condition):** These authoring spec templates must
receive legal sign-off before S7.1 bulk authoring begins. Owner: operator-side.
No code action required; operational gate only. See ADR-0041 §Decision 4.

---

## §10 — Example manifest item (complete)

```json
{
  "external_key": "naplan-y5-num-meas-area-001",
  "copyright_declaration": "original",
  "item": {
    "response_type": "multiple_choice",
    "skill_ids": ["meas.area.rectangle"],
    "difficulty": 0.1,
    "year_levels": [5],
    "exam_families": ["naplan"],
    "curricula": ["ac_v9"],
    "countries": ["AU"],
    "bloom_level": "apply",
    "expected_time_secs": 75
  },
  "version": {
    "stem": {
      "type": "text",
      "content": "A rectangular garden is 8 metres long and 5 metres wide.\nWhat is the area of the garden?",
      "format": "plaintext"
    },
    "response_config": {
      "options": [
        { "key": "A", "text": "13 square metres" },
        { "key": "B", "text": "26 square metres" },
        { "key": "C", "text": "40 square metres" },
        { "key": "D", "text": "45 square metres" }
      ],
      "correct": "C",
      "scoring": { "correct": 1, "incorrect": 0 }
    },
    "difficulty": 0.1,
    "distractor_rationale": {
      "A": { "misconception": "addition instead of multiplication", "description": "Student adds 8 + 5 = 13 instead of multiplying" },
      "B": { "misconception": "perimeter confusion", "description": "Student calculates perimeter 2×(8+5) = 26 instead of area" },
      "D": { "misconception": "off-by-one multiplication", "description": "Student uses 9 × 5 = 45 (miscounts length by 1)" }
    },
    "explanation": {
      "steps": [
        "Area of a rectangle = length × width",
        "Area = 8 × 5",
        "Area = 40 square metres"
      ],
      "answer": "C",
      "tip": "Area is always measured in square units."
    }
  }
}
```

---

## §11 — Curriculum disclaimer

Curriculum mappings are provided as guidance only and may require periodic
review due to changes in ACARA publications or state education frameworks.
Authors must verify strand codes and descriptors against current primary-source
ACARA documentation before authoring; the strand table in §2 is a reference
starting point, not a substitute for the primary source.

---

## §12 — Privacy and safeguarding

This template produces educational content for use with children. Authors must
observe:

- **Australian Privacy Act 1988** — no personal information about students
  (names, images, identifying details) may be embedded in item content.
- **Child-data handling** — content must not contain material inappropriate for
  the relevant year level.
- **Content moderation review** — all items must pass the `draft → review`
  lifecycle gate, which includes a content-suitability check alongside
  originality review.

---

## §13 — Accessibility compliance

All authored content must comply with WCAG 2.1 AA where applicable, including
stimuli, graphs, tables, and colour usage:

- Text in stimuli must meet minimum contrast (4.5:1 for body text; 3:1 for
  large text).
- Graphs and diagrams must include sufficient descriptive context in the stem
  for screen-reader users.
- Questions relying solely on colour to convey meaning are prohibited.
- Tables must include clear header labels.

---

## §14 — Jurisdiction

This specification is governed by Australian law and intended for
educational-content development within Australia. Disputes arising from use of
this specification are subject to the jurisdiction of Australian courts.
