/**
 * notifications-svc handlers — Stage 34.
 *
 * Endpoints served (via index.ts routing):
 *   GET  /notifications/me?unread=   Bearer — own notifications ordered created_at DESC
 *   PATCH /notifications/{id}/read   Bearer — mark one notification read
 *   POST /notifications/read-all     Bearer — mark all unread read
 *   POST /notifications/pipeline/create  service-role — create notification from job payload
 *
 * Ownership: notifications-svc is the sole writer to the `notification` table (arch §1.2 NTF).
 * RLS Pattern E: notification_own FOR ALL TO authenticated USING (user_id = auth_user_id()).
 *   - User-facing endpoints use service-role DB client; filter by user_id explicitly.
 *   - Pipeline/create writes via service-role (RLS bypassed — owner service write path).
 *
 * Spam guard: ISSUE-0025 — soft dedup on (user_id, type, metadata->>'aggregate_id') within 1h.
 * 100-cap: spec §27.3 — oldest unread trimmed to read_at when count exceeds 100.
 * DEV-20260524-1: 5s wall-clock SLA not testable in sandbox; chain tested directly.
 */

import { getNotificationCopy } from './notification-copy.ts';

// ---------------------------------------------------------------------------
// DbClient contract (mirrors analytics-svc shape)
// ---------------------------------------------------------------------------

export interface DbClient {
  from(table: string): DbBuilder;
}

export type DbBuilder = {
  select: (cols: string) => DbBuilder;
  insert: (row: unknown) => DbBuilder;
  update: (patch: unknown) => DbBuilder;
  eq: (col: string, val: unknown) => DbBuilder;
  in: (col: string, vals: unknown[]) => DbBuilder;
  is: (col: string, val: unknown) => DbBuilder;
  gte: (col: string, val: unknown) => DbBuilder;
  order: (col: string, opts?: { ascending?: boolean }) => DbBuilder;
  limit: (n: number) => DbBuilder;
  single: () => DbBuilder;
} & PromiseLike<{ data: unknown; error: unknown }>;

export interface Caller {
  userId: string;
  role: string;
}

type HandlerResult<T> = { data: T | null; status: number; error?: string };

// ---------------------------------------------------------------------------
// NotificationRow (internal)
// ---------------------------------------------------------------------------

interface NotificationRow {
  id: string;
  user_id: string;
  tenant_id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// NotificationDTO (mirrors arch §6.9 verbatim)
// ---------------------------------------------------------------------------

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

function rowToDTO(row: NotificationRow): NotificationDTO {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.read_at !== null,
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// CreateNotificationPayload (from jobs-worker via migration 0016)
// ---------------------------------------------------------------------------

interface CreateNotificationPayload {
  notification_type: string;
  tenant_id: string;
  // assignment_assigned fields
  assignment_id?: string;
  student_id?: string;
  published_at?: string;
  // plan_updated fields
  plan_id?: string;
  session_count?: number;
  // intervention_alert fields
  teacher_id?: string;
  alert_type?: string;
  // access_downgraded fields
  parent_id?: string;
}

function parseCreatePayload(raw: unknown): CreateNotificationPayload {
  if (typeof raw !== 'object' || raw === null) throw new Error('payload must be an object');
  const p = raw as Record<string, unknown>;
  if (typeof p['notification_type'] !== 'string') throw new Error('payload.notification_type required');
  if (typeof p['tenant_id'] !== 'string') throw new Error('payload.tenant_id required');
  return {
    notification_type: p['notification_type'],
    tenant_id: p['tenant_id'],
    assignment_id: typeof p['assignment_id'] === 'string' ? p['assignment_id'] : undefined,
    student_id: typeof p['student_id'] === 'string' ? p['student_id'] : undefined,
    published_at: typeof p['published_at'] === 'string' ? p['published_at'] : undefined,
    plan_id: typeof p['plan_id'] === 'string' ? p['plan_id'] : undefined,
    session_count: typeof p['session_count'] === 'number' ? p['session_count'] : undefined,
    teacher_id: typeof p['teacher_id'] === 'string' ? p['teacher_id'] : undefined,
    alert_type: typeof p['alert_type'] === 'string' ? p['alert_type'] : undefined,
    parent_id: typeof p['parent_id'] === 'string' ? p['parent_id'] : undefined,
  };
}

// ---------------------------------------------------------------------------
// getMyNotifications
// ---------------------------------------------------------------------------

export async function getMyNotifications(
  userId: string,
  unreadOnly: boolean,
  db: DbClient,
): Promise<HandlerResult<NotificationDTO[]>> {
  let q = db
    .from('notification')
    .select('id,user_id,tenant_id,type,title,body,link,read_at,metadata,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (unreadOnly) q = (q as unknown as DbBuilder).is('read_at', null);

  const { data, error } = (await q) as { data: NotificationRow[] | null; error: unknown };
  if (error) return { data: null, status: 500, error: 'DB_ERROR' };
  return { data: (data ?? []).map(rowToDTO), status: 200 };
}

// ---------------------------------------------------------------------------
// markRead
// ---------------------------------------------------------------------------

export async function markRead(
  notificationId: string,
  userId: string,
  db: DbClient,
): Promise<HandlerResult<NotificationDTO>> {
  const now = new Date().toISOString();
  const { data: existing, error: selectErr } = (await db
    .from('notification')
    .select('id,user_id,tenant_id,type,title,body,link,read_at,metadata,created_at')
    .eq('id', notificationId)
    .eq('user_id', userId)
    .single()) as { data: NotificationRow | null; error: unknown };
  if (selectErr || !existing) return { data: null, status: 404, error: 'NOT_FOUND' };

  if (existing.read_at !== null) {
    // Idempotent — already read; return as-is.
    return { data: rowToDTO(existing), status: 200 };
  }

  const { error: updateErr } = (await db
    .from('notification')
    .update({ read_at: now })
    .eq('id', notificationId)
    .eq('user_id', userId)) as { data: unknown; error: unknown };
  if (updateErr) return { data: null, status: 500, error: 'DB_ERROR' };

  return { data: rowToDTO({ ...existing, read_at: now }), status: 200 };
}

// ---------------------------------------------------------------------------
// markAllRead
// ---------------------------------------------------------------------------

export async function markAllRead(
  userId: string,
  db: DbClient,
): Promise<HandlerResult<{ count: number }>> {
  // ISSUE-0023 precedent: Idempotency-Key accepted at route layer, not server-side deduped in v1.
  const now = new Date().toISOString();

  // Get count of unread to return in response.
  const { data: unread, error: selectErr } = (await db
    .from('notification')
    .select('id')
    .eq('user_id', userId)
    .is('read_at', null)) as { data: { id: string }[] | null; error: unknown };
  if (selectErr) return { data: null, status: 500, error: 'DB_ERROR' };
  const count = (unread ?? []).length;
  if (count === 0) return { data: { count: 0 }, status: 200 };

  const { error: updateErr } = (await db
    .from('notification')
    .update({ read_at: now })
    .eq('user_id', userId)
    .is('read_at', null)) as { data: unknown; error: unknown };
  if (updateErr) return { data: null, status: 500, error: 'DB_ERROR' };

  return { data: { count }, status: 200 };
}

// ---------------------------------------------------------------------------
// createNotification — service-role pipeline handler
// ---------------------------------------------------------------------------

export async function createNotification(
  body: unknown,
  db: DbClient,
): Promise<HandlerResult<{ deduped: boolean; notification: NotificationDTO | null }>> {
  const payload = parseCreatePayload(body);
  const { notification_type, tenant_id } = payload;

  // Derive recipient user_id from notification type.
  let userId: string;
  let aggregateId: string;
  if (notification_type === 'assignment_assigned') {
    if (!payload.student_id) return { data: null, status: 400, error: 'student_id required for assignment_assigned' };
    if (!payload.assignment_id) return { data: null, status: 400, error: 'assignment_id required for assignment_assigned' };
    userId = payload.student_id;
    aggregateId = payload.assignment_id;
  } else if (notification_type === 'plan_updated') {
    if (!payload.student_id) return { data: null, status: 400, error: 'student_id required for plan_updated' };
    if (!payload.plan_id) return { data: null, status: 400, error: 'plan_id required for plan_updated' };
    userId = payload.student_id;
    aggregateId = payload.plan_id;
  } else if (notification_type === 'intervention_alert') {
    if (!payload.teacher_id) return { data: null, status: 400, error: 'teacher_id required for intervention_alert' };
    if (!payload.student_id) return { data: null, status: 400, error: 'student_id required for intervention_alert' };
    userId = payload.teacher_id;
    aggregateId = payload.student_id; // Q-34.6 self-resolve: student_id UUID as aggregate_id
  } else if (notification_type === 'access_downgraded') {
    if (!payload.parent_id) return { data: null, status: 400, error: 'parent_id required for access_downgraded' };
    userId = payload.parent_id;
    aggregateId = tenant_id;
  } else {
    return { data: null, status: 400, error: `unsupported notification_type: ${notification_type}` };
  }

  // ISSUE-0025: soft dedup — (user_id, type, aggregate_id) within 1h.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: existing, error: dedupErr } = (await db
    .from('notification')
    .select('id')
    .eq('user_id', userId)
    .eq('type', notification_type)
    .eq('metadata->>aggregate_id', aggregateId)
    .gte('created_at', oneHourAgo)
    .limit(1)) as { data: { id: string }[] | null; error: unknown };
  if (dedupErr) return { data: null, status: 500, error: 'DB_ERROR' };
  if ((existing ?? []).length > 0) {
    // ISSUE-0025: dedup hit within 1h window
    return { data: { deduped: true, notification: null }, status: 200 };
  }

  const copy = getNotificationCopy(notification_type, payload as unknown as Record<string, unknown>);
  const now = new Date().toISOString();
  const newRow: Omit<NotificationRow, 'id'> = {
    user_id: userId,
    tenant_id,
    type: notification_type,
    title: copy.title,
    body: copy.body,
    link: copy.link,
    read_at: null,
    metadata: { aggregate_id: aggregateId },
    created_at: now,
  };

  const { error: insertErr } = (await db
    .from('notification')
    .insert(newRow)) as { data: unknown; error: unknown };
  if (insertErr) return { data: null, status: 500, error: 'DB_ERROR' };

  // spec §27.3: 100-unread cap — trim oldest unread if count exceeds 100.
  const { data: unreadRows, error: capErr } = (await db
    .from('notification')
    .select('id')
    .eq('user_id', userId)
    .is('read_at', null)
    .order('created_at', { ascending: true })) as { data: { id: string }[] | null; error: unknown };
  if (!capErr && (unreadRows ?? []).length > 100) {
    const toTrim = (unreadRows ?? []).slice(0, (unreadRows ?? []).length - 100).map((r) => r.id);
    await db.from('notification').update({ read_at: now }).in('id', toTrim);
  }

  const dto: NotificationDTO = {
    id: '',
    type: notification_type,
    title: copy.title,
    body: copy.body,
    link: copy.link,
    read: false,
    created_at: now,
  };
  return { data: { deduped: false, notification: dto }, status: 201 };
}
