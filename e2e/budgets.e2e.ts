import { type APIRequestContext, type Page } from "@playwright/test"
import { expect, test } from "./fixtures/stack.ts"
import { signIn } from "./fixtures/app.ts"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"
import { openBudgets } from "./fixtures/groups.ts"
import { payForGroup, signUpWithCode } from "./fixtures/sign-up.ts"

const apiBase = "http://app.localhost"
const headers = { origin: apiBase, "sec-fetch-site": "same-origin" }
const password = "Passw0rd!"

const VIEWER = 1
const EXPENSE = 1
const INCOME = 2

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

async function signInOnline(page: Page, email: string): Promise<void> {
  await signIn(page, email, password)
  await expect(page.locator("[data-e2e=shell-ws-status]")).toHaveText("Online")
}

/** Runs one operation as the page's signed-in person, the way the app's HTTP transport does. */
async function call(page: Page, name: string, data: unknown) {
  const me = await page.request.get(`${apiBase}/api/auth/me`)
  expect(me.ok(), await me.text()).toBe(true)
  const response = await page.request.post(`${apiBase}/api/call/${name}`, {
    headers: {
      ...headers,
      "x-realtime-user": String((await me.json()).id),
      "idempotency-key": uuidV7(),
    },
    data,
  })
  expect(response.ok(), `${name}: ${await response.text()}`).toBe(true)
  return (await response.json()).result
}

/**
 * A paid household in euros, the household's default, made by the page's person, with one euro
 * account and the expense category Groceries. `viewer`, when given, joins it as a viewer.
 */
async function household(
  owner: Page,
  request: APIRequestContext,
  name: string,
  viewer?: string,
): Promise<{ groupId: string; accountId: string; groceries: string }> {
  const groupId = uuidV7()
  const created = await owner.request.post(`${apiBase}/api/groups`, {
    headers,
    data: { id: groupId, name },
  })
  expect(created.status(), await created.text()).toBe(201)
  await payForGroup(owner.request, apiBase, groupId)
  if (viewer) {
    const added = await request.post(`${apiBase}/api/test/add-member`, {
      data: { login: viewer, groupId, role: VIEWER },
    })
    expect(added.status(), await added.text()).toBe(200)
  }
  const accountId = uuidV7()
  await call(owner, `account.create`, {
    groupId,
    id: accountId,
    name: "Wallet",
    kind: 1,
    currency: "EUR",
    startingBalance: 0,
  })
  const groceries = uuidV7()
  await call(owner, `category.create`, {
    groupId,
    id: groceries,
    name: "Groceries",
    kind: EXPENSE,
    icon: "shopping-cart",
    color: "#16a34a",
    parentId: null,
  })
  return { groupId, accountId, groceries }
}

/** `YYYY-MM` of the month `offset` months from this one, in UTC: the household's time zone. */
function monthFromNow(offset: number): string {
  const now = new Date()
  const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  return at.toISOString().slice(0, 7)
}

/** A button's name that ends in Groceries, which the page isolates for right-to-left text. */
const named = (action: string) => new RegExp(`^${action} ⁨?Groceries⁩?$`)

test.describe("budgets", () => {
  test.describe.configure({ timeout: 120_000 })

  test("a limit an editor sets, then an expense and a refund, move the bar on another member's open tab without a reload", async ({ browser, request }) => {
    const owner = "e2e_budgets_live_owner@example.com"
    const viewer = "e2e_budgets_live_viewer@example.com"
    const baseURL = test.info().project.use.baseURL
    for (const email of [owner, viewer]) await cleanup(request, email)
    const ownerContext = await browser.newContext({ baseURL })
    const viewerContext = await browser.newContext({ baseURL })
    try {
      for (const email of [owner, viewer]) await signUp(request, email)
      const ownerPage = await ownerContext.newPage()
      await signInOnline(ownerPage, owner)
      const { groupId, accountId, groceries } = await household(
        ownerPage,
        request,
        "Budget team",
        viewer,
      )
      const entry = (kind: number, amount: number) =>
        call(ownerPage, `transaction.create`, {
          groupId,
          id: uuidV7(),
          accountId,
          categoryId: groceries,
          kind,
          amount,
          currency: "EUR",
        })
      await entry(EXPENSE, 40_000)

      // The viewer's tab counts its page loads, so a reload, which would read the month on its
      // own, fails the test instead of passing it.
      const viewerPage = await viewerContext.newPage()
      let viewerLoads = 0
      viewerPage.on("load", () => viewerLoads++)
      await signInOnline(viewerPage, viewer)
      await openBudgets(viewerPage, "Budget team")
      const viewerRow = viewerPage.locator(`[data-e2e=budget-${groceries}]`)
      await expect(viewerRow.locator("[data-e2e=budget-spent]")).toHaveText("€400.00 spent")
      await expect(viewerPage.locator("[data-e2e=budgets-read-only]")).toBeVisible()
      await expect(viewerRow.getByRole("button")).toHaveCount(0)
      const loadsBefore = viewerLoads
      const meter = viewerRow.getByRole("meter")

      await openBudgets(ownerPage, "Budget team")
      const set = ownerPage.getByRole("button", { name: named("Set a limit on") })
      await set.click()
      const dialog = ownerPage.locator("[data-e2e=budget-dialog]")
      await expect(dialog.getByRole("heading")).toHaveText(/^⁨?Groceries⁩? limit$/)
      await dialog.getByLabel("Monthly limit").fill("500")
      await dialog.getByLabel("Monthly limit").press("Enter")
      await expect(dialog).toHaveCount(0)
      await expect(ownerPage.locator("[data-e2e=budget-saved]")).toContainText(
        "€500.00 a month",
      )
      // Focus goes back to the row's button, which is now the pencil.
      await expect(ownerPage.getByRole("button", { name: named("Change the limit on") }))
        .toBeFocused()

      await expect(meter).toHaveAttribute("data-state", "near", { timeout: 5_000 })
      await expect(meter).toContainText("€400.00 of €500.00, 80%")

      await entry(EXPENSE, 15_000)
      await expect(meter).toHaveAttribute("data-state", "over", { timeout: 5_000 })
      await expect(meter).toContainText("€550.00 of €500.00")
      await expect(meter).toContainText("€50.00 over the limit")

      // A refund is income in an expense category: it takes the spending back under the limit.
      await entry(INCOME, 25_000)
      await expect(meter).toHaveAttribute("data-state", "under", { timeout: 5_000 })
      await expect(meter).toContainText("€300.00 of €500.00, 60%")
      await expect(meter).toContainText("€200.00 left")

      expect(viewerLoads).toBe(loadsBefore)
    } finally {
      await ownerContext.close()
      await viewerContext.close()
      for (const email of [owner, viewer]) await cleanup(request, email)
    }
  })

  test("stepping back a month shows that month's limit and spending, read-only, and this month keeps its own", async ({ page, request }) => {
    const owner = "e2e_budgets_months@example.com"
    await cleanup(request, owner)
    try {
      await signUp(request, owner)
      await signInOnline(page, owner)
      const { groupId, accountId, groceries } = await household(page, request, "Past months")
      const before = monthFromNow(-1)
      const limit = (month: string, amount: number) =>
        call(page, `budget.set`, {
          groupId,
          categoryId: groceries,
          month,
          amount,
          currency: "EUR",
          expectedVersion: null,
        })
      await limit(before, 30_000)
      await limit(monthFromNow(0), 60_000)
      await call(page, `transaction.create`, {
        groupId,
        id: uuidV7(),
        accountId,
        categoryId: groceries,
        kind: EXPENSE,
        amount: 12_000,
        currency: "EUR",
        date: `${before}-15`,
      })

      await openBudgets(page, "Past months")
      const meter = page.locator(`[data-e2e=budget-${groceries}]`).getByRole("meter")
      await expect(meter).toContainText("€0.00 of €600.00, 0%")
      await expect(page.getByRole("button", { name: named("Change the limit on") }))
        .toBeVisible()

      await page.keyboard.press("[")
      await expect(meter).toContainText("€120.00 of €300.00, 40%")
      await expect(page.locator("[data-e2e=budgets-past]")).toBeVisible()
      await expect(page.getByRole("button", { name: /limit on Groceries/ })).toHaveCount(0)

      await page.keyboard.press("t")
      await expect(meter).toContainText("€0.00 of €600.00, 0%")
      await expect(page.locator("[data-e2e=budgets-past]")).toHaveCount(0)
    } finally {
      await cleanup(request, owner)
    }
  })
})
