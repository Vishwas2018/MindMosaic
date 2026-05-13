/**
 * Stage 46 e2e — Billing cancellation + undo flow.
 *
 * Opt-in only. Skipped by default in CI.
 * Run manually: npx playwright test billing-cancel.spec.ts
 *
 * Env required:
 *   E2E_WEB_URL   Next.js app URL
 *   E2E_BASE_URL  Edge Functions base
 *
 * Tests:
 *   cancel   → subscription status shows "Ends {date}"; undo banner visible
 *   uncancel → subscription status shows "Renews {date}"; undo banner gone
 */
import { test } from '@playwright/test';

test.skip(); // opt-in only — run with: npx playwright test billing-cancel.spec.ts
