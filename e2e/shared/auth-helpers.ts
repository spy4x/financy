/**
 * Shared authentication helpers for E2E tests
 */

import type { Page } from "@playwright/test"
import { sel } from "./test-helpers.ts"

const APP_URL = "http://fn.localhost"
const TEST_CREDENTIALS = {
  email: "test@test.com",
  password: "pass1234",
}

/**
 * Sign in with test credentials if not already logged in
 */
export async function ensureLoggedIn(page: Page): Promise<void> {
  // Navigate to the application
  await page.goto(APP_URL)

  // Wait for the page to load
  await page.waitForLoadState("networkidle")

  // Check if already logged in (look for main content)
  const isLoggedIn = await sel(page, "main").isVisible()

  if (!isLoggedIn) {
    // Sign in with test credentials using data-e2e selectors
    await sel(page, '[data-e2e="login-email-input"]').fill(TEST_CREDENTIALS.email)
    await sel(page, '[data-e2e="login-password-input"]').fill(TEST_CREDENTIALS.password)
    await sel(page, '[data-e2e="login-submit-button"]').click()

    // Wait for login to complete - look for dashboard
    await page.waitForSelector("main", { timeout: 10000 })
  }
}

/**
 * Navigate to transactions page
 */
export async function navigateToTransactions(page: Page): Promise<void> {
  await page.goto(`${APP_URL}/transactions`)
  await page.waitForLoadState("networkidle")
}

/**
 * Get a unique memo for test transactions
 */
export function getUniqueTestMemo(prefix: string): string {
  return `${prefix} - ${Date.now()}`
}

export { APP_URL, TEST_CREDENTIALS }
