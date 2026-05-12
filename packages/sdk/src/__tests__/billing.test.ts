// @vitest-environment jsdom
// Stage 43 — SDK hook tests for billing (D2/D3 hooks).
// Verifies URL patterns, query key shapes, and Idempotency-Key presence.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { MmClient, MmClientProvider } from '../index.js';
import {
  usePlanCatalog,
  useSubscription,
  useInvoices,
  useCreateCheckout,
  useCreatePortalSession,
  useCancelSubscription,
} from '../hooks/index.js';
import { mmKeys } from '../keys.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: (): string | null => null },
    json: async () => body,
  });
}

function makeWrapper(client: MmClient) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: qc },
      createElement(MmClientProvider, { client }, children),
    );
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ── mmKeys.billing (D2) ───────────────────────────────────────────────────────

describe('mmKeys.billing — query key shapes', () => {
  it('all() is the root invalidation key', () => {
    expect(mmKeys.billing.all()).toEqual(['billing']);
  });

  it('plans(), subscription(), invoices() are all scoped under the root', () => {
    expect(mmKeys.billing.plans()[0]).toBe('billing');
    expect(mmKeys.billing.subscription()[0]).toBe('billing');
    expect(mmKeys.billing.invoices()[0]).toBe('billing');
  });

  it('plans/subscription/invoices produce distinct keys', () => {
    expect(mmKeys.billing.plans()).not.toEqual(mmKeys.billing.subscription());
    expect(mmKeys.billing.subscription()).not.toEqual(mmKeys.billing.invoices());
  });
});

// ── Query hooks — URL verification ───────────────────────────────────────────

describe('usePlanCatalog', () => {
  it('calls GET /billing-svc/billing/plans (ADR-0029 prefix)', async () => {
    const fetchMock = mockFetchOk({ plans: [] });
    vi.stubGlobal('fetch', fetchMock);
    const client = new MmClient({ baseUrl: 'https://api.test', getToken: async () => 'tok' });
    const { result } = renderHook(() => usePlanCatalog(), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = (fetchMock.mock.calls[0] as [string])[0];
    expect(url).toContain('/billing-svc/billing/plans');
  });
});

describe('useSubscription', () => {
  it('calls GET /billing-svc/billing/subscription (ADR-0029 prefix)', async () => {
    const subscriptionFixture = {
      tier: 'free',
      is_active: true,
      started_at: new Date().toISOString(),
      current_period_end: null,
      cancel_at: null,
      canceled_at: null,
      stripe_subscription_id: null,
    };
    const fetchMock = mockFetchOk(subscriptionFixture);
    vi.stubGlobal('fetch', fetchMock);
    const client = new MmClient({ baseUrl: 'https://api.test', getToken: async () => 'tok' });
    const { result } = renderHook(() => useSubscription(), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = (fetchMock.mock.calls[0] as [string])[0];
    expect(url).toContain('/billing-svc/billing/subscription');
  });
});

describe('useInvoices', () => {
  it('calls GET /billing-svc/billing/invoices (ADR-0029 prefix)', async () => {
    const fetchMock = mockFetchOk({ invoices: [], truncated: false });
    vi.stubGlobal('fetch', fetchMock);
    const client = new MmClient({ baseUrl: 'https://api.test', getToken: async () => 'tok' });
    const { result } = renderHook(() => useInvoices(), { wrapper: makeWrapper(client) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const url = (fetchMock.mock.calls[0] as [string])[0];
    expect(url).toContain('/billing-svc/billing/invoices');
  });
});

// ── Mutation hooks ────────────────────────────────────────────────────────────

describe('useCreateCheckout', () => {
  it('sends POST with Idempotency-Key header to /billing-svc/billing/checkout', async () => {
    const fetchMock = mockFetchOk({ checkout_url: 'https://checkout.stripe.com/pay/cs_test', session_id: 'cs_test' });
    vi.stubGlobal('fetch', fetchMock);
    const client = new MmClient({ baseUrl: 'https://api.test', getToken: async () => 'tok' });
    const { result } = renderHook(() => useCreateCheckout(), { wrapper: makeWrapper(client) });
    await act(async () => {
      result.current.mutate({
        tier: 'standard',
        billing_interval: 'monthly',
        success_url: 'https://app.example.com/success',
        cancel_url: 'https://app.example.com/cancel',
      });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url, reqInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/billing-svc/billing/checkout');
    expect((reqInit.headers as Record<string, string>)['Idempotency-Key']).toBeDefined();
  });
});

describe('useCreatePortalSession', () => {
  it('sends POST to /billing-svc/billing/portal', async () => {
    const fetchMock = mockFetchOk({ portal_url: 'https://billing.stripe.com/portal/test' });
    vi.stubGlobal('fetch', fetchMock);
    const client = new MmClient({ baseUrl: 'https://api.test', getToken: async () => 'tok' });
    const { result } = renderHook(() => useCreatePortalSession(), { wrapper: makeWrapper(client) });
    await act(async () => { result.current.mutate(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/billing-svc/billing/portal');
  });
});

describe('useCancelSubscription', () => {
  it('sends POST to /billing-svc/billing/cancel without undo param by default', async () => {
    const fetchMock = mockFetchOk({ cancel_at: '2025-06-01T00:00:00.000Z', is_active: true });
    vi.stubGlobal('fetch', fetchMock);
    const client = new MmClient({ baseUrl: 'https://api.test', getToken: async () => 'tok' });
    const { result } = renderHook(() => useCancelSubscription(), { wrapper: makeWrapper(client) });
    await act(async () => { result.current.mutate({}); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('/billing-svc/billing/cancel');
    expect(url).not.toContain('undo=true');
  });

  it('appends ?undo=true when undo=true', async () => {
    const fetchMock = mockFetchOk({ cancel_at: null, is_active: true });
    vi.stubGlobal('fetch', fetchMock);
    const client = new MmClient({ baseUrl: 'https://api.test', getToken: async () => 'tok' });
    const { result } = renderHook(() => useCancelSubscription(), { wrapper: makeWrapper(client) });
    await act(async () => { result.current.mutate({ undo: true }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain('undo=true');
  });
});
