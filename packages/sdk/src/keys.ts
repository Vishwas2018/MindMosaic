// X4: mmKeys query-key factory. Hierarchy: .all() → root invalidation; .byId(id) → specific.
export const mmKeys = {
  users: {
    all: () => ['users'] as const,
    me: () => ['users', 'me'] as const,
    children: () => ['users', 'children'] as const,
    classes: () => ['users', 'classes'] as const,
    classStudents: (classId: string) => ['users', 'classes', classId, 'students'] as const,
    student: (id: string) => ['users', 'students', id] as const,
  },
  tenants: {
    all: () => ['tenants'] as const,
    byId: (id: string) => ['tenants', id] as const,
  },
  pathways: {
    all: () => ['pathways'] as const,
    list: () => ['pathways', 'list'] as const,
  },
  assessmentProfiles: {
    all: () => ['assessmentProfiles'] as const,
    byId: (id: string) => ['assessmentProfiles', id] as const,
  },
  sessions: {
    all: () => ['sessions'] as const,
    byId: (id: string) => ['sessions', id] as const,
    state: (id: string) => ['sessions', id, 'state'] as const,
    summary: (id: string) => ['sessions', id, 'summary'] as const,
    recent: () => ['sessions', 'recent'] as const,
    childRecent: (studentId: string) => ['sessions', 'recent', studentId] as const,
    teacherRecent: (studentId: string) => ['sessions', 'teacher-recent', studentId] as const,
  },
  intelligence: {
    all: () => ['intelligence'] as const,
    learningDNA: (studentId: string) => ['intelligence', 'learningDNA', studentId] as const,
    learnerProfile: (studentId: string) => ['intelligence', 'learnerProfile', studentId] as const,
    skillProgress: (skillId: string) => ['intelligence', 'skillProgress', skillId] as const,
    causalMap: (studentId: string) => ['intelligence', 'causalMap', studentId] as const,
  },
  orchestration: {
    all: () => ['orchestration'] as const,
    learningPlan: (studentId: string) => ['orchestration', 'learningPlan', studentId] as const,
    pathwayReadiness: (studentId: string, slug: string) =>
      ['orchestration', 'pathwayReadiness', studentId, slug] as const,
  },
  analytics: {
    all: () => ['analytics'] as const,
    classKpi: (classId: string) => ['analytics', 'classKpi', classId] as const,
    interventionAlerts: (classId: string) => ['analytics', 'interventionAlerts', classId] as const,
    interventionAlert: (id: string) => ['analytics', 'interventionAlert', id] as const,
  },
  assignments: {
    all: () => ['assignments'] as const,
    forClass: (classId: string) => ['assignments', 'forClass', classId] as const,
    forStudent: (studentId: string) => ['assignments', 'forStudent', studentId] as const,
    byId: (id: string) => ['assignments', id] as const,
    tracking: (id: string) => ['assignments', id, 'tracking'] as const,
  },
  notifications: {
    all: () => ['notifications'] as const,
    mine: () => ['notifications', 'mine'] as const,
  },
  billing: {
    all: () => ['billing'] as const,
    plans: () => ['billing', 'plans'] as const,
    subscription: () => ['billing', 'subscription'] as const,
    invoices: () => ['billing', 'invoices'] as const,
  },
} as const;
