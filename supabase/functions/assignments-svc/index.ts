/// <reference lib="deno.ns" />
/**
 * assignments-svc — Stage 33.
 *
 * Endpoints (all role-gated Bearer JWT; all placed BEFORE service-role gate):
 *   POST   /assignments                          [Teacher + Idempotency-Key]
 *   GET    /assignments/{id}                     [Role-gated: student/teacher/admin]
 *   PATCH  /assignments/{id}                     [Teacher creator, pre-publish]
 *   POST   /assignments/{id}/publish             [Teacher]
 *   POST   /assignments/{id}/archive             [Teacher]
 *   GET    /assignments/for-student/{student_id} [Role-gated + ?status=]
 *   GET    /assignments/for-class/{class_id}     [Teacher]
 *   GET    /assignments/{id}/tracking            [Teacher]
 *   POST   /assignments/{id}/start               [Student + Idempotency-Key]
 *
 * Service env:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ASSESSMENT_SVC_URL
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getTraceId } from '../_shared/trace-id.ts';
import { jsonOk, jsonError } from '../_shared/error-envelope.ts';
import { log } from '../_shared/logger.ts';
import { verifyBearer } from '../_shared/auth.ts';
import {
  createAssignment,
  getAssignment,
  updateAssignment,
  publishAssignment,
  archiveAssignment,
  getAssignmentsForStudent,
  getAssignmentsForClass,
  getAssignmentTracking,
  startAssignment,
  type DbClient as HandlerDbClient,
  type Caller,
} from './handlers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const ASSESSMENT_SVC_URL =
  Deno.env.get('ASSESSMENT_SVC_URL') ?? `${SUPABASE_URL}/functions/v1/assessment-svc`;

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

    // Pre-compute path matches (specific patterns first, generic {id} last)
    const forStudentMatch = path.match(/^\/assignments\/for-student\/([^/]+)$/);
    const forClassMatch = path.match(/^\/assignments\/for-class\/([^/]+)$/);
    const trackingMatch = path.match(/^\/assignments\/([^/]+)\/tracking$/);
    const subactionMatch = path.match(/^\/assignments\/([^/]+)\/(publish|archive|start)$/);
    const idMatch = path.match(/^\/assignments\/([^/]+)$/);

    // ------------------------------------------------------------------
    // POST /assignments — createAssignment [Teacher + Idempotency-Key]
    // ------------------------------------------------------------------
    if (method === 'POST' && path === '/assignments') {
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
      const tenantId = (auth.user.app_metadata?.['tenant_id'] as string | undefined) ?? '';
      const caller: Caller = { userId: auth.user.id, role, tenantId };

      const idempotencyKey = req.headers.get('Idempotency-Key');
      const rawBody: unknown = await req.json();
      const result = await createAssignment(
        rawBody,
        idempotencyKey,
        caller,
        db as unknown as HandlerDbClient,
      );
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Teacher/admin only', traceId, 403);
      if (result.status === 400)
        return jsonError('BAD_REQUEST', result.error ?? 'Invalid body', traceId, 400);
      if (result.status === 422)
        return jsonError('UNPROCESSABLE', result.error ?? 'Unprocessable', traceId, 422);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data, traceId, 201);
    }

    // ------------------------------------------------------------------
    // GET /assignments/for-student/{student_id}?status= — [Role-gated]
    // ------------------------------------------------------------------
    if (method === 'GET' && forStudentMatch !== null) {
      const studentId = forStudentMatch[1]!;
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
      const tenantId = (auth.user.app_metadata?.['tenant_id'] as string | undefined) ?? '';
      const caller: Caller = { userId: auth.user.id, role, tenantId };

      const statusFilter = url.searchParams.get('status');
      const result = await getAssignmentsForStudent(
        studentId,
        statusFilter,
        caller,
        db as unknown as HandlerDbClient,
      );
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Access denied', traceId, 403);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? [], traceId, 200);
    }

    // ------------------------------------------------------------------
    // GET /assignments/for-class/{class_id} — [Teacher]
    // ------------------------------------------------------------------
    if (method === 'GET' && forClassMatch !== null) {
      const classId = forClassMatch[1]!;
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
      const tenantId = (auth.user.app_metadata?.['tenant_id'] as string | undefined) ?? '';
      const caller: Caller = { userId: auth.user.id, role, tenantId };

      const result = await getAssignmentsForClass(
        classId,
        caller,
        db as unknown as HandlerDbClient,
      );
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Teacher/admin only', traceId, 403);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data ?? [], traceId, 200);
    }

    // ------------------------------------------------------------------
    // GET /assignments/{id}/tracking — [Teacher]
    // ------------------------------------------------------------------
    if (method === 'GET' && trackingMatch !== null) {
      const assignmentId = trackingMatch[1]!;
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
      const tenantId = (auth.user.app_metadata?.['tenant_id'] as string | undefined) ?? '';
      const caller: Caller = { userId: auth.user.id, role, tenantId };

      const result = await getAssignmentTracking(
        assignmentId,
        caller,
        db as unknown as HandlerDbClient,
      );
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Teacher/admin only', traceId, 403);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data, traceId, 200);
    }

    // ------------------------------------------------------------------
    // POST /assignments/{id}/publish|archive|start — [Role-gated]
    // ------------------------------------------------------------------
    if (method === 'POST' && subactionMatch !== null) {
      const assignmentId = subactionMatch[1]!;
      const action = subactionMatch[2]!;

      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
      const tenantId = (auth.user.app_metadata?.['tenant_id'] as string | undefined) ?? '';
      const caller: Caller = { userId: auth.user.id, role, tenantId };

      if (action === 'publish') {
        const result = await publishAssignment(
          assignmentId,
          caller,
          db as unknown as HandlerDbClient,
        );
        status = result.status;
        if (result.status === 403) return jsonError('FORBIDDEN', 'Teacher/admin only', traceId, 403);
        if (result.status === 404) return jsonError('NOT_FOUND', 'Assignment not found', traceId, 404);
        if (result.status === 422)
          return jsonError('UNPROCESSABLE', result.error ?? 'Unprocessable', traceId, 422);
        if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
        return jsonOk(result.data, traceId, 200);
      }

      if (action === 'archive') {
        const result = await archiveAssignment(
          assignmentId,
          caller,
          db as unknown as HandlerDbClient,
        );
        status = result.status;
        if (result.status === 403) return jsonError('FORBIDDEN', 'Teacher/admin only', traceId, 403);
        if (result.status === 404) return jsonError('NOT_FOUND', 'Assignment not found', traceId, 404);
        if (result.status === 422)
          return jsonError('UNPROCESSABLE', result.error ?? 'Unprocessable', traceId, 422);
        if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
        return jsonOk(result.data, traceId, 200);
      }

      if (action === 'start') {
        const idempotencyKey = req.headers.get('Idempotency-Key');
        const authHeader = req.headers.get('Authorization');
        const result = await startAssignment(
          assignmentId,
          caller.userId,
          authHeader,
          idempotencyKey,
          traceId,
          db as unknown as HandlerDbClient,
          ASSESSMENT_SVC_URL,
        );
        status = result.status;
        if (result.status === 401) return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
        if (result.status === 403) return jsonError('FORBIDDEN', 'Student only', traceId, 403);
        if (result.status === 404) return jsonError('NOT_FOUND', 'Assignment not found', traceId, 404);
        if (result.status === 422)
          return jsonError('UNPROCESSABLE', result.error ?? 'Unprocessable', traceId, 422);
        if (result.status >= 500)
          return jsonError('INTERNAL_ERROR', result.error ?? 'Upstream error', traceId, result.status);
        return jsonOk(result.data, traceId, 200);
      }
    }

    // ------------------------------------------------------------------
    // GET /assignments/{id} — [Role-gated]
    // ------------------------------------------------------------------
    if (method === 'GET' && idMatch !== null) {
      const assignmentId = idMatch[1]!;
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
      const tenantId = (auth.user.app_metadata?.['tenant_id'] as string | undefined) ?? '';
      const caller: Caller = { userId: auth.user.id, role, tenantId };

      const result = await getAssignment(assignmentId, caller, db as unknown as HandlerDbClient);
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Access denied', traceId, 403);
      if (result.status === 404) return jsonError('NOT_FOUND', 'Assignment not found', traceId, 404);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data, traceId, 200);
    }

    // ------------------------------------------------------------------
    // PATCH /assignments/{id} — [Teacher creator, pre-publish]
    // ------------------------------------------------------------------
    if (method === 'PATCH' && idMatch !== null) {
      const assignmentId = idMatch[1]!;
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';
      const tenantId = (auth.user.app_metadata?.['tenant_id'] as string | undefined) ?? '';
      const caller: Caller = { userId: auth.user.id, role, tenantId };

      const rawBody: unknown = await req.json();
      const result = await updateAssignment(
        assignmentId,
        rawBody,
        caller,
        db as unknown as HandlerDbClient,
      );
      status = result.status;
      if (result.status === 403) return jsonError('FORBIDDEN', 'Creator/admin only', traceId, 403);
      if (result.status === 404) return jsonError('NOT_FOUND', 'Assignment not found', traceId, 404);
      if (result.status === 400)
        return jsonError('BAD_REQUEST', result.error ?? 'Invalid body', traceId, 400);
      if (result.status === 422)
        return jsonError('UNPROCESSABLE', result.error ?? 'Not in draft status', traceId, 422);
      if (result.status === 500) return jsonError('INTERNAL_ERROR', 'Database error', traceId, 500);
      return jsonOk(result.data, traceId, 200);
    }

    // ------------------------------------------------------------------
    // All remaining routes: service-role only (none defined for assignments-svc v1)
    // ------------------------------------------------------------------
    const serviceHeader = req.headers.get('x-mm-service-role');
    if (serviceHeader === null || serviceHeader !== SERVICE_ROLE_KEY) {
      status = 401;
      return jsonError('UNAUTHENTICATED', 'service-role header required', traceId, 401);
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
      service: 'assignments-svc',
      trace_id: traceId,
      endpoint: `${method} ${path}`,
      status_code: status,
      duration_ms: Date.now() - t0,
    });
  }
});
