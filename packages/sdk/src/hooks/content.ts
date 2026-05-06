// hooks/content.ts → content-svc (per ADR-0029)
import { useQuery } from '@tanstack/react-query';
import { PathwayDTOSchema, AssessmentProfileDTOSchema } from '@mm/types';
import { useMmClient } from '../context.js';
import { mmKeys } from '../keys.js';

const PathwayListSchema = PathwayDTOSchema.array();

export function usePathways() {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.pathways.list(),
    queryFn: () => client.get('/content-svc/pathways', PathwayListSchema).then((r) => r.data),
  });
}

// PHASE-2: not in v1 OWNERS.md — content-svc serves the list at
// `GET /assessment-profiles` (line 153) but no per-id endpoint exists in v1.
// Prefix retained for future-stage path stability.
export function useAssessmentProfile(profileId: string) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.assessmentProfiles.byId(profileId),
    queryFn: () =>
      client
        .get(`/content-svc/content/profiles/${profileId}`, AssessmentProfileDTOSchema)
        .then((r) => r.data),
    enabled: profileId.length > 0,
  });
}
