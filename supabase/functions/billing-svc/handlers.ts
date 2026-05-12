import { withIdempotency, type IdempotencyDbClient } from '../_shared/idempotency.ts';

/**
 * billing-svc handlers — Stage 42–43 (Phase 4 slice).
 *
 * Implements:
 *   handleStripeWebhook  — POST /billing/webhook/stripe
 *   handleFlagPropagateStub — POST /billing/pipeline/flag-propagate (Stage 44 pending)
 *
 * Webhook flow (Q-42.6 resolution):
 *   1. req.text() FIRST — raw body before any JSON parse (arch §3.4.1)
 *   2. stripe.webhooks.constructEvent — signature verification ≤300ms
 *   3. INSERT billing_event ON CONFLICT (stripe_event_id) DO NOTHING (Q-42.4)
 *   4. If new row: sync subscription + billing_customer state
 *   5. Enqueue pipeline.feature_flag_propagate job
 *   6. Return 200 to Stripe (non-2xx triggers retry)
 *
 * Idempotency model: billing_event.stripe_event_id UNIQUE NOT NULL + ON CONFLICT.
 * This is DISTINCT from withIdempotency middleware (Q-42.4, ADR-0034).
 *
 * ISSUE-0032: single STRIPE_WEBHOOK_SECRET; v1.1 needs dual-secret rotation window.
 */

export interface BillingDbClient {
  from(table: string): {
    insert(row: Record<string, unknown>): {
      select(cols: string): Promise<{ data: Array<{ id: string }> | null; error: { message: string; code?: string } | null }>;
      then?: never;
    };
    upsert(row: Record<string, unknown>, opts?: { onConflict?: string }): Promise<{ error: { message: string } | null }>;
    update(patch: Record<string, unknown>): {
      eq(col: string, val: unknown): Promise<{ error: { message: string } | null }>;
      match(cond: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
    };
    select(cols: string): {
      eq(col: string, val: unknown): {
        maybeSingle(): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }>;
        order(col: string, opts: { ascending: boolean }): {
          limit(n: number): Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
        };
      };
    };
  };
}

export interface StripeClient {
  webhooks: {
    constructEvent(
      rawBody: string,
      sig: string,
      secret: string,
    ): { id: string; type: string; data: { object: Record<string, unknown> } };
  };
  checkout: {
    sessions: {
      create(params: Record<string, unknown>): Promise<{ id: string; url: string | null }>;
    };
  };
  billingPortal: {
    sessions: {
      create(params: Record<string, unknown>): Promise<{ url: string }>;
    };
  };
  subscriptions: {
    update(id: string, params: Record<string, unknown>): Promise<{ cancel_at: number | null; status: string }>;
  };
}

export interface WebhookHandlerOpts {
  rawBody: string;
  signature: string;
  webhookSecret: string;
  stripe: StripeClient;
  client: BillingDbClient;
  traceId: string;
}

export interface WebhookHandlerResult {
  status: number;
  data: Record<string, unknown>;
}

export async function handleStripeWebhook(
  opts: WebhookHandlerOpts,
): Promise<WebhookHandlerResult> {
  const { rawBody, signature, webhookSecret, stripe, client, traceId } = opts;

  // ── Step 1: Signature verification (arch §3.4.1 — ≤300ms) ─────────────────
  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    // Invalid signature: write billing_event with processing_error + return 400.
    // arch §3.4.1: "reject within 300 ms if signature invalid"
    // spec line 3086: "write a billing_event row with processing_error='invalid_signature'"
    await writeBillingEvent(client, {
      stripe_event_id: `invalid-${traceId}`,
      event_type: 'invalid_signature',
      payload: {},
      processing_error: 'invalid_signature',
    });
    return { status: 400, data: { error: { code: 'INVALID_SIGNATURE', trace_id: traceId } } };
  }

  // ── Step 2: Idempotent billing_event INSERT (Q-42.4, ADR-0034) ────────────
  // ON CONFLICT (stripe_event_id) DO NOTHING — duplicate events are no-ops.
  // Return 200 to Stripe on duplicate (non-2xx triggers Stripe retry).
  const insertResult = await client
    .from('billing_event')
    .insert({
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event.data.object,
    })
    .select('id');

  if (insertResult.error !== null) {
    // 23505 = unique_violation → duplicate event; return 200 (idempotent no-op).
    if (insertResult.error.code === '23505') {
      return { status: 200, data: { received: true, duplicate: true } };
    }
    return {
      status: 500,
      data: { error: { code: 'INTERNAL_ERROR', message: insertResult.error.message, trace_id: traceId } },
    };
  }

  // No rows inserted = duplicate handled by ON CONFLICT DO NOTHING without error.
  if (!insertResult.data || insertResult.data.length === 0) {
    return { status: 200, data: { received: true, duplicate: true } };
  }

  const billingEventId = insertResult.data[0]!.id;

  // ── Step 3: Resolve stripe_customer_id → tenant_id ────────────────────────
  const obj = event.data.object;
  const stripeCustomerId = resolveCustomerId(event.type, obj);

  let tenantId: string | null = null;
  if (stripeCustomerId !== null) {
    const bcResult = await client
      .from('billing_customer')
      .select('tenant_id')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();
    if (bcResult.data !== null) {
      tenantId = bcResult.data['tenant_id'] as string;
    }
  }

  // ── Step 4: Event state machine (spec §25.4) ───────────────────────────────
  let tierChanged = false;
  if (tenantId !== null) {
    tierChanged = await resolveSubscriptionState({
      eventType: event.type,
      obj,
      tenantId,
      stripeCustomerId,
      client,
    });
  }

  // ── Step 5: Mark billing_event processed ──────────────────────────────────
  await client
    .from('billing_event')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', billingEventId);

  // ── Step 6: Enqueue pipeline.feature_flag_propagate (Q-42.6) ──────────────
  if (tierChanged && tenantId !== null) {
    await client.from('job_queue').insert({
      tenant_id: tenantId,
      job_type: 'pipeline.feature_flag_propagate',
      payload: { tenant_id: tenantId, triggered_by: event.id },
      priority: 'medium',
      idempotency_key: `ffp-${event.id}`,
    }).select('id');
  }

  return { status: 200, data: { received: true } };
}

// ─── Subscription state machine (spec §25.4) ──────────────────────────────────

interface ResolveStateOpts {
  eventType: string;
  obj: Record<string, unknown>;
  tenantId: string;
  stripeCustomerId: string | null;
  client: BillingDbClient;
}

export async function resolveSubscriptionState(opts: ResolveStateOpts): Promise<boolean> {
  const { eventType, obj, tenantId, stripeCustomerId, client } = opts;

  switch (eventType) {
    case 'checkout.session.completed': {
      const tier = (obj['metadata'] as Record<string, string> | null)?.['tier'] ?? 'standard';
      const stripeSub = obj['subscription'] as string | null;
      await client.from('subscription').upsert(
        {
          tenant_id: tenantId,
          tier,
          stripe_subscription_id: stripeSub ?? null,
          is_active: true,
          started_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id' },
      );
      if (stripeCustomerId !== null) {
        await client.from('billing_customer').upsert(
          { tenant_id: tenantId, stripe_customer_id: stripeCustomerId },
          { onConflict: 'tenant_id' },
        );
      }
      return true;
    }

    case 'customer.subscription.created': {
      const periodEnd = obj['current_period_end'];
      const stripeSub = obj['id'] as string;
      await client.from('subscription').upsert(
        {
          tenant_id: tenantId,
          stripe_subscription_id: stripeSub,
          is_active: true,
          current_period_end: periodEnd != null
            ? new Date((periodEnd as number) * 1000).toISOString()
            : null,
        },
        { onConflict: 'tenant_id' },
      );
      return false;
    }

    case 'customer.subscription.updated': {
      const periodEnd = obj['current_period_end'];
      const cancelAt = obj['cancel_at'];
      const patch: Record<string, unknown> = {
        current_period_end: periodEnd != null
          ? new Date((periodEnd as number) * 1000).toISOString()
          : null,
        cancel_at: cancelAt != null
          ? new Date((cancelAt as number) * 1000).toISOString()
          : null,
        is_active: obj['status'] !== 'canceled',
      };
      await client.from('subscription').update(patch).eq('tenant_id', tenantId);
      return true;
    }

    case 'customer.subscription.deleted': {
      await client.from('subscription').update({
        is_active: false,
        canceled_at: new Date().toISOString(),
        tier: 'free',
      }).eq('tenant_id', tenantId);
      return true;
    }

    case 'invoice.paid': {
      await upsertInvoice(client, tenantId, obj, 'paid');
      return false;
    }

    case 'invoice.payment_failed': {
      await upsertInvoice(client, tenantId, obj, 'open');
      return false;
    }

    case 'customer.updated': {
      const paymentMethod = obj['invoice_settings'] != null
        ? ((obj['invoice_settings'] as Record<string, unknown>)['default_payment_method'] as string | null)
        : null;
      if (stripeCustomerId !== null) {
        await client.from('billing_customer').update({
          default_payment_method: paymentMethod,
        }).eq('tenant_id', tenantId);
      }
      return false;
    }

    default:
      return false;
  }
}

// ─── Stage 44 pending stub ─────────────────────────────────────────────────────

export interface FlagPropagateOpts {
  traceId: string;
  tenantId?: string;
}

export interface FlagPropagateResult {
  status: number;
  data: Record<string, unknown>;
}

export function handleFlagPropagateStub(opts: FlagPropagateOpts): FlagPropagateResult {
  // Stage 44 pending — full feature_flag propagation implemented in Stage 44.
  // Q-42.7: admin_action_log write deferred (actor_id NOT NULL vs actor_role='system'
  // — no sentinel system user yet; Stage 44 resolves with Option A: sentinel user).
  // This stub is auditable via structured logger (not a silent no-op).
  return {
    status: 200,
    data: {
      received: true,
      // Stage 44 pending
      note: 'feature_flag propagation deferred to Stage 44',
      trace_id: opts.traceId,
      tenant_id: opts.tenantId ?? null,
    },
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveCustomerId(
  eventType: string,
  obj: Record<string, unknown>,
): string | null {
  const customer = obj['customer'];
  if (typeof customer === 'string') return customer;
  return null;
}

async function writeBillingEvent(
  client: BillingDbClient,
  row: {
    stripe_event_id: string;
    event_type: string;
    payload: Record<string, unknown>;
    processing_error?: string;
  },
): Promise<void> {
  await client.from('billing_event').insert({
    stripe_event_id: row.stripe_event_id,
    event_type: row.event_type,
    payload: row.payload,
    processing_error: row.processing_error ?? null,
    processed_at: new Date().toISOString(),
  }).select('id');
}

// ─── Stage 43: Billing endpoint handlers ──────────────────────────────────────

export interface StripePriceIds {
  standard_monthly: string;
  standard_yearly: string;
  premium_monthly: string;
  premium_yearly: string;
}

// PLAN_CATALOG: single source of truth shared by handleGetPlans + handleCreateCheckout.
// Stripe Price IDs injected from env vars (STRIPE_PRICE_*) at call site in index.ts.
const PLAN_CATALOG = [
  {
    tier: 'standard' as const,
    display_name: 'Standard',
    price_monthly_cents: 1900,
    price_yearly_cents: 19000,
    currency: 'AUD',
    features: [
      'Adaptive NAPLAN Y5 Numeracy practice',
      'ICAS Math Paper C practice',
      'Student progress dashboard',
      'Parent progress view',
      'Unlimited practice sessions',
    ],
    popular: true,
  },
  {
    tier: 'premium' as const,
    display_name: 'Premium',
    price_monthly_cents: 3900,
    price_yearly_cents: 39000,
    currency: 'AUD',
    features: [
      'Everything in Standard',
      'AI-powered learning insights',
      'Teacher class dashboard',
      'Class management & assignments',
      'Priority support',
    ],
    popular: false,
  },
];

// GET /billing/plans — public; no auth required (Q-43.4).
export function handleGetPlans(opts: { stripePriceIds: StripePriceIds }): WebhookHandlerResult {
  const plans = PLAN_CATALOG.map((p) => ({
    ...p,
    stripe_price_monthly: opts.stripePriceIds[`${p.tier}_monthly` as keyof StripePriceIds],
    stripe_price_yearly: opts.stripePriceIds[`${p.tier}_yearly` as keyof StripePriceIds],
  }));
  return { status: 200, data: { plans } };
}

export interface CreateCheckoutOpts {
  body: { tier: string; billing_interval: 'monthly' | 'yearly'; success_url: string; cancel_url: string };
  idempotencyKey: string;
  tenantId: string;
  stripe: StripeClient;
  client: BillingDbClient;
  traceId: string;
  stripePriceIds: StripePriceIds;
}

// POST /billing/checkout — Stripe-hosted Checkout (ADR-0034 Decision 5, Q-43.1).
// withIdempotency applied per ISSUE-0023 pattern; distinct from webhook billing_event dedup.
export async function handleCreateCheckout(
  opts: CreateCheckoutOpts,
): Promise<WebhookHandlerResult> {
  const { body, idempotencyKey, tenantId, stripe, client, traceId, stripePriceIds } = opts;

  const planEntry = PLAN_CATALOG.find((p) => p.tier === body.tier);
  if (planEntry === undefined) {
    return { status: 400, data: { error: { code: 'INVALID_PLAN', message: 'Unknown tier', trace_id: traceId } } };
  }

  const priceKey = `${body.tier}_${body.billing_interval}` as keyof StripePriceIds;
  const priceId = stripePriceIds[priceKey];
  if (!priceId) {
    return { status: 400, data: { error: { code: 'INVALID_PLAN', message: 'Unknown billing interval', trace_id: traceId } } };
  }

  const bcResult = await client
    .from('billing_customer')
    .select('stripe_customer_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  const existingCustomerId = (bcResult.data?.['stripe_customer_id'] as string | undefined) ?? null;

  const result = await withIdempotency<{ checkout_url: string; session_id: string }>({
    client: client as unknown as IdempotencyDbClient,
    idempotencyKey,
    tenantId,
    endpoint: '/billing/checkout',
    bodyText: JSON.stringify(body),
    handler: async () => {
      const params: Record<string, unknown> = {
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: body.success_url,
        cancel_url: body.cancel_url,
        metadata: { tenant_id: tenantId, tier: body.tier },
      };
      if (existingCustomerId !== null) params['customer'] = existingCustomerId;
      const session = await stripe.checkout.sessions.create(params);
      return { status: 200, data: { checkout_url: session.url ?? '', session_id: session.id } };
    },
  });

  if (!result.ok) {
    return { status: result.status, data: { error: { code: result.code, message: result.message, trace_id: traceId } } };
  }
  return { status: result.status, data: result.data };
}

export interface CreatePortalSessionOpts {
  tenantId: string;
  stripe: StripeClient;
  client: BillingDbClient;
  traceId: string;
  returnUrl: string;
}

// POST /billing/portal — Stripe Customer Portal session (SAQ A; no card data in app).
export async function handleCreatePortalSession(
  opts: CreatePortalSessionOpts,
): Promise<WebhookHandlerResult> {
  const { tenantId, stripe, client, traceId, returnUrl } = opts;

  const bcResult = await client
    .from('billing_customer')
    .select('stripe_customer_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (bcResult.error !== null) {
    return { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: bcResult.error.message, trace_id: traceId } } };
  }
  const stripeCustomerId = bcResult.data?.['stripe_customer_id'] as string | undefined;
  if (!stripeCustomerId) {
    return { status: 404, data: { error: { code: 'NO_BILLING_CUSTOMER', message: 'No billing customer found for tenant', trace_id: traceId } } };
  }

  const session = await stripe.billingPortal.sessions.create({ customer: stripeCustomerId, return_url: returnUrl });
  return { status: 200, data: { portal_url: session.url } };
}

export interface GetSubscriptionOpts {
  tenantId: string;
  client: BillingDbClient;
  traceId: string;
}

// GET /billing/subscription — synthetic free-tier returned when no row exists (Q-43.5).
export async function handleGetSubscription(
  opts: GetSubscriptionOpts,
): Promise<WebhookHandlerResult> {
  const { tenantId, client, traceId } = opts;

  const result = await client
    .from('subscription')
    .select('tier, is_active, started_at, current_period_end, cancel_at, canceled_at, stripe_subscription_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (result.error !== null) {
    return { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: result.error.message, trace_id: traceId } } };
  }

  const subscription = result.data ?? {
    tier: 'free',
    is_active: true,
    started_at: new Date().toISOString(),
    current_period_end: null,
    cancel_at: null,
    canceled_at: null,
    stripe_subscription_id: null,
  };
  return { status: 200, data: subscription };
}

export interface CancelSubscriptionOpts {
  tenantId: string;
  undo: boolean;
  stripe: StripeClient;
  client: BillingDbClient;
  traceId: string;
}

// POST /billing/cancel — schedule or undo subscription cancellation at period end.
export async function handleCancelSubscription(
  opts: CancelSubscriptionOpts,
): Promise<WebhookHandlerResult> {
  const { tenantId, undo, stripe, client, traceId } = opts;

  const subResult = await client
    .from('subscription')
    .select('stripe_subscription_id, is_active')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (subResult.error !== null) {
    return { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: subResult.error.message, trace_id: traceId } } };
  }
  if (subResult.data === null) {
    return { status: 404, data: { error: { code: 'NO_SUBSCRIPTION', message: 'No subscription found', trace_id: traceId } } };
  }
  const stripeSubscriptionId = subResult.data['stripe_subscription_id'] as string | null;
  if (!stripeSubscriptionId) {
    return { status: 400, data: { error: { code: 'NO_STRIPE_SUBSCRIPTION', message: 'Subscription has no Stripe subscription ID', trace_id: traceId } } };
  }

  const updated = await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: !undo });
  const cancelAt = updated.cancel_at !== null ? new Date(updated.cancel_at * 1000).toISOString() : null;
  const isActive = updated.status !== 'canceled';

  await client.from('subscription').update({ cancel_at: cancelAt, is_active: isActive }).eq('tenant_id', tenantId);

  return { status: 200, data: { cancel_at: cancelAt, is_active: isActive } };
}

export interface GetInvoicesOpts {
  tenantId: string;
  client: BillingDbClient;
  traceId: string;
}

// GET /billing/invoices — LIMIT 50 + truncated flag (Q-43.2, ISSUE-0033).
export async function handleGetInvoices(
  opts: GetInvoicesOpts,
): Promise<WebhookHandlerResult> {
  const { tenantId, client, traceId } = opts;

  // ISSUE-0033: v1 LIMIT 50 + truncated:boolean; cursor pagination deferred to v1.1.
  const result = await client
    .from('invoice')
    .select('id, stripe_invoice_id, amount_cents, currency, status, invoiced_at, paid_at, hosted_invoice_url, invoice_pdf_url')
    .eq('tenant_id', tenantId)
    .order('invoiced_at', { ascending: false })
    .limit(51);

  if (result.error !== null) {
    return { status: 500, data: { error: { code: 'INTERNAL_ERROR', message: result.error.message, trace_id: traceId } } };
  }

  const rows = result.data ?? [];
  const truncated = rows.length === 51;
  const invoices = rows.slice(0, 50);
  return { status: 200, data: { invoices, truncated } };
}

async function upsertInvoice(
  client: BillingDbClient,
  tenantId: string,
  obj: Record<string, unknown>,
  status: 'paid' | 'open',
): Promise<void> {
  const stripeInvoiceId = obj['id'] as string;
  const amountPaid = (obj['amount_paid'] as number | null) ?? (obj['amount_due'] as number | null) ?? 0;
  const currency = ((obj['currency'] as string | null) ?? 'aud').toUpperCase();
  const invoicedAt = obj['created'] != null
    ? new Date((obj['created'] as number) * 1000).toISOString()
    : new Date().toISOString();
  const paidAt = status === 'paid' && obj['status_transitions'] != null
    ? (() => {
        const ts = (obj['status_transitions'] as Record<string, unknown>)['paid_at'];
        return ts != null ? new Date((ts as number) * 1000).toISOString() : null;
      })()
    : null;

  await client.from('invoice').upsert(
    {
      tenant_id: tenantId,
      stripe_invoice_id: stripeInvoiceId,
      amount_cents: amountPaid,
      currency,
      status,
      hosted_invoice_url: (obj['hosted_invoice_url'] as string | null) ?? null,
      invoice_pdf_url: (obj['invoice_pdf'] as string | null) ?? null,
      invoiced_at: invoicedAt,
      paid_at: paidAt,
    },
    { onConflict: 'stripe_invoice_id' },
  );
}
