/**
 * Transfers between a household's own accounts: one from euros to dong with both amounts, which
 * moves both balances, leaves the month's spending and income alone, shows under either account's
 * filter and reaches the partner's open list without a reload; its delete and Undo; and a transfer
 * whose date has no rate, which makes the received amount required.
 */
import { type APIRequestContext, type Page } from "@playwright/test"
import { expect, test } from "./fixtures/stack.ts"
import { gotoApp, signIn } from "./fixtures/app.ts"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"
import { payForGroup, signUpWithCode } from "./fixtures/sign-up.ts"

const apiBase = "http://app.localhost"
const headers = { origin: apiBase, "sec-fetch-site": "same-origin" }
const password = "Passw0rd!"

const EDITOR = 2
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
 * A paid household made by `owner`'s page, with `partner` as an editor when given, and the
 * accounts Wallet (€1,000.00) and Cash (dong, empty). The European Central Bank publishes no rate
 * for the dong, so the server cannot convert between the two.
 */
async function household(owner: Page, request: APIRequestContext, partner?: string) {
  const groupId = uuidV7()
  const created = await owner.request.post(`${apiBase}/api/groups`, {
    headers,
    data: { id: groupId, name: "Home money" },
  })
  expect(created.status(), await created.text()).toBe(201)
  await payForGroup(owner.request, apiBase, groupId)
  if (partner) {
    const added = await request.post(`${apiBase}/api/test/add-member`, {
      data: { login: partner, groupId, role: EDITOR },
    })
    expect(added.status(), await added.text()).toBe(200)
  }
  const account = async (name: string, currency: string, startingBalance: number) => {
    const id = uuidV7()
    await call(owner, `account.create`, { groupId, id, name, kind: 1, currency, startingBalance })
    return id
  }
  const wallet = await account("Wallet", "EUR", 100_000)
  const cash = await account("Cash", "VND", 0)
  return { groupId, wallet, cash }
}

/** Selects the household and opens its transactions, with the socket online. */
async function openTransactions(page: Page, groupId: string): Promise<void> {
  const selected = await page.request.put(`${apiBase}/api/groups/selected`, {
    headers,
    data: { groupId },
  })
  expect(selected.ok(), await selected.text()).toBe(true)
  const status = page.locator("[data-e2e=shell-ws-status]")
  await gotoApp(page, "/transactions", status)
  await expect(status).toHaveText("Online")
}

const sent = (page: Page) => page.locator("[data-e2e=transfer-sent-field] input[type=text]")
const received = (page: Page) => page.locator("[data-e2e=transfer-received-field] input[type=text]")
const rows = (page: Page) => page.locator("[data-e2e=transfer-row]")

test.describe("transfers", () => {
  test.describe.configure({ timeout: 180_000 })

  test("a transfer from euros to dong moves both balances, not the month, shows under both accounts and reaches the partner without a reload, and comes back on Undo after a delete", async ({ browser, request }) => {
    const owner = "e2e_transfers_owner@example.com"
    const partner = "e2e_transfers_partner@example.com"
    const baseURL = test.info().project.use.baseURL
    for (const email of [owner, partner]) await cleanup(request, email)
    const ownerContext = await browser.newContext({ baseURL })
    const partnerContext = await browser.newContext({ baseURL })
    try {
      for (const email of [owner, partner]) await signUp(request, email)
      const page = await ownerContext.newPage()
      await signIn(page, owner, password)
      const { groupId, wallet, cash } = await household(page, request, partner)

      // A month with an expense and an income, read before the transfer.
      const category = async (name: string, kind: number) => {
        const id = uuidV7()
        const color = "#16a34a"
        await call(page, `category.create`, {
          groupId,
          id,
          name,
          kind,
          icon: "tag",
          color,
          parentId: null,
        })
        return id
      }
      const groceries = await category("Groceries", EXPENSE)
      const salary = await category("Salary", INCOME)
      for (
        const [categoryId, kind, amount] of [[groceries, EXPENSE, 4_000], [salary, INCOME, 50_000]]
      ) {
        await call(page, `transaction.create`, {
          groupId,
          id: uuidV7(),
          accountId: wallet,
          categoryId,
          kind,
          amount,
          currency: "EUR",
        })
      }
      const monthBefore = await call(page, `budget.month`, { groupId })

      // The partner's tab counts its page loads, so a reload fails the test instead of passing it.
      const partnerPage = await partnerContext.newPage()
      let partnerLoads = 0
      partnerPage.on("load", () => partnerLoads++)
      await signIn(partnerPage, partner, password)
      await openTransactions(partnerPage, groupId)
      const loadsBefore = partnerLoads

      // Add: from the list's More actions menu, both amounts typed.
      await openTransactions(page, groupId)
      await page.locator("[data-e2e=transactions-menu]").click()
      await page.locator("[data-e2e=transfer-new]").click()
      await expect(page).toHaveURL("/transfers/new")
      await page.locator("#transfer-from").selectOption(wallet)
      await page.locator("#transfer-to").selectOption(cash)
      await expect(page.locator("label[for=transfer-received]")).toContainText("VND")
      await sent(page).fill("200")
      await received(page).fill("5000000")
      await expect(page.locator("[data-e2e=transfer-rate]")).toHaveText(
        "Your own rate: 1 EUR = 25,000 VND.",
      )
      await page.locator("[data-e2e=transfer-save]").click()
      await expect(page).toHaveURL("/transactions")
      await expect(rows(page)).toHaveCount(1)
      await expect(rows(page)).toHaveAttribute(
        "aria-label",
        /^Transfer of €200\.00 from Wallet to Cash, ₫5,000,000 received, Today$/,
      )
      await expect(rows(page).locator("[data-e2e=transfer-amount]")).toHaveText("€200.00")

      // The partner's open list follows, with no reload.
      await expect(rows(partnerPage)).toHaveCount(1, { timeout: 5_000 })
      expect(partnerLoads).toBe(loadsBefore)

      // Each account's filter shows the transfer from that account's side.
      await gotoApp(page, `/transactions?account=${wallet}`, rows(page))
      await expect(rows(page).locator("[data-e2e=transfer-amount]")).toHaveText("-€200.00")
      await gotoApp(page, `/transactions?account=${cash}`, rows(page))
      await expect(rows(page).locator("[data-e2e=transfer-amount]")).toHaveText("₫5,000,000")
      await expect(rows(page).locator("[data-e2e=transfer-other-amount]")).toHaveText(
        "€200.00 sent",
      )

      // Both balances move: €1,000 + €500 income − €40 spent − €200 sent; ₫5,000,000 arrived.
      await gotoApp(page, "/accounts", page.locator(`[data-e2e=account-${wallet}]`))
      await expect(page.locator(`[data-e2e=account-${wallet}] [data-e2e=account-balance]`))
        .toContainText("1,260.00")
      await expect(page.locator(`[data-e2e=account-${cash}] [data-e2e=account-balance]`))
        .toContainText("5,000,000")

      // The month's spending and income are what they were.
      expect(await call(page, `budget.month`, { groupId })).toEqual(monthBefore)

      // Delete from the transfer's page, then Undo from the list's toast.
      await gotoApp(page, "/transactions", rows(page))
      await rows(page).click()
      await expect(page).toHaveURL(/\/transfers\/[0-9a-f-]{36}$/)
      await page.locator("[data-e2e=transfer-editor-menu]").click()
      await page.locator("[data-e2e=transfer-delete]").click()
      await expect(page).toHaveURL("/transactions")
      await expect(page.locator("[data-e2e=transfer-undo-toast]")).toContainText(
        "Transfer deleted",
      )
      await expect(rows(page)).toHaveCount(0)
      await expect(rows(partnerPage)).toHaveCount(0, { timeout: 5_000 })
      await page.locator("[data-e2e=transfer-undo]").click()
      await expect(rows(page)).toHaveCount(1)
      await expect(rows(partnerPage)).toHaveCount(1, { timeout: 5_000 })
      expect(partnerLoads).toBe(loadsBefore)
    } finally {
      await ownerContext.close()
      await partnerContext.close()
      for (const email of [owner, partner]) await cleanup(request, email)
    }
  })

  test("a transfer the server has no rate for asks for the received amount, required, and saves with it", async ({ page, request }) => {
    const owner = "e2e_transfers_no_rate@example.com"
    await cleanup(request, owner)
    try {
      await signUp(request, owner)
      await signIn(page, owner, password)
      const { groupId, wallet, cash } = await household(page, request)
      await openTransactions(page, groupId)

      // In from the transaction editor's kind control, which carries the amount typed there.
      await page.locator("[data-e2e=transaction-new-empty], [data-e2e=transaction-new]").first()
        .click()
      await expect(page).toHaveURL(/\/transactions\/new/)
      await page.locator("[data-e2e=transaction-amount-field] input[type=text]").fill("200")
      await page.locator("[data-e2e=transaction-kind]").getByRole("radio", { name: "Transfer" })
        .click()
      await expect(page).toHaveURL("/transfers/new")
      await expect(sent(page)).toHaveValue("200")

      await page.locator("#transfer-from").selectOption(cash)
      await page.locator("#transfer-to").selectOption(wallet)
      await expect(page.locator("[data-e2e=transfer-rate]")).toContainText("when you save")
      await expect(received(page)).not.toHaveAttribute("required")
      await page.locator("[data-e2e=transfer-save]").click()

      await expect(page).toHaveURL("/transfers/new")
      await expect(page.locator("[data-e2e=transfer-received-field]")).toContainText(
        "no exchange rate",
      )
      await expect(received(page)).toHaveAttribute("required")
      await expect(received(page)).toBeFocused()
      await received(page).fill("0.01")
      await page.locator("[data-e2e=transfer-save]").click()
      await expect(page).toHaveURL("/transactions")
      await expect(rows(page)).toHaveCount(1)
    } finally {
      await cleanup(request, owner)
    }
  })
})
