/// <reference lib="deno.ns" />
/**
 * notifications-svc — Stage 34.
 *
 * Endpoints:
 *   GET  /notifications/me?unread=          [Bearer] Own notifications, ordered created_at DESC.
 *   PATCH /notifications/{id}/read          [Bearer] Mark one notification read. Idempotent.
 *   POST /notifications/read-all            [Bearer + Idempotency-Key] Mark all unread read.
 *   POST /notifications/pipeline/create     [service-role only] Create notification from job payload.
 *     Dispatched by jobs-worker (ADR-0031 fourth amendment, notification.create job_type).
 *
 * Ownership: sole writer to `notification` table (arch §1.2 NTF).
 * Spam guard: ISSUE-0025 — 1h dedup on (user_id, type, aggregate_id).
 * 100-cap: spec §27.3 — oldest unread trimmed when count > 100.
 * Channel: in-app only (spec §27.5). Email = separate svc. Push = Phase 5.
 * DEV-20260524-1: 5s SLA wall-clock not testable in sandbox (cron every-minute per ADR-0018).
 *
 * Service env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getTraceId } from '../_shared/trace-id.ts';
import { jsonOk, jsonError } from '../_shared/error-envelope.ts';
import { log } from '../_shared/logger.ts';
import { verifyBearer } from '../_shared/auth.ts';
import {
  getMyNotifications,
  markRead,
  markAllRead,
  createNotification,
  type DbClient as HandlerDbClient,
} from './handlers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request) => {
  const t0 = Date.now();
  const traceId = getTraceId(req);
  const method = req.method;
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/$/, '');
  let status = 200;

  try {
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'X-Trace-Id': traceId,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers':
            'Content-Type, Authorization, Idempotency-Key, x-mm-service-role, x-mm-trace-id',
        },
      });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ------------------------------------------------------------------
    // GET /notifications/me?unread= — Bearer, before service-role gate
    // ------------------------------------------------------------------
    if (method === 'GET' && path === '/notifications/me') {
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const userId = auth.user.id;
      const unreadOnly = url.searchParams.get('unread') === 'true';
      const result = await getMyNotifications(userId, unreadOnly, db as unknown as HandlerDbClient);
      status = result.status;
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? [], traceId, 200);
    }

    // ------------------------------------------------------------------
    // PATCH /notifications/{id}/read — Bearer, before service-role gate
    // ------------------------------------------------------------------
    const readMatch = path.match(/^\/notifications\/([^/]+)\/read$/);
    if (method === 'PATCH' && readMatch !== null) {
      const notifId = readMatch[1]!;
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const result = await markRead(notifId, auth.user.id, db as unknown as HandlerDbClient);
      status = result.status;
      if (result.status === 404) return jsonError('NOT_FOUND', 'Notification not found', traceId, 404);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? null, traceId, 200);
    }

    // ------------------------------------------------------------------
    // POST /notifications/read-all — Bearer, before service-role gate
    // Idempotency-Key accepted per BUILD_CONTRACT §8; not server-side deduped in v1
    // (ISSUE-0023 precedent).
    // ------------------------------------------------------------------
    if (method === 'POST' && path === '/notifications/read-all') {
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const result = await markAllRead(auth.user.id, db as unknown as HandlerDbClient);
      status = result.status;
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? null, traceId, 200);
    }

    // ------------------------------------------------------------------
    // Service-role gate — all remaining routes
    // ------------------------------------------------------------------
    const serviceHeader = req.headers.get('x-mm-service-role');
    if (serviceHeader === null || serviceHeader !== SERVICE_ROLE_KEY) {
      status = 401;
      return jsonError('UNAUTHENTICATED', 'service-role header required', traceId, 401);
    }

    // ------------------------------------------------------------------
    // POST /notifications/pipeline/create — service-role only
    // Dispatched by jobs-worker (ADR-0031 fourth amendment, notification.create).
    // ------------------------------------------------------------------
    if (method === 'POST' && path === '/notifications/pipeline/create') {
      const rawBody: unknown = await req.json();
      const result = await createNotification(rawBody, db as unknown as HandlerDbClient);
      status = result.status;
      if (result.status === 400) return jsonError('VALIDATION_ERROR', result.error ?? 'Bad payload', traceId, 400);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? null, traceId, result.status);
    }

    status = 404;
    return jsonError('NOT_FOUND', `No route for ${method} ${path}`, traceId, 404);
  } catch (errCaught) {
    status = 500;
    console.error(JSON.stringify({ level: 'error', trace_id: traceId, err: String(errCaught) }));
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', traceId, 500);
  } finally {
    log({
      level: status >= 500 ? 'error' : 'info',
      service: 'notifications-svc',
      trace_id: traceId,
      endpoint: `${method} ${path}`,
      status_code: status,
      duration_ms: Date.now() - t0,
    });
  }
});
