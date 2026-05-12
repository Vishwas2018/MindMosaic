/**
 * billing-svc contract tests — Stage 43.
 *
 * Vitest in Node. Pure handler function tests; Deno dispatcher not exercised.
 * withIdempotency is mocked so tests focus on handler logic.
 *
 * Coverage (21 tests):
 *   handleGetPlans (2): plan catalog shape; popular flag
 *   handleGetSubscription (3): existing row; synthetic free-tier; DB error
 *   handleGetInvoices (3): empty list; LIMIT 50 + truncated; DB error
 *   handleCreateCheckout (5): unknown tier; unknown interval; happy path; existing customer; idempotency error
 *   handleCreatePortalSession (3): no billing_customer 404; DB error 500; happy path
 *   handleCancelSubscription (5): no subscription 404; no stripe_sub_id 400; schedule cancel; undo cancel; DB error
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  handleGetPlans,
  handleCreateCheckout,
  handleCreatePortalSession,
  handleGetSubscription,
  handleCancelSubscription,
  handleGetInvoices,
  type BillingDbClient,
  type StripeClient,
  type StripePriceIds,
} from '../handlers.ts';
import { withIdempotency, type HandlerOutcome } from '../../_shared/idempotency.ts';

vi.mock('../../_shared/idempotency.ts', () => ({
  withIdempotency: vi.fn(),
}));

const mockWithIdempotency = vi.mocked(withIdempotency);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID          = 't0000000-0000-4000-8000-000000000001';
const STRIPE_CUSTOMER_ID = 'cus_test_00000000001';
const STRIPE_SUB_ID      = 'sub_test_00000000001';
const TRACE_ID           = 'trace-43-test';

const PRICE_IDS: StripePriceIds = {
  standard_monthly: 'price_std_mo',
  standard_yearly:  'price_std_yr',
  premium_monthly:  'price_prm_mo',
  premium_yearly:   'price_prm_yr',
};

// ─── Mock harness ─────────────────────────────────────────────────────────────

interface TableStub {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

function buildClient(
  stubs: Record<string, TableStub | TableStub[]>,
): BillingDbClient & { calls: Array<{ table: string; op: string; row?: unknown }> } {
  const calls: Array<{ table: string; op: string; row?: unknown }> = [];
  const counters: Record<string, number> = {};

  function getStub(table: string): TableStub {
    const i = counters[table] ?? 0;
    counters[table] = i + 1;
    const entry = stubs[table];
    if (entry === undefined) throw new Error(`buildClient: unexpected table '${table}'`);
    return Array.isArray(entry) ? (entry[i] ?? entry[entry.length - 1]!) : entry;
  }

  return {
    calls,
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          return {
            select(_cols: string) {
              const stub = getStub(table);
              calls.push({ table, op: 'insert', row });
              return Promise.resolve({
                data: (stub.data ?? null) as Array<{ id: string }> | null,
                error: (stub.error ?? null) as { message: string; code?: string } | null,
              });
            },
          };
        },
        upsert(row: Record<string, unknown>, _opts?: { onConflict?: string }) {
          const stub = getStub(table);
          calls.push({ table, op: 'upsert', row });
          return Promise.resolve({ error: (stub.error ?? null) as { message: string } | null });
        },
        update(patch: Record<string, unknown>) {
          return {
            eq(_col: string, _val: unknown) {
              const stub = getStub(table);
              calls.push({ table, op: 'update', row: patch });
              return Promise.resolve({ error: (stub.error ?? null) as { message: string } | null });
            },
            match(_cond: Record<string, unknown>) {
              const stub = getStub(table);
              calls.push({ table, op: 'update', row: patch });
              return Promise.resolve({ error: (stub.error ?? null) as { message: string } | null });
            },
          };
        },
        select(_cols: string) {
          return {
            eq(_col: string, _val: unknown) {
              return {
                maybeSingle() {
                  const stub = getStub(table);
                  calls.push({ table, op: 'select' });
                  return Promise.resolve({
                    data: (stub.data ?? null) as Record<string, unknown> | null,
                    error: (stub.error ?? null) as { message: string } | null,
                  });
                },
                order(_col: string, _opts: { ascending: boolean }) {
                  return {
                    limit(_n: number) {
                      const stub = getStub(table);
                      calls.push({ table, op: 'select-list' });
                      return Promise.resolve({
                        data: (stub.data ?? null) as Array<Record<string, unknown>> | null,
                        error: (stub.error ?? null) as { message: string } | null,
                      });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as BillingDbClient & { calls: Array<{ table: string; op: string; row?: unknown }> };
}

function buildStripe(opts: {
  checkoutUrl?: string | null;
  sessionId?: string;
  portalUrl?: string;
  cancelAt?: number | null;
  subStatus?: string;
} = {}): StripeClient {
  return {
    webhooks: {
      constructEvent() { throw new Error('not used in stage43 tests'); },
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({
          id: opts.sessionId ?? 'cs_test_stage43',
          url: opts.checkoutUrl !== undefined ? opts.checkoutUrl : 'https://checkout.stripe.com/pay/cs_test_stage43',
        }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: opts.portalUrl ?? 'https://billing.stripe.com/session/portal_test' }),
      },
    },
    subscriptions: {
      update: vi.fn().mockResolvedValue({
        cancel_at: opts.cancelAt !== undefined ? opts.cancelAt : null,
        status: opts.subStatus ?? 'active',
      }),
    },
  };
}

afterEach(() => vi.clearAllMocks());

// ─── handleGetPlans ───────────────────────────────────────────────────────────

describe('handleGetPlans', () => {
  it('returns 200 with plan catalog; stripe price IDs merged from opts', () => {
    const result = handleGetPlans({ stripePriceIds: PRICE_IDS });
    expect(result.status).toBe(200);
    const plans = (result.data as { plans: Array<Record<string, unknown>> })['plans'];
    expect(plans).toHaveLength(2);
    const std = plans.find((p) => p['tier'] === 'standard');
    expect(std?.['stripe_price_monthly']).toBe('price_std_mo');
    expect(std?.['stripe_price_yearly']).toBe('price_std_yr');
    const prm = plans.find((p) => p['tier'] === 'premium');
    expect(prm?.['stripe_price_monthly']).toBe('price_prm_mo');
  });

  it('standard is popular; premium is not', () => {
    const result = handleGetPlans({ stripePriceIds: PRICE_IDS });
    const plans = (result.data as { plans: Array<Record<string, unknown>> })['plans'];
    expect(plans.find((p) => p['tier'] === 'standard')?.['popular']).toBe(true);
    expect(plans.find((p) => p['tier'] === 'premium')?.['popular']).toBe(false);
  });
});

// ─── handleGetSubscription ────────────────────────────────────────────────────

describe('handleGetSubscription', () => {
  it('returns existing subscription row from DB', async () => {
    const dbRow = {
      tier: 'standard',
      is_active: true,
      started_at: '2025-01-01T00:00:00.000Z',
      current_period_end: '2025-02-01T00:00:00.000Z',
      cancel_at: null,
      canceled_at: null,
      stripe_subscription_id: STRIPE_SUB_ID,
    };
    const client = buildClient({ subscription: { data: dbRow, error: null } });
    const result = await handleGetSubscription({ tenantId: TENANT_ID, client, traceId: TRACE_ID });
    expect(result.status).toBe(200);
    expect(result.data['tier']).toBe('standard');
    expect(result.data['stripe_subscription_id']).toBe(STRIPE_SUB_ID);
  });

  it('returns synthetic free-tier when no subscription row exists', async () => {
    const client = buildClient({ subscription: { data: null, error: null } });
    const result = await handleGetSubscription({ tenantId: TENANT_ID, client, traceId: TRACE_ID });
    expect(result.status).toBe(200);
    expect(result.data['tier']).toBe('free');
    expect(result.data['is_active']).toBe(true);
    expect(result.data['stripe_subscription_id']).toBeNull();
  });

  it('returns 500 on DB error', async () => {
    const client = buildClient({ subscription: { data: null, error: { message: 'DB failure' } } });
    const result = await handleGetSubscription({ tenantId: TENANT_ID, client, traceId: TRACE_ID });
    expect(result.status).toBe(500);
    expect((result.data['error'] as Record<string, unknown>)['code']).toBe('INTERNAL_ERROR');
  });
});

// ─── handleGetInvoices ────────────────────────────────────────────────────────

describe('handleGetInvoices', () => {
  it('returns empty invoice list with truncated=false', async () => {
    const client = buildClient({ invoice: { data: [], error: null } });
    const result = await handleGetInvoices({ tenantId: TENANT_ID, client, traceId: TRACE_ID });
    expect(result.status).toBe(200);
    expect(result.data['invoices']).toHaveLength(0);
    expect(result.data['truncated']).toBe(false);
  });

  it('returns first 50 + truncated=true when DB returns 51 rows', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({ id: `inv-${String(i).padStart(3, '0')}` }));
    const client = buildClient({ invoice: { data: rows, error: null } });
    const result = await handleGetInvoices({ tenantId: TENANT_ID, client, traceId: TRACE_ID });
    expect(result.status).toBe(200);
    expect((result.data['invoices'] as unknown[]).length).toBe(50);
    expect(result.data['truncated']).toBe(true);
  });

  it('returns 500 on DB error', async () => {
    const client = buildClient({ invoice: { data: null, error: { message: 'timeout' } } });
    const result = await handleGetInvoices({ tenantId: TENANT_ID, client, traceId: TRACE_ID });
    expect(result.status).toBe(500);
    expect((result.data['error'] as Record<string, unknown>)['code']).toBe('INTERNAL_ERROR');
  });
});

// ─── handleCreateCheckout ─────────────────────────────────────────────────────

describe('handleCreateCheckout', () => {
  const baseCheckoutBody = {
    tier: 'standard',
    billing_interval: 'monthly' as const,
    success_url: 'https://app.example.com/billing/success',
    cancel_url: 'https://app.example.com/billing/cancel',
  };

  it('returns 400 for unknown tier', async () => {
    const client = buildClient({});
    const result = await handleCreateCheckout({
      body: { ...baseCheckoutBody, tier: 'institutional' },
      idempotencyKey: 'idk-001',
      tenantId: TENANT_ID,
      stripe: buildStripe(),
      client,
      traceId: TRACE_ID,
      stripePriceIds: PRICE_IDS,
    });
    expect(result.status).toBe(400);
    expect((result.data['error'] as Record<string, unknown>)['code']).toBe('INVALID_PLAN');
  });

  it('returns 400 for unknown billing_interval', async () => {
    const client = buildClient({});
    const result = await handleCreateCheckout({
      body: { ...baseCheckoutBody, billing_interval: 'quarterly' as 'monthly' },
      idempotencyKey: 'idk-002',
      tenantId: TENANT_ID,
      stripe: buildStripe(),
      client,
      traceId: TRACE_ID,
      stripePriceIds: PRICE_IDS,
    });
    expect(result.status).toBe(400);
  });

  it('happy path: calls withIdempotency and returns checkout_url + session_id', async () => {
    const expectedData = { checkout_url: 'https://checkout.stripe.com/pay/cs_test_stage43', session_id: 'cs_test_stage43' };
    mockWithIdempotency.mockImplementation(async (opts) => {
      const outcome = await (opts.handler as () => Promise<HandlerOutcome<typeof expectedData>>)();
      return { ok: true as const, data: outcome.data, fromCache: false, status: outcome.status };
    });
    const client = buildClient({ billing_customer: { data: null, error: null } });
    const result = await handleCreateCheckout({
      body: baseCheckoutBody,
      idempotencyKey: 'idk-003',
      tenantId: TENANT_ID,
      stripe: buildStripe(),
      client,
      traceId: TRACE_ID,
      stripePriceIds: PRICE_IDS,
    });
    expect(result.status).toBe(200);
    expect(result.data['checkout_url']).toContain('checkout.stripe.com');
    expect(result.data['session_id']).toBe('cs_test_stage43');
    expect(mockWithIdempotency).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'idk-003', tenantId: TENANT_ID, endpoint: '/billing/checkout' }),
    );
  });

  it('passes existing Stripe customer ID when billing_customer exists', async () => {
    const stripe = buildStripe();
    mockWithIdempotency.mockImplementation(async (opts) => {
      const outcome = await (opts.handler as () => Promise<HandlerOutcome<Record<string, unknown>>>)();
      return { ok: true as const, data: outcome.data, fromCache: false, status: outcome.status };
    });
    const client = buildClient({
      billing_customer: { data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null },
    });
    await handleCreateCheckout({
      body: baseCheckoutBody,
      idempotencyKey: 'idk-004',
      tenantId: TENANT_ID,
      stripe,
      client,
      traceId: TRACE_ID,
      stripePriceIds: PRICE_IDS,
    });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: STRIPE_CUSTOMER_ID }),
    );
  });

  it('returns error when withIdempotency returns ok=false', async () => {
    mockWithIdempotency.mockResolvedValue({
      ok: false,
      status: 409,
      code: 'IDEMPOTENCY_IN_FLIGHT',
      message: 'Concurrent request',
    });
    const client = buildClient({ billing_customer: { data: null, error: null } });
    const result = await handleCreateCheckout({
      body: baseCheckoutBody,
      idempotencyKey: 'idk-005',
      tenantId: TENANT_ID,
      stripe: buildStripe(),
      client,
      traceId: TRACE_ID,
      stripePriceIds: PRICE_IDS,
    });
    expect(result.status).toBe(409);
    expect((result.data['error'] as Record<string, unknown>)['code']).toBe('IDEMPOTENCY_IN_FLIGHT');
  });
});

// ─── handleCreatePortalSession ────────────────────────────────────────────────

describe('handleCreatePortalSession', () => {
  it('returns 404 when no billing_customer exists for tenant', async () => {
    const client = buildClient({ billing_customer: { data: null, error: null } });
    const result = await handleCreatePortalSession({
      tenantId: TENANT_ID,
      stripe: buildStripe(),
      client,
      traceId: TRACE_ID,
      returnUrl: 'https://app.example.com/billing',
    });
    expect(result.status).toBe(404);
    expect((result.data['error'] as Record<string, unknown>)['code']).toBe('NO_BILLING_CUSTOMER');
  });

  it('returns 500 on DB error', async () => {
    const client = buildClient({ billing_customer: { data: null, error: { message: 'DB failure' } } });
    const result = await handleCreatePortalSession({
      tenantId: TENANT_ID,
      stripe: buildStripe(),
      client,
      traceId: TRACE_ID,
      returnUrl: 'https://app.example.com/billing',
    });
    expect(result.status).toBe(500);
  });

  it('happy path: creates portal session and returns portal_url', async () => {
    const client = buildClient({
      billing_customer: { data: { stripe_customer_id: STRIPE_CUSTOMER_ID }, error: null },
    });
    const stripe = buildStripe({ portalUrl: 'https://billing.stripe.com/portal/session_abc' });
    const result = await handleCreatePortalSession({
      tenantId: TENANT_ID,
      stripe,
      client,
      traceId: TRACE_ID,
      returnUrl: 'https://app.example.com/billing',
    });
    expect(result.status).toBe(200);
    expect(result.data['portal_url']).toBe('https://billing.stripe.com/portal/session_abc');
    expect(stripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: STRIPE_CUSTOMER_ID }),
    );
  });
});

// ─── handleCancelSubscription ─────────────────────────────────────────────────

describe('handleCancelSubscription', () => {
  it('returns 404 when no subscription row exists', async () => {
    const client = buildClient({ subscription: { data: null, error: null } });
    const result = await handleCancelSubscription({
      tenantId: TENANT_ID, undo: false, stripe: buildStripe(), client, traceId: TRACE_ID,
    });
    expect(result.status).toBe(404);
    expect((result.data['error'] as Record<string, unknown>)['code']).toBe('NO_SUBSCRIPTION');
  });

  it('returns 400 when subscription has no stripe_subscription_id', async () => {
    const client = buildClient({
      subscription: { data: { stripe_subscription_id: null, is_active: true }, error: null },
    });
    const result = await handleCancelSubscription({
      tenantId: TENANT_ID, undo: false, stripe: buildStripe(), client, traceId: TRACE_ID,
    });
    expect(result.status).toBe(400);
    expect((result.data['error'] as Record<string, unknown>)['code']).toBe('NO_STRIPE_SUBSCRIPTION');
  });

  it('schedules cancellation at period end (undo=false)', async () => {
    const periodEndUnix = 1780000000; // far-future unix
    const client = buildClient({
      subscription: [
        { data: { stripe_subscription_id: STRIPE_SUB_ID, is_active: true }, error: null },
        { data: null, error: null }, // update call
      ],
    });
    const stripe = buildStripe({ cancelAt: periodEndUnix, subStatus: 'active' });
    const result = await handleCancelSubscription({
      tenantId: TENANT_ID, undo: false, stripe, client, traceId: TRACE_ID,
    });
    expect(result.status).toBe(200);
    expect(result.data['cancel_at']).not.toBeNull();
    expect(result.data['is_active']).toBe(true);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(STRIPE_SUB_ID, { cancel_at_period_end: true });
  });

  it('undoes cancellation (undo=true) — cancel_at becomes null', async () => {
    const client = buildClient({
      subscription: [
        { data: { stripe_subscription_id: STRIPE_SUB_ID, is_active: true }, error: null },
        { data: null, error: null },
      ],
    });
    const stripe = buildStripe({ cancelAt: null, subStatus: 'active' });
    const result = await handleCancelSubscription({
      tenantId: TENANT_ID, undo: true, stripe, client, traceId: TRACE_ID,
    });
    expect(result.status).toBe(200);
    expect(result.data['cancel_at']).toBeNull();
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(STRIPE_SUB_ID, { cancel_at_period_end: false });
  });

  it('returns 500 on subscription DB error', async () => {
    const client = buildClient({
      subscription: { data: null, error: { message: 'DB timeout' } },
    });
    const result = await handleCancelSubscription({
      tenantId: TENANT_ID, undo: false, stripe: buildStripe(), client, traceId: TRACE_ID,
    });
    expect(result.status).toBe(500);
  });
});
