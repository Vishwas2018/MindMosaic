import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getRoleHome } from './lib/auth/role-home'

const PUBLIC_PREFIXES = ['/login', '/signup', '/forgot-password', '/reset-password', '/auth']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env['NEXT_PUBLIC_SUPABASE_URL']!,
    process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // Refresh session — required for @supabase/ssr cookie hygiene
  const { data: { session } } = await supabase.auth.getSession()

  const isPublic = PUBLIC_PREFIXES.some(p => pathname.startsWith(p)) || pathname === '/'

  if (!session && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (session && isPublic && pathname !== '/') {
    const role = (session.user.app_metadata?.['role'] as string) ?? 'student'
    const url = request.nextUrl.clone()
    url.pathname = getRoleHome(role)
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon|logo|manifest|.*\\.svg|.*\\.png|.*\\.ico|.*\\.webmanifest).*)',
  ],
}
