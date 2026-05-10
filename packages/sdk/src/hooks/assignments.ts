// hooks/assignments.ts → assignments-svc (ADR-0029 prefix: /assignments-svc/assignments/...)
// Stage 37: Screen 18 Block 6 — assignments widget for teacher dashboard.
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { useMmClient } from '../context.js';
import { mmKeys } from '../keys.js';

// Lightweight DTO for dashboard display; full AssignmentDTO is in @mm/types.
const AssignmentSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.string(),
  due_at: z.string().nullable(),
  mode: z.string(),
  item_count: z.number(),
  auto_generated: z.boolean(),
  created_at: z.string(),
  published_at: z.string().nullable(),
  archived_at: z.string().nullable(),
});

export type AssignmentSummary = z.infer<typeof AssignmentSummarySchema>;

// Screen 18 Block 6: class assignments for the ProgressBar widget.
// assignments-svc returns the array directly as response body (jsonOk(result.data ?? [])).
export function useAssignmentsForClass(classId: string) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.assignments.forClass(classId),
    queryFn: () =>
      client
        .get(
          `/assignments-svc/assignments/for-class/${encodeURIComponent(classId)}`,
          z.array(AssignmentSummarySchema),
        )
        .then((r) => r.data),
    enabled: classId.length > 0,
  });
}
