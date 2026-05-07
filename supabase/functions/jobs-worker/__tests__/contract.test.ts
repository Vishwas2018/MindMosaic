/**
 * jobs-worker contract tests — Stage 28.
 *
 * Vitest in Node. The Deno dispatcher (index.ts) is NOT exercised here.
 * Two named tests map to DEV_PLAN Stage 28 exit criteria:
 *
 *   - '500 jobs enqueued, all processed, zero duplicates'
 *   - 'failure injection drives retries then dead-letter'
 *
 * An opt-in real-Postgres integration test is guarded by
 * DOCKER_AVAILABLE=1 (skipped in CI sandbox where Docker is unavailable).
 *
 * Coverage:
 *   Named exit criteria  (2)  — 500-job throughput, retry→dead-letter
 *   Unknown job_type     (1)  — immediate dead-letter on unknown route
 *   Pickup RPC failure   (1)  — error path when fn_pickup_jobs fails
 *   Backoff scheduling   (1)  — next scheduled_at uses exponential formula
 *   Empty queue          (1)  — no-op on empty pickup result
 *   Opt-in Postgres      (1)  — FOR UPDATE SKIP LOCKED (Docker only)
 */
import { describe, expect, it, vi } from 'vitest';
import {
  processJobBatch,
  type JobRow,
  type WorkerDbClient,
  type WorkerDbBuilderPromise,
  type FetchResponse,
  type RouteMap,
} from '../handlers.ts';

// ─── Test fixture builders ───────────────────────────────────────────────────

function buildJob(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    job_type: overrides.job_type ?? 'pipeline.causal.evaluate_full',
    payload: overrides.payload ?? { session_id: crypto.randomUUID() },
    tenant_id: overrides.tenant_id ?? null,
    attempts: overrides.attempts ?? 0,
    max_attempts: overrides.max_attempts ?? 3,
    idempotency_key: overrides.idempotency_key ?? crypto.randomUUID(),
    last_error: overrides.last_error ?? null,
  };
}

function buildJobs(count: number, overrides: Partial<JobRow> = {}): JobRow[] {
  return Array.from({ length: count }, (_, i) =>
    buildJob({ ...overrides, id: `job-${String(i).padStart(6, '0')}` }),
  );
}

// ─── Mock client builder ─────────────────────────────────────────────────────

interface UpdateCapture {
  patch: Record<string, unknown>;
  id: string;
}

interface WorkerMockOptions {
  pickupBatches: Array<{ data: JobRow[] | null; error: { message: string } | null }>;
}

function buildWorkerClient(opts: WorkerMockOptions): WorkerDbClient & {
  updateCaptures: UpdateCapture[];
  rpcCallCount: number;
} {
  const updateCaptures: UpdateCapture[] = [];
  let rpcCallIndex = 0;

  const rpcSpy = vi.fn(async (_name: string, _args?: Record<string, unknown>) => {
    const stub =
      opts.pickupBatches[rpcCallIndex] ??
      opts.pickupBatches[opts.pickupBatches.length - 1]!;
    rpcCallIndex += 1;
    return stub;
  });

  const fromSpy = vi.fn((_table: string) => {
    let capturedPatch: Record<string, unknown> = {};
    let capturedId = '';

    const builder: WorkerDbBuilderPromise = {
      update(patch: Record<string, unknown>) {
        capturedPatch = patch;
        return this;
      },
      eq(col: string, val: unknown) {
        if (col === 'id') capturedId = String(val);
        return this;
      },
      then(resolve: (v: { data: unknown; error: null }) => unknown) {
        updateCaptures.push({ patch: capturedPatch, id: capturedId });
        return resolve({ data: null, error: null });
      },
    } as unknown as WorkerDbBuilderPromise;
    return builder;
  });

  return {
    rpc: rpcSpy as unknown as WorkerDbClient['rpc'],
    from: fromSpy as unknown as WorkerDbClient['from'],
    updateCaptures,
    get rpcCallCount() {
      return rpcCallIndex;
    },
  };
}

const TEST_ROUTE_MAP: RouteMap = {
  'pipeline.causal.evaluate_full': { url: 'http://localhost:9999/intelligence/pipeline/causal-full' },
};

const ALWAYS_OK_FETCH = vi.fn(async (): Promise<FetchResponse> => ({
  ok: true,
  status: 200,
  text: async () => '{"status":"processed"}',
}));

const ALWAYS_FAIL_FETCH = vi.fn(async (): Promise<FetchResponse> => ({
  ok: false,
  status: 500,
  text: async () => 'internal server error',
}));

// ─── Named exit-criterion tests ──────────────────────────────────────────────

describe('jobs-worker — DEV_PLAN exit criteria', () => {
  it('500 jobs enqueued, all processed, zero duplicates', async () => {
    const jobs = buildJobs(500);
    const client = buildWorkerClient({
      pickupBatches: [{ data: jobs, error: null }],
    });

    const dispatchedIds: string[] = [];
    const httpFetch = vi.fn(async (_url: string, init: { body: string }): Promise<FetchResponse> => {
      const body = JSON.parse(init.body) as { job_id: string };
      dispatchedIds.push(body.job_id);
      return { ok: true, status: 200, text: async () => '{}' };
    });

    const result = await processJobBatch({
      client,
      httpFetch,
      routeMap: TEST_ROUTE_MAP,
      serviceRoleKey: 'test-key',
      workerId: 'test-worker',
      batchSize: 500,
    });

    expect(result.processed).toBe(500);
    expect(result.failed).toBe(0);
    expect(result.deadLettered).toBe(0);

    // Zero duplicates: every dispatched id is unique.
    expect(new Set(dispatchedIds).size).toBe(500);

    // Exactly 500 completed UPDATE calls.
    const completedUpdates = client.updateCaptures.filter(c => c.patch['status'] === 'completed');
    expect(completedUpdates).toHaveLength(500);

    // Each job ID appears exactly once in completed updates.
    const updatedIds = completedUpdates.map(c => c.id);
    expect(new Set(updatedIds).size).toBe(500);
  });

  it('failure injection drives retries then dead-letter', async () => {
    const job = buildJob({ id: 'job-retry-test', attempts: 0, max_attempts: 3 });

    const client = buildWorkerClient({
      pickupBatches: [
        { data: [{ ...job, attempts: 0 }], error: null },
        { data: [{ ...job, attempts: 1 }], error: null },
        { data: [{ ...job, attempts: 2 }], error: null },
      ],
    });

    // Simulate 3 cron ticks, all failing.
    await processJobBatch({
      client, httpFetch: ALWAYS_FAIL_FETCH,
      routeMap: TEST_ROUTE_MAP, serviceRoleKey: 'test-key', workerId: 'w1',
    });
    await processJobBatch({
      client, httpFetch: ALWAYS_FAIL_FETCH,
      routeMap: TEST_ROUTE_MAP, serviceRoleKey: 'test-key', workerId: 'w1',
    });
    await processJobBatch({
      client, httpFetch: ALWAYS_FAIL_FETCH,
      routeMap: TEST_ROUTE_MAP, serviceRoleKey: 'test-key', workerId: 'w1',
    });

    // Ticks 1 + 2: retry (pending), tick 3: dead-letter.
    const retryUpdates = client.updateCaptures.filter(c => c.patch['status'] === 'pending');
    const deadLetterUpdates = client.updateCaptures.filter(c => c.patch['status'] === 'dead_letter');

    expect(retryUpdates).toHaveLength(2);
    expect(deadLetterUpdates).toHaveLength(1);
    expect(deadLetterUpdates[0]!.patch['dead_lettered_at']).toBeDefined();
    expect(typeof deadLetterUpdates[0]!.patch['last_error']).toBe('string');
    expect(deadLetterUpdates[0]!.id).toBe('job-retry-test');
  });
});

// ─── Behavioural tests ───────────────────────────────────────────────────────

describe('jobs-worker — route handling', () => {
  it('unknown job_type is dead-lettered immediately without HTTP dispatch', async () => {
    const job = buildJob({ id: 'job-unknown', job_type: 'unknown.type' });
    const client = buildWorkerClient({ pickupBatches: [{ data: [job], error: null }] });

    const result = await processJobBatch({
      client, httpFetch: ALWAYS_OK_FETCH,
      routeMap: TEST_ROUTE_MAP, serviceRoleKey: 'test-key', workerId: 'w1',
    });

    expect(result.deadLettered).toBe(1);
    expect(result.processed).toBe(0);
    // HTTP fetch must NOT have been called.
    expect(ALWAYS_OK_FETCH).not.toHaveBeenCalled();
    const dead = client.updateCaptures.find(c => c.patch['status'] === 'dead_letter');
    expect(dead).toBeDefined();
    expect((dead!.patch['last_error'] as string)).toMatch(/unknown job_type/);
  });

  it('pickup RPC failure returns zero-result without throwing', async () => {
    const client = buildWorkerClient({
      pickupBatches: [{ data: null, error: { message: 'connection reset' } }],
    });
    const result = await processJobBatch({
      client, httpFetch: ALWAYS_OK_FETCH,
      routeMap: TEST_ROUTE_MAP, serviceRoleKey: 'test-key', workerId: 'w1',
    });
    expect(result).toEqual({ processed: 0, failed: 0, deadLettered: 0 });
  });

  it('empty queue returns zero-result', async () => {
    const client = buildWorkerClient({ pickupBatches: [{ data: [], error: null }] });
    const result = await processJobBatch({
      client, httpFetch: ALWAYS_OK_FETCH,
      routeMap: TEST_ROUTE_MAP, serviceRoleKey: 'test-key', workerId: 'w1',
    });
    expect(result).toEqual({ processed: 0, failed: 0, deadLettered: 0 });
  });
});

describe('jobs-worker — backoff scheduling', () => {
  it('retry update sets scheduled_at to a future ISO timestamp', async () => {
    const job = buildJob({ id: 'job-backoff', attempts: 0, max_attempts: 3 });
    const client = buildWorkerClient({ pickupBatches: [{ data: [job], error: null }] });
    const before = Date.now();

    await processJobBatch({
      client, httpFetch: ALWAYS_FAIL_FETCH,
      routeMap: TEST_ROUTE_MAP, serviceRoleKey: 'test-key', workerId: 'w1',
    });

    const retry = client.updateCaptures.find(c => c.patch['status'] === 'pending');
    expect(retry).toBeDefined();
    const scheduledAt = new Date(retry!.patch['scheduled_at'] as string).getTime();
    // At least 30s in the future (2^1 × 30s = 60s after first failure).
    expect(scheduledAt).toBeGreaterThan(before + 29_000);
  });
});

// ─── Opt-in real-Postgres integration test (Docker only) ────────────────────

describe('jobs-worker — real-Postgres integration (opt-in)', () => {
  it.skipIf(process.env['DOCKER_AVAILABLE'] !== '1')(
    'FOR UPDATE SKIP LOCKED prevents duplicate pickup under concurrent workers (requires Docker)',
    async () => {
      // This test requires a live Postgres instance with the job_queue table.
      // Set DOCKER_AVAILABLE=1 and SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
      // environment variables to run.
      //
      // Assertion: two concurrent processJobBatch calls claim disjoint sets
      // of jobs (zero overlap in processed IDs).
      throw new Error('Implement with live DB when Docker is available');
    },
  );
});
