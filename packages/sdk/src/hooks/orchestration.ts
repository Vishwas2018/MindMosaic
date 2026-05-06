// hooks/orchestration.ts → orchestration-svc (per ADR-0029)
// Note: usePathwayReadiness routes to /analytics-svc — see comment on that hook.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import {
  LearningPlanDTOSchema,
  PathwayReadinessDTOSchema,
  type PlanOverrideRequest,
} from '@mm/types';
import { useMmClient } from '../context.js';
import { mmKeys } from '../keys.js';

// Plan override returns the updated plan.
const PlanOverrideAckSchema = { parse: (): void => undefined };

// Stage 31+: dispatcher not in v1; body fix deferred to that stage.
// OWNERS.md:147 spells the future endpoint as
// `GET /orchestration/plan/{student_id}/current`.
export function useLearningPlan(studentId: string) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.orchestration.learningPlan(studentId),
    queryFn: () =>
      client
        .get('/orchestration-svc/orchestration/plan', LearningPlanDTOSchema)
        .then((r) => r.data),
    enabled: studentId.length > 0,
  });
}

// Stage 32+: cross-service — endpoint owned by analytics-svc per OWNERS.md
// (line 173: `GET /analytics/pathway-readiness/{student_id}/{pathway_slug}`),
// not orchestration-svc. Hook stays in orchestration.ts for now; SDK file
// reorganisation is a v1.1 concern. Body fix deferred to whichever stage
// ships analytics-svc.
export function usePathwayReadiness(slug: string) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.orchestration.pathwayReadiness(slug),
    queryFn: () =>
      client
        .get(`/analytics-svc/orchestration/readiness/${slug}`, PathwayReadinessDTOSchema)
        .then((r) => r.data),
    enabled: slug.length > 0,
  });
}

/** X3: idempotencyKey per-mount. Not retry-safe without stable key. */
// Stage 31+: dispatcher not in v1; path body matches OWNERS.md:149 already.
export function usePlanOverride(options?: { idempotencyKey?: string }) {
  const client = useMmClient();
  const qc = useQueryClient();
  const autoKey = useRef<string>(crypto.randomUUID());
  const idempotencyKey = options?.idempotencyKey ?? autoKey.current;
  return useMutation({
    mutationFn: (request: PlanOverrideRequest) =>
      client
        .post(
          '/orchestration-svc/orchestration/overrides',
          PlanOverrideAckSchema,
          request,
          idempotencyKey,
        )
        .then((r) => r.data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: mmKeys.orchestration.all() });
    },
  });
}
