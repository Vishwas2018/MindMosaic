/**
 * assignments-svc handlers — Stage 33.
 *
 * Full assignment lifecycle: create, read, update, publish, archive,
 * list-for-student, list-for-class, tracking, start.
 *
 * Spec refs: arch §4.8, §6.6; spec §24.1–§24.8; Q-33.1–Q-33.8; ADR-0034.
 * Boundaries:
 *   assessment-svc: POST /sessions/create forwards student JWT + assignment_id + pathway_id (Q-33.1 Option A, Q-33.8 Option A).
 *   analytics-svc:  DraftAssignmentDTO → CreateAssignmentRequest conversion happens in teacher UI (Stage 39); no conversion shim here.
 */

// ---------------------------------------------------------------------------
// DbClient contract (mirrors analytics-svc shape for test harness parity)
// ---------------------------------------------------------------------------

export interface DbClient {
  from(table: string): DbBuilder;
}

export type DbBuilder = {
  select: (cols: string) => DbBuilder;
  insert: (row: unknown) => DbBuilder;
  update: (patch: unknown) => DbBuilder;
  upsert: (row: unknown, opts?: { onConflict?: string }) => DbBuilder;
  delete: () => DbBuilder;
  eq: (col: string, val: unknown) => DbBuilder;
  neq: (col: string, val: unknown) => DbBuilder;
  in: (col: string, vals: unknown[]) => DbBuilder;
  gte: (col: string, val: unknown) => DbBuilder;
  is: (col: string, val: null) => DbBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => DbBuilder;
  limit: (n: number) => DbBuilder;
  single: () => DbBuilder;
} & PromiseLike<{ data: unknown; error: unknown }>;

// ---------------------------------------------------------------------------
// Caller — extracted by index.ts from Bearer JWT
// ---------------------------------------------------------------------------

export interface Caller {
  userId: string;
  role: string;
  tenantId: string;
}

// ---------------------------------------------------------------------------
// Public DTO types (mirror @mm/types shapes, includes Q-33.8 pathway_id)
// ---------------------------------------------------------------------------

export interface AssignmentDTO {
  id: string;
  title: string;
  description: string | null;
  mode: string;
  pathway_id: string;
  target_skill_ids: string[];
  target_skill_names: string[];
  difficulty_range: { min: number; max: number } | null;
  item_count: number;
  time_limit_ms: number | null;
  due_at: string | null;
  status: string;
  auto_generated: boolean;
  rationale: string | null;
  created_by: { id: string; display_name: string };
  created_at: string;
  published_at: string | null;
}

export interface StudentAssignmentDTO extends AssignmentDTO {
  my_status: string;
  my_session_id: string | null;
  completed_at: string | null;
}

export interface AssignmentTrackingDTO {
  assignment_id: string;
  targets: Array<{
    student_id: string;
    display_name: string;
    status: string;
    session_id: string | null;
    score: number | null;
    completed_at: string | null;
  }>;
  completion_rate: number;
}

// ---------------------------------------------------------------------------
// Internal row types
// ---------------------------------------------------------------------------

interface AssignmentRow {
  id: string;
  tenant_id: string;
  created_by: string;
  title: string;
  description: string | null;
  mode: string;
  pathway_id: string;
  target_skill_ids: string[];
  difficulty_range: { min: number; max: number } | null;
  item_count: number;
  time_limit_ms: number | null;
  due_at: string | null;
  status: string;
  auto_generated: boolean;
  rationale: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  archived_at: string | null;
}

interface AssignmentTargetRow {
  assignment_id: string;
  student_id: string | null;
  class_id: string | null;
}

interface AssignmentSessionRow {
  assignment_id: string;
  student_id: string;
  tenant_id: string;
  session_id: string | null;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SkillNodeRow {
  id: string;
  name: string;
}

interface UserProfileRow {
  id: string;
  display_name: string;
  tenant_id: string;
}

interface ClassStudentRow {
  student_id: string;
}

interface ClassGroupRow {
  teacher_id: string;
}

// ---------------------------------------------------------------------------
// Result type alias
// ---------------------------------------------------------------------------

type HandlerResult<T> = { data: T | null; status: number; error?: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isTeacherOrAdmin(role: string): boolean {
  return (
    role === 'teacher' ||
    role === 'tutor' ||
    role === 'org_admin' ||
    role === 'platform_admin'
  );
}

function isAdmin(role: string): boolean {
  return role === 'org_admin' || role === 'platform_admin';
}

async function fetchAssignment(
  assignmentId: string,
  db: DbClient,
): Promise<AssignmentRow | null> {
  const { data: rows, error } = (await db
    .from('assignment')
    .select(
      'id,tenant_id,created_by,title,description,mode,pathway_id,target_skill_ids,difficulty_range,item_count,time_limit_ms,due_at,status,auto_generated,rationale,created_at,updated_at,published_at,archived_at',
    )
    .eq('id', assignmentId)
    .limit(1)) as { data: AssignmentRow[] | null; error: unknown };
  if (error || !rows?.[0]) return null;
  return rows[0]!;
}

async function fetchSkillNames(
  skillIds: string[],
  db: DbClient,
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (skillIds.length === 0) return nameMap;
  const { data: rows } = (await db
    .from('skill_node')
    .select('id,name')
    .in('id', skillIds)) as { data: SkillNodeRow[] | null; error: unknown };
  for (const r of rows ?? []) nameMap.set(r.id, r.name);
  return nameMap;
}

async function fetchDisplayName(userId: string, db: DbClient): Promise<string> {
  const { data: rows } = (await db
    .from('user_profile')
    .select('display_name')
    .eq('id', userId)
    .limit(1)) as { data: UserProfileRow[] | null; error: unknown };
  return rows?.[0]?.display_name ?? '';
}

function buildAssignmentDTO(
  row: AssignmentRow,
  skillNames: Map<string, string>,
  creatorDisplayName: string,
): AssignmentDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    mode: row.mode,
    pathway_id: row.pathway_id,
    target_skill_ids: row.target_skill_ids,
    target_skill_names: row.target_skill_ids.map((id) => skillNames.get(id) ?? id),
    difficulty_range: row.difficulty_range,
    item_count: row.item_count,
    time_limit_ms: row.time_limit_ms,
    due_at: row.due_at,
    status: row.status,
    auto_generated: row.auto_generated,
    rationale: row.rationale,
    created_by: { id: row.created_by, display_name: creatorDisplayName },
    created_at: row.created_at,
    published_at: row.published_at,
  };
}

// ---------------------------------------------------------------------------
// createAssignment
// ---------------------------------------------------------------------------

interface CreateBody {
  title: string;
  description?: string;
  mode: string;
  pathway_id: string;
  target_skill_ids: string[];
  difficulty_range?: { min: number; max: number } | null;
  item_count: number;
  time_limit_ms?: number | null;
  due_at?: string | null;
  targets: Array<{ type: 'student' | 'class'; id: string }>;
  auto_generated?: boolean;
  rationale?: string | null;
}

function parseCreateBody(raw: unknown): CreateBody {
  if (typeof raw !== 'object' || raw === null) throw new Error('body must be an object');
  const b = raw as Record<string, unknown>;
  if (typeof b['title'] !== 'string') throw new Error('title required (string)');
  if (typeof b['mode'] !== 'string') throw new Error('mode required (string)');
  if (typeof b['pathway_id'] !== 'string') throw new Error('pathway_id required (string uuid)');
  if (!Array.isArray(b['target_skill_ids'])) throw new Error('target_skill_ids required (array)');
  if (typeof b['item_count'] !== 'number') throw new Error('item_count required (number)');
  if (!Array.isArray(b['targets'])) throw new Error('targets required (array)');
  return {
    title: b['title'],
    description: typeof b['description'] === 'string' ? b['description'] : undefined,
    mode: b['mode'],
    pathway_id: b['pathway_id'],
    target_skill_ids: b['target_skill_ids'] as string[],
    difficulty_range:
      typeof b['difficulty_range'] === 'object' && b['difficulty_range'] !== null
        ? (b['difficulty_range'] as { min: number; max: number })
        : null,
    item_count: b['item_count'],
    time_limit_ms: typeof b['time_limit_ms'] === 'number' ? b['time_limit_ms'] : null,
    due_at: typeof b['due_at'] === 'string' ? b['due_at'] : null,
    targets: b['targets'] as Array<{ type: 'student' | 'class'; id: string }>,
    auto_generated: typeof b['auto_generated'] === 'boolean' ? b['auto_generated'] : false,
    rationale: typeof b['rationale'] === 'string' ? b['rationale'] : null,
  };
}

export async function createAssignment(
  rawBody: unknown,
  idempotencyKey: string | null,
  caller: Caller,
  db: DbClient,
): Promise<HandlerResult<AssignmentDTO>> {
  if (!isTeacherOrAdmin(caller.role)) return { data: null, status: 403, error: 'FORBIDDEN' };

  let body: CreateBody;
  try {
    body = parseCreateBody(rawBody);
  } catch (e) {
    return { data: null, status: 400, error: `BAD_REQUEST: ${String(e)}` };
  }

  // DEV-20260523-1 + ISSUE-0023: Idempotency-Key parsed but not enforced in v1.
  if (idempotencyKey !== null) {
    console.info(JSON.stringify({ op: 'idempotency_key_received', key: idempotencyKey }));
  }

  // Q-33.8 v1 single-pathway constraint: all target_skill_ids must belong to the specified pathway.
  if (body.target_skill_ids.length > 0) {
    const { data: validSkills } = (await db
      .from('skill_node')
      .select('id')
      .in('id', body.target_skill_ids)
      .eq('pathway_id', body.pathway_id)) as { data: SkillNodeRow[] | null; error: unknown };
    const validCount = validSkills?.length ?? 0;
    if (validCount < body.target_skill_ids.length) {
      return {
        data: null,
        status: 422,
        error: 'UNPROCESSABLE: target_skill_ids contains skills from other pathways',
      };
    }
  }

  const { data: inserted, error: insertErr } = (await db
    .from('assignment')
    .insert({
      tenant_id: caller.tenantId,
      created_by: caller.userId,
      title: body.title,
      description: body.description ?? null,
      mode: body.mode,
      pathway_id: body.pathway_id,
      target_skill_ids: body.target_skill_ids,
      difficulty_range: body.difficulty_range ?? null,
      item_count: body.item_count,
      time_limit_ms: body.time_limit_ms ?? null,
      due_at: body.due_at ?? null,
      auto_generated: body.auto_generated ?? false,
      rationale: body.rationale ?? null,
    })
    .select(
      'id,tenant_id,created_by,title,description,mode,pathway_id,target_skill_ids,difficulty_range,item_count,time_limit_ms,due_at,status,auto_generated,rationale,created_at,updated_at,published_at,archived_at',
    )
    .single()) as { data: AssignmentRow | null; error: unknown };
  if (insertErr || !inserted) {
    return { data: null, status: 500, error: 'DB_ERROR' };
  }

  if (body.targets.length > 0) {
    const targetRows = body.targets.map((t) => ({
      assignment_id: inserted.id,
      student_id: t.type === 'student' ? t.id : null,
      class_id: t.type === 'class' ? t.id : null,
    }));
    const { error: targetErr } = (await db
      .from('assignment_target')
      .insert(targetRows)) as { data: unknown; error: unknown };
    if (targetErr) return { data: null, status: 500, error: 'DB_ERROR' };
  }

  const [skillNames, displayName] = await Promise.all([
    fetchSkillNames(inserted.target_skill_ids, db),
    fetchDisplayName(inserted.created_by, db),
  ]);

  return { data: buildAssignmentDTO(inserted, skillNames, displayName), status: 201 };
}

// ---------------------------------------------------------------------------
// getAssignment
// ---------------------------------------------------------------------------

export async function getAssignment(
  assignmentId: string,
  caller: Caller,
  db: DbClient,
): Promise<HandlerResult<AssignmentDTO>> {
  const row = await fetchAssignment(assignmentId, db);
  if (!row) return { data: null, status: 404, error: 'NOT_FOUND' };

  // Role gate per spec §24.8
  if (isAdmin(caller.role)) {
    // always allowed
  } else if (caller.role === 'teacher' || caller.role === 'tutor') {
    if (row.created_by !== caller.userId) {
      // Check if teacher owns a class targeted by this assignment
      const { data: targets } = (await db
        .from('assignment_target')
        .select('class_id')
        .eq('assignment_id', assignmentId)) as {
        data: AssignmentTargetRow[] | null;
        error: unknown;
      };
      const classIds = (targets ?? []).map((t) => t.class_id).filter(Boolean) as string[];
      if (classIds.length === 0) return { data: null, status: 403, error: 'FORBIDDEN' };
      const { data: classRows } = (await db
        .from('class_group')
        .select('teacher_id')
        .in('id', classIds)) as { data: ClassGroupRow[] | null; error: unknown };
      const owns = (classRows ?? []).some((c) => c.teacher_id === caller.userId);
      if (!owns) return { data: null, status: 403, error: 'FORBIDDEN' };
    }
  } else if (caller.role === 'student') {
    const { data: sessionRows } = (await db
      .from('assignment_session')
      .select('assignment_id')
      .eq('assignment_id', assignmentId)
      .eq('student_id', caller.userId)
      .limit(1)) as { data: AssignmentSessionRow[] | null; error: unknown };
    if (!sessionRows?.[0]) return { data: null, status: 403, error: 'FORBIDDEN' };
  } else {
    return { data: null, status: 403, error: 'FORBIDDEN' };
  }

  const [skillNames, displayName] = await Promise.all([
    fetchSkillNames(row.target_skill_ids, db),
    fetchDisplayName(row.created_by, db),
  ]);

  return { data: buildAssignmentDTO(row, skillNames, displayName), status: 200 };
}

// ---------------------------------------------------------------------------
// updateAssignment
// ---------------------------------------------------------------------------

interface UpdateBody {
  title?: string;
  description?: string | null;
  mode?: string;
  pathway_id?: string;
  target_skill_ids?: string[];
  difficulty_range?: { min: number; max: number } | null;
  item_count?: number;
  time_limit_ms?: number | null;
  due_at?: string | null;
  rationale?: string | null;
}

function parseUpdateBody(raw: unknown): UpdateBody {
  if (typeof raw !== 'object' || raw === null) throw new Error('body must be an object');
  const b = raw as Record<string, unknown>;
  const patch: UpdateBody = {};
  if (typeof b['title'] === 'string') patch.title = b['title'];
  if (typeof b['description'] === 'string' || b['description'] === null)
    patch.description = b['description'] as string | null;
  if (typeof b['mode'] === 'string') patch.mode = b['mode'];
  if (typeof b['pathway_id'] === 'string') patch.pathway_id = b['pathway_id'];
  if (Array.isArray(b['target_skill_ids'])) patch.target_skill_ids = b['target_skill_ids'] as string[];
  if (typeof b['item_count'] === 'number') patch.item_count = b['item_count'];
  if (typeof b['time_limit_ms'] === 'number' || b['time_limit_ms'] === null)
    patch.time_limit_ms = b['time_limit_ms'] as number | null;
  if (typeof b['due_at'] === 'string' || b['due_at'] === null)
    patch.due_at = b['due_at'] as string | null;
  if (typeof b['rationale'] === 'string' || b['rationale'] === null)
    patch.rationale = b['rationale'] as string | null;
  if (
    typeof b['difficulty_range'] === 'object' &&
    b['difficulty_range'] !== null
  ) {
    patch.difficulty_range = b['difficulty_range'] as { min: number; max: number };
  } else if (b['difficulty_range'] === null) {
    patch.difficulty_range = null;
  }
  return patch;
}

export async function updateAssignment(
  assignmentId: string,
  rawBody: unknown,
  caller: Caller,
  db: DbClient,
): Promise<HandlerResult<AssignmentDTO>> {
  const row = await fetchAssignment(assignmentId, db);
  if (!row) return { data: null, status: 404, error: 'NOT_FOUND' };

  if (row.status !== 'draft') {
    return { data: null, status: 422, error: 'UNPROCESSABLE: assignment is not in draft status' };
  }

  if (!isAdmin(caller.role) && row.created_by !== caller.userId) {
    return { data: null, status: 403, error: 'FORBIDDEN' };
  }

  let patch: UpdateBody;
  try {
    patch = parseUpdateBody(rawBody);
  } catch (e) {
    return { data: null, status: 400, error: `BAD_REQUEST: ${String(e)}` };
  }

  const { data: updated, error: updateErr } = (await db
    .from('assignment')
    .update(patch)
    .eq('id', assignmentId)
    .select(
      'id,tenant_id,created_by,title,description,mode,pathway_id,target_skill_ids,difficulty_range,item_count,time_limit_ms,due_at,status,auto_generated,rationale,created_at,updated_at,published_at,archived_at',
    )
    .single()) as { data: AssignmentRow | null; error: unknown };
  if (updateErr || !updated) return { data: null, status: 500, error: 'DB_ERROR' };

  const [skillNames, displayName] = await Promise.all([
    fetchSkillNames(updated.target_skill_ids, db),
    fetchDisplayName(updated.created_by, db),
  ]);

  return { data: buildAssignmentDTO(updated, skillNames, displayName), status: 200 };
}

// ---------------------------------------------------------------------------
// publishAssignment
// ---------------------------------------------------------------------------

export async function publishAssignment(
  assignmentId: string,
  caller: Caller,
  db: DbClient,
): Promise<HandlerResult<AssignmentDTO>> {
  if (!isTeacherOrAdmin(caller.role)) return { data: null, status: 403, error: 'FORBIDDEN' };

  const row = await fetchAssignment(assignmentId, db);
  if (!row) return { data: null, status: 404, error: 'NOT_FOUND' };
  if (row.status !== 'draft') {
    return { data: null, status: 422, error: 'UNPROCESSABLE: assignment is not in draft status' };
  }

  // Expand targets to distinct student_ids
  const { data: targets, error: targetErr } = (await db
    .from('assignment_target')
    .select('assignment_id,student_id,class_id')
    .eq('assignment_id', assignmentId)) as {
    data: AssignmentTargetRow[] | null;
    error: unknown;
  };
  if (targetErr) return { data: null, status: 500, error: 'DB_ERROR' };

  const directStudentIds = (targets ?? [])
    .filter((t) => t.student_id !== null)
    .map((t) => t.student_id as string);

  const classIds = (targets ?? [])
    .filter((t) => t.class_id !== null)
    .map((t) => t.class_id as string);

  const classStudentIds: string[] = [];
  for (const classId of classIds) {
    const { data: roster } = (await db
      .from('class_student')
      .select('student_id')
      .eq('class_id', classId)) as { data: ClassStudentRow[] | null; error: unknown };
    for (const r of roster ?? []) classStudentIds.push(r.student_id);
  }

  const allStudentIds = [...new Set([...directStudentIds, ...classStudentIds])];

  if (allStudentIds.length > 0) {
    const sessionRows = allStudentIds.map((sid) => ({
      assignment_id: assignmentId,
      student_id: sid,
      tenant_id: row.tenant_id,
      status: 'pending',
    }));
    const { error: sessionErr } = (await db
      .from('assignment_session')
      .insert(sessionRows)) as { data: unknown; error: unknown };
    if (sessionErr) return { data: null, status: 500, error: 'DB_ERROR' };

    const outboxRows = allStudentIds.map((sid) => ({
      aggregate_type: 'assignment',
      aggregate_id: assignmentId,
      event_type: 'assignment_assigned',
      payload: {
        assignment_id: assignmentId,
        student_id: sid,
        tenant_id: row.tenant_id,
        published_at: new Date().toISOString(),
      },
    }));
    const { error: outboxErr } = (await db
      .from('outbox_event')
      .insert(outboxRows)) as { data: unknown; error: unknown };
    if (outboxErr) return { data: null, status: 500, error: 'DB_ERROR' };
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = (await db
    .from('assignment')
    .update({ status: 'published', published_at: now })
    .eq('id', assignmentId)
    .select(
      'id,tenant_id,created_by,title,description,mode,pathway_id,target_skill_ids,difficulty_range,item_count,time_limit_ms,due_at,status,auto_generated,rationale,created_at,updated_at,published_at,archived_at',
    )
    .single()) as { data: AssignmentRow | null; error: unknown };
  if (updateErr || !updated) return { data: null, status: 500, error: 'DB_ERROR' };

  const [skillNames, displayName] = await Promise.all([
    fetchSkillNames(updated.target_skill_ids, db),
    fetchDisplayName(updated.created_by, db),
  ]);

  return { data: buildAssignmentDTO(updated, skillNames, displayName), status: 200 };
}

// ---------------------------------------------------------------------------
// archiveAssignment
// ---------------------------------------------------------------------------

export async function archiveAssignment(
  assignmentId: string,
  caller: Caller,
  db: DbClient,
): Promise<HandlerResult<AssignmentDTO>> {
  if (!isTeacherOrAdmin(caller.role)) return { data: null, status: 403, error: 'FORBIDDEN' };

  const row = await fetchAssignment(assignmentId, db);
  if (!row) return { data: null, status: 404, error: 'NOT_FOUND' };
  if (row.status === 'archived') {
    return { data: null, status: 422, error: 'UNPROCESSABLE: assignment is already archived' };
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = (await db
    .from('assignment')
    .update({ status: 'archived', archived_at: now })
    .eq('id', assignmentId)
    .select(
      'id,tenant_id,created_by,title,description,mode,pathway_id,target_skill_ids,difficulty_range,item_count,time_limit_ms,due_at,status,auto_generated,rationale,created_at,updated_at,published_at,archived_at',
    )
    .single()) as { data: AssignmentRow | null; error: unknown };
  if (updateErr || !updated) return { data: null, status: 500, error: 'DB_ERROR' };

  const [skillNames, displayName] = await Promise.all([
    fetchSkillNames(updated.target_skill_ids, db),
    fetchDisplayName(updated.created_by, db),
  ]);

  return { data: buildAssignmentDTO(updated, skillNames, displayName), status: 200 };
}

// ---------------------------------------------------------------------------
// getAssignmentsForStudent
// ---------------------------------------------------------------------------

export async function getAssignmentsForStudent(
  studentId: string,
  statusFilter: string | null,
  caller: Caller,
  db: DbClient,
): Promise<HandlerResult<StudentAssignmentDTO[]>> {
  // Role gate per spec §24.8 Q-33.4 Option B:
  // Student: own only. Non-teacher cross-student → 403.
  if (caller.role === 'student' && caller.userId !== studentId) {
    return { data: null, status: 403, error: 'FORBIDDEN' };
  }
  if (!isTeacherOrAdmin(caller.role) && caller.role !== 'parent' && caller.role !== 'student') {
    return { data: null, status: 403, error: 'FORBIDDEN' };
  }

  let sessionQuery = db
    .from('assignment_session')
    .select('assignment_id,student_id,tenant_id,session_id,status,completed_at,created_at,updated_at')
    .eq('student_id', studentId);

  if (statusFilter !== null) {
    sessionQuery = sessionQuery.eq('status', statusFilter);
  }

  const { data: sessionRows, error: sessionErr } = (await sessionQuery) as {
    data: AssignmentSessionRow[] | null;
    error: unknown;
  };
  if (sessionErr) return { data: null, status: 500, error: 'DB_ERROR' };
  if (!sessionRows || sessionRows.length === 0) return { data: [], status: 200 };

  const assignmentIds = sessionRows.map((s) => s.assignment_id);
  const { data: assignmentRows, error: asgErr } = (await db
    .from('assignment')
    .select(
      'id,tenant_id,created_by,title,description,mode,pathway_id,target_skill_ids,difficulty_range,item_count,time_limit_ms,due_at,status,auto_generated,rationale,created_at,updated_at,published_at,archived_at',
    )
    .in('id', assignmentIds)) as { data: AssignmentRow[] | null; error: unknown };
  if (asgErr) return { data: null, status: 500, error: 'DB_ERROR' };

  const asgMap = new Map<string, AssignmentRow>();
  for (const a of assignmentRows ?? []) asgMap.set(a.id, a);

  const allSkillIds = [...new Set((assignmentRows ?? []).flatMap((a) => a.target_skill_ids))];
  const creatorIds = [...new Set((assignmentRows ?? []).map((a) => a.created_by))];

  const skillNames = await fetchSkillNames(allSkillIds, db);

  const displayNames = new Map<string, string>();
  for (const creatorId of creatorIds) {
    const name = await fetchDisplayName(creatorId, db);
    displayNames.set(creatorId, name);
  }

  const sessionByAssignment = new Map<string, AssignmentSessionRow>();
  for (const s of sessionRows) sessionByAssignment.set(s.assignment_id, s);

  const result: StudentAssignmentDTO[] = [];
  for (const session of sessionRows) {
    const asg = asgMap.get(session.assignment_id);
    if (!asg) continue;
    const base = buildAssignmentDTO(asg, skillNames, displayNames.get(asg.created_by) ?? '');
    result.push({
      ...base,
      my_status: session.status,
      my_session_id: session.session_id,
      completed_at: session.completed_at,
    });
  }

  return { data: result, status: 200 };
}

// ---------------------------------------------------------------------------
// getAssignmentsForClass
// ---------------------------------------------------------------------------

export async function getAssignmentsForClass(
  classId: string,
  caller: Caller,
  db: DbClient,
): Promise<HandlerResult<AssignmentDTO[]>> {
  if (!isTeacherOrAdmin(caller.role)) return { data: null, status: 403, error: 'FORBIDDEN' };

  if (caller.role === 'teacher' || caller.role === 'tutor') {
    const { data: classRows } = (await db
      .from('class_group')
      .select('teacher_id')
      .eq('id', classId)
      .limit(1)) as { data: ClassGroupRow[] | null; error: unknown };
    if (classRows?.[0]?.teacher_id !== caller.userId) {
      return { data: null, status: 403, error: 'FORBIDDEN' };
    }
  }

  const { data: targets, error: targetErr } = (await db
    .from('assignment_target')
    .select('assignment_id')
    .eq('class_id', classId)) as { data: AssignmentTargetRow[] | null; error: unknown };
  if (targetErr) return { data: null, status: 500, error: 'DB_ERROR' };

  const assignmentIds = [...new Set((targets ?? []).map((t) => t.assignment_id))];
  if (assignmentIds.length === 0) return { data: [], status: 200 };

  const { data: rows, error: asgErr } = (await db
    .from('assignment')
    .select(
      'id,tenant_id,created_by,title,description,mode,pathway_id,target_skill_ids,difficulty_range,item_count,time_limit_ms,due_at,status,auto_generated,rationale,created_at,updated_at,published_at,archived_at',
    )
    .in('id', assignmentIds)) as { data: AssignmentRow[] | null; error: unknown };
  if (asgErr) return { data: null, status: 500, error: 'DB_ERROR' };

  const allSkillIds = [...new Set((rows ?? []).flatMap((a) => a.target_skill_ids))];
  const skillNames = await fetchSkillNames(allSkillIds, db);

  const result: AssignmentDTO[] = [];
  for (const row of rows ?? []) {
    const displayName = await fetchDisplayName(row.created_by, db);
    result.push(buildAssignmentDTO(row, skillNames, displayName));
  }

  return { data: result, status: 200 };
}

// ---------------------------------------------------------------------------
// getAssignmentTracking
// ---------------------------------------------------------------------------

export async function getAssignmentTracking(
  assignmentId: string,
  caller: Caller,
  db: DbClient,
): Promise<HandlerResult<AssignmentTrackingDTO>> {
  if (!isTeacherOrAdmin(caller.role)) return { data: null, status: 403, error: 'FORBIDDEN' };

  const { data: sessionRows, error: sessionErr } = (await db
    .from('assignment_session')
    .select('assignment_id,student_id,session_id,status,completed_at,created_at,updated_at,tenant_id')
    .eq('assignment_id', assignmentId)) as { data: AssignmentSessionRow[] | null; error: unknown };
  if (sessionErr) return { data: null, status: 500, error: 'DB_ERROR' };

  const sessions = sessionRows ?? [];
  const studentIds = sessions.map((s) => s.student_id);

  const displayNames = new Map<string, string>();
  for (const sid of studentIds) {
    const name = await fetchDisplayName(sid, db);
    displayNames.set(sid, name);
  }

  const total = sessions.length;
  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const completionRate = total > 0 ? completedCount / total : 0;

  const trackingTargets = sessions.map((s) => ({
    student_id: s.student_id,
    display_name: displayNames.get(s.student_id) ?? '',
    status: s.status,
    session_id: s.session_id,
    score: null, // spec §24: score not in assignment_session schema; v1 returns null
    completed_at: s.completed_at,
  }));

  return {
    data: {
      assignment_id: assignmentId,
      targets: trackingTargets,
      completion_rate: completionRate,
    },
    status: 200,
  };
}

// ---------------------------------------------------------------------------
// startAssignment
// studentId is the authenticated caller's userId, extracted by index.ts.
// authorizationHeader forwarded to assessment-svc per Q-33.1 Option A.
// pathway_id read from assignment row per Q-33.8 Option A.
// ---------------------------------------------------------------------------

export async function startAssignment(
  assignmentId: string,
  studentId: string,
  authorizationHeader: string | null,
  idempotencyKey: string | null,
  traceId: string,
  db: DbClient,
  assessmentSvcUrl: string,
): Promise<HandlerResult<{ session_id: string; assignment_session_status: string }>> {
  // DEV-20260523-1 + ISSUE-0023: Idempotency-Key parsed but not enforced in v1.
  if (idempotencyKey !== null) {
    console.info(JSON.stringify({ op: 'idempotency_key_received', key: idempotencyKey, student_id: studentId }));
  }

  const row = await fetchAssignment(assignmentId, db);
  if (!row) return { data: null, status: 404, error: 'NOT_FOUND' };

  if (row.status !== 'published') {
    return { data: null, status: 422, error: 'UNPROCESSABLE: assignment is not published' };
  }

  const { data: sessionRows, error: sessionErr } = (await db
    .from('assignment_session')
    .select('assignment_id,student_id,session_id,status,completed_at,created_at,updated_at,tenant_id')
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)
    .limit(1)) as { data: AssignmentSessionRow[] | null; error: unknown };
  if (sessionErr) return { data: null, status: 500, error: 'DB_ERROR' };

  const existingSession = sessionRows?.[0];
  if (!existingSession) return { data: null, status: 404, error: 'NOT_FOUND' };
  if (existingSession.status !== 'pending') {
    return { data: null, status: 422, error: 'UNPROCESSABLE: assignment already started or completed' };
  }

  if (!authorizationHeader) {
    return { data: null, status: 401, error: 'UNAUTHENTICATED' };
  }

  // Q-33.8 Option A: read pathway_id from assignment row; forward to POST /sessions/create.
  const sessionRes = await fetch(`${assessmentSvcUrl}/sessions/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorizationHeader,
      'x-mm-trace-id': traceId,
    },
    body: JSON.stringify({
      assessment_profile_id: null,
      repair_sequence_id: null,
      assignment_id: assignmentId,
      mode: row.mode,
      target_skills: row.target_skill_ids,
      pathway_id: row.pathway_id, // Q-33.8 Option A: sourced from assignment row
    }),
  });

  if (!sessionRes.ok) {
    const bodyText = await sessionRes.text().catch(() => '');
    return {
      data: null,
      status: sessionRes.status,
      error: `UPSTREAM_ERROR: assessment-svc ${sessionRes.status}: ${bodyText}`,
    };
  }

  const sessionBody = (await sessionRes.json()) as { data?: { session_id?: string } };
  const newSessionId = sessionBody?.data?.session_id;
  if (!newSessionId) {
    return {
      data: null,
      status: 502,
      error: 'UPSTREAM_ERROR: session_id missing from assessment-svc response',
    };
  }

  const { error: updateErr } = (await db
    .from('assignment_session')
    .update({ status: 'in_progress', session_id: newSessionId })
    .eq('assignment_id', assignmentId)
    .eq('student_id', studentId)) as { data: unknown; error: unknown };
  if (updateErr) return { data: null, status: 500, error: 'DB_ERROR' };

  return {
    data: { session_id: newSessionId, assignment_session_status: 'in_progress' },
    status: 200,
  };
}

// ---------------------------------------------------------------------------
// markOverdue (invoked by pg_cron in production; exposed for e2e test simulation)
// ---------------------------------------------------------------------------

export async function markOverdue(db: DbClient): Promise<{ updated: number }> {
  const now = new Date();
  const { data: rows, error } = (await db
    .from('assignment_session')
    .select('assignment_id,student_id')
    .in('status', ['pending', 'in_progress'])) as {
    data: Array<{ assignment_id: string; student_id: string }> | null;
    error: unknown;
  };
  if (error) throw new Error(`markOverdue query failed: ${String(error)}`);

  const candidates = rows ?? [];
  const overdue: Array<{ assignment_id: string; student_id: string }> = [];

  for (const c of candidates) {
    const { data: asgRows } = (await db
      .from('assignment')
      .select('due_at')
      .eq('id', c.assignment_id)
      .limit(1)) as { data: Array<{ due_at: string | null }> | null; error: unknown };
    const dueAt = asgRows?.[0]?.due_at;
    if (dueAt !== null && dueAt !== undefined) {
      const overdueThreshold = new Date(dueAt).getTime() + 24 * 60 * 60 * 1000;
      if (now.getTime() > overdueThreshold) {
        overdue.push(c);
      }
    }
  }

  if (overdue.length === 0) return { updated: 0 };

  for (const o of overdue) {
    await db
      .from('assignment_session')
      .update({ status: 'overdue' })
      .eq('assignment_id', o.assignment_id)
      .eq('student_id', o.student_id);
  }

  return { updated: overdue.length };
}

// ---------------------------------------------------------------------------
// syncAssignmentCompletion (invoked by pg_cron; exposed for e2e test simulation)
// ---------------------------------------------------------------------------

export async function syncAssignmentCompletion(db: DbClient): Promise<{ updated: number }> {
  const { data: rows, error } = (await db
    .from('assignment_session')
    .select('assignment_id,student_id,session_id')
    .eq('status', 'in_progress')) as {
    data: Array<{ assignment_id: string; student_id: string; session_id: string | null }> | null;
    error: unknown;
  };
  if (error) throw new Error(`syncAssignmentCompletion query failed: ${String(error)}`);

  const candidates = (rows ?? []).filter((r) => r.session_id !== null);
  let updated = 0;

  for (const c of candidates) {
    const { data: srRows } = (await db
      .from('session_record')
      .select('status,updated_at')
      .eq('id', c.session_id!)
      .limit(1)) as { data: Array<{ status: string; updated_at: string }> | null; error: unknown };
    const sr = srRows?.[0];
    if (sr?.status === 'processed') {
      await db
        .from('assignment_session')
        .update({ status: 'completed', completed_at: sr.updated_at })
        .eq('assignment_id', c.assignment_id)
        .eq('student_id', c.student_id);
      updated++;
    }
  }

  return { updated };
}
