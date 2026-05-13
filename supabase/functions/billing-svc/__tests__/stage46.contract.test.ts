/**
 * billing-svc contract tests — Stage 46.
 *
 * Vitest in Node. Pure handler function tests; Deno dispatcher not exercised.
 *
 * Coverage (6 tests):
 *   customer.subscription.deleted with parent (2): ffp + notification.create enqueued; idempotency_key format
 *   customer.subscription.deleted no parent (1): ffp only; warn logged; 200 (no webhook failure)
 *   customer.subscription.deleted regression (1): is_active=false + tier=free
 *   handleCancelSubscription R1 regression (2): cancel_at_period_end true/false
 */
import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  handleStripeWebhook,
  handleCancelSubscription,
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
                eq(col2: string, val2: unknown) {
                  eqArgsList.push([col2, val2]);
                  return {
                    maybeSingle() {
                      const stub = getStub(table);
                      calls.push({ table, op: 'select', eqArgs: [...eqArgsList] });
                      return Promise.resolve({
                        data: (stub.data ?? null) as Record<string, unknown> | null,
                        error: (stub.error ?? null) as { message: string } | null,
                      });
                    },
                    order(_col: string, _opts: { ascending: boolean }) {
                      return {
                        limit(_n: number) {
                          const stub = getStub(table);
                          calls.push({ table, op: 'select', eqArgs: [...eqArgsList] });
                          return Promise.resolve({
                            data: (stub.data ?? null) as Array<Record<string, unknown>> | null,
                            error: (stub.error ?? null) as { message: string } | null,
                          });
                        },
                      };
                    },
                  };
                },
                maybeSingle() {
                  const stub = getStub(table);
                  calls.push({ table, op: 'select', eqArgs: [...eqArgsList] });
                  return Promise.resolve({
                    data: (stub.data ?? null) as Record<string, unknown> | null,
                    error: (stub.error ?? null) as { message: string } | null,
                  });
                },
                order(_col: string, _opts: { ascending: boolean }) {
                  return {
                    limit(_n: number) {
                      const stub = getStub(table);
                      calls.push({ table, op: 'select', eqArgs: [...eqArgsList] });
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
  } as unknown as BillingDbClient & { calls: CallRecord[] };
}

function buildStripe(opts: {
  shouldThrow?: boolean;
  event?: ReturnType<StripeClient['webhooks']['constructEvent']>;
  cancelAt?: number | null;
  subStatus?: string;
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
    subscriptions: {
      update: vi.fn().mockResolvedValue({
        cancel_at: opts.cancelAt !== undefined ? opts.cancelAt : null,
        status: opts.subStatus ?? 'active',
      }),
    },
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

const TENANT_ID          = 't0000046-0000-4000-8000-000000000001';
const PARENT_ID          = 'u0000046-0000-4000-8000-000000000001';
const STRIPE_CUSTOMER_ID = 'cus_test_00000046001';
const STRIPE_SUB_ID      = 'sub_test_00000046001';
const STRIPE_EVENT_ID    = 'evt_test_46000001';
const BILLING_EVENT_ID   = 'be000046-0000-4000-8000-000000000001';
const TRACE_ID           = 'trace-46-test';

const deletedObj = {
  customer: STRIPE_CUSTOMER_ID,
  id: STRIPE_SUB_ID,
};

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

// ─── customer.subscription.deleted — with parent user ────────────────────────

describe('customer.subscription.deleted — with parent user', () => {
  function deletedWithParentClient() {
    return buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null },
        { error: null },
      ],
      billing_customer: { data: { tenant_id: TENANT_ID }, error: null },
      subscription: { error: null },
      user_profile: { data: [{ id: PARENT_ID }], error: null },
      job_queue: [
        { data: [{ id: 'jq-ffp-46a' }], error: null },
        { data: [{ id: 'jq-nfp-46a' }], error: null },
      ],
    });
  }

  it('enqueues pipeline.feature_flag_propagate AND notification.create with access_downgraded + correct parent_id', async () => {
    const client = deletedWithParentClient();
    const event = makeEvent(STRIPE_EVENT_ID, 'customer.subscription.deleted', deletedObj);
    const result = await handleStripeWebhook(baseOpts({ client, stripe: buildStripe({ event }) }));
    expect(result.status).toBe(200);

    const jobInserts = client.calls.filter((c) => c.table === 'job_queue' && c.op === 'insert');
    expect(jobInserts).toHaveLength(2);

    const ffpJob = jobInserts.find(
      (c) => (c.row as Record<string, unknown>)['job_type'] === 'pipeline.feature_flag_propagate',
    );
    expect(ffpJob).toBeDefined();

    const nfpJob = jobInserts.find(
      (c) => (c.row as Record<string, unknown>)['job_type'] === 'notification.create',
    );
    expect(nfpJob).toBeDefined();
    const nfpPayload = (nfpJob!.row as Record<string, unknown>)['payload'] as Record<string, unknown>;
    expect(nfpPayload['notification_type']).toBe('access_downgraded');
    expect(nfpPayload['tenant_id']).toBe(TENANT_ID);
    expect(nfpPayload['parent_id']).toBe(PARENT_ID);
  });

  it('notification.create job idempotency_key is nfp-${event.id}', async () => {
    const client = deletedWithParentClient();
    const event = makeEvent(STRIPE_EVENT_ID, 'customer.subscription.deleted', deletedObj);
    await handleStripeWebhook(baseOpts({ client, stripe: buildStripe({ event }) }));

    const nfpJob = client.calls
      .filter((c) => c.table === 'job_queue' && c.op === 'insert')
      .find((c) => (c.row as Record<string, unknown>)['job_type'] === 'notification.create');
    expect(nfpJob).toBeDefined();
    expect((nfpJob!.row as Record<string, unknown>)['idempotency_key']).toBe(`nfp-${STRIPE_EVENT_ID}`);
  });
});

// ─── customer.subscription.deleted — no parent user ──────────────────────────

describe('customer.subscription.deleted — no parent user', () => {
  it('enqueues ffp only, logs warning, returns 200 (no webhook failure — ADR-0034 §3)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null },
        { error: null },
      ],
      billing_customer: { data: { tenant_id: TENANT_ID }, error: null },
      subscription: { error: null },
      user_profile: { data: [], error: null },
      job_queue: [
        { data: [{ id: 'jq-ffp-46b' }], error: null },
      ],
    });
    const event = makeEvent(STRIPE_EVENT_ID, 'customer.subscription.deleted', deletedObj);
    const result = await handleStripeWebhook(baseOpts({ client, stripe: buildStripe({ event }) }));
    expect(result.status).toBe(200);

    const jobInserts = client.calls.filter((c) => c.table === 'job_queue' && c.op === 'insert');
    expect(jobInserts).toHaveLength(1);
    expect((jobInserts[0]!.row as Record<string, unknown>)['job_type']).toBe('pipeline.feature_flag_propagate');

    const nfpJob = jobInserts.find(
      (c) => (c.row as Record<string, unknown>)['job_type'] === 'notification.create',
    );
    expect(nfpJob).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ─── customer.subscription.deleted — subscription state regression guard ─────

describe('customer.subscription.deleted — subscription state regression guard', () => {
  it('sets is_active=false and tier=free (R3 regression guard)', async () => {
    const client = buildClient({
      billing_event: [
        { data: [{ id: BILLING_EVENT_ID }], error: null },
        { error: null },
      ],
      billing_customer: { data: { tenant_id: TENANT_ID }, error: null },
      subscription: { error: null },
      user_profile: { data: [{ id: PARENT_ID }], error: null },
      job_queue: [
        { data: [{ id: 'jq-ffp-46c' }], error: null },
        { data: [{ id: 'jq-nfp-46c' }], error: null },
      ],
    });
    const event = makeEvent(STRIPE_EVENT_ID, 'customer.subscription.deleted', deletedObj);
    await handleStripeWebhook(baseOpts({ client, stripe: buildStripe({ event }) }));

    const subUpdate = client.calls.find((c) => c.table === 'subscription' && c.op === 'update');
    expect(subUpdate).toBeDefined();
    const patch = subUpdate!.row as Record<string, unknown>;
    expect(patch['is_active']).toBe(false);
    expect(patch['tier']).toBe('free');
  });
});

// ─── handleCancelSubscription R1 regression guard ────────────────────────────

describe('handleCancelSubscription — R1 regression guard (Stage 43)', () => {
  it('cancel path: stripe.subscriptions.update called with cancel_at_period_end=true', async () => {
    const client = buildClient({
      subscription: [
        { data: { stripe_subscription_id: STRIPE_SUB_ID, is_active: true }, error: null },
        { error: null },
      ],
    });
    const stripe = buildStripe({ cancelAt: 1800000000, subStatus: 'active' });
    const result = await handleCancelSubscription({
      tenantId: TENANT_ID, undo: false, stripe, client, traceId: TRACE_ID,
    });
    expect(result.status).toBe(200);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      STRIPE_SUB_ID,
      { cancel_at_period_end: true },
    );
  });

  it('undo path: stripe.subscriptions.update called with cancel_at_period_end=false', async () => {
    const client = buildClient({
      subscription: [
        { data: { stripe_subscription_id: STRIPE_SUB_ID, is_active: true }, error: null },
        { error: null },
      ],
    });
    const stripe = buildStripe({ cancelAt: null, subStatus: 'active' });
    const result = await handleCancelSubscription({
      tenantId: TENANT_ID, undo: true, stripe, client, traceId: TRACE_ID,
    });
    expect(result.status).toBe(200);
    expect(stripe.subscriptions.update).toHaveBeenCalledWith(
      STRIPE_SUB_ID,
      { cancel_at_period_end: false },
    );
  });
});
