import { type APIRequestContext, type Page } from "@playwright/test"
import { expect, test } from "./fixtures/stack.ts"
import { signIn } from "./fixtures/app.ts"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"
import { openCategories } from "./fixtures/groups.ts"
import { payForGroup, signUpWithCode } from "./fixtures/sign-up.ts"

const apiBase = "http://app.localhost"
const headers = { origin: apiBase, "sec-fetch-site": "same-origin" }
const password = "Passw0rd!"

const VIEWER = 1

interface ServerCategory {
  id: string
  name: string
  parentId: string | null
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

/** Creates a paid household as the page's user; `viewer`, when given, joins it as a viewer. */
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
  await payForGroup(owner.request, apiBase, groupId)
  if (viewer) {
    const added = await request.post(`${apiBase}/api/test/add-member`, {
      data: { login: viewer, groupId, role: VIEWER },
    })
    expect(added.status(), await added.text()).toBe(200)
  }
  return groupId
}

async function serverCategories(page: Page, groupId: string): Promise<ServerCategory[]> {
  const response = await page.request.get(`${apiBase}/api/groups/${groupId}/categories`)
  expect(response.ok(), await response.text()).toBe(true)
  return (await response.json()).categories
}

const CATEGORY_URL = /\/categories\/[0-9a-f-]{36}$/

/** Types a name into the open editor, saves it and goes back to the list. */
async function saveNamed(page: Page, name: string): Promise<void> {
  await page.locator("[data-e2e=category-name-input]").fill(name)
  await page.locator("[data-e2e=category-save]").click()
  await expect(page).toHaveURL(CATEGORY_URL)
  await expect(page.locator("[data-e2e=category-save]")).toHaveCount(0)
  await page.locator("[data-e2e=page-back]").click()
  await expect(page).toHaveURL("/categories")
}

/** The row menu of the category named `name`. */
function menuOf(page: Page, name: string) {
  return page.locator("li", { has: page.getByRole("link", { name, exact: true }) })
    .locator("[data-e2e=category-menu]")
}

test.describe("categories", () => {
  test.describe.configure({ timeout: 120_000 })

  test("a category and its subcategory made by the owner show in a viewer's open tab without a reload, and archiving the parent takes both away until it comes back", async ({ browser, request }) => {
    const owner = "e2e_categories_live_owner@example.com"
    const viewer = "e2e_categories_live_viewer@example.com"
    const baseURL = test.info().project.use.baseURL
    for (const email of [owner, viewer]) await cleanup(request, email)
    const ownerContext = await browser.newContext({ baseURL })
    const viewerContext = await browser.newContext({ baseURL })
    try {
      for (const email of [owner, viewer]) await signUp(request, email)
      const ownerPage = await ownerContext.newPage()
      await signInOnline(ownerPage, owner)
      const groupId = await household(ownerPage, request, "Spending team", viewer)

      // The viewer's tab counts its page loads, so a reload, which would read the categories on
      // its own, fails the test instead of passing it.
      const viewerPage = await viewerContext.newPage()
      let viewerLoads = 0
      viewerPage.on("load", () => viewerLoads++)
      await signInOnline(viewerPage, viewer)
      await openCategories(viewerPage, "Spending team")
      await expect(viewerPage.locator("[data-e2e=categories-read-only]")).toBeVisible()
      await expect(viewerPage.locator("[data-e2e=category-new]")).toHaveCount(0)
      const loadsBefore = viewerLoads
      const viewerNames = viewerPage.locator("[data-e2e=category-name] bdi")

      await openCategories(ownerPage, "Spending team")
      await ownerPage.locator("[data-e2e=category-new]").click()
      await expect(ownerPage).toHaveURL("/categories/new")
      await saveNamed(ownerPage, "Food")
      await expect(viewerNames).toHaveText(["Food"], { timeout: 5_000 })

      // Add subcategory from Food's menu opens the editor with Food as its parent.
      await menuOf(ownerPage, "Food").click()
      await ownerPage.locator("[data-e2e=category-menu-add-child]:visible").click()
      await expect(ownerPage).toHaveURL(/\/categories\/new\?parent=/)
      await expect(ownerPage.locator("[data-e2e=category-parent] input")).toHaveValue("Food")
      await saveNamed(ownerPage, "Groceries")
      const ownerNames = ownerPage.locator("[data-e2e=category-name] bdi")
      await expect(ownerNames).toHaveText(["Food", "Groceries"])
      await expect(viewerNames).toHaveText(["Food", "Groceries"], { timeout: 5_000 })
      // The viewer's rows carry no menu.
      await expect(viewerPage.locator("[data-e2e=category-menu]")).toHaveCount(0)
      const food = (await serverCategories(ownerPage, groupId)).find((c) => c.name === "Food")!
      const groceries = (await serverCategories(ownerPage, groupId))
        .find((c) => c.name === "Groceries")!
      expect(groceries.parentId).toBe(food.id)

      // A sibling's name, in other letter case, is refused (D3).
      await ownerPage.locator("[data-e2e=category-new]").click()
      await ownerPage.locator("[data-e2e=category-name-input]").fill("FOOD")
      await ownerPage.locator("[data-e2e=category-save]").click()
      await expect(
        ownerPage.getByText(/There is already an expense category called \u2068?FOOD\u2069?\./),
      )
        .toBeVisible()
      await expect(ownerPage).toHaveURL("/categories/new")
      // Leaving with the refused name typed asks first.
      await ownerPage.locator("[data-e2e=category-cancel]").first().click()
      await ownerPage.getByRole("button", { name: "Discard", exact: true }).click()
      await expect(ownerPage).toHaveURL("/categories")

      // Archiving Food asks first, naming Groceries, and then takes both away.
      await menuOf(ownerPage, "Food").click()
      await ownerPage.locator("[data-e2e=category-archive]:visible").click()
      const dialog = ownerPage.locator("[data-e2e=category-archive-dialog]")
      await expect(dialog).toContainText("Groceries")
      await ownerPage.locator("[data-e2e=category-archive-confirm]").click()
      await expect(ownerNames).toHaveCount(0)
      await expect(viewerNames).toHaveCount(0, { timeout: 5_000 })
      const archived = await serverCategories(ownerPage, groupId)
      expect(archived.every((c) => c.archivedAt !== null)).toBe(true)

      // Unarchiving Food brings Groceries back with it (D2).
      await ownerPage.locator("[data-e2e=categories-menu]").click()
      await ownerPage.locator("[data-e2e=categories-toggle-archived]").click()
      await menuOf(ownerPage, "Food").click()
      await ownerPage.locator("[data-e2e=category-unarchive]:visible").click()
      await expect(viewerNames).toHaveText(["Food", "Groceries"], { timeout: 5_000 })
      const back = await serverCategories(ownerPage, groupId)
      expect(back.every((c) => c.archivedAt === null)).toBe(true)

      expect(viewerLoads).toBe(loadsBefore)
    } finally {
      await ownerContext.close()
      await viewerContext.close()
      for (const email of [owner, viewer]) await cleanup(request, email)
    }
  })

  test("a 60-character name leaves the editor without sideways scroll on a 390 px phone", async ({ page, request }) => {
    const owner = "e2e_categories_long_name@example.com"
    await cleanup(request, owner)
    try {
      await signUp(request, owner)
      await signInOnline(page, owner)
      await household(page, request, "Long names")
      await openCategories(page, "Long names")
      await page.setViewportSize({ width: 390, height: 800 })
      await page.locator("[data-e2e=category-new]").click()
      const name = "W".repeat(60)
      await page.locator("[data-e2e=category-name-input]").fill(name)
      // The colour preview repeats the name, cut short to the field's width.
      await expect(page.locator("[data-e2e=color-field-preview] bdi")).toHaveText(name)
      expect(await page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(390)
    } finally {
      await cleanup(request, owner)
    }
  })
})
