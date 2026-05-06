// hooks/session.ts → assessment-svc (per ADR-0029)
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import {
  CreateSessionResponseSchema,
  RecordResponseResponseSchema,
  SubmitSessionResponseSchema,
  SessionStateDTOSchema,
  SessionSummaryDTOSchema,
  type CreateSessionRequest,
  type RecordResponseRequest,
  type CheckpointRequest,
} from '@mm/types';
import { useMmClient } from '../context.js';
import { mmKeys } from '../keys.js';

// Checkpoint response has no defined shape in arch §6.3 — acknowledge as void.
const CheckpointAckSchema = { parse: (): void => undefined };

/** X3: idempotencyKey stabilised per-mount. Auto-generated key is not retry-safe across unmounts;
 *  pass a stable key when retrying after failure. */
export function useCreateSession(options?: { idempotencyKey?: string }) {
  const client = useMmClient();
  const autoKey = useRef<string>(crypto.randomUUID());
  const idempotencyKey = options?.idempotencyKey ?? autoKey.current;
  return useMutation({
    mutationFn: (request: CreateSessionRequest) =>
      client
        .post('/assessment-svc/sessions/create', CreateSessionResponseSchema, request, idempotencyKey)
        .then((r) => r.data),
  });
}

export function useSessionState(sessionId: string) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.sessions.state(sessionId),
    queryFn: () =>
      client
        .get(`/assessment-svc/sessions/${sessionId}/state`, SessionStateDTOSchema)
        .then((r) => r.data),
    enabled: sessionId.length > 0,
  });
}

export function useSessionSummary(sessionId: string) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.sessions.summary(sessionId),
    queryFn: () =>
      // Q-22.2: dispatcher serves `GET /sessions/{id}` (no `/summary` suffix)
      // — see assessment-svc/index.ts:353.
      client
        .get(`/assessment-svc/sessions/${sessionId}`, SessionSummaryDTOSchema)
        .then((r) => r.data),
    enabled: sessionId.length > 0,
  });
}

const SessionSummaryListSchema = SessionSummaryDTOSchema.array();

/** Q-22.1: GET /sessions/recent (OWNERS.md:99). Used by Session Selection
 *  screen (Stage 22) to render the "recent sessions" row. */
export function useListRecentSessions() {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.sessions.recent(),
    queryFn: () =>
      client.get('/assessment-svc/sessions/recent', SessionSummaryListSchema).then((r) => r.data),
  });
}

/** X3: idempotencyKey per-mount. Not retry-safe without stable key. */
export function useRecordResponse(sessionId: string, options?: { idempotencyKey?: string }) {
  const client = useMmClient();
  const qc = useQueryClient();
  const autoKey = useRef<string>(crypto.randomUUID());
  const idempotencyKey = options?.idempotencyKey ?? autoKey.current;
  return useMutation({
    mutationFn: (request: RecordResponseRequest) =>
      client
        .post(
          `/assessment-svc/sessions/${sessionId}/respond`,
          RecordResponseResponseSchema,
          request,
          idempotencyKey,
        )
        .then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mmKeys.sessions.state(sessionId) });
    },
  });
}

/** X3: idempotencyKey per-mount. Not retry-safe without stable key. */
export function useSubmitSession(sessionId: string, options?: { idempotencyKey?: string }) {
  const client = useMmClient();
  const qc = useQueryClient();
  const autoKey = useRef<string>(crypto.randomUUID());
  const idempotencyKey = options?.idempotencyKey ?? autoKey.current;
  return useMutation({
    mutationFn: () =>
      client
        .post(
          `/assessment-svc/sessions/${sessionId}/submit`,
          SubmitSessionResponseSchema,
          {},
          idempotencyKey,
        )
        .then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mmKeys.sessions.byId(sessionId) });
    },
  });
}

/** X3: idempotencyKey per-mount. Not retry-safe without stable key. */
export function useCheckpoint(sessionId: string, options?: { idempotencyKey?: string }) {
  const client = useMmClient();
  const autoKey = useRef<string>(crypto.randomUUID());
  const idempotencyKey = options?.idempotencyKey ?? autoKey.current;
  return useMutation({
    mutationFn: (request: CheckpointRequest) =>
      client
        .post(
          `/assessment-svc/sessions/${sessionId}/checkpoint`,
          CheckpointAckSchema,
          request,
          idempotencyKey,
        )
        .then((r) => r.data),
  });
}
