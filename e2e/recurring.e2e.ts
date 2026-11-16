/**
 * Repeating entries: a member makes a monthly rule from an entry with "Repeat this", the job
 * makes the entry when an operator runs it now, and the partner's open tab shows it without a
 * reload; and skipping an upcoming date takes it off the list.
 */
import { type APIRequestContext, type BrowserContext, type Page } from "@playwright/test"
import { expect, test } from "./fixtures/stack.ts"
import { gotoApp, signIn } from "./fixtures/app.ts"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"
import { openBudgets } from "./fixtures/groups.ts"
import { payForGroup, signUpWithCode } from "./fixtures/sign-up.ts"

const apiBase = "http://app.localhost"
const adminBase = "http://admin.localhost"
const headers = { origin: apiBase, "sec-fetch-site": "same-origin" }
const password = "Passw0rd!"

const VIEWER = 1
const OPERATOR = 2
const EXPENSE = 1

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
 * A paid household in euros, in UTC, made by the page's person, with one euro account and the
 * expense category Sport. `viewer`, when given, joins it as a viewer.
 */
async function household(
  owner: Page,
  request: APIRequestContext,
  name: string,
  viewer?: string,
): Promise<{ groupId: string; accountId: string; sport: string }> {
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
  const sport = uuidV7()
  await call(owner, `category.create`, {
    groupId,
    id: sport,
    name: "Sport",
    kind: EXPENSE,
    icon: "dumbbell",
    color: "#16a34a",
    parentId: null,
  })
  return { groupId, accountId, sport }
}

/** `YYYY-MM-DD` of `day` in the month `offset` months from this one, in UTC. */
function dayOfMonth(offset: number, day: number): string {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day))
    .toISOString().slice(0, 10)
}

/** Today in UTC, the household's time zone. */
const today = () => new Date().toISOString().slice(0, 10)

/** Signs `email` in to the admin app as an operator, and presses Run now on the repeating entries. */
async function runRepeatingEntriesNow(admin: BrowserContext, email: string): Promise<void> {
  const ops = await admin.newPage()
  await ops.goto(`${adminBase}/sign-in`)
  await ops.locator("[data-e2e=auth-form-login]").fill(email)
  await ops.locator("[data-e2e=auth-form-password]").fill(password)
  await ops.locator("[data-e2e=auth-form-submit]").click()
  await expect(ops.locator("[data-e2e=admin-dashboard-title]")).toBeVisible()
  await ops.goto(`${adminBase}/jobs?tab=repeating`)
  await ops.locator("[data-e2e='admin-repeating-run-recurring.make-entries']").click()
  await expect(ops.locator("[data-e2e=admin-job-toast]").first()).toBeVisible()
}

test.describe("repeating entries", () => {
  test.describe.configure({ timeout: 180_000 })

  test("a member repeats an entry monthly, the job makes it, and the partner's open tab shows it without a reload", async ({ browser, request }) => {
    const owner = "e2e_recurring_owner@example.com"
    const partner = "e2e_recurring_partner@example.com"
    const operator = "e2e_recurring_operator@example.com"
    const baseURL = test.info().project.use.baseURL
    for (const email of [owner, partner, operator]) await cleanup(request, email)
    const ownerContext = await browser.newContext({ baseURL })
    const partnerContext = await browser.newContext({ baseURL })
    const adminContext = await browser.newContext({ baseURL: adminBase })
    try {
      for (const email of [owner, partner, operator]) await signUp(request, email)
      const promoted = await request.post(`${apiBase}/api/test/set-role`, {
        data: { login: operator, role: OPERATOR },
      })
      expect(promoted.ok(), await promoted.text()).toBe(true)

      const ownerPage = await ownerContext.newPage()
      await signInOnline(ownerPage, owner)
      const { groupId, accountId, sport } = await household(
        ownerPage,
        request,
        "Repeat team",
        partner,
      )
      // A month ago, on a day every month has, so "Repeat this" starts the rule today or earlier
      // in this month: the clock has moved a month on, and the rule is due.
      const day = Math.min(new Date().getUTCDate(), 28)
      const entryId = uuidV7()
      await call(ownerPage, `transaction.create`, {
        groupId,
        id: entryId,
        accountId,
        categoryId: sport,
        kind: EXPENSE,
        amount: 3_000,
        currency: "EUR",
        memo: "Gym",
        date: dayOfMonth(-1, day),
      })
      const start = dayOfMonth(0, day)
      expect(start <= today()).toBe(true)

      // The partner's tab counts its page loads, so a reload, which would read the list on its
      // own, fails the test instead of passing it.
      const partnerPage = await partnerContext.newPage()
      let partnerLoads = 0
      partnerPage.on("load", () => partnerLoads++)
      await signInOnline(partnerPage, partner)
      await openBudgets(partnerPage, "Repeat team")
      await partnerPage.getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Transactions" }).click()
      await expect(partnerPage).toHaveURL("/transactions")
      await expect(partnerPage.getByRole("heading", { level: 1, name: "Transactions" }))
        .toBeVisible()
      const loadsBefore = partnerLoads
      const made = partnerPage.locator("[data-e2e=transaction-row]", { hasText: "Gym membership" })
      await expect(made).toHaveCount(0)

      await openBudgets(ownerPage, "Repeat team")
      await gotoApp(
        ownerPage,
        `/transactions/${entryId}`,
        ownerPage.locator("[data-e2e=transaction-editor-menu]"),
      )
      await ownerPage.locator("[data-e2e=transaction-editor-menu]").click()
      await ownerPage.locator("[data-e2e=transaction-repeat]").click()
      await expect(ownerPage).toHaveURL(`/recurring/new?from=${entryId}`)
      await expect(ownerPage.locator("[data-e2e=recurring-memo]")).toHaveValue("Gym")
      await expect(ownerPage.locator("[data-e2e=recurring-start]")).toHaveValue(start)
      await expect(ownerPage.locator("[data-e2e=recurring-month-day]")).toHaveValue(String(day))
      await expect(ownerPage.locator("[data-e2e=recurring-sentence] p").first())
        .toHaveText(`Monthly on day ${day}`)
      await ownerPage.locator("[data-e2e=recurring-memo]").fill("Gym membership")
      await ownerPage.locator("[data-e2e=recurring-save]").click()
      await expect(ownerPage).toHaveURL("/recurring")
      await expect(ownerPage.locator("[data-e2e=recurring-created]")).toBeVisible()
      await expect(
        ownerPage.locator("[data-e2e=recurring-list] [data-e2e=recurring-title]"),
      ).toHaveText("Gym membership")

      await runRepeatingEntriesNow(adminContext, operator)

      await expect(made).toHaveCount(1, { timeout: 30_000 })
      expect(partnerLoads).toBe(loadsBefore)
    } finally {
      await ownerContext.close()
      await partnerContext.close()
      await adminContext.close()
      for (const email of [owner, partner, operator]) await cleanup(request, email)
    }
  })

  test("skipping an upcoming date takes it off the list and keeps the next one", async ({ page, request }) => {
    const owner = "e2e_recurring_skip@example.com"
    await cleanup(request, owner)
    try {
      await signUp(request, owner)
      await signInOnline(page, owner)
      const { groupId, accountId, sport } = await household(page, request, "Skip team")
      // Weekly from tomorrow: the job has nothing to make yet, and the list shows four or five
      // dates, a week apart.
      const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
      const weekLater = new Date(Date.now() + 8 * 86_400_000).toISOString().slice(0, 10)
      const weekday = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][
        new Date(`${tomorrow}T00:00:00Z`).getUTCDay()
      ]
      const rule = await call(page, `recurring.create`, {
        groupId,
        id: uuidV7(),
        accountId,
        categoryId: sport,
        kind: EXPENSE,
        amount: 3_000,
        currency: "EUR",
        memo: "Swimming",
        rrule: `FREQ=WEEKLY;BYDAY=${weekday}`,
        startDate: tomorrow,
      })
      const ruleId = rule.rule.id

      await openBudgets(page, "Skip team")
      await gotoApp(
        page,
        "/recurring",
        page.getByRole("heading", { level: 1, name: "Repeating entries" }),
      )
      const first = page.locator(`[data-e2e=recurring-upcoming-${ruleId}-${tomorrow}]`)
      const second = page.locator(`[data-e2e=recurring-upcoming-${ruleId}-${weekLater}]`)
      await expect(first).toBeVisible()
      await expect(second).toBeVisible()

      await first.locator("[data-e2e=recurring-skip]").click()
      const dialog = page.locator("[data-e2e=recurring-skip-dialog]")
      await expect(dialog).toContainText("Skip Swimming on")
      await dialog.getByRole("button", { name: "Skip this date" }).click()

      await expect(page.locator("[data-e2e=recurring-skipped]")).toBeVisible()
      await expect(first).toHaveCount(0)
      await expect(second).toBeVisible()
      await expect(
        page.locator(`[data-e2e=recurring-${ruleId}] [data-e2e=recurring-next]`),
      ).not.toContainText("Tomorrow")
    } finally {
      await cleanup(request, owner)
    }
  })
})
