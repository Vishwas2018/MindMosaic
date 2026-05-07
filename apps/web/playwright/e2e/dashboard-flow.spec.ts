/**
 * Stage 25 e2e — Student Dashboard v1 happy path.
 *
 * Flow (DEV_PLAN Stage 25 deliverable):
 *   1. Sign up + login a fresh student via auth-svc.
 *   2. Navigate to /dashboard.
 *   3. Assert the six sections are present:
 *      - Greeting heading (h1)
 *      - "Start first session" or "Start new session" CTA (no active session)
 *      - "Quick start" section heading
 *      - "Mastery snapshot" section heading
 *      - "Recent sessions" section heading
 *      - "Your progress" section heading
 *   4. Assert mastery stub copy is visible.
 *   5. Assert streak stub "—" is visible.
 *
 * Env required (set via .env.test or shell):
 *   E2E_WEB_URL          Next.js app URL
 *   E2E_BASE_URL         Edge Functions base
 *   E2E_SUPABASE_ANON    Anon key
 *
 * Skips when env not provisioned. CI integration deferred to Stage 26
 * per Q-19.9.
 */
import { expect, test } from '@playwright/test'
import { randomUUID } from 'crypto'

const E2E_WEB_URL = process.env['E2E_WEB_URL']
const E2E_BASE_URL = process.env['E2E_BASE_URL']
const E2E_ANON = process.env['E2E_SUPABASE_ANON']

test.skip(
  E2E_WEB_URL === undefined || E2E_BASE_URL === undefined || E2E_ANON === undefined,
  'Stage 25 e2e requires E2E_WEB_URL + E2E_BASE_URL + E2E_SUPABASE_ANON',
)

async function signUpAndGetToken(baseUrl: string, anon: string): Promise<string> {
  const email = `test-${randomUUID()}@example.com`
  const password = 'TestPassword123!'
  const res = await fetch(`${baseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anon },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`signup failed: ${res.status}`)
  const body = (await res.json()) as { access_token?: string }
  const token = body.access_token
  if (token === undefined) throw new Error('signup: no access_token in response')
  return token
}

test('dashboard flow — signup → /dashboard → all six sections render', async ({ page }) => {
  const webUrl = E2E_WEB_URL as string
  const baseUrl = E2E_BASE_URL as string
  const anon = E2E_ANON as string

  // 1. Sign up + inject session cookie.
  const token = await signUpAndGetToken(baseUrl, anon)
  await page.goto(`${webUrl}/dashboard`)
  await page.evaluate(([t]: string[]) => {
    localStorage.setItem('sb-access-token', t ?? '')
  }, [token])
  await page.goto(`${webUrl}/dashboard`)

  // 2. Wait for the dashboard to load (greeting h1 appears).
  await page.waitForSelector('h1', { timeout: 10000 })

  // 3. Assert greeting heading is present.
  const h1 = page.locator('h1')
  await expect(h1).toBeVisible()
  const greeting = await h1.textContent()
  expect(greeting).toMatch(/good morning|good afternoon|good evening|hello/i)

  // 4. Assert "Start first session" CTA (fresh account has no sessions).
  await expect(
    page.getByRole('button', { name: /start first session/i }),
  ).toBeVisible({ timeout: 8000 })

  // 5. Assert section headings are present.
  await expect(page.getByText('Quick start')).toBeVisible()
  await expect(page.getByText('Mastery snapshot')).toBeVisible()
  await expect(page.getByText('Recent sessions')).toBeVisible()
  await expect(page.getByText('Your progress')).toBeVisible()

  // 6. Assert mastery stub copy.
  await expect(
    page.getByText(/full mastery data in a future release/i),
  ).toBeVisible()

  // 7. Assert streak stub.
  await expect(page.getByText('Coming soon')).toBeVisible()
})
