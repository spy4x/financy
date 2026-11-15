import { expect, test } from "./fixtures/stack.ts"
import { signIn } from "./fixtures/app.ts"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"
import { payForGroup, signUpWithCode } from "./fixtures/sign-up.ts"

/**
 * The group overview: the rail's first link opens the selected group's overview, a widget
 * hidden from its card's menu stays hidden after a reload (the layout is kept in the person's
 * preferences on the server), and "Reset layout" brings it back. A group the person is not in
 * reads as one that does not exist.
 */

const appBase = "http://app.localhost"
const headers = { origin: appBase, "sec-fetch-site": "same-origin" }
const password = "Passw0rd!"

test.describe("group overview", () => {
  test("a widget hidden from its menu stays hidden after a reload, and Reset layout shows it again", async ({ page, request }) => {
    test.setTimeout(90_000)
    const email = `e2e-overview-${uuidV7().slice(-8)}@example.com`
    const cleanup = async () => {
      const response = await request.post(`${appBase}/api/test/cleanup-user`, {
        data: { login: email },
      })
      expect.soft(response.status(), await response.text()).toBe(200)
    }
    try {
      const signUp = await signUpWithCode(request, `${appBase}/api/auth/password/sign-up`, {
        headers,
        data: { email, password },
      })
      expect(signUp.ok(), await signUp.text()).toBe(true)
      await signIn(page, email, password)

      await page.getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Overview" }).click()
      await expect(page).toHaveURL(/\/overview\/[0-9a-f-]{36}$/)
      await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible()
      const added = page.locator(`[data-e2e="overview-widget-notes.added"]`)
      await expect(added).toBeVisible()
      await expect(page.locator(`[data-e2e="overview-widget-notes.total"]`)).toBeVisible()

      await page.getByRole("button", { name: "Actions for Notes added" }).click()
      await page.getByRole("menuitem", { name: "Hide widget" }).click()
      await expect(page.getByText("Notes added hidden.")).toBeVisible()
      await expect(added).toHaveCount(0)

      await page.reload()
      await expect(page.locator(`[data-e2e="overview-widget-notes.total"]`)).toBeVisible()
      await expect(added).toHaveCount(0)

      await page.locator("[data-e2e=overview-menu]").click()
      await page.getByRole("menuitem", { name: "Reset layout" }).click()
      await expect(added).toBeVisible()
      await page.reload()
      await expect(added).toBeVisible()

      await page.goto(`/overview/${uuidV7()}`)
      await expect(page.getByText("This group does not exist.")).toBeVisible()
    } finally {
      await cleanup()
    }
  })

  test("a money card opens its own household's transactions while another household is selected, with no 'No notes' card above the money", async ({ page, request }) => {
    test.setTimeout(120_000)
    const email = `e2e-overview-money-${uuidV7().slice(-8)}@example.com`
    try {
      const signUp = await signUpWithCode(request, `${appBase}/api/auth/password/sign-up`, {
        headers,
        data: { email, password },
      })
      expect(signUp.ok(), await signUp.text()).toBe(true)
      await signIn(page, email, password)

      /** Runs one operation as the signed-in person, the way the app's HTTP transport does. */
      const call = async (name: string, data: unknown) => {
        const me = await page.request.get(`${appBase}/api/auth/me`)
        const response = await page.request.post(`${appBase}/api/call/${name}`, {
          headers: {
            ...headers,
            "x-realtime-user": String((await me.json()).id),
            "idempotency-key": uuidV7(),
          },
          data,
        })
        expect(response.ok(), `${name}: ${await response.text()}`).toBe(true)
      }
      const household = async (name: string) => {
        const groupId = uuidV7()
        const created = await page.request.post(`${appBase}/api/groups`, {
          headers,
          data: { id: groupId, name },
        })
        expect(created.status(), await created.text()).toBe(201)
        await payForGroup(page.request, appBase, groupId)
        return groupId
      }
      const home = await household("Home")
      const accountId = uuidV7()
      const salary = uuidV7()
      await call(`account.create`, {
        groupId: home,
        id: accountId,
        name: "Wallet",
        kind: 1,
        currency: "EUR",
        startingBalance: 0,
      })
      await call(`category.create`, {
        groupId: home,
        id: salary,
        name: "Salary",
        kind: 2,
        icon: "shopping-cart",
        color: "#16a34a",
        parentId: null,
      })
      await call(`transaction.create`, {
        groupId: home,
        id: uuidV7(),
        accountId,
        categoryId: salary,
        kind: 2,
        amount: 300_000,
        currency: "EUR",
        memo: "Salary of Home",
      })
      const work = await household("Work")
      await call(`group.select`, { groupId: work })

      await page.goto(`/overview/${home}`)
      const income = page.locator(`[data-e2e="overview-widget-money.income"]`)
      await expect(income).toContainText("€3,000.00")
      await expect(page.locator(`[data-e2e=overview-empty-group]`)).toHaveCount(0)

      await income.getByRole("link", { name: "See income transactions" }).click()
      await expect(page).toHaveURL(/\/transactions\?kind=2&from=[\d-]+&to=[\d-]+$/)
      await expect(page.getByText("Salary of Home")).toBeVisible()
    } finally {
      const response = await request.post(`${appBase}/api/test/cleanup-user`, {
        data: { login: email },
      })
      expect.soft(response.status(), await response.text()).toBe(200)
    }
  })

  test("the budgets card names a long category far over in dong on a phone, without sideways scrolling, and opens that month's Budgets screen of its own household", async ({ page, request }) => {
    test.setTimeout(120_000)
    const email = `e2e-overview-budgets-${uuidV7().slice(-8)}@example.com`
    try {
      const signUp = await signUpWithCode(request, `${appBase}/api/auth/password/sign-up`, {
        headers,
        data: { email, password },
      })
      expect(signUp.ok(), await signUp.text()).toBe(true)
      await page.setViewportSize({ width: 390, height: 844 })
      await signIn(page, email, password)

      /** Runs one operation as the signed-in person, the way the app's HTTP transport does. */
      const call = async (name: string, data: unknown) => {
        const me = await page.request.get(`${appBase}/api/auth/me`)
        const response = await page.request.post(`${appBase}/api/call/${name}`, {
          headers: {
            ...headers,
            "x-realtime-user": String((await me.json()).id),
            "idempotency-key": uuidV7(),
          },
          data,
        })
        expect(response.ok(), `${name}: ${await response.text()}`).toBe(true)
      }
      const household = async (name: string) => {
        const groupId = uuidV7()
        const created = await page.request.post(`${appBase}/api/groups`, {
          headers,
          data: { id: groupId, name },
        })
        expect(created.status(), await created.text()).toBe(201)
        await payForGroup(page.request, appBase, groupId)
        return groupId
      }
      const home = await household("Home")
      const accountId = uuidV7()
      const supplies = uuidV7()
      await call(`account.create`, {
        groupId: home,
        id: accountId,
        name: "Ví",
        kind: 1,
        currency: "VND",
        startingBalance: 0,
      })
      await call(`category.create`, {
        groupId: home,
        id: supplies,
        name: "Groceries and household supplies for the whole family",
        kind: 1,
        icon: "shopping-cart",
        color: "#c2410c",
        parentId: null,
      })
      const month = new Date().toISOString().slice(0, 7)
      await call(`budget.set`, {
        groupId: home,
        categoryId: supplies,
        month,
        amount: 1_000_000,
        currency: "VND",
        expectedVersion: null,
      })
      await call(`transaction.create`, {
        groupId: home,
        id: uuidV7(),
        accountId,
        categoryId: supplies,
        kind: 1,
        amount: 125_000_000,
        currency: "VND",
        memo: "Supplies of Home",
      })
      const work = await household("Work")
      await call(`group.select`, { groupId: work })

      await page.goto(`/overview/${home}`)
      const card = page.locator(`[data-e2e="overview-widget-budgets.month"]`)
      await expect(card.locator(`[data-e2e=budget-widget-sentence]`)).toHaveText(
        /^0 of 1 budget on track; .Groceries and household supplies for the whole family. is .₫124,000,000. over\.$/,
      )
      await expect(card.locator(`[data-e2e=budget-${supplies}]`).getByRole("meter")).toBeVisible()
      await expect(card.locator(`[data-e2e=budget-widget-bars]`).getByRole("button")).toHaveCount(0)
      expect(
        await page.evaluate(() =>
          document.documentElement.scrollWidth <= document.documentElement.clientWidth
        ),
      ).toBe(true)
      await card.scrollIntoViewIfNeeded()
      await page.screenshot({ path: test.info().outputPath(`overview-budgets-390.png`) })

      await card.getByRole("link", { name: /^See budgets for / }).click()
      await expect(page).toHaveURL(/\/budgets\??$/)
      await expect(page.locator(`[data-e2e=budget-${supplies}]`).getByRole("meter"))
        .toContainText("₫125,000,000 of ₫1,000,000")
    } finally {
      const response = await request.post(`${appBase}/api/test/cleanup-user`, {
        data: { login: email },
      })
      expect.soft(response.status(), await response.text()).toBe(200)
    }
  })
})
