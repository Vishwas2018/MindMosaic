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

// StudentAssignment DTO — assignment + student's completion status (Screen 20, Stage 38).
const StudentAssignmentSchema = z.object({
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
  my_status: z.string().nullable().optional(),
  my_session_id: z.string().nullable().optional(),
  completed_at: z.string().nullable().optional(),
});

export type StudentAssignmentDTO = z.infer<typeof StudentAssignmentSchema>;

// Stage 38: teacher fetching a student's assignment list for student detail page (Screen 20).
export function useStudentAssignments(studentId: string) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.assignments.forStudent(studentId),
    queryFn: () =>
      client
        .get(
          `/assignments-svc/assignments/for-student/${encodeURIComponent(studentId)}`,
          z.array(StudentAssignmentSchema),
        )
        .then((r) => r.data),
    enabled: studentId.length > 0,
  });
}

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
