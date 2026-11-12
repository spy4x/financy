/**
 * The quick entry: on any page, `t` opens a new transaction with every field but the amount taken
 * from the person's last one, so typing an amount and pressing Enter adds it and goes back to the
 * page the person was on.
 */
import { type APIRequestContext, type Page } from "@playwright/test"
import { expect, test } from "./fixtures/stack.ts"
import { signIn } from "./fixtures/app.ts"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"
import { openAccounts, openCategories } from "./fixtures/groups.ts"
import { payForGroup, signUpWithCode } from "./fixtures/sign-up.ts"

const apiBase = "http://app.localhost"
const headers = { origin: apiBase, "sec-fetch-site": "same-origin" }
const password = "Passw0rd!"

async function cleanup(request: APIRequestContext, email: string): Promise<void> {
  const response = await request.post(`${apiBase}/api/test/cleanup-user`, {
    data: { login: email },
  })
  expect.soft(response.status(), await response.text()).toBe(200)
}

async function signUp(request: APIRequestContext, email: string): Promise<void> {
  const response = await signUpWithCode(request, `${apiBase}/api/auth/password/sign-up`, {
    headers,
    data: { email, password },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

/** Creates a household on the paid plan as the page's user: the free plan allows no entries. */
async function household(page: Page, name: string): Promise<void> {
  const groupId = uuidV7()
  const created = await page.request.post(`${apiBase}/api/groups`, {
    headers,
    data: { id: groupId, name },
  })
  expect(created.status(), await created.text()).toBe(201)
  await payForGroup(page.request, apiBase, groupId)
}

const rail = (page: Page) => page.getByRole("navigation", { name: "Main navigation" })
const amount = (page: Page) => page.locator("[data-e2e=transaction-amount-field] input[type=text]")
const chosen = (page: Page, field: string) =>
  page.locator(`select[data-e2e=transaction-${field}] option:checked`)

test.describe("transactions", () => {
  test.describe.configure({ timeout: 90_000 })

  test("t on the accounts page, an amount and Enter add an entry like the last one and go back to the accounts", async ({ page, request }) => {
    const owner = "e2e_transactions_quick@example.com"
    await cleanup(request, owner)
    try {
      await signUp(request, owner)
      await signIn(page, owner, password)
      await expect(page.locator("[data-e2e=shell-ws-status]")).toHaveText("Online")
      await household(page, "Daily money")

      await openCategories(page, "Daily money")
      await page.locator("[data-e2e=category-new]").click()
      await page.locator("[data-e2e=category-name-input]").fill("Coffee")
      await page.locator("[data-e2e=category-save]").click()
      await expect(page.locator("[data-e2e=category-save]")).toHaveCount(0)

      await openAccounts(page, "Daily money")
      await page.locator("[data-e2e=account-new]").click()
      await page.locator("[data-e2e=account-name-input]").fill("Wallet")
      const currency = page.locator("[data-e2e=account-currency-field] input")
      await currency.fill("EUR")
      await currency.press("Enter")
      await page.locator("[data-e2e=account-save]").click()
      await expect(page.locator("[data-e2e=account-save]")).toHaveCount(0)

      // The first entry, from the list: nothing to take a category from yet.
      await rail(page).getByRole("link", { name: "Transactions" }).click()
      await expect(page).toHaveURL("/transactions")
      await page.locator("[data-e2e=transaction-new-empty]").click()
      await expect(amount(page)).toBeFocused()
      await expect(chosen(page, "account")).toHaveText("Wallet · EUR")
      await amount(page).fill("4.50")
      await page.locator("select[data-e2e=transaction-category]").selectOption({ label: "Coffee" })
      await page.locator("[data-e2e=transaction-memo]").fill("Latte")
      await page.locator("[data-e2e=transaction-save]").click()
      await expect(page).toHaveURL("/transactions")
      await expect(page.locator("[data-e2e=transaction-row]")).toHaveCount(1)

      // The quick entry from another page: only the amount is typed.
      await rail(page).getByRole("link", { name: "Accounts" }).click()
      await expect(page).toHaveURL("/accounts")
      await page.keyboard.press("t")
      await expect(page).toHaveURL(/\/transactions\/new/)
      await expect(amount(page)).toBeFocused()
      await expect(chosen(page, "account")).toHaveText("Wallet · EUR")
      await expect(chosen(page, "category")).toHaveText("Coffee")
      await expect(page.locator("[data-e2e=transaction-kind] [aria-checked=true]")).toHaveText(
        "Expense",
      )
      await page.keyboard.type("3")
      await page.keyboard.press("Enter")
      await expect(page).toHaveURL("/accounts")

      await rail(page).getByRole("link", { name: "Transactions" }).click()
      const rows = page.locator("[data-e2e=transaction-row]")
      await expect(rows).toHaveCount(2)
      await expect(rows.first()).toHaveAttribute("aria-label", "Expense of €3.00 in Coffee, Today")
      await expect(rows.first().locator("[data-e2e=transaction-meta]")).toHaveText("Wallet · You")
      await expect(rows.nth(1)).toHaveAttribute("aria-label", "Expense of €4.50 in Coffee, Today")
    } finally {
      await cleanup(request, owner)
    }
  })
})
