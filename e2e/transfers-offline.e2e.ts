/**
 * Transfers made or changed with no network, in a household of two: a transfer made offline waits
 * on the device and reaches the server once, an offline edit the partner beat shows the transfers'
 * own wording on the sync line, and a transfer whose account the partner deleted meanwhile waits on
 * the list for another account or Discard.
 */
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test"
import { expect, test } from "./fixtures/stack.ts"
import { gotoApp, signIn } from "./fixtures/app.ts"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"
import { payForGroup, signUpWithCode } from "./fixtures/sign-up.ts"

const apiBase = "http://app.localhost"
const headers = { origin: apiBase, "sec-fetch-site": "same-origin" }
const password = "Passw0rd!"

const EDITOR = 2
const WAITING = "[data-e2e=offline-status] [data-sync-state]:not([data-sync-state=synced])"

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
 * A paid household in euros made by `owner`'s page, with `partner` as an editor and the accounts
 * Wallet, Cash and Savings.
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
  await account(owner, groupId, "Savings")
  return { groupId, wallet, cash }
}

/**
 * Opens the household's transactions as the page's signed-in person, then the transfer editor once,
 * so the page holds what it needs to add or change a transfer with no network.
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
  await page.locator("[data-e2e=transactions-menu]").click()
  await page.locator("[data-e2e=transfer-new]").click()
  await expect(page).toHaveURL("/transfers/new")
  await expect(page.locator("#transfer-from option").nth(2)).toBeAttached()
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

/** Adds a transfer from the list's menu with the editor, and lands back on the list. */
async function addTransfer(page: Page, amount: string, from: string, to: string, memo: string) {
  await page.locator("[data-e2e=transactions-menu]").click()
  await page.locator("[data-e2e=transfer-new]").click()
  await expect(page).toHaveURL("/transfers/new")
  await page.locator("#transfer-from").selectOption({ label: `${from} · EUR` })
  await page.locator("#transfer-to").selectOption({ label: `${to} · EUR` })
  await page.locator("[data-e2e=transfer-memo]").fill(memo)
  const field = page.locator("[data-e2e=transfer-sent-field] input[type=text]")
  await field.fill(amount)
  await field.press("Enter")
  await expect(page).toHaveURL("/transactions")
}

const row = (page: Page, memo: string) =>
  page.locator("li[data-e2e^=transfer-]").filter({ hasText: memo })

/** Two signed-up people with a browser each, cleaned up whatever the test does. */
async function twoPeople(
  browser: Browser,
  request: APIRequestContext,
  prefix: string,
  run: (people: {
    ownerPage: Page
    partnerPage: Page
    ownerContext: BrowserContext
    partnerContext: BrowserContext
    owner: string
    partner: string
  }) => Promise<void>,
) {
  const owner = `e2e_${prefix}_owner@example.com`
  const partner = `e2e_${prefix}_partner@example.com`
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
    await run({ ownerPage, partnerPage, ownerContext, partnerContext, owner, partner })
  } finally {
    await ownerContext.close()
    await partnerContext.close()
    for (const email of [owner, partner]) await cleanup(request, email)
  }
}

test.describe("transfers offline", () => {
  test.describe.configure({ timeout: 120_000 })

  test("a transfer made offline waits on the device, then reaches the server once", async ({ browser, request }) => {
    await twoPeople(browser, request, "transfers_offline", async (people) => {
      const { ownerPage, partnerPage, partnerContext, partner } = people
      const { groupId } = await household(ownerPage, request, partner)
      await openTransactions(partnerPage, groupId)

      await goOffline(request, partnerContext, partnerPage, partner)
      await addTransfer(partnerPage, "40", "Wallet", "Cash", "Pocket money")
      await expect(row(partnerPage, "Pocket money")).toHaveCount(1)
      await expect(row(partnerPage, "Pocket money").locator("[data-e2e=transfer-row]"))
        .toHaveAttribute("aria-label", "Transfer of €40.00 from Wallet to Cash, Today")
      await expect(partnerPage.locator(WAITING)).toBeVisible()

      await partnerContext.setOffline(false)
      await expect(partnerPage.locator(WAITING)).toHaveCount(0, { timeout: 20_000 })

      // The server holds it once: the owner's fresh page shows one transfer.
      await openTransactions(ownerPage, groupId)
      await expect(row(ownerPage, "Pocket money")).toHaveCount(1)
      await expect(ownerPage.locator("li[data-e2e^=transfer-]")).toHaveCount(1)
    })
  })

  test("an offline edit of a transfer the partner changed meanwhile shows the transfers' wording", async ({ browser, request }) => {
    await twoPeople(browser, request, "transfers_conflict", async (people) => {
      const { ownerPage, partnerPage, partnerContext, partner } = people
      const { groupId, wallet, cash } = await household(ownerPage, request, partner)
      const id = uuidV7()
      const date = new Date().toISOString().slice(0, 10)
      const fields = {
        groupId,
        id,
        fromAccountId: wallet,
        toAccountId: cash,
        sentAmount: 2000,
        date,
      }
      await call(ownerPage, `transfer.create`, { ...fields, memo: "Rent pot" })
      await openTransactions(partnerPage, groupId)
      await expect(row(partnerPage, "Rent pot")).toHaveCount(1)

      await goOffline(request, partnerContext, partnerPage, partner)
      await row(partnerPage, "Rent pot").locator("[data-e2e=transfer-row]").click()
      await expect(partnerPage).toHaveURL(`/transfers/${id}`)
      await expect(partnerPage.locator("[data-e2e=transfer-offline]")).toBeVisible()
      await partnerPage.locator("[data-e2e=transfer-memo]").fill("Rent pot, mine")
      await partnerPage.locator("[data-e2e=transfer-save]").click()
      await expect(partnerPage).toHaveURL("/transactions")
      await expect(row(partnerPage, "Rent pot, mine")).toHaveCount(1)
      // Meanwhile the owner changes the same transfer.
      await call(ownerPage, `transfer.update`, { ...fields, memo: "Rent pot, theirs", version: 1 })

      await partnerContext.setOffline(false)
      const conflict = partnerPage.locator("[data-e2e=offline-status] li")
      await expect(conflict).toHaveCount(1, { timeout: 20_000 })
      await expect(conflict.locator("[data-e2e=conflict-message]"))
        .toHaveText("Someone changed this transfer while you were offline.")
      await expect(conflict.locator("[data-e2e=conflict-mine]")).toContainText("Rent pot, mine")
      await expect(conflict.locator("[data-e2e=conflict-theirs]")).toContainText("Rent pot, theirs")

      await conflict.getByRole("button", { name: "Use the server's" }).click()
      await expect(conflict).toHaveCount(0)
      await expect(row(partnerPage, "Rent pot, theirs")).toHaveCount(1)
    })
  })

  test("a transfer whose account was deleted while offline waits on the list for another account or Discard", async ({ browser, request }) => {
    await twoPeople(browser, request, "transfers_gone", async (people) => {
      const { ownerPage, partnerPage, partnerContext, partner } = people
      const { groupId, cash } = await household(ownerPage, request, partner)
      await openTransactions(partnerPage, groupId)

      await goOffline(request, partnerContext, partnerPage, partner)
      await addTransfer(partnerPage, "15", "Wallet", "Cash", "Pocket money")
      await addTransfer(partnerPage, "25", "Wallet", "Cash", "Gift")
      // Meanwhile the owner deletes the account the two transfers send to.
      await call(ownerPage, `account.delete`, { groupId, id: cash, version: 1 })

      await partnerContext.setOffline(false)
      const pocket = row(partnerPage, "Pocket money")
      const gift = row(partnerPage, "Gift")
      for (const transfer of [pocket, gift]) {
        await expect(transfer.locator("[data-e2e=transaction-conflict-message]")).toHaveText(
          "One of its accounts was deleted while you were offline. Pick another account, or discard this transfer.",
          { timeout: 20_000 },
        )
      }
      // The list is the one place that handles them, so the sync line is not drawn.
      await expect(partnerPage.locator("[data-e2e=offline-status]")).toHaveCount(0)

      // Discard, from the keyboard, asks first; Escape keeps the transfer, focus back on Discard.
      const discard = gift.locator("[data-e2e=transaction-conflict-discard]")
      const dialog = partnerPage.locator("[data-e2e=transaction-discard-dialog]")
      await gift.locator("[data-e2e=transfer-row]").focus()
      await partnerPage.keyboard.press("Tab")
      await expect(gift.locator("[data-e2e=transaction-conflict-pick]")).toBeFocused()
      await partnerPage.keyboard.press("Tab")
      await expect(discard).toBeFocused()
      await partnerPage.keyboard.press("Space")
      await expect(dialog).toBeVisible()
      await partnerPage.keyboard.press("Escape")
      await expect(dialog).toHaveCount(0)
      await expect(discard).toBeFocused()

      // Pick another account, from the keyboard: the editor opens with focus on the empty To.
      const pick = pocket.locator("[data-e2e=transaction-conflict-pick]")
      await expect(pick).toHaveText("Pick another account")
      await pick.focus()
      await partnerPage.keyboard.press("Enter")
      await expect(partnerPage).toHaveURL(/\/transfers\/[0-9a-f-]+$/)
      await expect(partnerPage.locator("#transfer-to")).toBeFocused()
      await partnerPage.locator("#transfer-to").selectOption({ label: "Savings · EUR" })
      await partnerPage.locator("[data-e2e=transfer-save]").click()
      await expect(partnerPage).toHaveURL("/transactions")
      await expect(pocket.locator("[data-e2e=transaction-conflict]")).toHaveCount(0, {
        timeout: 20_000,
      })
      await expect(pocket.locator("[data-e2e=transfer-accounts]")).toContainText("Savings")
      await expect(gift.locator("[data-e2e=transaction-conflict]")).toHaveCount(1)

      // Confirmed, the transfer leaves the device, and focus moves on to the next row.
      await discard.focus()
      await partnerPage.keyboard.press("Space")
      await expect(dialog).toBeVisible()
      const confirm = partnerPage.locator("[data-e2e=transaction-discard-confirm]")
      await confirm.focus()
      await expect(confirm).toBeFocused()
      await partnerPage.keyboard.press("Enter")
      await expect(gift).toHaveCount(0)
      await expect(pocket.locator("[data-e2e=transfer-row]")).toBeFocused()

      // The server holds the fixed transfer and not the discarded one.
      await openTransactions(ownerPage, groupId)
      await expect(row(ownerPage, "Pocket money")).toHaveCount(1)
      await expect(row(ownerPage, "Gift")).toHaveCount(0)
    })
  })
})
