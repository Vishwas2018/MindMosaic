/// <reference lib="deno.ns" />
/**
 * orchestration-svc — Stage 31 + Stage 35.
 *
 * Endpoints:
 *   POST /orchestration/pipeline/orchestration-replan   [service-role only]
 *     Async L9 — dispatched by jobs-worker (ADR-0031). Idempotency key: replan:{student_id}:{session_id}.
 *   GET  /orchestration/plan/{student_id}/current       [role-gated: Bearer JWT]
 *     ?plan_type= (defaults to 'weekly') — returns LearningPlanDTO.
 *   POST /orchestration/generate-plan/{student_id}      [role-gated: Bearer JWT + Idempotency-Key]
 *     Synchronous replan in v1. ISSUE-0020: async upgrade deferred to v1.1.
 *   POST /orchestration/overrides                       [role-gated: Bearer JWT — parent/teacher/tutor/org_admin/platform_admin]
 *     Create plan override (pin_skill | dismiss_recommendation). Returns PlanOverrideDTO.
 *   DELETE /orchestration/overrides/{id}               [role-gated: Bearer JWT — actor or admin]
 *     Delete plan override by id.
 *
 * Service env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ORCHESTRATION_SVC_URL (default: ${SUPABASE_URL}/functions/v1/orchestration-svc)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getTraceId } from '../_shared/trace-id.ts';
import { jsonOk, jsonError } from '../_shared/error-envelope.ts';
import { log } from '../_shared/logger.ts';
import { verifyBearer } from '../_shared/auth.ts';
import {
  processOrchestratorReplan,
  getCurrentPlan,
  generatePlan,
  createOverride,
  deleteOverride,
  type DbClient as HandlerDbClient,
  type Caller,
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
            'Content-Type, Authorization, x-mm-service-role, x-mm-trace-id, Idempotency-Key',
        },
      });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ------------------------------------------------------------------
    // GET /orchestration/plan/{student_id}/current — role-gated (before service-role gate)
    // ------------------------------------------------------------------
    if (method === 'GET' && path.includes('/orchestration/plan/') && path.endsWith('/current')) {
      const studentId = path
        .replace('/orchestration/plan/', '')
        .replace('/current', '');
      if (!studentId) {
        status = 400;
        return jsonError('BAD_REQUEST', 'student_id required in path', traceId, 400);
      }

      const planType = url.searchParams.get('plan_type') ?? 'weekly';

      const svcHeader = req.headers.get('x-mm-service-role');
      let caller: Caller;
      if (svcHeader !== null && svcHeader === SERVICE_ROLE_KEY) {
        caller = { userId: '', role: 'platform_admin' };
      } else {
        const auth = await verifyBearer(req, db);
        if (auth === null) {
          status = 401;
          return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
        }
        const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
        caller = { userId: auth.user.id, role };
      }

      const result = await getCurrentPlan(
        studentId,
        planType,
        caller,
        db as unknown as HandlerDbClient
      );
      if (result.status === 403) {
        status = 403;
        return jsonError('FORBIDDEN', 'Access denied', traceId, 403);
      }
      if (result.status === 500) {
        status = 500;
        return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      }
      return jsonOk(result.data, traceId, 200);
    }

    // ------------------------------------------------------------------
    // POST /orchestration/generate-plan/{student_id} — role-gated (before service-role gate)
    // ISSUE-0020: synchronous in v1; async upgrade deferred to v1.1.
    // ------------------------------------------------------------------
    if (method === 'POST' && path.startsWith('/orchestration/generate-plan/')) {
      const studentId = path.replace('/orchestration/generate-plan/', '');
      if (!studentId) {
        status = 400;
        return jsonError('BAD_REQUEST', 'student_id required in path', traceId, 400);
      }

      const svcHeader = req.headers.get('x-mm-service-role');
      let caller: Caller;
      let tenantId = '';
      if (svcHeader !== null && svcHeader === SERVICE_ROLE_KEY) {
        caller = { userId: '', role: 'platform_admin' };
      } else {
        const auth = await verifyBearer(req, db);
        if (auth === null) {
          status = 401;
          return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
        }
        const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
        tenantId = (auth.user.app_metadata?.['tenant_id'] as string | undefined) ?? '';
        caller = { userId: auth.user.id, role };
      }

      const result = await generatePlan(
        studentId,
        tenantId,
        caller,
        db as unknown as HandlerDbClient
      );
      if (result.status === 403) {
        status = 403;
        return jsonError('FORBIDDEN', 'Access denied', traceId, 403);
      }
      if (result.status === 500) {
        status = 500;
        return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      }
      status = 201;
      return jsonOk(result.data, traceId, 201);
    }

    // ------------------------------------------------------------------
    // POST /orchestration/overrides — create plan override [Bearer JWT]
    // Stage 35: synchronous parent/teacher action (ADR-0031 unchanged — no jobs-worker route).
    // ------------------------------------------------------------------
    if (method === 'POST' && path === '/orchestration/overrides') {
      const svcHeader = req.headers.get('x-mm-service-role');
      let caller: Caller;
      if (svcHeader !== null && svcHeader === SERVICE_ROLE_KEY) {
        caller = { userId: '', role: 'platform_admin' };
      } else {
        const auth = await verifyBearer(req, db);
        if (auth === null) {
          status = 401;
          return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
        }
        const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
        caller = { userId: auth.user.id, role };
      }

      const rawBody: unknown = await req.json();
      if (typeof rawBody !== 'object' || rawBody === null) {
        status = 400;
        return jsonError('BAD_REQUEST', 'request body must be a JSON object', traceId, 400);
      }
      const b = rawBody as Record<string, unknown>;
      const studentId = typeof b['student_id'] === 'string' ? b['student_id'] : '';
      if (!studentId) {
        status = 400;
        return jsonError('BAD_REQUEST', 'student_id required in request body', traceId, 400);
      }
      const overrideBody = {
        type: typeof b['type'] === 'string' ? b['type'] : '',
        target:
          typeof b['target'] === 'object' && b['target'] !== null
            ? (b['target'] as Record<string, unknown>)
            : {},
        expires_in_days: typeof b['expires_in_days'] === 'number' ? b['expires_in_days'] : undefined,
      };

      const result = await createOverride(studentId, caller, overrideBody, db as unknown as HandlerDbClient);
      if (result.status === 400) {
        status = 400;
        return jsonError(result.error ?? 'BAD_REQUEST', result.message ?? 'Bad request', traceId, 400);
      }
      if (result.status === 403) {
        status = 403;
        return jsonError('FORBIDDEN', result.message ?? 'Access denied', traceId, 403);
      }
      if (result.status === 500) {
        status = 500;
        return jsonError('INTERNAL_ERROR', result.message ?? 'Database error', traceId, 500);
      }
      status = result.status;
      return jsonOk(result.data, traceId, result.status);
    }

    // ------------------------------------------------------------------
    // DELETE /orchestration/overrides/{id} — delete plan override [Bearer JWT]
    // Stage 35: actor or admin only.
    // ------------------------------------------------------------------
    if (method === 'DELETE' && path.startsWith('/orchestration/overrides/')) {
      const overrideId = path.replace('/orchestration/overrides/', '');
      if (!overrideId) {
        status = 400;
        return jsonError('BAD_REQUEST', 'override id required in path', traceId, 400);
      }

      const svcHeader = req.headers.get('x-mm-service-role');
      let caller: Caller;
      if (svcHeader !== null && svcHeader === SERVICE_ROLE_KEY) {
        caller = { userId: '', role: 'platform_admin' };
      } else {
        const auth = await verifyBearer(req, db);
        if (auth === null) {
          status = 401;
          return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
        }
        const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
        caller = { userId: auth.user.id, role };
      }

      const result = await deleteOverride(overrideId, caller, db as unknown as HandlerDbClient);
      if (result.status === 404) {
        status = 404;
        return jsonError('NOT_FOUND', result.message ?? 'Override not found', traceId, 404);
      }
      if (result.status === 403) {
        status = 403;
        return jsonError('FORBIDDEN', result.message ?? 'Access denied', traceId, 403);
      }
      if (result.status === 500) {
        status = 500;
        return jsonError('INTERNAL_ERROR', result.message ?? 'Database error', traceId, 500);
      }
      status = 204;
      return new Response(null, { status: 204, headers: { 'X-Trace-Id': traceId } });
    }

    // ------------------------------------------------------------------
    // All remaining routes: service-role only
    // ------------------------------------------------------------------
    const serviceHeader = req.headers.get('x-mm-service-role');
    if (serviceHeader === null || serviceHeader !== SERVICE_ROLE_KEY) {
      status = 401;
      return jsonError('UNAUTHENTICATED', 'service-role header required', traceId, 401);
    }

    // ------------------------------------------------------------------
    // POST /orchestration/pipeline/orchestration-replan
    // ------------------------------------------------------------------
    if (method === 'POST' && path === '/orchestration/pipeline/orchestration-replan') {
      const body: unknown = await req.json();
      const result = await processOrchestratorReplan(
        body,
        db as unknown as HandlerDbClient
      );
      return jsonOk(result, traceId, 200);
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
      service: 'orchestration-svc',
      trace_id: traceId,
      endpoint: `${method} ${path}`,
      status_code: status,
      duration_ms: Date.now() - t0,
    });
  }
});
