/**
 * users-svc handlers — Stage 37.
 *
 * Extracted handler functions for new teacher-facing endpoints.
 * Tested via __tests__/contract.test.ts (same mock-client harness as analytics-svc).
 *
 * Screen 18 + Screen 19 (SCREEN_SPECS):
 *   handleGetMyClasses    — GET /users/me/classes
 *   handleGetClassStudents — GET /users/classes/{class_id}/students
 */

// ---------------------------------------------------------------------------
// DbClient contract (structurally compatible with Supabase JS service-role client)
// ---------------------------------------------------------------------------

export interface DbClient {
  from(table: string): DbBuilder;
}

export type DbBuilder = {
  select: (cols: string) => DbBuilder;
  update: (patch: unknown) => DbBuilder;
  eq: (col: string, val: unknown) => DbBuilder;
  in: (col: string, vals: unknown[]) => DbBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => DbBuilder;
  limit: (n: number) => DbBuilder;
  range: (from: number, to: number) => DbBuilder;
  single: () => DbBuilder;
} & PromiseLike<{ data: unknown; error: unknown }>;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export interface ClassGroupDTO {
  id: string;
  name: string;
  year_level: number | null;
  student_count: number;
  created_at: string;
}

export interface StudentRowDTO {
  id: string;
  display_name: string | null;
  year_level: number | null;
  last_session_at: string | null;
  avg_score: number | null;
  mastery_summary: number;
}

export interface ClassStudentsResponse {
  students: StudentRowDTO[];
  total: number;
  page: number;
  page_size: number;
}

type HandlerResult<T> = { data: T | null; status: number; error?: string };

// ---------------------------------------------------------------------------
// handleGetMyClasses — GET /users/me/classes
//
// Returns teacher's class list with student_count per class.
// Role gate: teacher or tutor only.
// ---------------------------------------------------------------------------

interface ClassGroupRow {
  id: string;
  name: string;
  year_level: number | null;
  created_at: string;
}

interface ClassStudentCountRow {
  class_id: string;
  student_id: string;
}

export async function handleGetMyClasses(
  userId: string,
  role: string,
  db: DbClient,
): Promise<HandlerResult<{ classes: ClassGroupDTO[] }>> {
  if (role !== 'teacher' && role !== 'tutor') {
    return { data: null, status: 403, error: 'FORBIDDEN' };
  }

  const { data: classRows, error: classErr } = (await db
    .from('class_group')
    .select('id,name,year_level,created_at')
    .eq('teacher_id', userId)
    .order('created_at', { ascending: false })) as {
    data: ClassGroupRow[] | null;
    error: unknown;
  };

  if (classErr) return { data: null, status: 500, error: 'DB_ERROR' };
  if (!classRows || classRows.length === 0) {
    return { data: { classes: [] }, status: 200 };
  }

  const classIds = classRows.map((c) => c.id);

  const { data: memberRows, error: memberErr } = (await db
    .from('class_student')
    .select('class_id,student_id')
    .in('class_id', classIds)) as { data: ClassStudentCountRow[] | null; error: unknown };

  if (memberErr) return { data: null, status: 500, error: 'DB_ERROR' };

  const countByClass = new Map<string, number>();
  for (const r of memberRows ?? []) {
    countByClass.set(r.class_id, (countByClass.get(r.class_id) ?? 0) + 1);
  }

  const classes: ClassGroupDTO[] = classRows.map((c) => ({
    id: c.id,
    name: c.name,
    year_level: c.year_level ?? null,
    student_count: countByClass.get(c.id) ?? 0,
    created_at: c.created_at,
  }));

  return { data: { classes }, status: 200 };
}

// ---------------------------------------------------------------------------
// handleGetClassStudents — GET /users/classes/{class_id}/students
//
// Returns paginated student roster for a class.
// Teacher must own the class (class_group.teacher_id = userId).
// page_size = 50; ?page = 1-based.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

interface UserProfileRow {
  id: string;
  display_name: string | null;
  year_level: number | null;
}

interface SessionRow {
  student_id: string;
  raw_score: number | null;
  submitted_at: string | null;
}

interface MasteryRow {
  student_id: string;
  mastery_level: number;
}

interface ClassOwnerRow {
  teacher_id: string;
}

export async function handleGetClassStudents(
  classId: string,
  userId: string,
  role: string,
  page: number,
  db: DbClient,
): Promise<HandlerResult<ClassStudentsResponse>> {
  if (role !== 'teacher' && role !== 'tutor' && role !== 'org_admin' && role !== 'platform_admin') {
    return { data: null, status: 403, error: 'FORBIDDEN' };
  }

  if (role === 'teacher' || role === 'tutor') {
    const { data: ownerRows } = (await db
      .from('class_group')
      .select('teacher_id')
      .eq('id', classId)
      .limit(1)) as { data: ClassOwnerRow[] | null; error: unknown };
    if (ownerRows?.[0]?.teacher_id !== userId) {
      return { data: null, status: 403, error: 'FORBIDDEN' };
    }
  }

  const { data: memberRows, error: memberErr } = (await db
    .from('class_student')
    .select('student_id')
    .eq('class_id', classId)) as { data: Array<{ student_id: string }> | null; error: unknown };

  if (memberErr) return { data: null, status: 500, error: 'DB_ERROR' };

  const allStudentIds = (memberRows ?? []).map((r) => r.student_id);
  const total = allStudentIds.length;
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * PAGE_SIZE;
  const pageStudentIds = allStudentIds.slice(offset, offset + PAGE_SIZE);

  if (pageStudentIds.length === 0) {
    return {
      data: { students: [], total, page: safePage, page_size: PAGE_SIZE },
      status: 200,
    };
  }

  const [profileRes, sessionRes, masteryRes] = await Promise.all([
    db
      .from('user_profile')
      .select('id,display_name,year_level')
      .in('id', pageStudentIds) as unknown as Promise<{
        data: UserProfileRow[] | null;
        error: unknown;
      }>,
    db
      .from('session_record')
      .select('student_id,raw_score,submitted_at')
      .in('student_id', pageStudentIds)
      .eq('status', 'processed')
      .order('submitted_at', { ascending: false }) as unknown as Promise<{
        data: SessionRow[] | null;
        error: unknown;
      }>,
    db
      .from('skill_mastery')
      .select('student_id,mastery_level')
      .in('student_id', pageStudentIds) as unknown as Promise<{
        data: MasteryRow[] | null;
        error: unknown;
      }>,
  ]);

  if (profileRes.error) return { data: null, status: 500, error: 'DB_ERROR' };
  if (sessionRes.error) return { data: null, status: 500, error: 'DB_ERROR' };
  if (masteryRes.error) return { data: null, status: 500, error: 'DB_ERROR' };

  // Build lookup maps
  const profileMap = new Map<string, UserProfileRow>();
  for (const p of profileRes.data ?? []) profileMap.set(p.id, p);

  const sessionsByStudent = new Map<string, SessionRow[]>();
  for (const s of sessionRes.data ?? []) {
    const list = sessionsByStudent.get(s.student_id) ?? [];
    list.push(s);
    sessionsByStudent.set(s.student_id, list);
  }

  const masteryCountMap = new Map<string, number>();
  for (const m of masteryRes.data ?? []) {
    if (m.mastery_level >= 0.8) {
      masteryCountMap.set(m.student_id, (masteryCountMap.get(m.student_id) ?? 0) + 1);
    }
  }

  const students: StudentRowDTO[] = pageStudentIds.map((sid) => {
    const profile = profileMap.get(sid);
    const sessions = sessionsByStudent.get(sid) ?? [];
    const last5 = sessions.slice(0, 5);
    const scored = last5.filter((s): s is SessionRow & { raw_score: number } => s.raw_score !== null);
    const avgScore =
      scored.length > 0 ? scored.reduce((acc, s) => acc + s.raw_score, 0) / scored.length : null;
    return {
      id: sid,
      display_name: profile?.display_name ?? null,
      year_level: profile?.year_level ?? null,
      last_session_at: sessions[0]?.submitted_at ?? null,
      avg_score: avgScore,
      mastery_summary: masteryCountMap.get(sid) ?? 0,
    };
  });

  return {
    data: { students, total, page: safePage, page_size: PAGE_SIZE },
    status: 200,
  };
}
