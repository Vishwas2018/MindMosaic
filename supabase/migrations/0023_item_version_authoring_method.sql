-- 0023_item_version_authoring_method.sql
-- v1.1-S7-prep step 1b: Add authoring_method provenance column (legal review finding 3, Q-1.1-S7-LEGAL-1 Option A)
-- NOT NULL, no DEFAULT: forces explicit declaration at every INSERT site (Q-1.1-S7-LEGAL-1.3 Option A)
-- CHECK constraint mirrors z.enum values in ImportManifestItemSchema and ItemVersionCreateDTOSchema
-- Empty-bank safe: 0 rows in item_version at S6 close (Q-1.1-6.7 rationale)
-- No RLS change: existing item_version policies (SELECT only, is_current = true) cover this column

ALTER TABLE item_version
  ADD COLUMN authoring_method text NOT NULL
  CHECK (authoring_method IN ('human', 'ai_assisted_human_reviewed'));
