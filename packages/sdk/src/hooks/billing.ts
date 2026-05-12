// hooks/billing.ts → billing-svc (ADR-0029 prefix: /billing-svc/billing/...)
// Stage 43: plan catalog, checkout, portal, subscription, cancel, invoices.
import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlanCatalogDTOSchema,
  CheckoutResponseSchema,
  PortalResponseSchema,
  SubscriptionDTOSchema,
  CancelResponseSchema,
  InvoicesResponseSchema,
  type CheckoutRequest,
} from '@mm/types';
import { useMmClient } from '../context.js';
import { mmKeys } from '../keys.js';

// GET /billing/plans — public; no Bearer auth required server-side.
export function usePlanCatalog() {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.billing.plans(),
    queryFn: () =>
      client.get('/billing-svc/billing/plans', PlanCatalogDTOSchema).then((r) => r.data),
  });
}

// GET /billing/subscription — current tenant's subscription state.
export function useSubscription() {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.billing.subscription(),
    queryFn: () =>
      client
        .get('/billing-svc/billing/subscription', SubscriptionDTOSchema)
        .then((r) => r.data),
  });
}

// GET /billing/invoices — up to 50 invoices; truncated: boolean if >50 exist.
// ISSUE-0033: v1.1 will replace with cursor pagination.
export function useInvoices() {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.billing.invoices(),
    queryFn: () =>
      client.get('/billing-svc/billing/invoices', InvoicesResponseSchema).then((r) => r.data),
  });
}

// POST /billing/checkout — initiates Stripe-hosted Checkout session (ADR-0034 Decision 5).
// Stable Idempotency-Key per useRef: same key on retry, new key on remount.
export function useCreateCheckout() {
  const client = useMmClient();
  const queryClient = useQueryClient();
  const idempKey = useRef<string>(crypto.randomUUID());
  return useMutation({
    mutationFn: (body: CheckoutRequest) =>
      client
        .post('/billing-svc/billing/checkout', CheckoutResponseSchema, body, idempKey.current)
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mmKeys.billing.all() });
    },
  });
}

// POST /billing/portal — opens Stripe Customer Portal session.
// Single-use Idempotency-Key: fresh UUID per invocation (portal sessions are one-shot redirects).
export function useCreatePortalSession() {
  const client = useMmClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      client
        .post('/billing-svc/billing/portal', PortalResponseSchema, {}, crypto.randomUUID())
        .then((r) => r.data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mmKeys.billing.all() });
    },
  });
}

// POST /billing/cancel — cancel (or undo cancel) subscription.
// undo=true appends ?undo=true to reinstate a scheduled cancellation.
export function useCancelSubscription() {
  const client = useMmClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ undo }: { undo?: boolean } = {}) => {
      const path = undo ? '/billing-svc/billing/cancel?undo=true' : '/billing-svc/billing/cancel';
      return client
        .post(path, CancelResponseSchema, {}, crypto.randomUUID())
        .then((r) => r.data);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: mmKeys.billing.subscription() });
    },
  });
}
