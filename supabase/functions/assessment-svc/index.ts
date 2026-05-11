/// <reference lib="deno.ns" />
/**
 * assessment-svc — Stage 19.
 *
 * Thin Deno.serve dispatcher. All endpoint logic lives in `handlers.ts` so it
 * can be tested in Node Vitest without resolving Deno URL imports.
 *
 * Endpoints (arch §4.4):
 *   POST /sessions/create                 [Bearer + Idempotency-Key]
 *   POST /sessions/{id}/respond           [Bearer + Idempotency-Key + X-Session-Lock]
 *   POST /sessions/{id}/submit            [Bearer + Idempotency-Key]
 *   POST /sessions/{id}/checkpoint        [Bearer + X-Session-Lock]
 *   GET  /sessions/{id}/state             [Bearer]
 *   POST /sessions/{id}/abandon           [Bearer + X-Session-Lock]
 *   GET  /sessions/recent                 [Bearer]
 *   GET  /sessions/{id}                   [Bearer]
 *
 * Middleware composition (POSTs):
 *   auth (Bearer) → rate-limit → idempotency → handler
 *
 * Service env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — service-role client.
 *   CONTENT_SVC_URL — base URL for content-svc HTTP calls (Q-19.7).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getTraceId } from '../_shared/trace-id.ts';
import { jsonOk, jsonError } from '../_shared/error-envelope.ts';
import { verifyBearer } from '../_shared/auth.ts';
import { log } from '../_shared/logger.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { withIdempotency } from '../_shared/idempotency.ts';
import {
  createSession,
  respondToSession,
  submitSession,
  checkpointSession,
  resumeSession,
  abandonSession,
  listRecentSessions,
  getSessionSummary,
  type DbClient as HandlerDbClient,
  type ContentSelectFetcher,
  type ProcessIntelligenceFetcher,
  type HandlerResult,
} from './handlers.ts';
import type {
  CreateSessionRequest,
  RecordResponseRequest,
  CheckpointRequest,
  EngineItem,
} from '@mm/types';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CONTENT_SVC_URL = Deno.env.get('CONTENT_SVC_URL') ?? `${SUPABASE_URL}/functions/v1/content-svc`;
const INTELLIGENCE_SVC_URL =
  Deno.env.get('INTELLIGENCE_SVC_URL') ?? `${SUPABASE_URL}/functions/v1/intelligence-svc`;
/** Q-20.15: 4s under /submit's 5s p95 budget. */
const INTELLIGENCE_TIMEOUT_MS = 4000;

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

async function callerTenantId(
  client: ReturnType<typeof serviceClient>,
  userId: string,
): Promise<string | null> {
  const { data } = await client
    .from('user_profile')
    .select('tenant_id')
    .eq('id', userId)
    .maybeSingle();
  return (data as { tenant_id?: string } | null)?.tenant_id ?? null;
}

/**
 * Q-20.1 + ADR-0027 + Q-20.15: inline call to intelligence-svc /process-session/{id}
 * with a 4-second timeout. Soft-fails to 'pending' on timeout / 4xx / 5xx /
 * network error; never throws.
 */
const fetchProcessIntelligence: ProcessIntelligenceFetcher = async ({ sessionId, traceId }) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), INTELLIGENCE_TIMEOUT_MS);
  try {
    const res = await fetch(`${INTELLIGENCE_SVC_URL}/intelligence/process-session/${sessionId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mm-service-role': SERVICE_ROLE_KEY,
        'x-mm-trace-id': traceId,
      },
      body: JSON.stringify({}),
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) {
      return { ok: false, reason: 'error', status: res.status, message: `intelligence-svc ${res.status}` };
    }
    const body = (await res.json()) as { data?: { status?: 'processed' | 'already_processed' } } | undefined;
    const status = body?.data?.status ?? 'processed';
    return { ok: true, status };
  } catch (caught) {
    clearTimeout(t);
    const msg = caught instanceof Error ? caught.message : String(caught);
    if (caught instanceof Error && caught.name === 'AbortError') {
      return { ok: false, reason: 'timeout', message: 'intelligence-svc inline call timed out (4000ms)' };
    }
    return { ok: false, reason: 'error', message: msg };
  }
};

const fetchContentSelect: ContentSelectFetcher = async (input) => {
  const res = await fetch(`${CONTENT_SVC_URL}/content/select`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mm-service-role': SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      code: 'CONTENT_SELECT_FAILED',
      message: `content-svc /content/select returned ${res.status}`,
    };
  }
  const body = await res.json();
  // content-svc returns { data, error } via jsonOk; unwrap.
  const items = (body?.data ?? body) as EngineItem[];
  return { ok: true, data: items };
};

function settle<T>(traceId: string, result: HandlerResult<T>): Response {
  if (result.ok) return jsonOk(result.data, traceId, result.status);
  return jsonError(result.code, result.message, traceId, result.status);
}

interface RateLimitConfig {
  endpoint: string;
  limit: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'sessions.create': { endpoint: 'sessions.create', limit: 5 },
  'sessions.respond': { endpoint: 'sessions.respond', limit: 120 },
  'sessions.checkpoint': { endpoint: 'sessions.checkpoint', limit: 240 },
  'sessions.default': { endpoint: 'sessions.default', limit: 100 },
};

async function enforceRateLimit(
  db: ReturnType<typeof serviceClient>,
  endpointKey: string,
  studentId: string,
  traceId: string,
): Promise<Response | null> {
  const cfg = RATE_LIMITS[endpointKey] ?? RATE_LIMITS['sessions.default']!;
  const allowed = await checkRateLimit(db, {
    endpoint: cfg.endpoint,
    key: studentId,
    limit: cfg.limit,
    windowMinutes: 1,
  });
  if (!allowed) {
    return jsonError('RATE_LIMITED', 'Too many requests', traceId, 429);
  }
  return null;
}

Deno.serve(async (req: Request) => {
  const t0 = Date.now();
  const traceId = getTraceId(req);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/assessment-svc/, '');
  const method = req.method;

  let status = 200;
  let userId: string | undefined;
  let tenantId: string | undefined;

  try {
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'X-Trace-Id': traceId,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers':
            'Authorization, Content-Type, X-Trace-Id, X-Session-Lock, Idempotency-Key',
        },
      });
    }

    const db = serviceClient();
    const handlerClient = db as unknown as HandlerDbClient;

    // ── Bearer auth ──────────────────────────────────────────────────────────
    const auth = await verifyBearer(req, db);
    if (!auth) {
      status = 401;
      return jsonError('UNAUTHENTICATED', 'Valid Bearer token required', traceId, 401);
    }
    userId = auth.user.id;
    tenantId = (await callerTenantId(db, userId)) ?? undefined;
    if (tenantId === undefined) {
      status = 403;
      return jsonError('FORBIDDEN', 'No tenant for caller', traceId, 403);
    }

    const lockHeader = req.headers.get('X-Session-Lock');
    const idemKey = req.headers.get('Idempotency-Key');

    // POST /sessions/create
    if (method === 'POST' && path === '/sessions/create') {
      const rl = await enforceRateLimit(db, 'sessions.create', userId, traceId);
      if (rl !== null) { status = 429; return rl; }

      const bodyText = await req.text();
      const body = JSON.parse(bodyText) as CreateSessionRequest;
      if (idemKey === null) {
        const result = await createSession({
          client: handlerClient,
          studentId: userId,
          tenantId,
          body,
          fetchContentSelect,
        });
        status = result.status;
        return settle(traceId, result);
      }
      const idem = await withIdempotency({
        client: db as never,
        idempotencyKey: idemKey,
        tenantId,
        endpoint: 'POST /sessions/create',
        bodyText,
        handler: async () => {
          const result = await createSession({
            client: handlerClient,
            studentId: userId!,
            tenantId: tenantId!,
            body,
            fetchContentSelect,
          });
          return { status: result.status, data: result };
        },
      });
      if (!idem.ok) {
        status = idem.status;
        return jsonError(idem.code, idem.message, traceId, idem.status);
      }
      status = idem.status;
      return settle(traceId, idem.data as HandlerResult<unknown>);
    }

    // POST /sessions/{id}/respond
    const respondMatch = path.match(/^\/sessions\/([^/]+)\/respond$/);
    if (method === 'POST' && respondMatch !== null) {
      const sessionId = respondMatch[1]!;
      const rl = await enforceRateLimit(db, 'sessions.respond', userId, traceId);
      if (rl !== null) { status = 429; return rl; }
      const bodyText = await req.text();
      const body = JSON.parse(bodyText) as RecordResponseRequest;
      const result = await respondToSession({
        client: handlerClient,
        sessionId,
        studentId: userId,
        lockHeader,
        body,
      });
      status = result.status;
      return settle(traceId, result);
    }

    // POST /sessions/{id}/submit
    const submitMatch = path.match(/^\/sessions\/([^/]+)\/submit$/);
    if (method === 'POST' && submitMatch !== null) {
      const sessionId = submitMatch[1]!;
      const rl = await enforceRateLimit(db, 'sessions.default', userId, traceId);
      if (rl !== null) { status = 429; return rl; }
      const result = await submitSession({
        client: handlerClient,
        sessionId,
        studentId: userId,
        traceId,
        fetchProcessIntelligence,
      });
      status = result.status;
      return settle(traceId, result);
    }

    // POST /sessions/{id}/checkpoint
    const checkpointMatch = path.match(/^\/sessions\/([^/]+)\/checkpoint$/);
    if (method === 'POST' && checkpointMatch !== null) {
      const sessionId = checkpointMatch[1]!;
      const rl = await enforceRateLimit(db, 'sessions.checkpoint', userId, traceId);
      if (rl !== null) { status = 429; return rl; }
      const body = (await req.json()) as CheckpointRequest;
      const result = await checkpointSession({
        client: handlerClient,
        sessionId,
        studentId: userId,
        lockHeader,
        body,
      });
      status = result.status;
      return settle(traceId, result);
    }

    // POST /sessions/{id}/abandon
    const abandonMatch = path.match(/^\/sessions\/([^/]+)\/abandon$/);
    if (method === 'POST' && abandonMatch !== null) {
      const sessionId = abandonMatch[1]!;
      const rl = await enforceRateLimit(db, 'sessions.default', userId, traceId);
      if (rl !== null) { status = 429; return rl; }
      const result = await abandonSession({
        client: handlerClient,
        sessionId,
        studentId: userId,
        lockHeader,
      });
      status = result.status;
      return settle(traceId, result);
    }

    // GET /sessions/{id}/state
    const stateMatch = path.match(/^\/sessions\/([^/]+)\/state$/);
    if (method === 'GET' && stateMatch !== null) {
      const sessionId = stateMatch[1]!;
      const result = await resumeSession({
        client: handlerClient,
        sessionId,
        studentId: userId,
      });
      status = result.status;
      return settle(traceId, result);
    }

    // GET /sessions/recent — own sessions; teacher/parent may pass ?student_id= for cross-user lookup
    if (method === 'GET' && path === '/sessions/recent') {
      const limitStr = url.searchParams.get('limit');
      const limit = limitStr !== null ? parseInt(limitStr, 10) : 10;
      const targetStudentId = url.searchParams.get('student_id');
      const callerRole = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
      const elevated = callerRole === 'teacher' || callerRole === 'tutor' ||
        callerRole === 'org_admin' || callerRole === 'platform_admin' || callerRole === 'parent';
      const resolvedStudentId =
        targetStudentId !== null && elevated ? targetStudentId : userId;
      const result = await listRecentSessions(handlerClient, resolvedStudentId!, limit);
      status = result.status;
      return settle(traceId, result);
    }

    // GET /sessions/{id}
    const summaryMatch = path.match(/^\/sessions\/([^/]+)$/);
    if (method === 'GET' && summaryMatch !== null) {
      const sessionId = summaryMatch[1]!;
      const result = await getSessionSummary(handlerClient, sessionId, userId);
      status = result.status;
      return settle(traceId, result);
    }

    status = 404;
    return jsonError('NOT_FOUND', 'Endpoint not found', traceId, 404);
  } catch (errCaught) {
    status = 500;
    console.error(JSON.stringify({ level: 'error', trace_id: traceId, err: String(errCaught) }));
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', traceId, 500);
  } finally {
    log({
      level: status >= 500 ? 'error' : 'info',
      service: 'assessment-svc',
      trace_id: traceId,
      user_id: userId,
      tenant_id: tenantId,
      endpoint: `${method} ${path}`,
      status_code: status,
      duration_ms: Date.now() - t0,
    });
  }
});
