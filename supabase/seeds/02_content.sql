-- Seed 02 — Content (2 stimuli, 10 misconceptions, 50 items + item_versions)
-- Idempotent: ON CONFLICT ... DO NOTHING throughout.
-- Item convention: correct answer = option A; bloom_level inferred from skill.
-- G5 distribution: 25 NAPLAN + 25 ICAS; 15 easy(0.3) + 20 mid(0.55) + 15 hard(0.8).
-- =============================================================================

-- ─── stimuli (2) ─────────────────────────────────────────────────────────────

INSERT INTO stimulus (id, type, content, source_attribution, year_levels, exam_families)
VALUES
(
  'a0000002-0000-0000-0000-000000000001',
  'data_table',
  '{"title":"Book Sales","headers":["Day","Mon","Tue","Wed"],"rows":[["Count","3","5","4"]]}',
  'MindMosaic seed v1',
  ARRAY[5],
  ARRAY['naplan','icas']::exam_family[]
),
(
  'a0000002-0000-0000-0000-000000000002',
  'passage',
  '{"text":"A local sports club surveyed 80 members about their favourite activity. 40% chose sports, 25% chose reading, and 35% chose gaming."}',
  'MindMosaic seed v1',
  ARRAY[5],
  ARRAY['naplan','icas']::exam_family[]
)
ON CONFLICT (id) DO NOTHING;

-- ─── misconceptions (10) ─────────────────────────────────────────────────────

INSERT INTO misconception (id, name, description, category, severity, skill_ids, year_levels)
VALUES
(
  'a0000003-0000-0000-0000-000000000001',
  'Place-value digit confusion',
  'Misidentifies positional value of a digit, e.g. reads the 7 in 47 382 as 700 not 7 000.',
  'conceptual', 'critical',
  ARRAY['a0000001-0000-0000-0000-000000000004']::uuid[], ARRAY[5]
),
(
  'a0000003-0000-0000-0000-000000000002',
  'Fraction denominator addition',
  'Adds denominators when combining fractions, e.g. 1/3 + 1/3 = 2/6 instead of 2/3.',
  'procedural', 'critical',
  ARRAY['a0000001-0000-0000-0000-000000000005']::uuid[], ARRAY[5]
),
(
  'a0000003-0000-0000-0000-000000000003',
  'Multiplication as repeated addition only',
  'Solves multiplication by sequential addition, fails on larger factors.',
  'conceptual', 'moderate',
  ARRAY['a0000001-0000-0000-0000-000000000006']::uuid[], ARRAY[5]
),
(
  'a0000003-0000-0000-0000-000000000004',
  'Subtraction direction reversal',
  'Always subtracts smaller digit from larger regardless of column position.',
  'procedural', 'critical',
  ARRAY['a0000001-0000-0000-0000-000000000006']::uuid[], ARRAY[5]
),
(
  'a0000003-0000-0000-0000-000000000005',
  'Fraction size by denominator',
  'Believes larger denominator always means larger fraction.',
  'conceptual', 'critical',
  ARRAY['a0000001-0000-0000-0000-000000000005']::uuid[], ARRAY[5]
),
(
  'a0000003-0000-0000-0000-000000000006',
  'Area-perimeter confusion',
  'Confuses area and perimeter formulas, applying one where the other is required.',
  'conceptual', 'moderate',
  ARRAY['a0000001-0000-0000-0000-000000000008']::uuid[], ARRAY[5]
),
(
  'a0000003-0000-0000-0000-000000000007',
  'Division remainder ignored',
  'Discards remainder, giving an answer one unit short or over.',
  'procedural', 'moderate',
  ARRAY['a0000001-0000-0000-0000-000000000006']::uuid[], ARRAY[5]
),
(
  'a0000003-0000-0000-0000-000000000008',
  'Decimal alignment error',
  'Does not align decimal points when adding or subtracting decimals.',
  'procedural', 'moderate',
  ARRAY['a0000001-0000-0000-0000-000000000005']::uuid[], ARRAY[5]
),
(
  'a0000003-0000-0000-0000-000000000009',
  'Rounding always down',
  'Always rounds down regardless of the deciding digit value.',
  'procedural', 'minor',
  ARRAY['a0000001-0000-0000-0000-000000000004']::uuid[], ARRAY[5]
),
(
  'a0000003-0000-0000-0000-000000000010',
  'Graph scale misread',
  'Misreads axis scale on bar charts or line graphs, off by one interval.',
  'procedural', 'moderate',
  ARRAY['a0000001-0000-0000-0000-000000000009']::uuid[], ARRAY[5]
)
ON CONFLICT (id) DO NOTHING;

-- ─── items + item_versions (50) via PL/pgSQL ─────────────────────────────────
-- Skill indices: 1=Place Value, 2=Fractions & Decimals, 3=Operations,
--                4=Word Problems, 5=Geometry, 6=Data Interpretation
-- Items  1–25: NAPLAN  |  Items 26–50: ICAS
-- Difficulty counts: 0.3 → 15 (easy), 0.55 → 20 (mid), 0.8 → 15 (hard) ✓

DO $$
DECLARE
  sk    uuid[];
  mc    uuid[];
  sk_i  int[];
  diff  real[];
  ef    text[];
  stm   text[];
  oa    text[];
  ob    text[];
  oc    text[];
  od    text[];
  mb    int[];
  mci   int[];

  i     int;
  iid   uuid;
  bl    bloom_level;
  mb_id uuid;
  mc_id uuid;
  stim  uuid;
BEGIN
  -- ── skill UUIDs ──────────────────────────────────────────────────────────
  sk[1] := 'a0000001-0000-0000-0000-000000000004';
  sk[2] := 'a0000001-0000-0000-0000-000000000005';
  sk[3] := 'a0000001-0000-0000-0000-000000000006';
  sk[4] := 'a0000001-0000-0000-0000-000000000007';
  sk[5] := 'a0000001-0000-0000-0000-000000000008';
  sk[6] := 'a0000001-0000-0000-0000-000000000009';

  -- ── misconception UUIDs ──────────────────────────────────────────────────
  mc[1]  := 'a0000003-0000-0000-0000-000000000001';
  mc[2]  := 'a0000003-0000-0000-0000-000000000002';
  mc[3]  := 'a0000003-0000-0000-0000-000000000003';
  mc[4]  := 'a0000003-0000-0000-0000-000000000004';
  mc[5]  := 'a0000003-0000-0000-0000-000000000005';
  mc[6]  := 'a0000003-0000-0000-0000-000000000006';
  mc[7]  := 'a0000003-0000-0000-0000-000000000007';
  mc[8]  := 'a0000003-0000-0000-0000-000000000008';
  mc[9]  := 'a0000003-0000-0000-0000-000000000009';
  mc[10] := 'a0000003-0000-0000-0000-000000000010';

  -- ── per-item data ─────────────────────────────────────────────────────────
  -- skill index (1–6)
  sk_i := ARRAY[
    1,1,1,1,1, 2,2,2,2,2, 3,3,3,3,3, 4,4,4,4,4, 5,5, 6,6,6,
    1,1,1,1,1, 2,2,2,2,2, 3,3,3,3,3, 4,4,4,4,4, 5,5, 6,6,6
  ];

  -- difficulty (0.3=easy, 0.55=mid, 0.8=hard)
  diff := ARRAY[
    0.3,0.3,0.55,0.55,0.8,   0.3,0.55,0.55,0.8,0.8,
    0.3,0.3,0.55,0.8,0.8,    0.3,0.55,0.55,0.8,0.8,
    0.3,0.55,                 0.3,0.55,0.8,
    0.3,0.3,0.55,0.55,0.55,  0.3,0.55,0.55,0.8,0.8,
    0.3,0.3,0.55,0.55,0.8,   0.3,0.55,0.55,0.8,0.8,
    0.3,0.8,                  0.55,0.55,0.8
  ]::real[];

  -- exam family
  ef := ARRAY[
    'naplan','naplan','naplan','naplan','naplan',
    'naplan','naplan','naplan','naplan','naplan',
    'naplan','naplan','naplan','naplan','naplan',
    'naplan','naplan','naplan','naplan','naplan',
    'naplan','naplan','naplan','naplan','naplan',
    'icas','icas','icas','icas','icas',
    'icas','icas','icas','icas','icas',
    'icas','icas','icas','icas','icas',
    'icas','icas','icas','icas','icas',
    'icas','icas','icas','icas','icas'
  ];

  -- stems (A is always correct)
  stm := ARRAY[
    -- NAPLAN 1–25 ──────────────────────────────────────────────────────────
    'What is the value of the digit 7 in 47 382?',
    'Which number is 100 more than 34 619?',
    'Round 83 471 to the nearest thousand.',
    'Which number equals 40 000 + 6 000 + 300 + 5?',
    'How many tens are in 4 320?',
    'A shape has 4 equal parts and 1 part is shaded. What fraction is shaded?',
    'Which fraction is equivalent to 2/3?',
    'Order from smallest to largest: 1/2, 2/5, 3/4.',
    'What is 3/4 of 48?',
    '0.4 + 0.75 = ?',
    '243 + 158 = ?',
    '7 x 8 = ?',
    '485 - 267 = ?',
    '6 x ? = 144. What is the missing number?',
    '564 / 4 = ?',
    'Mia has 24 stickers and gives 9 away. How many remain?',
    'A bag of apples costs $3.45. How much do 4 bags cost?',
    'A train has 6 carriages each carrying 48 passengers. Total passengers?',
    'A rectangle has perimeter 36 cm and length 11 cm. What is the width?',
    'Tom reads 15 pages per day and has read 105 pages. For how many days?',
    'How many faces does a rectangular prism have?',
    'A square has sides of 9 cm. What is its perimeter?',
    'Use the table: Mon=3, Tue=5, Wed=4 books sold. What is the total?',
    'A bar chart shows tallest bar=35 and shortest bar=12. What is the difference?',
    'Use the passage: how many of the 80 members chose Sports?',
    -- ICAS 26–50 ───────────────────────────────────────────────────────────
    'Which is the largest: 23 065, 23 605, 23 506, 23 650?',
    'What is 10 times the value of the digit 3 in 4 302?',
    'What is the value of the digit 5 in 152 487?',
    'Which number is closest to 70 000: 69 408, 70 513, 69 891, 70 092?',
    'Write 300 000 + 40 000 + 700 + 8 as a single number.',
    'Which fraction is less than 1/2?',
    'What is 1/3 + 1/3?',
    'A pizza has 8 equal slices and Jake eats 3. What fraction remains?',
    'Convert 3/4 to a decimal then add 0.2. What is the result?',
    'Which is larger: 7/8 or 5/6?',
    '318 + 247 = ?',
    '9 x 6 = ?',
    '620 - 384 = ?',
    '48 / 6 = ?',
    'What is the remainder when 97 is divided by 8?',
    'A book has 180 pages. Sam reads 45. How many pages remain?',
    'Three friends share 42 marbles equally. How many does each receive?',
    'A cinema has 24 rows of 15 seats. Total seats?',
    'Emma saves $6.50 per week for 8 weeks then spends $18. How much remains?',
    'A tank holds 240 L and water flows in at 15 L per minute. Minutes to fill?',
    'How many sides does a hexagon have?',
    'A triangle has angles of 90 degrees and 45 degrees. What is the third angle?',
    'Bar chart: Cats=12, Dogs=18, Fish=7, Birds=9. What is the mean?',
    'Data set: 3, 7, 4, 8, 3. What is the mode?',
    'Temperature rises from 8C at 6am to 22C at 2pm. Average rise per hour?'
  ];

  -- option A (correct)
  oa := ARRAY[
    '7 000','34 719','83 000','46 305','432',
    '1/4','4/6','2/5, 1/2, 3/4','36','1.15',
    '401','56','218','24','141',
    '15','$13.80','288','7 cm','7',
    '6','36 cm','12','23','32',
    '23 650','3 000','50 000','70 092','340 708',
    '2/5','2/3','5/8','0.95','7/8',
    '565','54','236','8','1',
    '135','14','360','$34.00','16 minutes',
    '6','45 degrees','11.5','3','1.75 C per hour'
  ];

  -- option B (distractor)
  ob := ARRAY[
    '700','35 619','84 000','46 350','43',
    '1/3','3/5','1/2, 2/5, 3/4','12','1.14',
    '391','54','228','12','140',
    '14','$12.45','248','14 cm','8',
    '4','18 cm','13','22','20',
    '23 605','300','5 000','69 408','340 078',
    '3/5','2/6','3/8','0.34','5/6',
    '555','56','246','6','2',
    '125','12','39','$52.00','15 minutes',
    '5','90 degrees','12','7','14 C per hour'
  ];

  -- option C (distractor)
  oc := ARRAY[
    '70 000','34 629','80 000','46 035','4 320',
    '3/4','4/8','3/4, 1/2, 2/5','16','0.79',
    '411','64','118','18','142',
    '16','$14.20','278','25 cm','6',
    '8','81 cm','11','47','28',
    '23 506','30 000','500 000','70 513','304 708',
    '5/8','1/6','5/5','0.52','They are equal',
    '575','52','226','9','12 remainder 1',
    '145','16','350','$26.00','17 minutes',
    '7','135 degrees','11','4','2 C per hour'
  ];

  -- option D (distractor)
  od := ARRAY[
    '70','33 619','83 500','46 003','4',
    '4','2/5','2/5, 3/4, 1/2','24','1.19',
    '301','49','248','36','148',
    '33','$13.00','298','18 cm','5',
    '5','27 cm','14','24','40',
    '23 065','30','500','69 891','340 780',
    '7/12','3/6','3/5','0.25','Cannot tell',
    '465','63','244','7','0',
    '225','13','370','$46.50','20 minutes',
    '8','25 degrees','46','8','0.5 C per hour'
  ];

  -- misconception index for distractor B (0 = untagged)
  mb := ARRAY[
    1,1,9,1,1, 5,2,5,2,8, 4,3,4,3,7, 4,3,3,6,3, 6,6,10,10,10,
    1,1,1,1,1, 5,2,5,8,5, 4,3,4,7,7, 4,7,3,3,4, 6,6,10,10,10
  ];

  -- misconception index for distractor C (0 = untagged)
  mci := ARRAY[
    1,1,1,1,1, 2,5,5,3,8, 3,3,4,3,7, 4,3,3,6,7, 6,6,10,10,3,
    1,9,1,9,1, 5,2,2,8,5, 4,3,4,7,7, 4,3,3,4,4, 6,6,10,10,3
  ];

  -- ── insert loop ───────────────────────────────────────────────────────────
  FOR i IN 1..50 LOOP
    iid   := ('a0000004-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid;
    mb_id := CASE WHEN mb[i]  > 0 THEN mc[mb[i]]  ELSE NULL END;
    mc_id := CASE WHEN mci[i] > 0 THEN mc[mci[i]] ELSE NULL END;

    -- bloom_level by skill
    bl := CASE sk_i[i]
      WHEN 1 THEN 'remember'::bloom_level
      WHEN 2 THEN 'understand'::bloom_level
      WHEN 3 THEN 'apply'::bloom_level
      WHEN 4 THEN 'analyse'::bloom_level
      WHEN 5 THEN 'understand'::bloom_level
      ELSE        'analyse'::bloom_level
    END;

    -- stimulus link: item 23 → stimulus 1; item 25 → stimulus 2; others NULL
    stim := CASE i
      WHEN 23 THEN 'a0000002-0000-0000-0000-000000000001'::uuid
      WHEN 25 THEN 'a0000002-0000-0000-0000-000000000002'::uuid
      ELSE NULL
    END;

    INSERT INTO item (
      id, stimulus_id, response_type, skill_ids,
      difficulty, year_levels, exam_families, bloom_level,
      lifecycle, current_version
    ) VALUES (
      iid, stim, 'mcq', ARRAY[sk[sk_i[i]]],
      diff[i], ARRAY[5], ARRAY[ef[i]::exam_family], bl,
      'active', 1
    ) ON CONFLICT (id) DO NOTHING;

    INSERT INTO item_version (
      item_id, version, stem, response_config,
      distractor_rationale, explanation, metadata,
      difficulty, is_current
    ) VALUES (
      iid, 1,
      jsonb_build_object('text', stm[i]),
      jsonb_build_object(
        'options', jsonb_build_array(
          jsonb_build_object('id', 'A', 'text', oa[i]),
          jsonb_build_object('id', 'B', 'text', ob[i]),
          jsonb_build_object('id', 'C', 'text', oc[i]),
          jsonb_build_object('id', 'D', 'text', od[i])
        ),
        'correct_id', 'A'
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'B', CASE WHEN mb_id IS NOT NULL
             THEN jsonb_build_object('misconception_id', mb_id::text)
             ELSE NULL::jsonb END,
        'C', CASE WHEN mc_id IS NOT NULL
             THEN jsonb_build_object('misconception_id', mc_id::text)
             ELSE NULL::jsonb END
      )),
      jsonb_build_object('text', 'Review the worked solution in the explanation panel.'),
      '{}',
      diff[i],
      true
    ) ON CONFLICT (item_id, version) DO NOTHING;
  END LOOP;
END $$;
