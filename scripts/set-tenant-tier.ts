/**
 * set-tenant-tier.ts — manually set a tenant's subscription tier and feature flags.
 * G2 (pre-Stripe): authorised writer for feature_flag table.
 * Usage: pnpm set-tenant-tier <tenant-slug> <tier>
 * Tiers: free | standard | premium
 * Reads: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (or .env.local)
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

config({ path: resolve(process.cwd(), '.env.local') })
config({ path: resolve(process.cwd(), '.env') })

const SUPABASE_URL = process.env['SUPABASE_URL'] ?? process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? ''
const SERVICE_KEY = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''

const [, , tenantSlug, tier] = process.argv

if (!tenantSlug || !tier) {
  console.error('Usage: pnpm set-tenant-tier <tenant-slug> <tier>')
  console.error('Tiers: free | standard | premium')
  process.exit(1)
}

const VALID_TIERS = ['free', 'standard', 'premium'] as const
type Tier = typeof VALID_TIERS[number]

if (!VALID_TIERS.includes(tier as Tier)) {
  console.error(`Invalid tier "${tier}". Must be one of: ${VALID_TIERS.join(', ')}`)
  process.exit(1)
}

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SERVICE_KEY)

// ── tier → feature flag map ───────────────────────────────────────────────────

const TIER_FLAGS: Record<Tier, Record<string, boolean>> = {
  free: {
    naplan_y5:       true,
    icas_math_y5:    false,
    skill_practice:  true,
    parent_dashboard:true,
    diagnostic_mode: false,
    report_export:   false,
    teacher_dashboard:false,
  },
  standard: {
    naplan_y5:       true,
    icas_math_y5:    true,
    skill_practice:  true,
    parent_dashboard:true,
    diagnostic_mode: true,
    report_export:   false,
    teacher_dashboard:false,
  },
  premium: {
    naplan_y5:       true,
    icas_math_y5:    true,
    skill_practice:  true,
    parent_dashboard:true,
    diagnostic_mode: true,
    report_export:   true,
    teacher_dashboard:true,
  },
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Resolve tenant
  const { data: tenant, error: tenantErr } = await db
    .from('tenant')
    .select('id, name, slug')
    .eq('slug', tenantSlug)
    .single()

  if (tenantErr || !tenant) {
    console.error(`Tenant "${tenantSlug}" not found.`)
    process.exit(1)
  }

  console.log(`Tenant: ${tenant['name']} (${tenant['id']})`)
  console.log(`Setting tier: ${tier}\n`)

  const flags = TIER_FLAGS[tier as Tier]
  const tenantId = tenant['id'] as string

  // Update or insert subscription (partial unique index, so no upsert shortcut).
  const { data: existingSub } = await db
    .from('subscription')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (existingSub) {
    const { error: subErr } = await db
      .from('subscription')
      .update({ tier, updated_at: new Date().toISOString() })
      .eq('id', (existingSub as { id: string })['id'])
    if (subErr) { console.error('Failed to update subscription:', subErr.message); process.exit(1) }
  } else {
    const { error: subErr } = await db
      .from('subscription')
      .insert({ tenant_id: tenantId, tier, stripe_subscription_id: null, is_active: true, current_period_end: '2099-12-31T00:00:00Z' })
    if (subErr) { console.error('Failed to insert subscription:', subErr.message); process.exit(1) }
  }

  // Delete existing tenant flags then insert fresh set.
  // feature_flag uses a partial unique index (tenant_id, feature_key WHERE NOT NULL)
  // which PostgREST upsert cannot target, so delete+insert is the correct pattern.
  const { error: delErr } = await db
    .from('feature_flag')
    .delete()
    .eq('tenant_id', tenantId)

  if (delErr) {
    console.error('Failed to clear existing flags:', delErr.message)
    process.exit(1)
  }

  const rows = Object.entries(flags).map(([featureKey, enabled]) => ({
    tenant_id: tenantId,
    feature_key: featureKey,
    enabled,
    source: 'admin_override',
    config: {},
  }))

  const { error: insertErr } = await db.from('feature_flag').insert(rows)

  if (insertErr) {
    console.error('Failed to insert flags:', insertErr.message)
    process.exit(1)
  }

  for (const [featureKey, enabled] of Object.entries(flags)) {
    console.log(`  ${enabled ? '✓' : '○'} ${featureKey}: ${enabled ? 'enabled' : 'disabled'}`)
  }

  console.log('\nDone.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
