/// <reference lib="deno.ns" />
/**
 * billing-svc — Stage 42–43 (Phase 4 slice).
 *
 * Endpoints (Stage 43):
 *   GET  /billing/plans                   [public]                Plan catalog.
 *   POST /billing/checkout                [Bearer; parent/org_admin] Stripe Checkout session.
 *   POST /billing/portal                  [Bearer; parent/org_admin] Stripe Portal session.
 *   GET  /billing/subscription            [Bearer]                Current subscription state.
 *   POST /billing/cancel                  [Bearer; parent/org_admin] Schedule/undo cancellation.
 *   GET  /billing/invoices                [Bearer]                Invoice list (LIMIT 50).
 *
 * Endpoints (Stage 42):
 *   POST /billing/webhook/stripe          [Stripe-Signature only] Stripe webhook receiver.
 *   POST /billing/pipeline/flag-propagate [service-role only]     Stage 44 pending stub.
 *
 * ISSUE-0032: single STRIPE_WEBHOOK_SECRET; v1.1 needs dual-secret rotation window.
 * ISSUE-0033: GET /billing/invoices uses LIMIT 50 + truncated flag; cursor pagination v1.1.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@16';
import { getTraceId } from '../_shared/trace-id.ts';
import { jsonOk, jsonError } from '../_shared/error-envelope.ts';
import { log } from '../_shared/logger.ts';
import { verifyBearer } from '../_shared/auth.ts';
import {
  handleStripeWebhook,
  handleFlagPropagateStub,
  handleGetPlans,
  handleCreateCheckout,
  handleCreatePortalSession,
  handleGetSubscription,
  handleCancelSubscription,
  handleGetInvoices,
  type BillingDbClient,
  type StripePriceIds,
} from './handlers.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
// ISSUE-0032: single-secret; v1.1 needs dual-secret rotation window.
const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';

const STRIPE_PRICE_IDS: StripePriceIds = {
  standard_monthly: Deno.env.get('STRIPE_PRICE_STANDARD_MONTHLY') ?? '',
  standard_yearly: Deno.env.get('STRIPE_PRICE_STANDARD_YEARLY') ?? '',
  premium_monthly: Deno.env.get('STRIPE_PRICE_PREMIUM_MONTHLY') ?? '',
  premium_yearly: Deno.env.get('STRIPE_PRICE_PREMIUM_YEARLY') ?? '',
};

const BILLING_PORTAL_RETURN_URL = Deno.env.get('BILLING_PORTAL_RETURN_URL') ?? '';

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

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
            'Content-Type, stripe-signature, x-mm-service-role, x-mm-trace-id',
        },
      });
    }

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ── GET /billing/plans — public; no Bearer required (Q-43.4, arch §4.9) ─
    if (method === 'GET' && path === '/billing/plans') {
      const result = handleGetPlans({ stripePriceIds: STRIPE_PRICE_IDS });
      status = result.status;
      return jsonOk(result.data, traceId, result.status);
    }

    // ── Bearer-authenticated billing routes ────────────────────────────────
    if (
      (method === 'GET' && (path === '/billing/subscription' || path === '/billing/invoices')) ||
      (method === 'POST' && (path === '/billing/checkout' || path === '/billing/portal' || path === '/billing/cancel'))
    ) {
      const auth = await verifyBearer(req, db);
      if (auth === null) {
        status = 401;
        return jsonError('UNAUTHENTICATED', 'Bearer token required', traceId, 401);
      }
      const tenantId = (auth.user.app_metadata?.['tenant_id'] as string | undefined) ?? '';
      const role = (auth.user.app_metadata?.['role'] as string | undefined) ?? 'student';

      // ── GET /billing/subscription ──────────────────────────────────────
      if (method === 'GET' && path === '/billing/subscription') {
        const result = await handleGetSubscription({ tenantId, client: db as unknown as BillingDbClient, traceId });
        status = result.status;
        return jsonOk(result.data, traceId, result.status);
      }

      // ── GET /billing/invoices ──────────────────────────────────────────
      if (method === 'GET' && path === '/billing/invoices') {
        const result = await handleGetInvoices({ tenantId, client: db as unknown as BillingDbClient, traceId });
        status = result.status;
        return jsonOk(result.data, traceId, result.status);
      }

      // parent/org_admin gate for checkout, portal, cancel
      if (role !== 'parent' && role !== 'org_admin') {
        status = 403;
        return jsonError('FORBIDDEN', 'Billing mutations require parent or org_admin role', traceId, 403);
      }

      // ── POST /billing/checkout ─────────────────────────────────────────
      if (method === 'POST' && path === '/billing/checkout') {
        const idempotencyKey = req.headers.get('Idempotency-Key') ?? '';
        const rawBody = await req.text();
        let body: unknown;
        try { body = JSON.parse(rawBody); } catch { body = {}; }
        const result = await handleCreateCheckout({
          body: body as { tier: string; billing_interval: 'monthly' | 'yearly'; success_url: string; cancel_url: string },
          idempotencyKey,
          tenantId,
          stripe,
          client: db as unknown as BillingDbClient,
          traceId,
          stripePriceIds: STRIPE_PRICE_IDS,
        });
        status = result.status;
        return jsonOk(result.data, traceId, result.status);
      }

      // ── POST /billing/portal ───────────────────────────────────────────
      if (method === 'POST' && path === '/billing/portal') {
        const result = await handleCreatePortalSession({
          tenantId,
          stripe,
          client: db as unknown as BillingDbClient,
          traceId,
          returnUrl: BILLING_PORTAL_RETURN_URL,
        });
        status = result.status;
        return jsonOk(result.data, traceId, result.status);
      }

      // ── POST /billing/cancel ───────────────────────────────────────────
      if (method === 'POST' && path === '/billing/cancel') {
        const undo = url.searchParams.get('undo') === 'true';
        const result = await handleCancelSubscription({
          tenantId,
          undo,
          stripe,
          client: db as unknown as BillingDbClient,
          traceId,
        });
        status = result.status;
        return jsonOk(result.data, traceId, result.status);
      }
    }

    // ── POST /billing/webhook/stripe — Stripe-Signature auth only ─────────
    // raw body via req.text() MUST precede any JSON parse (arch §3.4.1).
    if (method === 'POST' && path === '/billing/webhook/stripe') {
      const rawBody = await req.text();
      const signature = req.headers.get('stripe-signature') ?? '';
      const result = await handleStripeWebhook({
        rawBody,
        signature,
        webhookSecret: STRIPE_WEBHOOK_SECRET,
        stripe,
        client: db as unknown as BillingDbClient,
        traceId,
      });
      status = result.status;
      return jsonOk(result.data, traceId, result.status);
    }

    // ── Service-role gate — all remaining routes ──────────────────────────
    const serviceHeader = req.headers.get('x-mm-service-role');
    if (serviceHeader === null || serviceHeader !== SERVICE_ROLE_KEY) {
      status = 401;
      return jsonError('UNAUTHENTICATED', 'service-role header required', traceId, 401);
    }

    // ── POST /billing/pipeline/flag-propagate — service-role only ─────────
    // Stage 44 pending — dispatched by jobs-worker (ADR-0031 fifth amendment).
    if (method === 'POST' && path === '/billing/pipeline/flag-propagate') {
      const rawBody: unknown = await req.json();
      const tenantId =
        rawBody !== null && typeof rawBody === 'object' && 'tenant_id' in rawBody
          ? ((rawBody as Record<string, unknown>)['tenant_id'] as string | undefined)
          : undefined;
      const result = handleFlagPropagateStub({ traceId, tenantId });
      status = result.status;
      return jsonOk(result.data, traceId, result.status);
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
      service: 'billing-svc',
      trace_id: traceId,
      endpoint: `${method} ${path}`,
      status_code: status,
      duration_ms: Date.now() - t0,
    });
  }
});
