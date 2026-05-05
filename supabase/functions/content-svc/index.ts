/// <reference lib="deno.ns" />
/**
 * content-svc — Stage 18.
 *
 * Thin Deno.serve dispatcher. All endpoint logic lives in `handlers.ts` so it
 * can be tested in Node Vitest without resolving Deno URL imports.
 *
 * Endpoints (arch §4.3):
 *   GET  /pathways
 *   GET  /pathways/{slug}
 *   GET  /assessment-profiles?exam_family=&year_level=
 *   GET  /content/items/{id}
 *   POST /content/select                     [service-role only]
 *   GET  /content/search?q=&...              [admin only]
 *   GET  /skill-graphs/active
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getTraceId } from '../_shared/trace-id.ts';
import { jsonOk, jsonError } from '../_shared/error-envelope.ts';
import { verifyBearer } from '../_shared/auth.ts';
import { log } from '../_shared/logger.ts';
import {
  createDbLoader,
  type DbClient as CacheDbClient,
} from '../_shared/skill-graph-cache.ts';
import {
  listPathways,
  getPathwayBySlug,
  listAssessmentProfiles,
  getItem,
  selectItems,
  searchContent,
  getActiveSkillGraph,
  type DbClient as HandlerDbClient,
  type ContentSelectRequest,
} from './handlers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SERVICE_HEADER = 'x-mm-service-role';

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

async function callerRole(
  client: ReturnType<typeof serviceClient>,
  userId: string,
): Promise<string | null> {
  const { data } = await client
    .from('user_profile')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  return (data as { role?: string } | null)?.role ?? null;
}

Deno.serve(async (req: Request) => {
  const t0 = Date.now();
  const traceId = getTraceId(req);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/content-svc/, '');
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
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Trace-Id, Idempotency-Key',
        },
      });
    }

    const db = serviceClient();
    const handlerClient = db as unknown as HandlerDbClient;
    const cacheClient = db as unknown as CacheDbClient;

    // ── Service-role gate for /content/select (no Bearer) ────────────────────
    if (method === 'POST' && path === '/content/select') {
      const provided = req.headers.get(SERVICE_HEADER);
      if (provided === null || provided !== SERVICE_ROLE_KEY) {
        status = 403;
        return jsonError('FORBIDDEN', 'Service-role header required', traceId, 403);
      }
      const body = (await req.json().catch(() => ({}))) as ContentSelectRequest;
      const result = await selectItems(handlerClient, body);
      if (!result.ok) {
        status = result.status;
        return jsonError(result.code, result.message, traceId, result.status);
      }
      return jsonOk(result.data, traceId);
    }

    // ── Bearer auth for everything else ──────────────────────────────────────
    const auth = await verifyBearer(req, db);
    if (!auth) {
      status = 401;
      return jsonError('UNAUTHENTICATED', 'Valid Bearer token required', traceId, 401);
    }
    userId = auth.user.id;
    tenantId = (await callerTenantId(db, userId)) ?? undefined;

    // GET /pathways
    if (method === 'GET' && path === '/pathways') {
      if (tenantId === undefined) {
        status = 403;
        return jsonError('FORBIDDEN', 'No tenant for caller', traceId, 403);
      }
      const result = await listPathways(handlerClient, tenantId);
      if (!result.ok) {
        status = result.status;
        return jsonError(result.code, result.message, traceId, result.status);
      }
      return jsonOk(result.data, traceId);
    }

    // GET /pathways/{slug}
    const slugMatch = path.match(/^\/pathways\/([^/]+)$/);
    if (method === 'GET' && slugMatch !== null) {
      if (tenantId === undefined) {
        status = 403;
        return jsonError('FORBIDDEN', 'No tenant for caller', traceId, 403);
      }
      const result = await getPathwayBySlug(handlerClient, tenantId, slugMatch[1]!);
      if (!result.ok) {
        status = result.status;
        return jsonError(result.code, result.message, traceId, result.status);
      }
      return jsonOk(result.data, traceId);
    }

    // GET /assessment-profiles
    if (method === 'GET' && path === '/assessment-profiles') {
      const exam = url.searchParams.get('exam_family') ?? undefined;
      const yearStr = url.searchParams.get('year_level');
      const filters: { exam_family?: string; year_level?: number } = {};
      if (exam !== undefined) filters.exam_family = exam;
      if (yearStr !== null) filters.year_level = parseInt(yearStr, 10);
      const result = await listAssessmentProfiles(handlerClient, filters);
      if (!result.ok) {
        status = result.status;
        return jsonError(result.code, result.message, traceId, result.status);
      }
      return jsonOk(result.data, traceId);
    }

    // GET /content/items/{id}
    const itemMatch = path.match(/^\/content\/items\/([^/]+)$/);
    if (method === 'GET' && itemMatch !== null) {
      const result = await getItem(handlerClient, itemMatch[1]!);
      if (!result.ok) {
        status = result.status;
        return jsonError(result.code, result.message, traceId, result.status);
      }
      return jsonOk(result.data, traceId);
    }

    // GET /content/search (admin only — Q-18.1)
    if (method === 'GET' && path === '/content/search') {
      const role = await callerRole(db, userId);
      if (role !== 'platform_admin' && role !== 'org_admin') {
        status = 403;
        return jsonError('FORBIDDEN', 'Admin role required', traceId, 403);
      }
      const result = await searchContent(handlerClient, {
        q: url.searchParams.get('q') ?? undefined,
        skill_ids: url.searchParams.get('skill_ids')?.split(',') ?? undefined,
        difficulty_band: (url.searchParams.get('difficulty_band') as 'easy' | 'mid' | 'hard' | null) ?? undefined,
        page: url.searchParams.get('page') !== null ? parseInt(url.searchParams.get('page')!, 10) : undefined,
        page_size: url.searchParams.get('page_size') !== null ? parseInt(url.searchParams.get('page_size')!, 10) : undefined,
      });
      if (!result.ok) {
        status = result.status;
        return jsonError(result.code, result.message, traceId, result.status);
      }
      return jsonOk(result.data, traceId);
    }

    // GET /skill-graphs/active
    if (method === 'GET' && path === '/skill-graphs/active') {
      const loader = createDbLoader(cacheClient);
      const result = await getActiveSkillGraph(loader);
      if (!result.ok) {
        status = result.status;
        return jsonError(result.code, result.message, traceId, result.status);
      }
      return jsonOk(result.data, traceId);
    }

    status = 404;
    return jsonError('NOT_FOUND', 'Endpoint not found', traceId, 404);
  } catch (err) {
    status = 500;
    console.error(JSON.stringify({ level: 'error', trace_id: traceId, err: String(err) }));
    return jsonError('INTERNAL_ERROR', 'An unexpected error occurred', traceId, 500);
  } finally {
    log({
      level: status >= 500 ? 'error' : 'info',
      service: 'content-svc',
      trace_id: traceId,
      user_id: userId,
      tenant_id: tenantId,
      endpoint: `${method} ${path}`,
      status_code: status,
      duration_ms: Date.now() - t0,
    });
  }
});
