import { SCHEMA_VERSION, APIErrorEnvelopeSchema, type ErrorCode } from '@mm/types';

// X1 (exact shape from execution directive)
export class APIError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    public readonly traceId: string,
    message: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// X2: traceId on success AND error paths for trace correlation (ADR-0019)
export type SDKResponse<T> = { data: T; traceId: string };

interface Schema<T> {
  parse(data: unknown): T;
}

export interface MmClientConfig {
  /**
   * Edge Functions root. Per ADR-0029, this is
   * `${SUPABASE_URL}/functions/v1` (no trailing slash, no service segment).
   * Each SDK hook prepends its service prefix in the path it passes to
   * `client.get`/`client.post` (e.g. `/assessment-svc/sessions/recent`,
   * `/content-svc/pathways`). No mapping table inside MmClient — the path
   * the hook writes is the path the network sees, with `${baseUrl}`
   * simply prepended.
   */
  baseUrl: string;
  /** Return the current JWT, or null if unauthenticated. */
  getToken: () => Promise<string | null>;
}

export class MmClient {
  constructor(private readonly config: MmClientConfig) {}

  private async request<T>(
    method: string,
    path: string,
    schema: Schema<T>,
    options?: {
      body?: unknown;
      idempotencyKey?: string;
      traceId?: string;
      /** ADR-0026: echo the current lock_token via X-Session-Lock on /respond, /checkpoint, /abandon. */
      lockToken?: string;
    },
  ): Promise<SDKResponse<T>> {
    const traceId = options?.traceId ?? crypto.randomUUID();
    const token = await this.config.getToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Trace-Id': traceId,
      'X-Client-Version': SCHEMA_VERSION,
    };

    if (token !== null) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options?.idempotencyKey !== undefined) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    if (options?.lockToken !== undefined) {
      headers['X-Session-Lock'] = options.lockToken;
    }

    // Network errors propagate as-is — no wrapping into APIError (X1)
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      method,
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    // X2: prefer response header; server may echo or override the trace ID
    const responseTraceId = response.headers.get('X-Trace-Id') ?? traceId;

    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const parsed = APIErrorEnvelopeSchema.safeParse(body);
      if (parsed.success) {
        throw new APIError(
          parsed.data.error.code,
          response.status,
          responseTraceId,
          parsed.data.error.message,
        );
      }
      throw new APIError('INTERNAL_ERROR', response.status, responseTraceId, `HTTP ${response.status}`);
    }

    const json: unknown = await response.json();
    return { data: schema.parse(json), traceId: responseTraceId };
  }

  get<T>(path: string, schema: Schema<T>, traceId?: string): Promise<SDKResponse<T>> {
    return this.request('GET', path, schema, { traceId });
  }

  post<T>(
    path: string,
    schema: Schema<T>,
    body: unknown,
    idempotencyKey?: string,
    traceId?: string,
    lockToken?: string,
  ): Promise<SDKResponse<T>> {
    return this.request('POST', path, schema, { body, idempotencyKey, traceId, lockToken });
  }

  patch<T>(
    path: string,
    schema: Schema<T>,
    body: unknown,
    idempotencyKey?: string,
    traceId?: string,
    lockToken?: string,
  ): Promise<SDKResponse<T>> {
    return this.request('PATCH', path, schema, { body, idempotencyKey, traceId, lockToken });
  }

  delete<T>(
    path: string,
    schema: Schema<T>,
    idempotencyKey?: string,
    traceId?: string,
    lockToken?: string,
  ): Promise<SDKResponse<T>> {
    return this.request('DELETE', path, schema, { idempotencyKey, traceId, lockToken });
  }
}
