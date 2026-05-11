/// <reference lib="deno.ns" />
/**
 * analytics-svc — Stage 30.
 *
 * Endpoints:
 *   POST /analytics/pipeline/teacher-refresh   [service-role only]
 *     Async L7 — dispatched by jobs-worker (ADR-0031, ADR-0033).
 *   GET  /analytics/auto-groups                [role-gated: Bearer JWT]
 *     ?class_id=&skill_id= — reads cohort_metric_cache; teacher/admin only.
 *   GET  /analytics/intervention-alerts        [role-gated: Bearer JWT]
 *     ?class_id= — reads intervention_alert; teacher/admin only.
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
  processTeacherRefresh,
  getAutoGroups,
  getInterventionAlerts,
  getCohort,
  getPathwayReadiness,
  generateAssignment,
  getClassKpi,
  patchInterventionAlert,
  createInterventionAlert,
  type DbClient as HandlerDbClient,
  type Caller,
  type CreateAlertBody,
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
            'Content-Type, Authorization, x-mm-service-role, x-mm-trace-id',
        },
      });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ------------------------------------------------------------------
    // GET /analytics/auto-groups — role-gated (placed BEFORE service-role gate)
    // ------------------------------------------------------------------
    if (method === 'GET' && path === '/analytics/auto-groups') {
      const classId = url.searchParams.get('class_id');
      const skillId = url.searchParams.get('skill_id');
      if (!classId || !skillId) {
        status = 400;
        return jsonError('BAD_REQUEST', 'class_id and skill_id required', traceId, 400);
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

      const result = await getAutoGroups(classId, skillId, caller, db as unknown as HandlerDbClient);
      if (result.status === 403) {
        status = 403;
        return jsonError('FORBIDDEN', 'Teacher access to own classes only', traceId, 403);
      }
      if (result.status === 500) {
        status = 500;
        return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      }
      return jsonOk(result.data ?? null, traceId, 200);
    }

    // ------------------------------------------------------------------
    // GET /analytics/intervention-alerts — role-gated (placed BEFORE service-role gate)
    // ------------------------------------------------------------------
    if (method === 'GET' && path === '/analytics/intervention-alerts') {
      const classId = url.searchParams.get('class_id');
      if (!classId) {
        status = 400;
        return jsonError('BAD_REQUEST', 'class_id required', traceId, 400);
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

      const result = await getInterventionAlerts(classId, caller, db as unknown as HandlerDbClient);
      if (result.status === 403) {
        status = 403;
        return jsonError('FORBIDDEN', 'Teacher access to own classes only', traceId, 403);
      }
      if (result.status === 500) {
        status = 500;
        return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      }
      return jsonOk(result.data ?? [], traceId, 200);
    }

    // ------------------------------------------------------------------
    // GET /analytics/cohort/{group_id} — role-gated (Stage 32, arch §4.7)
    // group_id = cohort_key format: class:{class_id}:{skill_id}
    // ------------------------------------------------------------------
    const cohortMatch = path.match(/^\/analytics\/cohort\/([^/]+)$/);
    if (method === 'GET' && cohortMatch !== null) {
      const groupId = cohortMatch[1]!;
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
      const result = await getCohort(groupId, caller, db as unknown as HandlerDbClient);
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Teacher access to own classes only', traceId, 403);
      if (result.status === 404) return jsonError('NOT_FOUND', 'Cohort not found', traceId, 404);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? null, traceId, 200);
    }

    // ------------------------------------------------------------------
    // GET /analytics/pathway-readiness/{student_id}/{pathway_slug} — role-gated (Stage 32, arch §4.7)
    // ------------------------------------------------------------------
    const pathwayReadinessMatch = path.match(/^\/analytics\/pathway-readiness\/([^/]+)\/([^/]+)$/);
    if (method === 'GET' && pathwayReadinessMatch !== null) {
      const studentId = pathwayReadinessMatch[1]!;
      const pathwaySlug = pathwayReadinessMatch[2]!;
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
      const result = await getPathwayReadiness(studentId, pathwaySlug, caller, db as unknown as HandlerDbClient);
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Access denied', traceId, 403);
      if (result.status === 404) return jsonError('NOT_FOUND', 'Pathway readiness data not found', traceId, 404);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? null, traceId, 200);
    }

    // ------------------------------------------------------------------
    // POST /analytics/generate-assignment — role-gated (Stage 32, arch §4.7, spec §14.3)
    // Teacher/admin only. Returns DraftAssignmentDTO without INSERT (Q-32.1).
    // ------------------------------------------------------------------
    if (method === 'POST' && path === '/analytics/generate-assignment') {
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
      const result = await generateAssignment(rawBody, caller, db as unknown as HandlerDbClient);
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Teacher/admin only', traceId, 403);
      if (result.status === 400) return jsonError('BAD_REQUEST', result.error ?? 'Invalid request body', traceId, 400);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? null, traceId, 200);
    }

    // ------------------------------------------------------------------
    // GET /analytics/class-kpi/{class_id} — role-gated (Stage 37, Screen 18 Block 2)
    // ------------------------------------------------------------------
    const classKpiMatch = path.match(/^\/analytics\/class-kpi\/([^/]+)$/);
    if (method === 'GET' && classKpiMatch !== null) {
      const classId = classKpiMatch[1]!;
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
      const caller: Caller = { userId: auth.user.id, role };
      const result = await getClassKpi(classId, caller, db as unknown as HandlerDbClient);
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Teacher access to own classes only', traceId, 403);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? null, traceId, 200);
    }

    // ------------------------------------------------------------------
    // PATCH /analytics/intervention-alerts/{id} — role-gated (Stage 37, Screen 18 Block 3)
    // ------------------------------------------------------------------
    const patchAlertMatch = path.match(/^\/analytics\/intervention-alerts\/([^/]+)$/);
    if (method === 'PATCH' && patchAlertMatch !== null) {
      const alertId = patchAlertMatch[1]!;
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
      const caller: Caller = { userId: auth.user.id, role };
      const rawBody: unknown = await req.json();
      const body = rawBody as { dismissed?: boolean; acknowledged?: boolean };
      const result = await patchInterventionAlert(alertId, body, caller, db as unknown as HandlerDbClient);
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Access denied', traceId, 403);
      if (result.status === 404) return jsonError('NOT_FOUND', 'Alert not found', traceId, 404);
      if (result.status === 400) return jsonError('BAD_REQUEST', result.error ?? 'Invalid request body', traceId, 400);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? null, traceId, 200);
    }

    // ------------------------------------------------------------------
    // POST /analytics/intervention-alerts — manual flag (Stage 38, Q-38.5 Option A)
    // ------------------------------------------------------------------
    if (method === 'POST' && path === '/analytics/intervention-alerts') {
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
      const caller: Caller = { userId: auth.user.id, role };
      const rawBody: unknown = await req.json();
      const body = rawBody as CreateAlertBody;
      if (!body.student_id || !body.class_id || !body.reason) {
        status = 400;
        return jsonError('VALIDATION_ERROR', 'student_id, class_id, and reason are required', traceId, 400);
      }
      const result = await createInterventionAlert(body, caller, db as unknown as HandlerDbClient);
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Teacher access to own classes only', traceId, 403);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? null, traceId, 201);
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
    // POST /analytics/pipeline/teacher-refresh
    // ------------------------------------------------------------------
    if (method === 'POST' && path === '/analytics/pipeline/teacher-refresh') {
      const body: unknown = await req.json();
      const result = await processTeacherRefresh(body, db as unknown as HandlerDbClient);
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
      service: 'analytics-svc',
      trace_id: traceId,
      endpoint: `${method} ${path}`,
      status_code: status,
      duration_ms: Date.now() - t0,
    });
  }
});
