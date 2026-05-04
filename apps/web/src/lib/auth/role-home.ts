export const ROLE_HOME: Record<string, string> = {
  student:        '/dashboard',
  parent:         '/parent',
  teacher:        '/teacher',
  tutor:          '/teacher',
  org_admin:      '/admin',
  platform_admin: '/admin',
}

export function getRoleHome(role: string): string {
  return ROLE_HOME[role] ?? '/dashboard'
}
