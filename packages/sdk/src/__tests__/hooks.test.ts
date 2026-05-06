// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { MmClient, MmClientProvider } from '../index.js';
import { useMe, useListRecentSessions } from '../hooks/index.js';
import { mmKeys } from '../keys.js';

function mockFetchOk(body: unknown, traceId?: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: (h: string): string | null => (h === 'X-Trace-Id' ? (traceId ?? null) : null) },
    json: async () => body,
  });
}

function makeWrapper(client: MmClient) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

describe('useMe — plumbing test (Q4 jsdom)', () => {
  it('returns typed UserMeDTO on success', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetchOk({
        id: '00000000-0000-0000-0000-000000000001',
        email: 'student@example.com',
        display_name: 'Alice',
        role: 'student',
        tenant_id: '00000000-0000-0000-0000-000000000002',
        year_level: 5,
        subscription_tier: 'free',
        entitlements: {},
        preferences: {},
      }),
    );

    const client = new MmClient({
      baseUrl: 'https://api.test',
      getToken: async () => 'tok',
    });

    const { result } = renderHook(() => useMe(), { wrapper: makeWrapper(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.display_name).toBe('Alice');
    expect(result.current.data?.role).toBe('student');
    expect(result.current.data?.subscription_tier).toBe('free');
  });

  it('returns APIError on 4xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => null },
        json: async () => ({
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Not authenticated',
            status: 401,
            details: null,
            trace_id: 'trace-xyz',
          },
        }),
      }),
    );

    const client = new MmClient({
      baseUrl: 'https://api.test',
      getToken: async () => null,
    });

    const { result } = renderHook(() => useMe(), { wrapper: makeWrapper(client) });

    await waitFor(() => expect(result.current.isError).toBe(true));

    const { APIError } = await import('../client.js');
    expect(result.current.error).toBeInstanceOf(APIError);
  });
});

describe('useListRecentSessions — Stage 22 / Q-22.1', () => {
  it('fetches GET /sessions/recent and parses SessionSummaryDTO[]', async () => {
    const fetchMock = mockFetchOk([
      {
        session_id: '11111111-1111-4111-8111-111111111111',
        mode: 'practice',
        pathway_name: 'NAPLAN Y5 Numeracy',
        started_at: '2026-05-10T08:00:00.000Z',
        submitted_at: '2026-05-10T08:30:00.000Z',
        duration_ms: 1800000,
        active_duration_ms: 1500000,
        score_band: 'developing',
        raw_score: 7,
        skills_touched_count: 4,
      },
      {
        session_id: '22222222-2222-4222-8222-222222222222',
        mode: 'exam',
        pathway_name: null,
        started_at: '2026-05-09T08:00:00.000Z',
        submitted_at: null,
        duration_ms: null,
        active_duration_ms: null,
        score_band: null,
        raw_score: null,
        skills_touched_count: 0,
      },
    ]);
    vi.stubGlobal('fetch', fetchMock);

    const client = new MmClient({
      baseUrl: 'https://api.test',
      getToken: async () => 'tok',
    });

    const { result } = renderHook(() => useListRecentSessions(), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0]?.mode).toBe('practice');
    expect(result.current.data?.[1]?.pathway_name).toBeNull();

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toMatch(
      /\/assessment-svc\/sessions\/recent$/,
    );
    expect(init.method ?? 'GET').toBe('GET');
  });

  it('uses mmKeys.sessions.recent() as query key', () => {
    expect(mmKeys.sessions.recent()).toEqual(['sessions', 'recent']);
  });
});
