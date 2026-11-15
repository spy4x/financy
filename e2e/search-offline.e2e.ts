import { type APIRequestContext, type Page } from "@playwright/test"
import { expect, test } from "./fixtures/stack.ts"
import { gotoApp, signIn } from "./fixtures/app.ts"
import { payForGroup, signUpWithCode } from "./fixtures/sign-up.ts"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"

/**
 * The search with no network. The app starts from the service worker's cache, so this spec runs
 * against the built SPA (`OFFLINE_SPECS` in `infra/scripts/e2e-local-plan.ts`).
 */

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

/**
 * Selects a new group with one note, opens its notes, and makes sure the device holds what an
 * offline start needs: the app in the service worker's cache, and the group's notes.
 */
async function groupOnDevice(page: Page, name: string, title: string, body: string) {
  const groupId = uuidV7()
  const group = await page.request.post(`${apiBase}/api/groups`, {
    headers,
    data: { id: groupId, name },
  })
  expect(group.status(), await group.text()).toBe(201)
  await payForGroup(page.request, apiBase, groupId)
  const note = await page.request.post(`${apiBase}/api/groups/${groupId}/notes`, {
    headers,
    data: { id: uuidV7(), title, body },
  })
  expect(note.status(), await note.text()).toBe(201)
  const selected = await page.request.put(`${apiBase}/api/groups/selected`, {
    headers,
    data: { groupId },
  })
  expect(selected.ok(), await selected.text()).toBe(true)
  await gotoApp(page, "/notes", page.locator("[data-e2e=shell-ws-status]"))
  await expect(page.locator("[data-e2e=shell-ws-status]")).toHaveText("Online")
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // One more load under the worker's control, so everything the page needs is cached.
  await gotoApp(page, page.url(), page.locator("[data-e2e=note-list]"))
  await expect(page.locator("[data-e2e=note-item-title]").filter({ hasText: title })).toHaveCount(1)
}

test.describe("search with no network", () => {
  // Signs up, loads the app twice so the service worker holds it, and starts it again offline.
  test.describe.configure({ timeout: 60_000 })

  test("searches the notes on this device and says so, and offers to create what nothing matches", async ({ browser, request }) => {
    const user = "e2e_search_offline@example.com"
    await cleanup(request, user)
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    try {
      await signUp(request, user)
      const page = await context.newPage()
      await signIn(page, user, password)
      await groupOnDevice(page, "Field trip", "Packing list", "Rain jacket")

      await context.setOffline(true)
      await page.reload()
      await expect(page.locator("[data-e2e=shell-ws-status]")).not.toHaveText("Online")

      const palette = page.locator("[data-e2e=search]")
      const field = palette.getByRole("combobox")
      await page.locator("[data-e2e=shell-search-rail] button").click()
      await field.fill("jacket")
      await expect(palette.getByRole("group").first()).toContainText("Notes on this device")
      await expect(palette.getByRole("option").filter({ hasText: "Packing list" })).toBeVisible()

      // Nothing matches: the Create rows offer it, a note on the device, a group not offline.
      await field.fill("snorkel")
      const options = palette.getByRole("option")
      await expect(options.first()).toHaveAccessibleName(/^New note: “\u2068?snorkel\u2069?”/)
      await expect(palette.getByRole("group").first()).toContainText("Create")
      const group = options.filter({ hasText: "New group" })
      await expect(group).toHaveAttribute("aria-disabled", "true")
      await expect(group).toContainText("Needs a connection")
      // Only the device was searched: a dimmed row says so, so the person does not make a twin.
      const hint = options.filter({
        hasText: "Nothing on this device matches “snorkel”. Search again when you're back online.",
      })
      await expect(hint).toBeVisible()
      await expect(hint).toHaveAttribute("aria-disabled", "true")
      await expect(hint).toHaveAttribute("aria-selected", "false")
    } finally {
      await context.close()
      await cleanup(request, user)
    }
  })

  test("finds a transaction and an account on this device and sends nothing typed", async ({ browser, request }) => {
    const user = "e2e_search_offline_records@example.com"
    await cleanup(request, user)
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    try {
      await signUp(request, user)
      const page = await context.newPage()
      await signIn(page, user, password)
      const { transactionId, accountId } = await householdOnDevice(page, "Пятёрочка")

      await context.setOffline(true)
      await page.reload()
      await expect(page.locator("[data-e2e=shell-ws-status]")).not.toHaveText("Online")

      // Every request the page starts while the person types, with its address and body.
      const sent: string[] = []
      page.on("request", (sentRequest) => {
        sent.push(`${decodeURIComponent(sentRequest.url())} ${sentRequest.postData() ?? ""}`)
      })
      const palette = page.locator("[data-e2e=search]")
      const field = palette.getByRole("combobox")
      // Misspelled: "е" for "ё", and "а" for the second "о".
      const query = "пятерачка"
      await page.locator("[data-e2e=shell-search-rail] button").click()
      await field.pressSequentially(query)
      const row = palette.getByRole("group", { name: "Transactions", exact: true })
        .getByRole("option").filter({ hasText: "Пятёрочка" })
      await expect(row).toContainText("Wallet")
      // Not even the first letters of it: each keystroke ran a search.
      expect(sent.filter((line) => line.toLowerCase().includes(query.slice(0, 3)))).toEqual([])
      await row.click()
      await expect(page).toHaveURL(`/transactions/${transactionId}`)

      sent.length = 0
      await page.locator("[data-e2e=shell-search-rail] button").click()
      await field.pressSequentially("walet")
      await palette.getByRole("group", { name: "Accounts", exact: true })
        .getByRole("option").filter({ hasText: "Wallet" }).click()
      await expect(page).toHaveURL(`/accounts/${accountId}`)
      expect(sent.filter((line) => line.toLowerCase().includes("wal"))).toEqual([])
    } finally {
      await context.close()
      await cleanup(request, user)
    }
  })

  test("finds a category on this device by an alias set in its editor", async ({ browser, request }) => {
    const user = "e2e_search_offline_alias@example.com"
    await cleanup(request, user)
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    try {
      await signUp(request, user)
      const page = await context.newPage()
      await signIn(page, user, password)
      const { categoryId } = await householdOnDevice(page, "Weekly shop")
      const status = page.locator("[data-e2e=shell-ws-status]")
      const row = page.locator(`[data-e2e=category-${categoryId}]`)
      await row.locator("[data-e2e=category-name]").click()
      await page.locator("#category-aliases").fill("Пятёрочка")
      await page.locator("#category-aliases").press("Enter")
      await page.locator("[data-e2e=category-save]").click()
      await expect(page.locator("[data-e2e=category-save]")).toHaveCount(0)
      // The list read again online, so the device's copy holds the alias.
      await gotoApp(page, "/categories", status)
      await expect(row).toBeVisible()

      await context.setOffline(true)
      await page.reload()
      await expect(status).not.toHaveText("Online")
      const palette = page.locator("[data-e2e=search]")
      await page.locator("[data-e2e=shell-search-rail] button").click()
      // Misspelled, as a person types it in a hurry: "е" for "ё", "а" for the second "о".
      await palette.getByRole("combobox").pressSequentially("пятерачка")
      await palette.getByRole("group", { name: "Categories", exact: true })
        .getByRole("option").filter({ hasText: "Groceries" }).click()
      await expect(page).toHaveURL(`/categories/${categoryId}`)
    } finally {
      await context.close()
      await cleanup(request, user)
    }
  })
})

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
 * Selects a new paid household with the account Wallet, the category Groceries and one expense
 * with `memo`, opens its transactions so the device keeps them, its accounts and its categories,
 * then leaves for the categories page, which reads no transactions: the palette must find the
 * entry in the device's copy.
 */
async function householdOnDevice(page: Page, memo: string) {
  const groupId = uuidV7()
  const group = await page.request.post(`${apiBase}/api/groups`, {
    headers,
    data: { id: groupId, name: "Home money" },
  })
  expect(group.status(), await group.text()).toBe(201)
  await payForGroup(page.request, apiBase, groupId)
  const accountId = uuidV7()
  await call(page, `account.create`, {
    groupId,
    id: accountId,
    name: "Wallet",
    kind: 1,
    currency: "EUR",
    startingBalance: 0,
  })
  const categoryId = uuidV7()
  await call(page, `category.create`, {
    groupId,
    id: categoryId,
    name: "Groceries",
    kind: 1,
    icon: "shopping-cart",
    color: "#16a34a",
    parentId: null,
  })
  const transactionId = uuidV7()
  await call(page, `transaction.create`, {
    groupId,
    id: transactionId,
    accountId,
    categoryId,
    kind: 1,
    amount: 1234,
    currency: "EUR",
    memo,
    date: new Date().toISOString().slice(0, 10),
  })
  const selected = await page.request.put(`${apiBase}/api/groups/selected`, {
    headers,
    data: { groupId },
  })
  expect(selected.ok(), await selected.text()).toBe(true)
  const status = page.locator("[data-e2e=shell-ws-status]")
  await gotoApp(page, "/transactions", status)
  await expect(status).toHaveText("Online")
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  // One more load under the worker's control, so everything the page needs is cached.
  await gotoApp(page, page.url(), page.locator(`[data-e2e=transaction-${transactionId}]`))
  await expect(page.locator(`[data-e2e=transaction-${transactionId}]`)).toContainText("Wallet")
  await gotoApp(page, "/categories", status)
  return { transactionId, accountId, categoryId }
}
