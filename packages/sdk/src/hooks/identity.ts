// hooks/identity.ts → users-svc (per ADR-0029)
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { UserMeDTOSchema, TenantDTOSchema } from '@mm/types';
import { useMmClient } from '../context.js';
import { mmKeys } from '../keys.js';

// Stage 36: child profile shape per handleGetChildren in users-svc/index.ts:194.
// No @mm/types schema — defined here as a UI-boundary type.
const ChildProfileSchema = z.object({
  student_id: z.string().uuid(),
  student: z.object({
    id: z.string().uuid(),
    display_name: z.string().nullable(),
    email: z.string().nullable(),
    year_level: z.number().nullable(),
    is_active: z.boolean(),
    created_at: z.string(),
  }),
  created_at: z.string(),
});
const ChildrenResponseSchema = z.object({ children: z.array(ChildProfileSchema) });
export type ChildProfile = z.infer<typeof ChildProfileSchema>;

export function useMe() {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.users.me(),
    queryFn: () => client.get('/users-svc/users/me', UserMeDTOSchema).then((r) => r.data),
  });
}

// Stage 36: GET /users/me/children → lists parent's linked student profiles.
export function useMyChildren() {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.users.children(),
    queryFn: () =>
      client.get('/users-svc/users/me/children', ChildrenResponseSchema).then((r) => r.data),
  });
}

// Stage 37: teacher class list per GET /users-svc/users/me/classes.
// No @mm/types schema — defined here as a UI-boundary type.
const ClassGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  year_level: z.number().nullable(),
  student_count: z.number(),
  created_at: z.string(),
});
const MyClassesResponseSchema = z.object({ classes: z.array(ClassGroupSchema) });
export type ClassGroupDTO = z.infer<typeof ClassGroupSchema>;

export function useMyClasses() {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.users.classes(),
    queryFn: () =>
      client.get('/users-svc/users/me/classes', MyClassesResponseSchema).then((r) => r.data),
  });
}

// Stage 37: paginated student roster per GET /users-svc/users/classes/{class_id}/students.
const StudentRowSchema = z.object({
  id: z.string(),
  display_name: z.string().nullable(),
  year_level: z.number().nullable(),
  last_session_at: z.string().nullable(),
  avg_score: z.number().nullable(),
  mastery_summary: z.number(),
});
const ClassStudentsResponseSchema = z.object({
  students: z.array(StudentRowSchema),
  total: z.number(),
  page: z.number(),
  page_size: z.number(),
});
export type StudentRowDTO = z.infer<typeof StudentRowSchema>;
export type ClassStudentsResponse = z.infer<typeof ClassStudentsResponseSchema>;

export function useClassStudents(classId: string, page = 1) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.users.classStudents(classId),
    queryFn: () =>
      client
        .get(
          `/users-svc/users/classes/${encodeURIComponent(classId)}/students?page=${page}`,
          ClassStudentsResponseSchema,
        )
        .then((r) => r.data),
    enabled: classId.length > 0,
  });
}

// Stage 38: student profile header for teacher student detail page (Screen 20, Q-38.2).
const StudentProfileSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  year_level: z.number().nullable(),
  class_id: z.string().nullable(),
  class_name: z.string().nullable(),
  last_session_at: z.string().nullable(),
  avg_score: z.number().nullable(),
});
export type StudentProfileDTO = z.infer<typeof StudentProfileSchema>;

export function useStudentProfile(studentId: string) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.users.student(studentId),
    queryFn: async () => {
      const res = await client.get(
        `/users-svc/users/students/${encodeURIComponent(studentId)}`,
        StudentProfileSchema,
      );
      return res.data;
    },
    enabled: studentId.length > 0,
  });
}

// PHASE-2: not in v1 OWNERS.md — `/tenants/{id}` has no v1 dispatcher.
// Prefix is set per UTA ownership (auth-svc/users-svc) for future-stage path stability.
export function useTenant(tenantId: string) {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.tenants.byId(tenantId),
    queryFn: () =>
      client.get(`/users-svc/tenants/${tenantId}`, TenantDTOSchema).then((r) => r.data),
    enabled: tenantId.length > 0,
  });
}
