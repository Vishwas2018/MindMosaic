// X4: mmKeys query-key factory. Hierarchy: .all() → root invalidation; .byId(id) → specific.
export const mmKeys = {
  users: {
    all: () => ['users'] as const,
    me: () => ['users', 'me'] as const,
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
  },
  intelligence: {
    all: () => ['intelligence'] as const,
    learningDNA: (studentId: string) => ['intelligence', 'learningDNA', studentId] as const,
    skillProgress: (skillId: string) => ['intelligence', 'skillProgress', skillId] as const,
    causalMap: (studentId: string) => ['intelligence', 'causalMap', studentId] as const,
  },
  orchestration: {
    all: () => ['orchestration'] as const,
    learningPlan: (studentId: string) => ['orchestration', 'learningPlan', studentId] as const,
    pathwayReadiness: (slug: string) => ['orchestration', 'pathwayReadiness', slug] as const,
  },
} as const;
