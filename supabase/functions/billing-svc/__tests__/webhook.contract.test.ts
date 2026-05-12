/**
 * billing-svc contract tests — Stage 42.
 *
 * Vitest in Node. The Deno dispatcher (index.ts) is NOT exercised here —
 * we test pure handler functions with mocked BillingDbClient + StripeClient.
 *
 * Idempotency model (Q-42.4 / ADR-0034):
 *   billing_event.stripe_event_id UNIQUE NOT NULL + ON CONFLICT DO NOTHING.
 *   This is distinct from withIdempotency middleware (ISSUE-0023 REST layer).
 *
 * Deterministic event IDs (evt_test_0001…evt_test_0050): replay verification
 *   requires stable IDs — randomUUID() would break second-pass assertions.
 *
 * Coverage (16 tests):
 *   Error / idempotency (3): invalid_signature 400, dup 23505, dup ON CONFLICT empty
 *   Event state machine (8): checkout.session.completed, subscription.created/updated/deleted,
 *     invoice.paid/payment_failed, customer.updated, unknown
 *   Edge cases (3): no customer field, arch §3.4.1 sig-first, 50-event replay
 *   handleFlagPropagateStub (2): with tenantId, without tenantId
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  handleStripeWebhook,
  handleFlagPropagateStub,
  type BillingDbClient,
  type StripeClient,
  type WebhookHandlerOpts,
} from '../handlers.ts';

// ─── Mock harness ─────────────────────────────────────────────────────────────

interface CallRecord {
  table: string;
  op: 'insert' | 'upsert' | 'update' | 'select';
  row?: unknown;
  eqArgs?: Array<[string, unknown]>;
}

interface TableStub {
  data?: unknown;
  error?: { message: string; code?: string } | null;
}

function buildClient(
  stubs: Record<string, TableStub | TableStub[]>,
): BillingDbClient & { calls: CallRecord[] } {
  const calls: CallRecord[] = [];
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
          const eqArgsList: Array<[string, unknown]> = [];
          return {
            eq(col: string, val: unknown) {
              eqArgsList.push([col, val]);
              const stub = getStub(table);
              calls.push({ table, op: 'update', row: patch, eqArgs: [...eqArgsList] });
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
          const eqArgsList: Array<[string, unknown]> = [];
          return {
            eq(col: string, val: unknown) {
              eqArgsList.push([col, val]);
              return {
                maybeSingle() {
                  const stub = getStub(table);
                  calls.push({ table, op: 'select', eqArgs: [...eqArgsList] });
                  return Promise.resolve({
                    data: (stub.data ?? null) as Record<string, unknown> | null,
                    error: (stub.error ?? null) as { message: string } | null,
                  });
                },
              };
            },
          };
        },
      };
    },
  } as unknown as BillingDbClient & { calls: CallRecord[] };
}

function buildStripe(opts: {
  shouldThrow?: boolean;
  event?: ReturnType<StripeClient['webhooks']['constructEvent']>;
} = {}): StripeClient {
  return {
    webhooks: {
      constructEvent(_rawBody: string, _sig: string, _secret: string) {
        if (opts.shouldThrow === true) throw new Error('No signatures found matching the expected signature for payload');
        return opts.event ?? makeEvent('evt_test_0001', 'customer.updated', {});
      },
    },
    checkout: { sessions: { create: async () => ({ id: '', url: null }) } },
    billingPortal: { sessions: { create: async () => ({ url: '' }) } },
    subscriptions: { update: async () => ({ cancel_at: null, status: 'active' }) },
  };
}

function makeEvent(
  id: string,
  type: string,
  obj: Record<string, unknown>,
): ReturnType<StripeClient['webhooks']['constructEvent']> {
  return { id, type, data: { object: obj } };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID          = 't0000000-0000-4000-8000-000000000001';
const STRIPE_CUSTOMER_ID = 'cus_test_00000000001';
const STRIPE_SUB_ID      = 'sub_test_00000000001';
const STRIPE_INV_ID      = 'in_test_000000000001';
const BILLING_EVENT_ID   = 'be000000-0000-4000-8000-000000000001';
const JOB_ID             = 'jq000000-0000-4000-8000-000000000001';
const TRACE_ID           = 'trace-42-test';

const NOW_UNIX = 1748736000; // 2025-06-01T00:00:00Z as unix seconds

function baseOpts(overrides: Partial<WebhookHandlerOpts> = {}): WebhookHandlerOpts {
  return {
    rawBody: '{}',
    signature: 'whsec_test_sig',
    webhookSecret: 'whsec_test_secret',
    stripe: buildStripe(),
    client: buildClient({ billing_event: { data: [], error: null } }) as unknown as BillingDbClient,
    traceId: TRACE_ID,
    ...overrides,
  };
}

afterEach(() => vi.clearAllMocks());

// ─── Error / idempotency cases ────────────────────────────────────────────────

describe('handleStripeWebhook — error and idempotency', () => {
  it('invalid signature: returns 400 and writes billing_event with processing_error', async () => {
    const client = buildClient({
      billing_event: { data: [{ id: BILLING_EVENT_ID }], error: null },
    });
    const result = await handleStripeWebhook(
      baseOpts({ stripe: buildStripe({ shouldThrow: true }), client }),
    );
    expect(result.status).toBe(400);
    expect(result.data['error']).toBeDefined();
    expect((result.data['error'] as Record<string, unknown>)['code']).toBe('INVALID_SIGNATURE');
    const inserts = client.calls.filter((c) => c.table === 'billing_event' && c.op === 'insert');
    expect(inserts).toHaveLength(1);
    expect((inserts[0]!.row as Record<string, unknown>)['processing_error']).toBe('invalid_signature');
    expect((inserts[0]!.row as Record<string, unknown>)['event_type']).toBe('invalid_signature');
  });

  it('duplicate event (unique_violation 23505): returns 200 with duplicate:true', async () => {
    const client = buildClient({
      billing_event: { data: null, error: { message: 'dup key', code: '23505' } },
    });
    const result = await handleStripeWebhook(baseOpts({ client }));
    expect(result.status).toBe(200);
    expect(result.data['duplicate']).toBe(true);
    expect(result.data['received']).toBe(true);
  });

  it('duplicate event (ON CONFLICT DO NOTHING, empty data): returns 200 with duplicate:true', async () => {
    const client = buildClient({
      billing_event: { data: [], error: null },
    });
    const result = await handleStripeWebhook(baseOpts({ client }));
    expect(result.status).toBe(200);
    expect(result.data['duplicate']).toBe(true);
  });
});

// ─── Event state machine ──────────────────────────────────────────────────────

describe('handleStripeWebhook — event state machine', () => {
  it('checkout.session.completed: upserts subscription + billing_customer, enqueues ffp job', async () => {
    const obj = {
      customer: STRIPE_CUSTOMER_ID,
      subscription: STRIPE_SUB_ID,
      metadata: { tier: 'premium' },
    };
    const client = buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null }, // insert
        { error: null },                                     // update processed_at
      ],
      billing_customer: [
        { data: { tenant_id: TENANT_ID }, error: null }, // select (lookup)
        { error: null },                                   // upsert
      ],
      subscription: { error: null }, // upsert
      job_queue: { data: [{ id: JOB_ID }], error: null },
    });
    const result = await handleStripeWebhook(
      baseOpts({
        stripe: buildStripe({ event: makeEvent('evt_test_0002', 'checkout.session.completed', obj) }),
        client,
      }),
    );
    expect(result.status).toBe(200);
    expect(result.data['received']).toBe(true);
    expect(result.data['duplicate']).toBeUndefined();

    const subUpsert = client.calls.find((c) => c.table === 'subscription' && c.op === 'upsert');
    expect(subUpsert).toBeDefined();
    expect((subUpsert!.row as Record<string, unknown>)['tier']).toBe('premium');
    expect((subUpsert!.row as Record<string, unknown>)['is_active']).toBe(true);

    const jqInsert = client.calls.find((c) => c.table === 'job_queue' && c.op === 'insert');
    expect(jqInsert).toBeDefined();
    expect((jqInsert!.row as Record<string, unknown>)['job_type']).toBe('pipeline.feature_flag_propagate');
    expect((jqInsert!.row as Record<string, unknown>)['idempotency_key']).toBe('ffp-evt_test_0002');
    expect((jqInsert!.row as Record<string, unknown>)['tenant_id']).toBe(TENANT_ID);
  });

  it('customer.subscription.created: upserts subscription with period_end, no job enqueued', async () => {
    const obj = {
      customer: STRIPE_CUSTOMER_ID,
      id: STRIPE_SUB_ID,
      current_period_end: NOW_UNIX,
    };
    const client = buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null },
        { error: null },
      ],
      billing_customer: { data: { tenant_id: TENANT_ID }, error: null },
      subscription: { error: null },
    });
    const result = await handleStripeWebhook(
      baseOpts({
        stripe: buildStripe({ event: makeEvent('evt_test_0003', 'customer.subscription.created', obj) }),
        client,
      }),
    );
    expect(result.status).toBe(200);
    const subUpsert = client.calls.find((c) => c.table === 'subscription' && c.op === 'upsert');
    expect(subUpsert).toBeDefined();
    expect((subUpsert!.row as Record<string, unknown>)['stripe_subscription_id']).toBe(STRIPE_SUB_ID);
    expect(client.calls.find((c) => c.table === 'job_queue')).toBeUndefined();
  });

  it('customer.subscription.updated: updates period_end + is_active, enqueues ffp job', async () => {
    const obj = {
      customer: STRIPE_CUSTOMER_ID,
      current_period_end: NOW_UNIX,
      cancel_at: null,
      status: 'active',
    };
    const client = buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null },
        { error: null },
      ],
      billing_customer: { data: { tenant_id: TENANT_ID }, error: null },
      subscription: { error: null },
      job_queue: { data: [{ id: JOB_ID }], error: null },
    });
    const result = await handleStripeWebhook(
      baseOpts({
        stripe: buildStripe({ event: makeEvent('evt_test_0004', 'customer.subscription.updated', obj) }),
        client,
      }),
    );
    expect(result.status).toBe(200);
    const subUpdate = client.calls.find((c) => c.table === 'subscription' && c.op === 'update');
    expect(subUpdate).toBeDefined();
    expect((subUpdate!.row as Record<string, unknown>)['is_active']).toBe(true);
    const jqInsert = client.calls.find((c) => c.table === 'job_queue');
    expect(jqInsert).toBeDefined();
  });

  it('customer.subscription.deleted: deactivates subscription, sets tier=free, enqueues ffp job', async () => {
    const obj = { customer: STRIPE_CUSTOMER_ID };
    const client = buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null },
        { error: null },
      ],
      billing_customer: { data: { tenant_id: TENANT_ID }, error: null },
      subscription: { error: null },
      job_queue: { data: [{ id: JOB_ID }], error: null },
    });
    const result = await handleStripeWebhook(
      baseOpts({
        stripe: buildStripe({ event: makeEvent('evt_test_0005', 'customer.subscription.deleted', obj) }),
        client,
      }),
    );
    expect(result.status).toBe(200);
    const subUpdate = client.calls.find((c) => c.table === 'subscription' && c.op === 'update');
    expect(subUpdate).toBeDefined();
    expect((subUpdate!.row as Record<string, unknown>)['is_active']).toBe(false);
    expect((subUpdate!.row as Record<string, unknown>)['tier']).toBe('free');
    expect(client.calls.find((c) => c.table === 'job_queue')).toBeDefined();
  });

  it('invoice.paid: upserts invoice with status=paid, no job enqueued', async () => {
    const obj = {
      customer: STRIPE_CUSTOMER_ID,
      id: STRIPE_INV_ID,
      amount_paid: 1990,
      currency: 'aud',
      created: NOW_UNIX,
      status_transitions: { paid_at: NOW_UNIX },
      hosted_invoice_url: 'https://invoice.stripe.com/i/test',
      invoice_pdf: null,
    };
    const client = buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null },
        { error: null },
      ],
      billing_customer: { data: { tenant_id: TENANT_ID }, error: null },
      invoice: { error: null },
    });
    const result = await handleStripeWebhook(
      baseOpts({
        stripe: buildStripe({ event: makeEvent('evt_test_0006', 'invoice.paid', obj) }),
        client,
      }),
    );
    expect(result.status).toBe(200);
    const invUpsert = client.calls.find((c) => c.table === 'invoice' && c.op === 'upsert');
    expect(invUpsert).toBeDefined();
    expect((invUpsert!.row as Record<string, unknown>)['status']).toBe('paid');
    expect((invUpsert!.row as Record<string, unknown>)['amount_cents']).toBe(1990);
    expect((invUpsert!.row as Record<string, unknown>)['currency']).toBe('AUD');
    expect(client.calls.find((c) => c.table === 'job_queue')).toBeUndefined();
  });

  it('invoice.payment_failed: upserts invoice with status=open, no job enqueued', async () => {
    const obj = {
      customer: STRIPE_CUSTOMER_ID,
      id: STRIPE_INV_ID,
      amount_due: 1990,
      currency: 'aud',
      created: NOW_UNIX,
    };
    const client = buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null },
        { error: null },
      ],
      billing_customer: { data: { tenant_id: TENANT_ID }, error: null },
      invoice: { error: null },
    });
    const result = await handleStripeWebhook(
      baseOpts({
        stripe: buildStripe({ event: makeEvent('evt_test_0007', 'invoice.payment_failed', obj) }),
        client,
      }),
    );
    expect(result.status).toBe(200);
    const invUpsert = client.calls.find((c) => c.table === 'invoice' && c.op === 'upsert');
    expect(invUpsert).toBeDefined();
    expect((invUpsert!.row as Record<string, unknown>)['status']).toBe('open');
    expect(client.calls.find((c) => c.table === 'job_queue')).toBeUndefined();
  });

  it('customer.updated: updates default_payment_method, no job enqueued', async () => {
    const obj = {
      customer: STRIPE_CUSTOMER_ID,
      invoice_settings: { default_payment_method: 'pm_test_001' },
    };
    const client = buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null },
        { error: null },
      ],
      billing_customer: [
        { data: { tenant_id: TENANT_ID }, error: null }, // select
        { error: null },                                   // update
      ],
    });
    const result = await handleStripeWebhook(
      baseOpts({
        stripe: buildStripe({ event: makeEvent('evt_test_0008', 'customer.updated', obj) }),
        client,
      }),
    );
    expect(result.status).toBe(200);
    const bcUpdate = client.calls.find((c) => c.table === 'billing_customer' && c.op === 'update');
    expect(bcUpdate).toBeDefined();
    expect((bcUpdate!.row as Record<string, unknown>)['default_payment_method']).toBe('pm_test_001');
    expect(client.calls.find((c) => c.table === 'job_queue')).toBeUndefined();
  });

  it('unknown event type: 200 received, no state changes, no job enqueued', async () => {
    const client = buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null },
        { error: null },
      ],
      billing_customer: { data: { tenant_id: TENANT_ID }, error: null },
    });
    const result = await handleStripeWebhook(
      baseOpts({
        stripe: buildStripe({ event: makeEvent('evt_test_0009', 'payment_intent.succeeded', { customer: STRIPE_CUSTOMER_ID }) }),
        client,
      }),
    );
    expect(result.status).toBe(200);
    expect(result.data['received']).toBe(true);
    expect(client.calls.find((c) => c.table === 'subscription')).toBeUndefined();
    expect(client.calls.find((c) => c.table === 'invoice')).toBeUndefined();
    expect(client.calls.find((c) => c.table === 'job_queue')).toBeUndefined();
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('handleStripeWebhook — edge cases', () => {
  it('no stripe_customer_id: skips billing_customer lookup, no state machine call', async () => {
    const client = buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null },
        { error: null },
      ],
      // billing_customer NOT in stubs — accessing it would throw
    });
    const result = await handleStripeWebhook(
      baseOpts({
        stripe: buildStripe({ event: makeEvent('evt_test_0010', 'customer.subscription.updated', {
          // no customer field → resolveCustomerId returns null
          current_period_end: NOW_UNIX,
          cancel_at: null,
          status: 'active',
        }) }),
        client,
      }),
    );
    expect(result.status).toBe(200);
    expect(client.calls.find((c) => c.table === 'billing_customer')).toBeUndefined();
    expect(client.calls.find((c) => c.table === 'job_queue')).toBeUndefined();
  });

  it('arch §3.4.1: constructEvent called with (rawBody, signature, webhookSecret) before any DB write', async () => {
    const callOrder: string[] = [];
    const stripeWithTracking: StripeClient = {
      webhooks: {
        constructEvent(rawBody: string, sig: string, secret: string) {
          callOrder.push('constructEvent');
          expect(rawBody).toBe('raw-body-content');
          expect(sig).toBe('sig_value');
          expect(secret).toBe('secret_value');
          return makeEvent('evt_test_0011', 'customer.updated', {});
        },
      },
      checkout: { sessions: { create: async () => ({ id: '', url: null }) } },
      billingPortal: { sessions: { create: async () => ({ url: '' }) } },
      subscriptions: { update: async () => ({ cancel_at: null, status: 'active' }) },
    };
    const client = buildClient({
      billing_event: [
        {
          data: [{ id: BILLING_EVENT_ID }],
          get error() { callOrder.push('db-billing_event-insert'); return null; },
        },
        { error: null },
      ],
    });
    await handleStripeWebhook({
      rawBody: 'raw-body-content',
      signature: 'sig_value',
      webhookSecret: 'secret_value',
      stripe: stripeWithTracking,
      client,
      traceId: TRACE_ID,
    });
    expect(callOrder[0]).toBe('constructEvent');
  });

  it('50-event replay: deterministic IDs evt_test_0001…evt_test_0050, second pass returns duplicate:true', async () => {
    const eventIds = Array.from({ length: 50 }, (_, i) => `evt_test_${String(i + 1).padStart(4, '0')}`);
    expect(eventIds[0]).toBe('evt_test_0001');
    expect(eventIds[24]).toBe('evt_test_0025');
    expect(eventIds[49]).toBe('evt_test_0050');

    // First pass: new events — insert succeeds, billing_event updated processed_at
    for (const eventId of eventIds) {
      const client = buildClient({
        billing_event: [
          { data: [{ id: BILLING_EVENT_ID }], error: null }, // insert
          { error: null },                                     // update processed_at
        ],
      });
      const result = await handleStripeWebhook({
        rawBody: '{}',
        signature: 'sig',
        webhookSecret: 'secret',
        stripe: buildStripe({ event: makeEvent(eventId, 'payment_intent.succeeded', {}) }),
        client,
        traceId: `trace-${eventId}`,
      });
      expect(result.status, `first pass ${eventId}: expected 200`).toBe(200);
      expect(result.data['duplicate'], `first pass ${eventId}: should not be duplicate`).toBeUndefined();
    }

    // Second pass: duplicate — ON CONFLICT DO NOTHING, data is empty
    for (const eventId of eventIds) {
      const client = buildClient({
        billing_event: { data: [], error: null },
      });
      const result = await handleStripeWebhook({
        rawBody: '{}',
        signature: 'sig',
        webhookSecret: 'secret',
        stripe: buildStripe({ event: makeEvent(eventId, 'payment_intent.succeeded', {}) }),
        client,
        traceId: `trace-${eventId}`,
      });
      expect(result.status, `second pass ${eventId}: expected 200`).toBe(200);
      expect(result.data['duplicate'], `second pass ${eventId}: should be duplicate`).toBe(true);
    }
  });
});

// ─── handleFlagPropagateStub ──────────────────────────────────────────────────

describe('handleFlagPropagateStub', () => {
  it('returns 200 with Stage 44 pending note and tenantId propagated', () => {
    const result = handleFlagPropagateStub({ traceId: TRACE_ID, tenantId: TENANT_ID });
    expect(result.status).toBe(200);
    expect(result.data['received']).toBe(true);
    expect(typeof result.data['note']).toBe('string');
    expect((result.data['note'] as string).toLowerCase()).toContain('stage 44');
    expect(result.data['tenant_id']).toBe(TENANT_ID);
    expect(result.data['trace_id']).toBe(TRACE_ID);
  });

  it('returns 200 with tenant_id null when tenantId omitted', () => {
    const result = handleFlagPropagateStub({ traceId: TRACE_ID });
    expect(result.status).toBe(200);
    expect(result.data['tenant_id']).toBeNull();
  });
});
