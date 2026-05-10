import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getTraceId } from "../_shared/trace-id.ts";
import { jsonOk, jsonError } from "../_shared/error-envelope.ts";
import { verifyBearer } from "../_shared/auth.ts";
import { log } from "../_shared/logger.ts";
import { handleGetMyClasses, handleGetClassStudents } from "./handlers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

// ─── Route dispatch ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const t0 = Date.now();
  const traceId = getTraceId(req);

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/users-svc/, "");
  const method = req.method;

  let status = 200;
  let userId: string | undefined;
  let tenantId: string | undefined;

  try {
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "X-Trace-Id": traceId,
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Trace-Id, Idempotency-Key",
        },
      });
    }

    const db = serviceClient();
    const auth = await verifyBearer(req, db);

    if (!auth) {
      status = 401;
      return jsonError("UNAUTHORIZED", "Valid Bearer token required", traceId, 401);
    }
    userId = auth.user.id;

    if (method === "GET" && path === "/users/me") {
      return await handleGetMe(auth.user, db, traceId, (tid) => { tenantId = tid; });
    }
    if (method === "PATCH" && path === "/users/me") {
      return await handleUpdateMe(req, auth.user, db, traceId, (tid) => { tenantId = tid; });
    }
    if (method === "GET" && path === "/users/me/children") {
      return await handleGetChildren(auth.user, db, traceId, (tid) => { tenantId = tid; });
    }

    // Stage 37: GET /users/me/classes — teacher's class list with student_count
    if (method === "GET" && path === "/users/me/classes") {
      const role = (auth.user.app_metadata?.["role"] as string | undefined) ?? "";
      const result = await handleGetMyClasses(auth.user.id, role, db as unknown as Parameters<typeof handleGetMyClasses>[2]);
      if (result.status === 403) {
        status = 403;
        return jsonError("FORBIDDEN", "Only teachers can list classes", traceId, 403);
      }
      if (result.status === 500) {
        status = 500;
        return jsonError("INTERNAL_ERROR", "Database error", traceId, 500);
      }
      return jsonOk(result.data ?? { classes: [] }, traceId);
    }

    // Stage 37: GET /users/classes/{class_id}/students — paginated roster
    const classStudentsMatch = path.match(/^\/users\/classes\/([^/]+)\/students$/);
    if (method === "GET" && classStudentsMatch !== null) {
      const classId = classStudentsMatch[1]!;
      const role = (auth.user.app_metadata?.["role"] as string | undefined) ?? "";
      const pageParam = parseInt(url.searchParams.get("page") ?? "1", 10);
      const page = isNaN(pageParam) || pageParam < 1 ? 1 : pageParam;
      const result = await handleGetClassStudents(classId, auth.user.id, role, page, db as unknown as Parameters<typeof handleGetClassStudents>[4]);
      if (result.status === 403) {
        status = 403;
        return jsonError("FORBIDDEN", "Teacher access to own classes only", traceId, 403);
      }
      if (result.status === 500) {
        status = 500;
        return jsonError("INTERNAL_ERROR", "Database error", traceId, 500);
      }
      return jsonOk(result.data ?? { students: [], total: 0, page: 1, page_size: 50 }, traceId);
    }
    if (method === "POST" && path === "/users/me/children") {
      // Students created via invite flow only (Stage 14; full invite in later stage)
      status = 422;
      return jsonError(
        "CHILDREN_INVITE_ONLY",
        "Student accounts can only be created via invitation. Available in a future release.",
        traceId,
        422,
      );
    }

    status = 404;
    return jsonError("NOT_FOUND", "Endpoint not found", traceId, 404);
  } catch (err) {
    status = 500;
    console.error(JSON.stringify({ level: "error", trace_id: traceId, err: String(err) }));
    return jsonError("INTERNAL_ERROR", "An unexpected error occurred", traceId, 500);
  } finally {
    log({
      level: status >= 500 ? "error" : "info",
      service: "users-svc",
      trace_id: traceId,
      user_id: userId,
      tenant_id: tenantId,
      endpoint: `${method} ${path}`,
      status_code: status,
      duration_ms: Date.now() - t0,
    });
  }
});

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleGetMe(
  authUser: { id: string; email?: string },
  db: ReturnType<typeof createClient>,
  traceId: string,
  setTenantId: (id: string) => void,
): Promise<Response> {
  const { data: profile, error: profileErr } = await db
    .from("user_profile")
    .select("id, tenant_id, role, email, display_name, year_level, preferences, created_at")
    .eq("id", authUser.id)
    .single();

  if (profileErr || !profile) {
    return jsonError("PROFILE_NOT_FOUND", "User profile not found", traceId, 404);
  }

  setTenantId(profile.tenant_id as string);

  const { data: tenant } = await db
    .from("tenant")
    .select("id, name, slug, type, region")
    .eq("id", profile.tenant_id)
    .single();

  // Entitlements: enabled feature flags for this tenant (G2: pre-Stripe, mostly empty)
  const { data: flags } = await db
    .from("feature_flag")
    .select("feature_key, config")
    .eq("tenant_id", profile.tenant_id)
    .eq("enabled", true);

  return jsonOk({
    user: {
      id: profile.id,
      email: profile.email ?? authUser.email,
      display_name: profile.display_name,
      role: profile.role,
      tenant_id: profile.tenant_id,
      year_level: profile.year_level ?? null,
      preferences: profile.preferences,
      created_at: profile.created_at,
    },
    tenant: tenant ?? null,
    entitlements: {
      tier: "free",
      features: (flags ?? []).map((f: { feature_key: string; config: unknown }) => ({
        key: f.feature_key,
        config: f.config,
      })),
    },
  }, traceId);
}

async function handleUpdateMe(
  req: Request,
  authUser: { id: string },
  db: ReturnType<typeof createClient>,
  traceId: string,
  setTenantId: (id: string) => void,
): Promise<Response> {
  let body: { display_name?: unknown; preferences?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonError("INVALID_BODY", "Request body must be valid JSON", traceId, 400);
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.display_name !== undefined) {
    if (typeof body.display_name !== "string" || body.display_name.trim().length < 1) {
      return jsonError("VALIDATION_ERROR", "display_name must be a non-empty string", traceId, 400);
    }
    updates["display_name"] = body.display_name.trim();
  }

  if (body.preferences !== undefined) {
    if (typeof body.preferences !== "object" || body.preferences === null || Array.isArray(body.preferences)) {
      return jsonError("VALIDATION_ERROR", "preferences must be a JSON object", traceId, 400);
    }
    updates["preferences"] = body.preferences;
  }

  if (Object.keys(updates).length === 1) {
    return jsonError("VALIDATION_ERROR", "At least one of display_name or preferences required", traceId, 400);
  }

  const { data: updated, error } = await db
    .from("user_profile")
    .update(updates)
    .eq("id", authUser.id)
    .select("id, tenant_id, role, display_name, year_level, preferences, updated_at")
    .single();

  if (error || !updated) {
    return jsonError("UPDATE_FAILED", error?.message ?? "Update failed", traceId, 400);
  }

  setTenantId(updated.tenant_id as string);

  return jsonOk({ user: updated }, traceId);
}

async function handleGetChildren(
  authUser: { id: string; app_metadata?: Record<string, unknown> },
  db: ReturnType<typeof createClient>,
  traceId: string,
  setTenantId: (id: string) => void,
): Promise<Response> {
  const role = authUser.app_metadata?.["role"] as string | undefined;
  if (role !== "parent") {
    return jsonError("FORBIDDEN", "Only parents can list linked students", traceId, 403);
  }

  // Get parent's tenant_id for logging
  const { data: parent } = await db
    .from("user_profile")
    .select("tenant_id")
    .eq("id", authUser.id)
    .single();

  if (parent) setTenantId(parent.tenant_id as string);

  const { data: links, error } = await db
    .from("parent_student_link")
    .select(`
      student_id,
      created_at,
      student:user_profile!parent_student_link_student_id_fkey (
        id, display_name, email, year_level, is_active, created_at
      )
    `)
    .eq("parent_id", authUser.id);

  if (error) {
    return jsonError("QUERY_FAILED", error.message, traceId, 400);
  }

  return jsonOk({ children: links ?? [] }, traceId);
}
