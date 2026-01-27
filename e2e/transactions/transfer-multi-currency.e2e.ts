/**
 * E2E: Multi-currency transfer flows
 *
 * Tests cross-currency transfer previews, exchange rate display and created transactions.
 */

import { expect, type Page, test } from "@playwright/test"
import {
  ensureLoggedIn,
  getUniqueTestMemo,
  navigateToTransactions,
} from "../shared/auth-helpers.ts"
import { sel, transaction } from "../shared/test-helpers.ts"

test.describe("Transfer - multi currency", () => {
  test.beforeEach(async ({ page }: { page: Page }) => {
    await ensureLoggedIn(page)
    await navigateToTransactions(page)
    await transaction.nav.create(page)
    // Switch to transfer type
    await transaction.radio.transferType(page).check()
  })

  async function selectAccountByCurrency(page: Page, dataE2E: string, code: string) {
    const select = sel(page, `[data-e2e="${dataE2E}"]`)
    const option = select.locator("option").filter({ hasText: `(${code})` }).first()
    const value = await option.getAttribute("value")
    if (!value) throw new Error(`No account option found for currency ${code}`)
    await select.selectOption(value)
  }

  async function cleanupByMemo(page: Page, memo: string) {
    // Delete all transactions with this memo using UI dropdown -> Delete
    // Accept confirm dialogs
    while (await page.locator(`tr:has-text("${memo}")`).count() > 0) {
      await transaction.actions.openDropdown(page, memo)
      page.once("dialog", (d) => d.accept())
      await page.getByText("Delete").click()
      // wait for deletion to reflect
      await page.waitForTimeout(200)
    }
  }

  test("Transfer USD→JPY", async ({ page }: { page: Page }) => {
    const memo = getUniqueTestMemo("USD→JPY")

    // Select accounts
    await selectAccountByCurrency(page, "transfer-from-account", "USD")
    await selectAccountByCurrency(page, "transfer-to-account", "JPY")

    // Fill amount and memo
    await sel(page, '[data-e2e="transfer-amount"]').fill("100.00")
    await sel(page, '[data-e2e="transfer-memo"]').fill(memo)

    // Preview should show ~15,560 JPY (100 * 155.5954 -> 15,559.54 -> rounded 15,560)
    await expect(page.getByText("¥15,560")).toBeVisible()

    // Submit
    await sel(page, '[data-e2e="transfer-submit"]').click()
    await page.waitForURL("**/transactions")

    // Verify two transactions created with same memo: one USD and one JPY
    const rows = page.locator(`tr:has-text("${memo}")`)
    await expect(rows).toHaveCount(2)

    // Check amounts present in the two rows
    const firstAmount = await rows.nth(0).locator('[data-e2e="transaction-amount-link"]')
      .innerText()
    const secondAmount = await rows.nth(1).locator('[data-e2e="transaction-amount-link"]')
      .innerText()
    expect(firstAmount.includes("$100.00") || secondAmount.includes("$100.00")).toBeTruthy()
    expect(firstAmount.includes("¥15,560") || secondAmount.includes("¥15,560")).toBeTruthy()

    // Clean up
    await cleanupByMemo(page, memo)
  })

  test("Transfer JPY→USD", async ({ page }: { page: Page }) => {
    const memo = getUniqueTestMemo("JPY→USD")

    await selectAccountByCurrency(page, "transfer-from-account", "JPY")
    await selectAccountByCurrency(page, "transfer-to-account", "USD")

    await sel(page, '[data-e2e="transfer-amount"]').fill("10000")
    await sel(page, '[data-e2e="transfer-memo"]').fill(memo)

    // 10,000 JPY -> ~64.29 USD
    await expect(page.getByText("$64.29")).toBeVisible()

    await sel(page, '[data-e2e="transfer-submit"]').click()
    await page.waitForURL("**/transactions")

    const rows = page.locator(`tr:has-text("${memo}")`)
    await expect(rows).toHaveCount(2)

    const amounts = [
      await rows.nth(0).locator('[data-e2e="transaction-amount-link"]').innerText(),
      await rows.nth(1).locator('[data-e2e="transaction-amount-link"]').innerText(),
    ]

    expect(amounts.some((t) => t.includes("¥10,000"))).toBeTruthy()
    expect(amounts.some((t) => t.includes("$64.29"))).toBeTruthy()

    await cleanupByMemo(page, memo)
  })

  test("Transfer GBP→USD", async ({ page }: { page: Page }) => {
    const memo = getUniqueTestMemo("GBP→USD")

    await selectAccountByCurrency(page, "transfer-from-account", "GBP")
    await selectAccountByCurrency(page, "transfer-to-account", "USD")

    await sel(page, '[data-e2e="transfer-amount"]').fill("50.00")
    await sel(page, '[data-e2e="transfer-memo"]').fill(memo)

    // 50 GBP -> ~63.07 USD
    await expect(page.getByText("$63.07")).toBeVisible()

    await sel(page, '[data-e2e="transfer-submit"]').click()
    await page.waitForURL("**/transactions")

    const rows = page.locator(`tr:has-text("${memo}")`)
    await expect(rows).toHaveCount(2)

    const amounts = [
      await rows.nth(0).locator('[data-e2e="transaction-amount-link"]').innerText(),
      await rows.nth(1).locator('[data-e2e="transaction-amount-link"]').innerText(),
    ]

    expect(amounts.some((t) => t.includes("£50.00") || t.includes("GBP"))).toBeTruthy()
    expect(amounts.some((t) => t.includes("$63.07") || t.includes("USD"))).toBeTruthy()

    await cleanupByMemo(page, memo)
  })

  test("Exchange rate display matches expected", async ({ page }: { page: Page }) => {
    // USD -> JPY
    await selectAccountByCurrency(page, "transfer-from-account", "USD")
    await selectAccountByCurrency(page, "transfer-to-account", "JPY")
    await expect(page.getByText("1 USD = 155.5954 JPY")).toBeVisible()

    // GBP -> USD
    await selectAccountByCurrency(page, "transfer-from-account", "GBP")
    await selectAccountByCurrency(page, "transfer-to-account", "USD")
    await expect(page.getByText("1 GBP = 1.2614 USD")).toBeVisible()
  })
})
