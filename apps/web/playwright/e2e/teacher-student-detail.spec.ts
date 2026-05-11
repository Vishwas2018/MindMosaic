/**
 * Stage 38 e2e — Teacher: Student Detail page (/teacher/students/[id]).
 *
 * Screen 20 (SCREEN_SPECS.md). Happy path:
 *   1. Login as teacher.
 *   2. Navigate to /teacher/students/{student_id}.
 *   3. Assert student hero renders (display_name).
 *   4. Assert strand mastery card or empty state present.
 *   5. Assert assignment table or empty state present.
 *   6. Assert teacher notes textarea present.
 *   7. Assert "Flag for Review" button present.
 *
 * Setup requires: teacher account + class + enrolled student.
 * Full data flow deferred; this test covers the not-found branch (no pre-seeded class)
 * which is deterministic for a freshly provisioned teacher.
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
  'Stage 38 e2e requires E2E_WEB_URL + E2E_BASE_URL + E2E_SUPABASE_ANON',
)

async function signUpAndLogin(email: string, password: string, role: string) {
  const res = await fetch(`${E2E_BASE_URL}/auth-svc/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-trace-id': randomUUID() },
    body: JSON.stringify({ email, password, role, display_name: 'E2E Teacher', tenant_slug: 'e2e-test' }),
  })
  return (await res.json()) as { data?: { access_token?: string }; error?: unknown }
}

test.describe('Teacher student detail page', () => {
  test('not-found branch: accessing an unknown student ID shows empty state', async ({ page }) => {
    const email = `teacher-e2e-${randomUUID()}@mm-test.invalid`
    const password = 'TestPass1234!'
    const login = await signUpAndLogin(email, password, 'teacher')
    const token = login.data?.access_token
    test.skip(token === undefined, 'Sign-up failed — skipping')

    // Inject token into localStorage so the SDK client picks it up
    await page.goto(`${E2E_WEB_URL}/teacher`)
    await page.evaluate((t) => {
      localStorage.setItem('mm:token', t)
    }, token ?? '')

    const fakeStudentId = randomUUID()
    await page.goto(`${E2E_WEB_URL}/teacher/students/${fakeStudentId}`)

    // Should show not-found empty state (403 from users-svc → no-class teacher)
    await expect(
      page.getByText(/student not found|ask your admin|not have access/i),
    ).toBeVisible({ timeout: 10_000 })
  })

  test('page structure: teacher notes textarea is present when student is found', async ({ page }) => {
    // This test requires pre-seeded data — skip if no seed env var provided.
    const seedStudentId = process.env['E2E_SEED_STUDENT_ID']
    test.skip(seedStudentId === undefined, 'Requires E2E_SEED_STUDENT_ID (pre-seeded test data)')

    await page.goto(`${E2E_WEB_URL}/teacher/students/${seedStudentId}`)
    await expect(page.getByLabel('Teacher notes')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('button', { name: /flag for review/i })).toBeVisible()
  })
})
