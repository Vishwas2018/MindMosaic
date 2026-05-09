/// <reference lib="deno.ns" />
/**
 * jobs-worker — Stage 29. Amended Stage 34 (ADR-0031 fourth amendment).
 *
 * Generic job-dispatch runtime (ADR-0031). Called by pg_cron every minute
 * (cron registration: deploy-time step, see DEV_PLAN Stage 28 notes).
 * Accepts POST requests; returns a BatchResult JSON.
 *
 * Routes (job_type → owning service):
 *   pipeline.causal.evaluate_full  → intelligence-svc    POST /intelligence/pipeline/causal-full
 *   pipeline.predictive_refresh    → intelligence-svc    POST /intelligence/pipeline/predictive-refresh
 *   pipeline.teacher_refresh       → analytics-svc       POST /analytics/pipeline/teacher-refresh
 *   pipeline.orchestration_replan  → orchestration-svc   POST /orchestration/pipeline/orchestration-replan
 *   notification.create            → notifications-svc   POST /notifications/pipeline/create
 *
 * Service env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   INTELLIGENCE_SVC_URL    (default: ${SUPABASE_URL}/functions/v1/intelligence-svc)
 *   ANALYTICS_SVC_URL       (default: ${SUPABASE_URL}/functions/v1/analytics-svc)
 *   ORCHESTRATION_SVC_URL   (default: ${SUPABASE_URL}/functions/v1/orchestration-svc)
 *   NOTIFICATIONS_SVC_URL   (default: ${SUPABASE_URL}/functions/v1/notifications-svc)
 *   JOB_WORKER_BATCH_SIZE   (default: 10)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getTraceId } from '../_shared/trace-id.ts';
import { jsonOk, jsonError } from '../_shared/error-envelope.ts';
import { log } from '../_shared/logger.ts';
import { processJobBatch, type WorkerDbClient, type RouteMap } from './handlers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const INTELLIGENCE_SVC_URL =
  Deno.env.get('INTELLIGENCE_SVC_URL') ??
  `${SUPABASE_URL}/functions/v1/intelligence-svc`;
const ANALYTICS_SVC_URL =
  Deno.env.get('ANALYTICS_SVC_URL') ??
  `${SUPABASE_URL}/functions/v1/analytics-svc`;
const ORCHESTRATION_SVC_URL =
  Deno.env.get('ORCHESTRATION_SVC_URL') ??
  `${SUPABASE_URL}/functions/v1/orchestration-svc`;
const NOTIFICATIONS_SVC_URL =
  Deno.env.get('NOTIFICATIONS_SVC_URL') ??
  `${SUPABASE_URL}/functions/v1/notifications-svc`;
const BATCH_SIZE = parseInt(Deno.env.get('JOB_WORKER_BATCH_SIZE') ?? '10', 10);

function buildRouteMap(): RouteMap {
  return {
    'pipeline.causal.evaluate_full': {
      url: `${INTELLIGENCE_SVC_URL}/intelligence/pipeline/causal-full`,
    },
    'pipeline.predictive_refresh': {
      url: `${INTELLIGENCE_SVC_URL}/intelligence/pipeline/predictive-refresh`,
    },
    'pipeline.teacher_refresh': {
      url: `${ANALYTICS_SVC_URL}/analytics/pipeline/teacher-refresh`,
    },
    'pipeline.orchestration_replan': {
      url: `${ORCHESTRATION_SVC_URL}/orchestration/pipeline/orchestration-replan`,
    },
    'notification.create': {
      url: `${NOTIFICATIONS_SVC_URL}/notifications/pipeline/create`,
    },
  };
}

Deno.serve(async (req: Request) => {
  const t0 = Date.now();
  const traceId = getTraceId(req);
  const method = req.method;
  let status = 200;

  try {
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'X-Trace-Id': traceId,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type, x-mm-service-role, x-mm-trace-id',
        },
      });
    }

    if (method !== 'POST') {
      status = 405;
      return jsonError('METHOD_NOT_ALLOWED', 'POST required', traceId, 405);
    }

    const serviceHeader = req.headers.get('x-mm-service-role');
    if (serviceHeader === null || serviceHeader !== SERVICE_ROLE_KEY) {
      status = 401;
      return jsonError('UNAUTHENTICATED', 'service-role header required', traceId, 401);
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const workerId = `deno-${traceId}`;

    const result = await processJobBatch({
      client: db as unknown as WorkerDbClient,
      httpFetch: (url, init) => fetch(url, init),
      routeMap: buildRouteMap(),
      serviceRoleKey: SERVICE_ROLE_KEY,
      workerId,
      batchSize: BATCH_SIZE,
    });

    return jsonOk(result, traceId, 200);
  } catch (errCaught) {
    status = 500;
    console.error(JSON.stringify({ level: 'error', trace_id: traceId, err: String(errCaught) }));
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', traceId, 500);
  } finally {
    log({
      level: status >= 500 ? 'error' : 'info',
      service: 'jobs-worker',
      trace_id: traceId,
      endpoint: `${method} /`,
      status_code: status,
      duration_ms: Date.now() - t0,
    });
  }
});
