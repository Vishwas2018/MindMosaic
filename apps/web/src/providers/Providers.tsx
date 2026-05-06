'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { MmClient, MmClientProvider } from '@mm/sdk'
import { ToastProvider, TooltipProvider } from '@mm/ui'
import { AuthProvider, useAuth } from './AuthProvider'
import { EntitlementsProvider } from './EntitlementsProvider'
import { createClient as createSupabaseBrowserClient } from '../lib/supabase/client'

// ADR-0029: single MmClient at ${SUPABASE_URL}/functions/v1; each SDK hook
// prepends its service prefix in the path. baseUrl is read from the same env
// var the Supabase browser client already uses.
function buildBaseUrl(): string {
  const root = process.env['NEXT_PUBLIC_SUPABASE_URL'] ?? ''
  return `${root.replace(/\/+$/, '')}/functions/v1`
}

function MmClientWiring({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  // Refresh-safe token resolver: ask the Supabase browser client for the
  // current session at fetch time rather than closing over a stale token.
  // Stable identity across renders so React Query keys remain consistent.
  const client = useMemo(
    () =>
      new MmClient({
        baseUrl: buildBaseUrl(),
        getToken: async () => {
          const supabase = createSupabaseBrowserClient()
          const { data } = await supabase.auth.getSession()
          return data.session?.access_token ?? session?.access_token ?? null
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  return <MmClientProvider client={client}>{children}</MmClientProvider>
}

export function Providers({
  children,
  initialSession,
}: {
  children: ReactNode
  initialSession: Session | null
}) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider initialSession={initialSession}>
        <MmClientWiring>
          <EntitlementsProvider>
            <TooltipProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </TooltipProvider>
          </EntitlementsProvider>
        </MmClientWiring>
      </AuthProvider>
    </QueryClientProvider>
  )
}
