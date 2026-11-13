/**
 * Entries made with no network, in a household of two: the entry reaches the partner's open tab
 * once the device is back online, and an entry whose account the partner deleted meanwhile is kept
 * as a conflict on the list, where the person picks another account or discards it.
 */
import { type APIRequestContext, type BrowserContext, type Page } from "@playwright/test"
import { expect, test } from "./fixtures/stack.ts"
import { gotoApp, signIn } from "./fixtures/app.ts"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"
import { payForGroup, signUpWithCode } from "./fixtures/sign-up.ts"

const apiBase = "http://app.localhost"
const headers = { origin: apiBase, "sec-fetch-site": "same-origin" }
const password = "Passw0rd!"

const EDITOR = 2
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

/** Makes a euro account in the household as the page's person; resolves its id. */
async function account(page: Page, groupId: string, name: string): Promise<string> {
  const id = uuidV7()
  await call(page, `account.create`, {
    groupId,
    id,
    name,
    kind: 1,
    currency: "EUR",
    startingBalance: 0,
  })
  return id
}

/**
 * A paid household in euros made by `owner`'s page, with `partner` as an editor, the accounts
 * Wallet and Cash, and the expense category Groceries.
 */
async function household(owner: Page, request: APIRequestContext, partner: string) {
  const groupId = uuidV7()
  const created = await owner.request.post(`${apiBase}/api/groups`, {
    headers,
    data: { id: groupId, name: "Home money" },
  })
  expect(created.status(), await created.text()).toBe(201)
  await payForGroup(owner.request, apiBase, groupId)
  const added = await request.post(`${apiBase}/api/test/add-member`, {
    data: { login: partner, groupId, role: EDITOR },
  })
  expect(added.status(), await added.text()).toBe(200)
  const wallet = await account(owner, groupId, "Wallet")
  const cash = await account(owner, groupId, "Cash")
  await call(owner, `category.create`, {
    groupId,
    id: uuidV7(),
    name: "Groceries",
    kind: EXPENSE,
    icon: "shopping-cart",
    color: "#16a34a",
    parentId: null,
  })
  return { groupId, wallet, cash }
}

/**
 * Opens the household's transactions as the page's signed-in person, then the editor once, so the
 * page holds what it needs to add an entry with no network.
 */
async function openTransactions(page: Page, groupId: string): Promise<void> {
  const selected = await page.request.put(`${apiBase}/api/groups/selected`, {
    headers,
    data: { groupId },
  })
  expect(selected.ok(), await selected.text()).toBe(true)
  const status = page.locator("[data-e2e=shell-ws-status]")
  await gotoApp(page, "/transactions", status)
  await expect(status).toHaveText("Online")
  await page.locator("[data-e2e=transaction-new-empty], [data-e2e=transaction-new]").first()
    .click()
  await expect(page.locator("select[data-e2e=transaction-account] option")).toHaveCount(2)
  await page.goBack()
  await expect(page).toHaveURL("/transactions")
}

/**
 * Slows the page's socket reconnect past the spec (`testBackoff` in apps/spa/src/realtime/index.ts),
 * so a socket {@link goOffline} closed stays closed. Call it before the page's first load.
 */
async function slowReconnect(page: Page): Promise<void> {
  await page.addInitScript(() => {
    ;(globalThis as { __REALTIME_BACKOFF__?: unknown }).__REALTIME_BACKOFF__ = {
      baseMs: 60_000,
      maxMs: 60_000,
      jitterRatio: 0,
    }
  })
}

/**
 * Closes the page's socket while the network is up, waits until the page shows it, and only then
 * takes the network down: a browser keeps an open socket through `setOffline`.
 */
async function goOffline(
  request: APIRequestContext,
  context: BrowserContext,
  page: Page,
  email: string,
): Promise<void> {
  const closed = await request.post(`${apiBase}/api/test/close-sockets`, {
    data: { login: email },
  })
  expect(closed.status(), await closed.text()).toBe(200)
  await expect(page.locator("[data-e2e=shell-ws-status]")).toHaveText("Offline")
  await context.setOffline(true)
}

/** Adds an expense from the transactions page with the editor, and lands back on the list. */
async function addExpense(page: Page, amount: string, accountName: string, memo: string) {
  await page.locator("[data-e2e=transaction-new-empty], [data-e2e=transaction-new]").first()
    .click()
  await page.locator("select[data-e2e=transaction-account]").selectOption({
    label: `${accountName} · EUR`,
  })
  await page.locator("select[data-e2e=transaction-category]").selectOption({ label: "Groceries" })
  await page.locator("[data-e2e=transaction-memo]").fill(memo)
  const field = page.locator("[data-e2e=transaction-amount-field] input[type=text]")
  await field.fill(amount)
  await field.press("Enter")
  await expect(page).toHaveURL("/transactions")
}

const row = (page: Page, memo: string) =>
  page.locator("li[data-e2e^=transaction-]").filter({ hasText: memo })

test.describe("transactions offline", () => {
  test.describe.configure({ timeout: 120_000 })

  test("an entry made offline appears in the partner's open tab once the device reconnects", async ({ browser, request }) => {
    const owner = "e2e_transactions_offline_owner@example.com"
    const partner = "e2e_transactions_offline_partner@example.com"
    for (const email of [owner, partner]) await cleanup(request, email)
    const baseURL = test.info().project.use.baseURL
    const ownerContext = await browser.newContext({ baseURL })
    const partnerContext = await browser.newContext({ baseURL })
    try {
      for (const email of [owner, partner]) await signUp(request, email)
      const ownerPage = await ownerContext.newPage()
      const partnerPage = await partnerContext.newPage()
      await slowReconnect(ownerPage)
      await signIn(ownerPage, owner, password)
      await signIn(partnerPage, partner, password)
      const { groupId } = await household(ownerPage, request, partner)
      await openTransactions(ownerPage, groupId)
      await openTransactions(partnerPage, groupId)

      await goOffline(request, ownerContext, ownerPage, owner)
      await addExpense(ownerPage, "12.30", "Wallet", "Bakery offline")
      await expect(row(ownerPage, "Bakery offline")).toHaveCount(1)
      await expect(row(partnerPage, "Bakery offline")).toHaveCount(0)

      await ownerContext.setOffline(false)
      await expect(row(partnerPage, "Bakery offline")).toHaveCount(1, { timeout: 20_000 })
      await expect(row(partnerPage, "Bakery offline").locator("[data-e2e=transaction-row]"))
        .toHaveAttribute("aria-label", "Expense of €12.30 in Groceries, Today")
    } finally {
      await ownerContext.close()
      await partnerContext.close()
      for (const email of [owner, partner]) await cleanup(request, email)
    }
  })

  test("an entry whose account was deleted while offline waits on the list for another account or Discard", async ({ browser, request }) => {
    const owner = "e2e_transactions_gone_owner@example.com"
    const partner = "e2e_transactions_gone_partner@example.com"
    for (const email of [owner, partner]) await cleanup(request, email)
    const baseURL = test.info().project.use.baseURL
    const ownerContext = await browser.newContext({ baseURL })
    const partnerContext = await browser.newContext({ baseURL })
    try {
      for (const email of [owner, partner]) await signUp(request, email)
      const ownerPage = await ownerContext.newPage()
      const partnerPage = await partnerContext.newPage()
      await slowReconnect(partnerPage)
      await signIn(ownerPage, owner, password)
      await signIn(partnerPage, partner, password)
      const { groupId, cash } = await household(ownerPage, request, partner)
      await openTransactions(partnerPage, groupId)

      await goOffline(request, partnerContext, partnerPage, partner)
      await addExpense(partnerPage, "5", "Cash", "Market stall")
      await addExpense(partnerPage, "7", "Cash", "Flowers")
      // Meanwhile the owner deletes the account the two entries name.
      await call(ownerPage, `account.delete`, { groupId, id: cash, version: 1 })

      await partnerContext.setOffline(false)
      const stall = row(partnerPage, "Market stall")
      const flowers = row(partnerPage, "Flowers")
      for (const entry of [stall, flowers]) {
        await expect(entry.locator("[data-e2e=transaction-conflict-message]")).toHaveText(
          "Its account was deleted while you were offline. Pick another account, or discard this transaction.",
          { timeout: 20_000 },
        )
      }
      // The sync line says the same, in the app's words rather than the server's.
      await expect(partnerPage.locator("[data-e2e=offline-status] [data-e2e=conflict-message]"))
        .toHaveText(
          Array(2).fill(
            "Its account was deleted while you were offline. Pick another account, or discard this transaction.",
          ),
        )

      // Discard, from the keyboard: the entry leaves the device and never reaches the server.
      // Tab goes from the entry to its two actions.
      await flowers.locator("[data-e2e=transaction-row]").focus()
      await partnerPage.keyboard.press("Tab")
      await expect(flowers.locator("[data-e2e=transaction-conflict-pick]")).toBeFocused()
      await partnerPage.keyboard.press("Tab")
      await expect(flowers.locator("[data-e2e=transaction-conflict-discard]")).toBeFocused()
      const discard = flowers.locator("[data-e2e=transaction-conflict-discard]")
      const dialog = partnerPage.locator("[data-e2e=transaction-discard-dialog]")
      // It asks first, and Escape keeps the entry and puts focus back on Discard.
      await partnerPage.keyboard.press("Space")
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText("Discard this transaction?")
      await partnerPage.keyboard.press("Escape")
      await expect(dialog).toHaveCount(0)
      await expect(discard).toBeFocused()
      await expect(flowers).toHaveCount(1)
      // Confirmed, the entry goes, and focus moves on to the next entry.
      // The open dialog first focuses its close button, so focus moves to confirm only after.
      await partnerPage.keyboard.press("Space")
      await expect(dialog).toBeVisible()
      const confirm = partnerPage.locator("[data-e2e=transaction-discard-confirm]")
      await expect(confirm).toHaveText("Discard transaction")
      await confirm.focus()
      await expect(confirm).toBeFocused()
      await partnerPage.keyboard.press("Enter")
      await expect(flowers).toHaveCount(0)
      await expect(stall.locator("[data-e2e=transaction-row]")).toBeFocused()

      // Pick another account, from the keyboard: the editor opens on the entry.
      const pick = stall.locator("[data-e2e=transaction-conflict-pick]")
      await expect(pick).toHaveText("Pick another account")
      await pick.focus()
      await partnerPage.keyboard.press("Enter")
      await expect(partnerPage).toHaveURL(/\/transactions\/[0-9a-f-]+$/)
      await partnerPage.locator("select[data-e2e=transaction-account]").selectOption({
        label: "Wallet · EUR",
      })
      await partnerPage.locator("[data-e2e=transaction-save]").click()
      await gotoApp(partnerPage, "/transactions", stall)
      await expect(stall.locator("[data-e2e=transaction-conflict]")).toHaveCount(0)
      await expect(stall.locator("[data-e2e=transaction-meta]")).toContainText("Wallet")

      // The server holds the fixed entry and not the discarded one.
      const selected = await ownerPage.request.put(`${apiBase}/api/groups/selected`, {
        headers,
        data: { groupId },
      })
      expect(selected.ok(), await selected.text()).toBe(true)
      await gotoApp(ownerPage, "/transactions", row(ownerPage, "Market stall"))
      await expect(row(ownerPage, "Flowers")).toHaveCount(0)
    } finally {
      await ownerContext.close()
      await partnerContext.close()
      for (const email of [owner, partner]) await cleanup(request, email)
    }
  })
})
