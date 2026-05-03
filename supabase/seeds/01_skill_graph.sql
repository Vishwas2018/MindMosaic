-- Seed 01 — Skill Graph (v1 seed; 1 domain, 2 strands, 6 skills, 4 edges)
-- Idempotent: ON CONFLICT (id) DO NOTHING throughout.
-- G4 guard bypassed via app.allow_unsafe_publish (seed-only setting).
-- =============================================================================

SET LOCAL app.allow_unsafe_publish = 'true';

-- ─── skill_graph_version ─────────────────────────────────────────────────────

INSERT INTO skill_graph_version (id, version, description, status, node_count, edge_count, published_at)
VALUES ('a0000000-0000-0000-0000-000000000001', 1, 'v1 seed skill graph — 9 nodes, 4 edges', 'published', 9, 4, now())
ON CONFLICT (id) DO NOTHING;

-- ─── skill_nodes — domain ────────────────────────────────────────────────────

INSERT INTO skill_node (id, graph_version_id, level, name, slug, description, difficulty_min, difficulty_max, bloom_levels, pathway_tags, year_levels)
VALUES (
  'a0000001-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'domain', 'Mathematics', 'mathematics',
  'Core numeracy domain — NAPLAN Y5 + ICAS Paper C scope',
  0.0, 1.0,
  ARRAY['remember','understand','apply','analyse']::bloom_level[],
  ARRAY['naplan','icas']::exam_family[],
  ARRAY[5]
) ON CONFLICT (id) DO NOTHING;

-- ─── skill_nodes — strands (2) ───────────────────────────────────────────────

INSERT INTO skill_node (id, graph_version_id, parent_id, domain_id, level, name, slug, difficulty_min, difficulty_max, bloom_levels, pathway_tags, year_levels)
VALUES
(
  'a0000001-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000001',
  'strand', 'Number & Algebra', 'number-algebra', 0.0, 1.0,
  ARRAY['remember','understand','apply','analyse']::bloom_level[],
  ARRAY['naplan','icas']::exam_family[], ARRAY[5]
),
(
  'a0000001-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000001',
  'strand', 'Measurement & Space', 'measurement-space', 0.0, 1.0,
  ARRAY['remember','understand','apply']::bloom_level[],
  ARRAY['naplan','icas']::exam_family[], ARRAY[5]
)
ON CONFLICT (id) DO NOTHING;

-- ─── skill_nodes — skills (6) ────────────────────────────────────────────────

INSERT INTO skill_node (id, graph_version_id, parent_id, domain_id, level, name, slug, difficulty_min, difficulty_max, bloom_levels, pathway_tags, year_levels)
VALUES
(
  'a0000001-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000002',
  'a0000001-0000-0000-0000-000000000001',
  'skill', 'Place Value', 'place-value', 0.2, 0.9,
  ARRAY['remember','understand','apply']::bloom_level[],
  ARRAY['naplan','icas']::exam_family[], ARRAY[5]
),
(
  'a0000001-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000002',
  'a0000001-0000-0000-0000-000000000001',
  'skill', 'Fractions & Decimals', 'fractions-decimals', 0.2, 0.9,
  ARRAY['understand','apply']::bloom_level[],
  ARRAY['naplan','icas']::exam_family[], ARRAY[5]
),
(
  'a0000001-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000002',
  'a0000001-0000-0000-0000-000000000001',
  'skill', 'Operations', 'operations', 0.2, 0.9,
  ARRAY['apply','analyse']::bloom_level[],
  ARRAY['naplan','icas']::exam_family[], ARRAY[5]
),
(
  'a0000001-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000002',
  'a0000001-0000-0000-0000-000000000001',
  'skill', 'Word Problems', 'word-problems', 0.3, 1.0,
  ARRAY['apply','analyse']::bloom_level[],
  ARRAY['naplan','icas']::exam_family[], ARRAY[5]
),
(
  'a0000001-0000-0000-0000-000000000008',
  'a0000000-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000003',
  'a0000001-0000-0000-0000-000000000001',
  'skill', 'Geometry', 'geometry', 0.2, 0.85,
  ARRAY['remember','understand','apply']::bloom_level[],
  ARRAY['naplan','icas']::exam_family[], ARRAY[5]
),
(
  'a0000001-0000-0000-0000-000000000009',
  'a0000000-0000-0000-0000-000000000001',
  'a0000001-0000-0000-0000-000000000003',
  'a0000001-0000-0000-0000-000000000001',
  'skill', 'Data Interpretation', 'data-interpretation', 0.3, 1.0,
  ARRAY['understand','analyse']::bloom_level[],
  ARRAY['naplan','icas']::exam_family[], ARRAY[5]
)
ON CONFLICT (id) DO NOTHING;

-- ─── skill_edges — 4 prerequisite edges ──────────────────────────────────────

INSERT INTO skill_edge (id, graph_version_id, source_id, target_id, edge_type, strength, dependency_class)
VALUES
-- Place Value → Fractions (required, high strength: fraction meaning requires PV)
('a0000001-0000-0001-0000-000000000001',
 'a0000000-0000-0000-0000-000000000001',
 'a0000001-0000-0000-0000-000000000004',
 'a0000001-0000-0000-0000-000000000005',
 'prerequisite', 0.85, 'required'),
-- Place Value → Operations (required: arithmetic requires PV understanding)
('a0000001-0000-0001-0000-000000000002',
 'a0000000-0000-0000-0000-000000000001',
 'a0000001-0000-0000-0000-000000000004',
 'a0000001-0000-0000-0000-000000000006',
 'prerequisite', 0.80, 'required'),
-- Operations → Word Problems (required: WP requires computational fluency)
('a0000001-0000-0001-0000-000000000003',
 'a0000000-0000-0000-0000-000000000001',
 'a0000001-0000-0000-0000-000000000006',
 'a0000001-0000-0000-0000-000000000007',
 'prerequisite', 0.85, 'required'),
-- Fractions → Word Problems (supportive: fraction problems are WP subtype)
('a0000001-0000-0001-0000-000000000004',
 'a0000000-0000-0000-0000-000000000001',
 'a0000001-0000-0000-0000-000000000005',
 'a0000001-0000-0000-0000-000000000007',
 'prerequisite', 0.60, 'supportive')
ON CONFLICT (id) DO NOTHING;

-- Update node/edge counts in version record
UPDATE skill_graph_version
SET node_count = 9, edge_count = 4
WHERE id = 'a0000000-0000-0000-0000-000000000001';
