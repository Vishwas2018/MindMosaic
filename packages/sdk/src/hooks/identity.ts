// hooks/identity.ts → users-svc (per ADR-0029)
import { useQuery } from '@tanstack/react-query';
import { UserMeDTOSchema, TenantDTOSchema } from '@mm/types';
import { useMmClient } from '../context.js';
import { mmKeys } from '../keys.js';

export function useMe() {
  const client = useMmClient();
  return useQuery({
    queryKey: mmKeys.users.me(),
    queryFn: () => client.get('/users-svc/users/me', UserMeDTOSchema).then((r) => r.data),
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
