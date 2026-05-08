/// <reference lib="deno.ns" />
/**
 * intelligence-svc — Stage 29.
 *
 * Endpoints:
 *   POST /intelligence/process-session/{id}              [service-role only]
 *     Sync L1 + L2 + L3a — called inline from assessment-svc /sessions/{id}/submit
 *     (Q-20.1, ADR-0027) within a 4s timeout window.
 *   POST /intelligence/pipeline/causal-full               [service-role only]
 *     Async L3b — dispatched by jobs-worker (ADR-0031).
 *   POST /intelligence/pipeline/predictive-refresh        [service-role only]
 *     Async L5 — dispatched by jobs-worker (ADR-0031).
 *   GET  /intelligence/predictions/:student_id/:pathway   [role-gated: Bearer JWT or service-role]
 *     Reads cohort_metric_cache; returns fresh/stale/no_data envelope (arch §6.3).
 *     student/parent → own predictions only; teacher/admin → any student; service-role → bypass.
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
  processSession,
  processCausalFull,
  processPredictiveRefresh,
  getPredictions,
  type DbClient as HandlerDbClient,
  type PredictiveRefreshInput,
  type PredictionsCallerContext,
} from './handlers.ts';
import {
  createDbLoader,
  type DbClient as SkillGraphDbClient,
} from '../_shared/skill-graph-cache.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

Deno.serve(async (req: Request) => {
  const t0 = Date.now();
  const traceId = getTraceId(req);
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/intelligence-svc/, '');
  const method = req.method;
  let status = 200;

  try {
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'X-Trace-Id': traceId,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, X-Trace-Id, x-mm-service-role, x-mm-trace-id',
        },
      });
    }

    // GET /intelligence/predictions/:student_id/:pathway_slug
    // Role-gated (arch §6.3): service-role → bypass; teacher/admin → any student;
    // student/parent → own predictions only. Accepts service-role header OR Bearer JWT.
    const predictionsMatch = path.match(/^\/intelligence\/predictions\/([^/]+)\/([^/]+)$/);
    if (method === 'GET' && predictionsMatch !== null) {
      const studentId = predictionsMatch[1]!;
      const pathwaySlug = predictionsMatch[2]!;
      const db = serviceClient();

      let caller: PredictionsCallerContext;
      const svcHeader = req.headers.get('x-mm-service-role');
      if (svcHeader !== null && svcHeader === SERVICE_ROLE_KEY) {
        caller = null; // service-role bypass
      } else {
        const auth = await verifyBearer(req, db);
        if (auth === null) {
          status = 401;
          return jsonError('UNAUTHENTICATED', 'Bearer token or service-role required', traceId, 401);
        }
        const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
        caller = { userId: auth.user.id, role };
      }

      const result = await getPredictions(studentId, pathwaySlug, db as unknown as HandlerDbClient, caller);
      status = result.status;
      if (result.ok) return jsonOk(result.data, traceId, result.status);
      return jsonError(result.code, result.message, traceId, result.status);
    }

    // All other routes: service-role only.
    const serviceHeader = req.headers.get('x-mm-service-role');
    if (serviceHeader === null || serviceHeader !== SERVICE_ROLE_KEY) {
      status = 401;
      return jsonError('UNAUTHENTICATED', 'service-role header required', traceId, 401);
    }

    const processMatch = path.match(/^\/intelligence\/process-session\/([^/]+)$/);
    if (method === 'POST' && processMatch !== null) {
      const sessionId = processMatch[1]!;
      const db = serviceClient();
      const client = db as unknown as HandlerDbClient;
      const graphLoader = createDbLoader(db as unknown as SkillGraphDbClient);
      const result = await processSession({
        client,
        sessionId,
        traceId,
        graphLoader,
      });
      status = result.status;
      if (result.ok) return jsonOk(result.data, traceId, result.status);
      return jsonError(result.code, result.message, traceId, result.status);
    }

    if (method === 'POST' && path === '/intelligence/pipeline/causal-full') {
      const body = await req.json() as { session_id?: unknown };
      const sessionId = body.session_id;
      if (typeof sessionId !== 'string' || sessionId.trim() === '') {
        status = 400;
        return jsonError('BAD_REQUEST', 'session_id required', traceId, 400);
      }
      const db = serviceClient();
      const client = db as unknown as HandlerDbClient;
      const graphLoader = createDbLoader(db as unknown as SkillGraphDbClient);
      const result = await processCausalFull({
        client,
        sessionId,
        traceId,
        graphLoader,
      });
      status = result.status;
      if (result.ok) return jsonOk(result.data, traceId, result.status);
      return jsonError(result.code, result.message, traceId, result.status);
    }

    if (method === 'POST' && path === '/intelligence/pipeline/predictive-refresh') {
      const body = await req.json() as PredictiveRefreshInput;
      if (typeof body.student_id !== 'string' || typeof body.pathway_slug !== 'string') {
        status = 400;
        return jsonError('BAD_REQUEST', 'student_id and pathway_slug required', traceId, 400);
      }
      const db = serviceClient();
      const result = await processPredictiveRefresh(
        { ...body, trace_id: traceId },
        db as unknown as HandlerDbClient,
      );
      status = result.status;
      if (result.ok) return jsonOk(result.data, traceId, result.status);
      return jsonError(result.code, result.message, traceId, result.status);
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
      service: 'intelligence-svc',
      trace_id: traceId,
      endpoint: `${method} ${path}`,
      status_code: status,
      duration_ms: Date.now() - t0,
    });
  }
});
