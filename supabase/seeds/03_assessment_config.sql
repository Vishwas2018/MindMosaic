-- Seed 03 — Assessment Config (framework_configs, blueprints, pathways, assessment_profiles)
-- Idempotent: ON CONFLICT ... DO NOTHING / DO UPDATE where needed.
-- =============================================================================

-- ─── framework_configs (2) ───────────────────────────────────────────────────

INSERT INTO framework_config (id, exam_family, version, structure, adaptive_rules, scoring_rules, constraints, difficulty_bands, blueprint)
VALUES
(
  'a0000005-0000-0000-0000-000000000001',
  'naplan',
  'v1',
  '{"engine":"adaptive","min_items":20,"max_items":30,"start_difficulty":0.5,"year_level":5}',
  '{"theta_init":0.0,"step_size":0.3,"termination":{"se_threshold":0.3,"max_items":30},"item_selection":"max_info"}',
  '{"model":"irt_1pl","ability_range":[-3,3],"score_scale":{"min":0,"max":1000,"mean":500}}',
  '{"require_skill_coverage":true,"min_skills_assessed":3}',
  '{"easy":[0.0,0.35],"mid":[0.35,0.70],"hard":[0.70,1.0]}',
  '{"strands":[{"slug":"number-algebra","weight":0.6},{"slug":"measurement-space","weight":0.4}]}'
),
(
  'a0000005-0000-0000-0000-000000000002',
  'icas',
  'v1',
  '{"engine":"linear","item_count":25,"time_minutes":60,"year_level":5}',
  null,
  '{"model":"raw","marks_per_item":1,"total_marks":25}',
  '{"fixed_order":true}',
  '{"easy":[0.0,0.35],"mid":[0.35,0.70],"hard":[0.70,1.0]}',
  '{"sections":[{"name":"Mathematics","item_count":25}]}'
)
ON CONFLICT (exam_family, version) DO NOTHING;

-- ─── blueprints (2) ──────────────────────────────────────────────────────────

INSERT INTO blueprint (id, sections)
VALUES
(
  'a0000006-0000-0000-0000-000000000001',
  '[
    {"name":"Number & Algebra","target_items":15,"skill_slugs":["place-value","fractions-decimals","operations","word-problems"],"difficulty_split":{"easy":0.3,"mid":0.4,"hard":0.3}},
    {"name":"Measurement & Space","target_items":10,"skill_slugs":["geometry","data-interpretation"],"difficulty_split":{"easy":0.3,"mid":0.4,"hard":0.3}}
  ]'
),
(
  'a0000006-0000-0000-0000-000000000002',
  '[
    {"name":"Number & Algebra","target_items":15,"skill_slugs":["place-value","fractions-decimals","operations","word-problems"],"difficulty_split":{"easy":0.3,"mid":0.4,"hard":0.3}},
    {"name":"Measurement & Space","target_items":10,"skill_slugs":["geometry","data-interpretation"],"difficulty_split":{"easy":0.3,"mid":0.4,"hard":0.3}}
  ]'
)
ON CONFLICT (id) DO NOTHING;

-- ─── pathways (2) ────────────────────────────────────────────────────────────

INSERT INTO pathway (id, slug, display_name, exam_family, program, country, curriculum, framework_config_id, engine_type, year_levels, required_feature_key)
VALUES
(
  'a0000007-0000-0000-0000-000000000001',
  'naplan-y5-numeracy',
  'NAPLAN Year 5 Numeracy',
  'naplan', 'NAPLAN', 'AU', 'australian_curriculum_v9',
  'a0000005-0000-0000-0000-000000000001',
  'adaptive',
  ARRAY[5],
  'naplan_y5'
),
(
  'a0000007-0000-0000-0000-000000000002',
  'icas-math-y5',
  'ICAS Mathematics Year 5',
  'icas', 'ICAS', 'AU', 'australian_curriculum_v9',
  'a0000005-0000-0000-0000-000000000002',
  'linear',
  ARRAY[5],
  'icas_math_y5'
)
ON CONFLICT (id) DO NOTHING;

-- ─── assessment_profiles (2) ─────────────────────────────────────────────────

INSERT INTO assessment_profile (id, exam_family, program, year_level, version, framework_config_id, blueprint_id, duration_minutes)
VALUES
(
  'a0000008-0000-0000-0000-000000000001',
  'naplan', 'NAPLAN', 5, '2024',
  'a0000005-0000-0000-0000-000000000001',
  'a0000006-0000-0000-0000-000000000001',
  45
),
(
  'a0000008-0000-0000-0000-000000000002',
  'icas', 'ICAS', 5, '2024',
  'a0000005-0000-0000-0000-000000000002',
  'a0000006-0000-0000-0000-000000000002',
  60
)
ON CONFLICT (id) DO NOTHING;
