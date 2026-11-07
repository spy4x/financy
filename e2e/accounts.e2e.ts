import { type APIRequestContext, type Page } from "@playwright/test"
import { expect, test } from "./fixtures/stack.ts"
import { signIn } from "./fixtures/app.ts"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"
import { openAccounts } from "./fixtures/groups.ts"
import { signUpWithCode } from "./fixtures/sign-up.ts"

const apiBase = "http://app.localhost"
const headers = { origin: apiBase, "sec-fetch-site": "same-origin" }
const password = "Passw0rd!"

const VIEWER = 1

interface ServerAccount {
  id: string
  name: string
  currency: string
  startingBalance: number
  balance: number
  archivedAt: string | null
}

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

/** Creates a household as the page's user; `viewer`, when given, joins it as a viewer. */
async function household(
  owner: Page,
  request: APIRequestContext,
  name: string,
  viewer?: string,
): Promise<string> {
  const groupId = uuidV7()
  const created = await owner.request.post(`${apiBase}/api/groups`, {
    headers,
    data: { id: groupId, name },
  })
  expect(created.status(), await created.text()).toBe(201)
  if (viewer) {
    const added = await request.post(`${apiBase}/api/test/add-member`, {
      data: { login: viewer, groupId, role: VIEWER },
    })
    expect(added.status(), await added.text()).toBe(200)
  }
  return groupId
}

async function serverAccounts(page: Page, groupId: string): Promise<ServerAccount[]> {
  const response = await page.request.get(`${apiBase}/api/groups/${groupId}/accounts`)
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()).accounts
}

/** Fills the open editor: a name, a currency picked by its code, and a starting balance. */
async function fillAccount(
  page: Page,
  { name, currency, balance }: { name: string; currency?: string; balance?: string },
): Promise<void> {
  await page.locator("[data-e2e=account-name-input]").fill(name)
  if (currency) {
    const field = page.locator("[data-e2e=account-currency-field] input")
    await field.fill(currency)
    await field.press("Enter")
  }
  if (balance !== undefined) {
    await page.locator("[data-e2e=account-starting-balance] input[type=text]").fill(balance)
  }
}

const ACCOUNT_URL = /\/accounts\/[0-9a-f-]{36}$/

/** Saves the open editor and goes back to the list. */
async function saveAndBack(page: Page): Promise<void> {
  await page.locator("[data-e2e=account-save]").click()
  await expect(page).toHaveURL(ACCOUNT_URL)
  await expect(page.locator("[data-e2e=account-save]")).toHaveCount(0)
  await page.locator("[data-e2e=page-back]").click()
  await expect(page).toHaveURL("/accounts")
}

/** Creates an account from the list's New account; the created account's page replaces the
 * create page, and the test goes back to the list from there. */
async function createAccount(
  page: Page,
  account: { name: string; currency: string; balance: string },
): Promise<void> {
  await page.locator("[data-e2e=account-new]").click()
  await expect(page).toHaveURL("/accounts/new")
  await fillAccount(page, account)
  await saveAndBack(page)
}

test.describe("accounts", () => {
  test.describe.configure({ timeout: 90_000 })

  test("an account created, edited and archived by the owner shows in a viewer's open tab without a reload, and the viewer gets no way to change it", async ({ browser, request }) => {
    const owner = "e2e_accounts_live_owner@example.com"
    const viewer = "e2e_accounts_live_viewer@example.com"
    const baseURL = test.info().project.use.baseURL
    for (const email of [owner, viewer]) await cleanup(request, email)
    const ownerContext = await browser.newContext({ baseURL })
    const viewerContext = await browser.newContext({ baseURL })
    try {
      for (const email of [owner, viewer]) await signUp(request, email)
      const ownerPage = await ownerContext.newPage()
      await signInOnline(ownerPage, owner)
      const groupId = await household(ownerPage, request, "Money team", viewer)

      // The viewer's tab counts its page loads, so a reload, which would read the accounts on its
      // own, fails the test instead of passing it.
      const viewerPage = await viewerContext.newPage()
      let viewerLoads = 0
      viewerPage.on("load", () => viewerLoads++)
      await signInOnline(viewerPage, viewer)
      await openAccounts(viewerPage, "Money team")
      await expect(viewerPage.locator("[data-e2e=accounts-read-only]")).toBeVisible()
      await expect(viewerPage.locator("[data-e2e=account-new]")).toHaveCount(0)
      const loadsBefore = viewerLoads
      const viewerNames = viewerPage.locator("[data-e2e=account-name]")

      await openAccounts(ownerPage, "Money team")
      await createAccount(ownerPage, { name: "Wallet", currency: "EUR", balance: "25.50" })
      const ownerNames = ownerPage.locator("[data-e2e=account-name]")
      await expect(ownerNames).toHaveText(["Wallet"])
      await expect(viewerNames).toHaveText(["Wallet"], { timeout: 5_000 })
      await expect(viewerPage.locator("[data-e2e=account-balance]")).toContainText("25.50")
      // The viewer's row is text, with no menu and no link to the editor.
      await expect(viewerPage.locator("a[data-e2e=account-name]")).toHaveCount(0)
      await expect(viewerPage.locator("[data-e2e=account-menu]")).toHaveCount(0)

      // Edit: the name and the starting balance, and the balance follows.
      await ownerPage.getByRole("link", { name: "Wallet" }).click()
      await expect(ownerPage).toHaveURL(ACCOUNT_URL)
      const accountPath = new URL(ownerPage.url()).pathname
      await fillAccount(ownerPage, { name: "Shared wallet", balance: "30" })
      await saveAndBack(ownerPage)
      await expect(ownerNames).toHaveText(["Shared wallet"])
      await expect(viewerNames).toHaveText(["Shared wallet"], { timeout: 5_000 })
      await expect(viewerPage.locator("[data-e2e=account-balance]")).toContainText("30.00")

      // The viewer opening the account's address gets it read-only: no Save, no menu.
      const peek = await viewerContext.newPage()
      await peek.goto(accountPath)
      await expect(peek.locator("[data-e2e=account-read-only]")).toBeVisible()
      await expect(peek.locator("[data-e2e=account-name-input]")).toBeDisabled()
      await expect(peek.locator("[data-e2e=account-save]")).toHaveCount(0)
      await expect(peek.locator("[data-e2e=account-editor-menu]")).toHaveCount(0)
      await peek.close()

      // Archive from the row's menu: the account leaves both lists and keeps its balance.
      await ownerPage.locator("[data-e2e=account-menu]").click()
      await ownerPage.locator("[data-e2e=account-archive]").click()
      await expect(ownerNames).toHaveCount(0)
      await expect(viewerNames).toHaveCount(0, { timeout: 5_000 })
      await expect(viewerPage.getByText("Every account is archived.")).toBeVisible()
      const [archived] = await serverAccounts(ownerPage, groupId)
      expect(archived.archivedAt).not.toBe(null)
      expect(archived.balance).toBe(3000)

      expect(viewerLoads).toBe(loadsBefore)
    } finally {
      await ownerContext.close()
      await viewerContext.close()
      for (const email of [owner, viewer]) await cleanup(request, email)
    }
  })

  test("the household total follows a new account, a currency with no rate and a change of the main currency in a viewer's open tab", async ({ browser, request }) => {
    const owner = "e2e_accounts_total_owner@example.com"
    const viewer = "e2e_accounts_total_viewer@example.com"
    const baseURL = test.info().project.use.baseURL
    for (const email of [owner, viewer]) await cleanup(request, email)
    const ownerContext = await browser.newContext({ baseURL })
    const viewerContext = await browser.newContext({ baseURL })
    try {
      for (const email of [owner, viewer]) await signUp(request, email)
      const ownerPage = await ownerContext.newPage()
      await signInOnline(ownerPage, owner)
      const groupId = await household(ownerPage, request, "Total team", viewer)

      const viewerPage = await viewerContext.newPage()
      let viewerLoads = 0
      viewerPage.on("load", () => viewerLoads++)
      await signInOnline(viewerPage, viewer)
      await openAccounts(viewerPage, "Total team")
      const loadsBefore = viewerLoads
      // No accounts, no card.
      await expect(viewerPage.locator("[data-e2e=accounts-total]")).toHaveCount(0)
      const amount = viewerPage.locator("[data-e2e=accounts-total-amount]")
      const leftOut = viewerPage.locator("[data-e2e=accounts-total-left-out]")

      // An account in the main currency (the euro by default): the total is exact.
      await openAccounts(ownerPage, "Total team")
      await createAccount(ownerPage, { name: "Wallet", currency: "EUR", balance: "25.50" })
      await expect(amount).toHaveText("€25.50", { timeout: 5_000 })
      await expect(viewerPage.locator("[data-e2e=accounts-total-rates]")).toHaveCount(0)

      // The test stack stores no rate for the lari: the account is left out and named.
      await createAccount(ownerPage, { name: "Lari", currency: "GEL", balance: "100" })
      await expect(leftOut).toHaveText("Leaves out 1 account: no exchange rate for GEL yet.", {
        timeout: 5_000,
      })
      await expect(amount).toHaveText("€25.50")

      // The owner makes the lari the main currency: now the euros have no rate.
      const members =
        await (await ownerPage.request.get(`${apiBase}/api/groups/${groupId}/members`))
          .json()
      const ownerId: number = members.members.find((m: { email?: string }) => m.email === owner)
        .userId
      const changed = await ownerPage.request.post(
        `${apiBase}/api/call/household.updateSettings`,
        {
          headers: { ...headers, "x-realtime-user": String(ownerId), "idempotency-key": uuidV7() },
          data: { groupId, baseCurrency: "GEL", version: 0 },
        },
      )
      expect(changed.ok(), await changed.text()).toBe(true)
      await expect(leftOut).toHaveText("Leaves out 1 account: no exchange rate for EUR yet.", {
        timeout: 5_000,
      })
      await expect(amount).toContainText("100.00")
      await expect(amount).not.toContainText("about")

      expect(viewerLoads).toBe(loadsBefore)
    } finally {
      await ownerContext.close()
      await viewerContext.close()
      for (const email of [owner, viewer]) await cleanup(request, email)
    }
  })

  test("500 yen, 12.34 dollars and 1.234 dinars typed in the editor are stored in each currency's smallest unit and shown back exactly", async ({ browser, request }) => {
    const user = "e2e_accounts_units@example.com"
    await cleanup(request, user)
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    try {
      await signUp(request, user)
      const page = await context.newPage()
      await signInOnline(page, user)
      const groupId = await household(page, request, "Three currencies")
      await openAccounts(page, "Three currencies")

      await createAccount(page, { name: "Yen", currency: "JPY", balance: "500" })
      await createAccount(page, { name: "Dollars", currency: "USD", balance: "12.34" })
      await createAccount(page, { name: "Dinars", currency: "BHD", balance: "1.234" })

      const stored = Object.fromEntries(
        (await serverAccounts(page, groupId)).map((a) => [a.currency, a.startingBalance]),
      )
      expect(stored).toEqual({ JPY: 500, USD: 1234, BHD: 1234 })
      const balance = (name: string) =>
        page.locator("li", { has: page.getByRole("link", { name, exact: true }) })
          .locator("[data-e2e=account-balance]")
      await expect(balance("Yen")).toContainText("500")
      await expect(balance("Yen")).not.toContainText("500.")
      await expect(balance("Dollars")).toContainText("12.34")
      await expect(balance("Dinars")).toContainText("1.234")

      // The editor shows the dinars back with all three decimals, and refuses a fourth.
      await page.getByRole("link", { name: "Dinars", exact: true }).click()
      const amount = page.locator("[data-e2e=account-starting-balance] input[type=text]")
      await expect(amount).toHaveValue("1.234")
      await amount.fill("1.2345")
      await expect(page.locator("[data-e2e=account-starting-balance] [role=status]")).not
        .toBeEmpty()
    } finally {
      await context.close()
      await cleanup(request, user)
    }
  })
})
