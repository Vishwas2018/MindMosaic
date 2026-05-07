import { describe, it, expect, vi, afterEach } from 'vitest';
import { MmClient, APIError } from '../client.js';
import { SCHEMA_VERSION } from '@mm/types';

const EchoSchema = { parse: (data: unknown) => data as { ok: boolean } };

function makeClient(getToken: () => Promise<string | null> = async () => null) {
  return new MmClient({ baseUrl: 'https://api.test', getToken });
}

function mockResponse(ok: boolean, status: number, body: unknown, traceId?: string) {
  return {
    ok,
    status,
    headers: { get: (h: string): string | null => (h === 'X-Trace-Id' ? (traceId ?? null) : null) },
    json: async () => body,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── X5: SCHEMA_VERSION drift guard ──────────────────────────────────────────

describe('X5 — X-Client-Version header matches SCHEMA_VERSION from @mm/types', () => {
  it('attaches X-Client-Version equal to exported SCHEMA_VERSION (catches hardcoding)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    await makeClient().get('/test', EchoSchema);
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1]?.headers) as Record<string, string>;
    expect(headers['X-Client-Version']).toBe(SCHEMA_VERSION);
  });
});

// ─── Header propagation ───────────────────────────────────────────────────────

describe('MmClient — headers', () => {
  it('attaches Authorization Bearer when token present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    await makeClient(async () => 'tok123').get('/test', EchoSchema);
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1]?.headers) as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok123');
  });

  it('omits Authorization when token is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    await makeClient().get('/test', EchoSchema);
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1]?.headers) as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('attaches X-Trace-Id UUID on every request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    await makeClient().get('/test', EchoSchema);
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1]?.headers) as Record<string, string>;
    expect(headers['X-Trace-Id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('attaches Idempotency-Key on POST', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    await makeClient().post('/test', EchoSchema, {}, 'idem-key-123');
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1]?.headers) as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('idem-key-123');
  });

  it('omits Idempotency-Key on GET', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    await makeClient().get('/test', EchoSchema);
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1]?.headers) as Record<string, string>;
    expect(headers['Idempotency-Key']).toBeUndefined();
  });
});

// ─── ADR-0026: X-Session-Lock header ─────────────────────────────────────────

describe('ADR-0026 — X-Session-Lock header', () => {
  it('attaches X-Session-Lock on post() when lockToken provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    await makeClient().post('/test', EchoSchema, {}, undefined, undefined, 'lock-abc');
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1]?.headers) as Record<string, string>;
    expect(headers['X-Session-Lock']).toBe('lock-abc');
  });

  it('omits X-Session-Lock on post() when lockToken not provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    await makeClient().post('/test', EchoSchema, {}, undefined, undefined, undefined);
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1]?.headers) as Record<string, string>;
    expect(headers['X-Session-Lock']).toBeUndefined();
  });

  it('attaches X-Session-Lock on patch() when lockToken provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    await makeClient().patch('/test', EchoSchema, {}, undefined, undefined, 'lock-patch');
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1]?.headers) as Record<string, string>;
    expect(headers['X-Session-Lock']).toBe('lock-patch');
  });

  it('attaches X-Session-Lock on delete() when lockToken provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    await makeClient().delete('/test', EchoSchema, undefined, undefined, 'lock-del');
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1]?.headers) as Record<string, string>;
    expect(headers['X-Session-Lock']).toBe('lock-del');
  });

  it('omits X-Session-Lock on GET (get() has no lockToken parameter)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    await makeClient().get('/test', EchoSchema);
    const headers = (vi.mocked(fetch).mock.calls[0]?.[1]?.headers) as Record<string, string>;
    expect(headers['X-Session-Lock']).toBeUndefined();
  });
});

// ─── X1: APIError class ───────────────────────────────────────────────────────

describe('X1 — APIError', () => {
  it('throws APIError with parsed envelope on 4xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(false, 404, {
          error: { code: 'NOT_FOUND', message: 'not found', status: 404, details: null, trace_id: 'x' },
        }),
      ),
    );
    let err: unknown;
    try {
      await makeClient().get('/test', EchoSchema);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(APIError);
    const apiErr = err as APIError;
    expect(apiErr.code).toBe('NOT_FOUND');
    expect(apiErr.status).toBe(404);
    expect(apiErr.name).toBe('APIError');
  });

  it('throws INTERNAL_ERROR APIError when 5xx body is unparseable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(false, 503, null)));
    let err: unknown;
    try {
      await makeClient().get('/test', EchoSchema);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(APIError);
    expect((err as APIError).code).toBe('INTERNAL_ERROR');
    expect((err as APIError).status).toBe(503);
  });

  it('rethrows network errors as-is (not wrapped in APIError)', async () => {
    const networkErr = new TypeError('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkErr));
    await expect(makeClient().get('/test', EchoSchema)).rejects.toBe(networkErr);
  });

  it('APIError narrowing: instanceof + code switch', () => {
    const err = new APIError('FORBIDDEN', 403, 'trace-1', 'Forbidden');
    expect(err instanceof APIError).toBe(true);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.status).toBe(403);
    expect(err.traceId).toBe('trace-1');
    expect(err.message).toBe('Forbidden');
  });
});

// ─── X2: traceId propagation ─────────────────────────────────────────────────

describe('X2 — traceId propagation', () => {
  it('captures X-Trace-Id from response header on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true }, 'server-trace-abc')),
    );
    const result = await makeClient().get('/test', EchoSchema);
    expect(result.traceId).toBe('server-trace-abc');
  });

  it('falls back to request traceId when response has no X-Trace-Id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse(true, 200, { ok: true })));
    const result = await makeClient().get('/test', EchoSchema);
    expect(result.traceId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('captures X-Trace-Id from response header on error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockResponse(
          false,
          403,
          { error: { code: 'FORBIDDEN', message: 'no', status: 403, details: null, trace_id: 'x' } },
          'server-err-trace',
        ),
      ),
    );
    let err: unknown;
    try {
      await makeClient().get('/test', EchoSchema);
    } catch (e) {
      err = e;
    }
    expect((err as APIError).traceId).toBe('server-err-trace');
  });
});
