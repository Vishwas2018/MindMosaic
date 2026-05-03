/**
 * validate-content.ts — asserts G5 content minimums are met in the database.
 * Usage: pnpm validate:content
 * Reads: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or .env.local)
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? ''
const SERVICE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY)

// ── helpers ───────────────────────────────────────────────────────────────────

async function countAll(table: string): Promise<number> {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
  if (error) throw new Error(`count(${table}): ${error.message}`)
  return count ?? 0
}

async function countWhere(table: string, column: string, op: 'lte' | 'gt', value: number): Promise<number> {
  const q = db.from(table).select('*', { count: 'exact', head: true })
  const { count, error } = op === 'lte' ? await q.lte(column, value) : await q.gt(column, value)
  if (error) throw new Error(`countWhere(${table}, ${column} ${op} ${value}): ${error.message}`)
  return count ?? 0
}

async function countContains(table: string, column: string, value: string): Promise<number> {
  const { count, error } = await db
    .from(table)
    .select('*', { count: 'exact', head: true })
    .contains(column, [value])
  if (error) throw new Error(`countContains(${table}, ${column} @> [${value}]): ${error.message}`)
  return count ?? 0
}

// ── checks ────────────────────────────────────────────────────────────────────

interface Check {
  label: string
  actual: () => Promise<number>
  expected: number
}

const checks: Check[] = [
  { label: 'Total items',               actual: () => countAll('item'),                          expected: 50 },
  { label: 'NAPLAN items',              actual: () => countContains('item', 'exam_families', 'naplan'), expected: 25 },
  { label: 'ICAS items',               actual: () => countContains('item', 'exam_families', 'icas'),   expected: 25 },
  { label: 'Easy items  (d <= 0.35)',   actual: () => countWhere('item', 'difficulty', 'lte', 0.35),   expected: 15 },
  { label: 'Hard items  (d >  0.70)',   actual: () => countWhere('item', 'difficulty', 'gt',  0.70),   expected: 15 },
  { label: 'Total misconceptions',      actual: () => countAll('misconception'),                  expected: 10 },
  { label: 'Total stimuli',            actual: () => countAll('stimulus'),                        expected: 2  },
]

// Mid-difficulty derived: total - easy - hard must equal 20 (not a separate DB call)

// ── runner ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('MindMosaic — G5 content validation\n')

  let passed = 0
  let failed = 0
  const results: Array<{ label: string; expected: number; actual: number; ok: boolean }> = []

  for (const check of checks) {
    const actual = await check.actual()
    const ok = actual === check.expected
    results.push({ label: check.label, expected: check.expected, actual, ok })
    if (ok) { passed++ } else { failed++ }
  }

  // Derived: mid = total - easy - hard
  const total = results[0]!.actual
  const easy  = results[3]!.actual
  const hard  = results[4]!.actual
  const mid   = total - easy - hard
  const midOk = mid === 20
  results.push({ label: 'Mid items (0.35 < d <= 0.70)', expected: 20, actual: mid, ok: midOk })
  if (midOk) { passed++ } else { failed++ }

  // Print table
  const labelW = Math.max(...results.map(r => r.label.length)) + 2
  console.log(`${'Check'.padEnd(labelW)}  Expected  Actual  Status`)
  console.log('─'.repeat(labelW + 28))
  for (const r of results) {
    const status = r.ok ? '✓ PASS' : '✗ FAIL'
    console.log(`${r.label.padEnd(labelW)}  ${String(r.expected).padStart(8)}  ${String(r.actual).padStart(6)}  ${status}`)
  }

  console.log(`\n${passed} passed, ${failed} failed`)

  if (failed > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
