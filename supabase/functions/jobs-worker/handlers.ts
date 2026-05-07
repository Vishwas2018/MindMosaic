/**
 * jobs-worker handlers — Stage 28.
 *
 * Generic job-dispatch runtime per ADR-0031. This file is Vitest-testable in
 * Node (no Deno imports). The Deno dispatcher (index.ts) wires environment
 * variables and the real Supabase client.
 *
 * Responsibilities (ONLY):
 *   - Claim pending jobs via fn_pickup_jobs (FOR UPDATE SKIP LOCKED).
 *   - Dispatch each job to its owning service via HTTP.
 *   - Record success (completed), transient failure (retry + backoff),
 *     or permanent failure (dead_letter) back to job_queue.
 *
 * NO domain logic. All domain code lives in the owning service (ADR-0031).
 * Retry + backoff state is owned here, never in the owning service handler.
 *
 * Backoff: 2^attempts × 30s, capped at 1800s (30min).
 *
 * ADRs: ADR-0031 (boundary), ADR-0017 (cron), ADR-0018 (outbox chain).
 */

// ─── DB client surface ───────────────────────────────────────────────────────

export interface JobRow {
  id: string;
  job_type: string;
  payload: Record<string, unknown>;
  tenant_id: string | null;
  attempts: number;
  max_attempts: number;
  idempotency_key: string;
  last_error: string | null;
}

export interface WorkerDbBuilder {
  update(patch: Record<string, unknown>): WorkerDbBuilder;
  eq(col: string, val: unknown): WorkerDbBuilder;
}

export type WorkerDbBuilderPromise = WorkerDbBuilder &
  PromiseLike<{ data: unknown; error: { message: string } | null }>;

export interface WorkerDbClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: JobRow[] | null; error: { message: string } | null }>;
  from(table: string): WorkerDbBuilderPromise;
}

// ─── Effects ─────────────────────────────────────────────────────────────────

export interface WorkerEffects {
  now: () => string;
}

export const DEFAULT_WORKER_EFFECTS: WorkerEffects = {
  now: () => new Date().toISOString(),
};

// ─── Route map ───────────────────────────────────────────────────────────────

export interface ServiceRoute {
  url: string;
}

export type RouteMap = Record<string, ServiceRoute>;

// ─── HTTP surface (injected for testability) ─────────────────────────────────

export interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type HttpFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<FetchResponse>;

// ─── processJobBatch ─────────────────────────────────────────────────────────

export interface ProcessBatchInput {
  client: WorkerDbClient;
  httpFetch: HttpFetch;
  routeMap: RouteMap;
  serviceRoleKey: string;
  workerId: string;
  batchSize?: number;
  effects?: Partial<WorkerEffects>;
}

export interface BatchResult {
  processed: number;
  failed: number;
  deadLettered: number;
}

const BACKOFF_BASE_SECS = 30;
const BACKOFF_CAP_SECS = 1800;

function nextScheduledAt(attempts: number): string {
  // 2^attempts × 30s, cap at 1800s. Clamp exponent at 6 (2^6 × 30 = 1920 > cap).
  const delaySecs = Math.min(
    BACKOFF_CAP_SECS,
    BACKOFF_BASE_SECS * Math.pow(2, Math.min(attempts, 6)),
  );
  return new Date(Date.now() + delaySecs * 1000).toISOString();
}

export async function processJobBatch(input: ProcessBatchInput): Promise<BatchResult> {
  const eff = { ...DEFAULT_WORKER_EFFECTS, ...input.effects };
  const { client, httpFetch, routeMap, serviceRoleKey, workerId, batchSize = 10 } = input;

  const pickupRes = await client.rpc('fn_pickup_jobs', {
    p_worker_id: workerId,
    p_limit: batchSize,
  });

  if (pickupRes.error !== null) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'jobs_worker_pickup_failed',
        worker_id: workerId,
        error: pickupRes.error.message,
      }),
    );
    return { processed: 0, failed: 0, deadLettered: 0 };
  }

  const jobs = pickupRes.data ?? [];
  let processed = 0;
  let failed = 0;
  let deadLettered = 0;

  for (const job of jobs) {
    const route = routeMap[job.job_type];
    if (route === undefined) {
      await markDeadLetter(client, job, eff, `unknown job_type: ${job.job_type}`);
      deadLettered += 1;
      continue;
    }

    const traceId = `worker-${workerId}-${job.id}`;
    const dispatch = await dispatchJob(httpFetch, route.url, serviceRoleKey, job, traceId);

    if (dispatch.ok) {
      await client
        .from('job_queue')
        .update({ status: 'completed', completed_at: eff.now() })
        .eq('id', job.id);
      processed += 1;
    } else {
      const nextAttempts = job.attempts + 1;
      if (nextAttempts >= job.max_attempts) {
        await markDeadLetter(client, job, eff, dispatch.error);
        deadLettered += 1;
      } else {
        await client
          .from('job_queue')
          .update({
            status: 'pending',
            attempts: nextAttempts,
            scheduled_at: nextScheduledAt(nextAttempts),
            last_error: dispatch.error,
          })
          .eq('id', job.id);
        failed += 1;
      }
    }
  }

  return { processed, failed, deadLettered };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function dispatchJob(
  httpFetch: HttpFetch,
  url: string,
  serviceRoleKey: string,
  job: JobRow,
  traceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const body = JSON.stringify({
      ...job.payload,
      job_id: job.id,
      job_type: job.job_type,
    });
    const res = await httpFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mm-service-role': serviceRoleKey,
        'x-mm-trace-id': traceId,
        'Idempotency-Key': job.idempotency_key,
      },
      body,
    });
    if (res.ok) return { ok: true };
    const text = await res.text();
    return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 256)}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function markDeadLetter(
  client: WorkerDbClient,
  job: JobRow,
  eff: WorkerEffects,
  error: string,
): Promise<void> {
  await client
    .from('job_queue')
    .update({ status: 'dead_letter', dead_lettered_at: eff.now(), last_error: error })
    .eq('id', job.id);
  console.warn(
    JSON.stringify({
      level: 'warn',
      event: 'job_dead_lettered',
      job_id: job.id,
      job_type: job.job_type,
      attempts: job.attempts,
      error,
    }),
  );
}
