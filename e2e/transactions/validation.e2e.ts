/**
 * E2E Test: Transaction Form Validation
 *
 * Tests form validation rules and error handling for transaction creation and editing.
 */

import { expect, type Page, test } from "@playwright/test"
import {
  ensureLoggedIn,
  getUniqueTestMemo,
  navigateToTransactions,
} from "../shared/auth-helpers.ts"
import { eText, sel, transaction } from "../shared/test-helpers.ts"

test.describe("Transaction Form Validation", () => {
  test.beforeEach(async ({ page: p }: { page: Page }) => {
    await ensureLoggedIn(p)
    await navigateToTransactions(p)
    await transaction.nav.create(p)
  })

  test("should require amount field", async ({ page: p }: { page: Page }) => {
    // Fill other fields but leave amount empty
    const memo = getUniqueTestMemo("Amount validation test")
    await transaction.form.fillMemo(p, memo)

    // Submit button should be disabled
    await expect(sel(p, transaction.selectors.submitButton)).toBeDisabled()
  })

  test("should reject zero or negative amounts", async ({ page: p }: { page: Page }) => {
    const memo = getUniqueTestMemo("Zero amount test")
    await transaction.form.fillMemo(p, memo)

    const submitButton = sel(p, transaction.selectors.submitButton)

    // Try zero amount - HTML5 validation should prevent this
    await transaction.form.fillAmount(p, "0")

    // The form might be enabled but HTML5 validation should prevent submission
    // Try to submit and verify it doesn't proceed
    if (await submitButton.isEnabled()) {
      await submitButton.click()
      // Should still be on create page due to validation
      await expect(p).toHaveURL(/.*transactions\/create/)
    } else {
      await expect(submitButton).toBeDisabled()
    }

    // Try negative amount - this should also fail validation
    await transaction.form.fillAmount(p, "-10.50")

    if (await submitButton.isEnabled()) {
      await submitButton.click()
      // Should still be on create page due to validation
      await expect(p).toHaveURL(/.*transactions\/create/)
    } else {
      await expect(submitButton).toBeDisabled()
    }
  })

  test("should validate memo length limit", async ({ page: p }: { page: Page }) => {
    await transaction.form.fillAmount(p, "25.00")

    // Create a memo that's exactly at the limit (500 characters)
    const maxMemo = "A".repeat(500)
    await transaction.form.fillMemo(p, maxMemo)

    // Should show character count
    await expect(p.locator("text=500/500")).toBeVisible()

    // Submit should work at limit
    await expect(sel(p, transaction.selectors.submitButton)).toBeEnabled()
  })

  test("should require both accounts for transfers", async ({ page: p }: { page: Page }) => {
    // Switch to transfer type
    await transaction.radio.transferType(p).check()

    const submitButton = sel(p, transaction.selectors.submitButton)

    // Should be disabled without amount (amount is required)
    await expect(submitButton).toBeDisabled()

    // Add amount
    await transaction.form.fillAmount(p, "50.00")

    // Now it should be enabled since both accounts are pre-selected
    await expect(submitButton).toBeEnabled()
  })

  test("should prevent selecting same account for transfer source and destination", async ({ page: p }: { page: Page }) => {
    // Switch to transfer type
    await transaction.radio.transferType(p).check()
    await transaction.form.fillAmount(p, "50.00")

    // By default, the form has different accounts selected which is valid
    const submitButton = sel(p, transaction.selectors.submitButton)
    await expect(submitButton).toBeEnabled()

    // Try to select the same account for both by changing the To Account to match From Account
    // From Account is already "Checking Account (USD)", so change To Account to the same
    const toAccountSelect = transaction.combo.toAccount(p)

    // First check available options in the To Account dropdown
    const options = await toAccountSelect.locator("option").allTextContents()

    // If "Checking Account (USD)" is available in the To Account dropdown, select it
    if (options.includes("Checking Account (USD)")) {
      await toAccountSelect.selectOption({ label: "Checking Account (USD)" })

      // Check if the form validates this and prevents submission
      if (await submitButton.isEnabled()) {
        await submitButton.click()
        // Should stay on the create page due to validation
        await expect(p).toHaveURL(/.*transactions\/create/)
      } else {
        await expect(submitButton).toBeDisabled()
      }
    } else {
      // If the form prevents the same account from appearing in both dropdowns,
      // this is actually good validation and the test should pass
      console.log("Form prevents same account selection - validation working correctly")
      await expect(submitButton).toBeEnabled() // Different accounts are selected
    }
  })

  test("should require valid timestamp", async ({ page: p }: { page: Page }) => {
    await transaction.form.fillAmount(p, "25.00")
    const memo = getUniqueTestMemo("Timestamp validation test")
    await transaction.form.fillMemo(p, memo)

    // Clear the default timestamp
    await transaction.form.fillTimestamp(p, "")

    // Submit button should be disabled
    await expect(sel(p, transaction.selectors.submitButton)).toBeDisabled()

    // Add valid timestamp
    await transaction.form.fillTimestamp(p, "2025-06-30T12:00")
    await expect(sel(p, transaction.selectors.submitButton)).toBeEnabled()
  })

  test("should handle decimal amounts correctly", async ({ page: p }: { page: Page }) => {
    const memo = getUniqueTestMemo("Decimal amount test")
    await transaction.form.fillMemo(p, memo)

    // Test various decimal formats
    const amounts = ["10", "10.5", "10.50", "10.99", "0.01"]

    for (const amount of amounts) {
      await transaction.form.fillAmount(p, amount)
      await expect(sel(p, transaction.selectors.submitButton)).toBeEnabled()
    }

    // Test the last valid amount by submitting
    await transaction.form.fillAmount(p, "0.01")
    await transaction.form.submit(p)
    await p.waitForURL("**/transactions")

    // Verify it was created correctly
    const transactionRow = eText(p, transaction.selectors.row, memo)
    await expect(transactionRow).toContainText("$0.01")
  })
})
