/**
 * Stage 37 e2e — Teacher Dashboard happy path.
 *
 * Flow:
 *   1. Sign up + login a fresh teacher account via auth-svc.
 *   2. Navigate to /teacher.
 *   3. Assert no-classes empty state ("Ask your admin to assign a class").
 *
 * Full end-to-end with class data deferred — requires class creation + teacher
 * assignment by admin API. This test covers the "no classes" branch which is
 * always true for a freshly provisioned teacher account.
 *
 * Env required:
 *   E2E_WEB_URL          Next.js app URL
 *   E2E_BASE_URL         Edge Functions base
 *   E2E_SUPABASE_ANON    Anon key
 *
 * Skips when env not provisioned.
 */
import { expect, test } from '@playwright/test'
import { randomUUID } from 'crypto'

const E2E_WEB_URL = process.env['E2E_WEB_URL']
const E2E_BASE_URL = process.env['E2E_BASE_URL']
const E2E_ANON = process.env['E2E_SUPABASE_ANON']

test.skip(
  E2E_WEB_URL === undefined || E2E_BASE_URL === undefined || E2E_ANON === undefined,
  'Stage 37 e2e requires E2E_WEB_URL + E2E_BASE_URL + E2E_SUPABASE_ANON',
)

async function signUpTeacherAndGetToken(baseUrl: string, anon: string): Promise<string> {
  const email = `teacher-${randomUUID()}@example.com`
  const password = 'TestPassword123!'
  const res = await fetch(`${baseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon },
    body: JSON.stringify({ email, password, data: { role: 'teacher' } }),
  })
  if (!res.ok) throw new Error(`signup failed: ${res.status}`)
  const body = (await res.json()) as { access_token?: string }
  const token = body.access_token
  if (token === undefined) throw new Error('signup: no access_token in response')
  return token
}

test('teacher dashboard — fresh teacher sees no-classes empty state', async ({ page }) => {
  const webUrl = E2E_WEB_URL as string
  const baseUrl = E2E_BASE_URL as string
  const anon = E2E_ANON as string

  const token = await signUpTeacherAndGetToken(baseUrl, anon)
  await page.goto(`${webUrl}/teacher`)
  await page.evaluate(([t]: string[]) => {
    localStorage.setItem('sb-access-token', t ?? '')
  }, [token])
  await page.goto(`${webUrl}/teacher`)

  // Fresh teacher has no classes — empty state must render.
  await expect(
    page.getByText(/no classes yet/i),
  ).toBeVisible({ timeout: 10000 })

  await expect(
    page.getByText(/ask your admin to assign a class/i),
  ).toBeVisible()
})
