import { expect, type Locator, type Page } from "@playwright/test"
import { type NewGroupPlan, payForGroup } from "./sign-up.ts"
import { gotoApp, openNotesFromMenu } from "./app.ts"

/** Page objects for the group pages: the list, the editor and the way to a group's notes. */

/** `text` as a regular expression that matches it literally. */
function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Opens the groups page from the main navigation, the way a person gets there. */
export async function openGroups(page: Page): Promise<void> {
  await page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Groups" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Groups" })).toBeVisible()
}

/**
 * The row link of the group named `name` on the groups page. The current group's link is named
 * "<name>, current group", so both names match.
 */
export function groupLink(page: Page, name: string): Locator {
  return page.locator("[data-e2e=group-list]").getByRole("link", {
    name: new RegExp(`^${literal(name)}(, current group)?$`),
  })
}

/** Opens the page of the group named `name` from the groups page. */
export async function openGroup(page: Page, name: string): Promise<void> {
  await groupLink(page, name).click()
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/)
  await expect(page.locator("[data-e2e=group-general-name]")).toHaveText(name)
}

/** The address part each tab of a group's page adds to `/groups/:groupId`. */
const TAB_PATHS = {
  "General": "",
  "Members": "/members",
  "Billing": "/billing",
  "Activity": "/activity",
}

/** Opens a tab of the open group's page by its name, the way a person does, and waits for its address. */
export async function openGroupTab(page: Page, tab: keyof typeof TAB_PATHS): Promise<void> {
  await page.getByRole("tab", { name: tab, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/groups/[0-9a-f-]{36}${TAB_PATHS[tab]}$`))
  await expect(page.getByRole("tab", { name: tab, exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  )
}

/**
 * Creates a group named `name` from the groups page's "New group", and resolves on the new group's
 * page, which takes the create page's place in the history. When the free plan allows nothing, the
 * group is then put on the paid plan ({@link payForGroup}), unless `plan.keepFree`.
 */
export async function createGroup(
  page: Page,
  name: string,
  plan: NewGroupPlan = {},
): Promise<void> {
  // By its hook, not its name: until the list has loaded, the empty page can show a second
  // "New group" button, and a click by name then matches two.
  await page.locator("[data-e2e=group-new]").click()
  await expect(page).toHaveURL("/groups/new")
  await page.locator("[data-e2e=group-name]").fill(name)
  await page.locator("[data-e2e=group-create]").click()
  await expect(page).toHaveURL(/\/groups\/[0-9a-f-]{36}$/)
  await expect(page.locator("[data-e2e=group-general-name]")).toHaveText(name)
  if (plan.keepFree) return
  const url = new URL(page.url())
  await payForGroup(page.request, url.origin, url.pathname.replace("/groups/", ""))
}

/**
 * Opens the notes of the group named `name`: its page from the groups page, "Switch to this group"
 * in its menu unless it is already the current group, then Notes in the main navigation.
 */
export async function openNotes(page: Page, name: string): Promise<void> {
  await openGroups(page)
  await openGroup(page, name)
  if (await page.locator("[data-e2e=group-current]").count() === 0) {
    await page.locator("[data-e2e=group-menu]").click()
    await page.getByRole("menuitem", { name: "Switch to this group" }).click()
    await expect(page.locator("[data-e2e=group-current]")).toBeVisible()
  }
  await openNotesFromMenu(page)
  await expect(page.getByRole("heading", { level: 1, name: "Notes", exact: true })).toBeVisible()
  await expect(page.locator("[data-e2e=notes-group]")).toHaveText(name)
}

/**
 * Opens the accounts of the group named `name`: its page from the groups page, "Switch to this
 * group" in its menu unless it is already the current group, then Accounts in the main navigation.
 */
export async function openAccounts(page: Page, name: string): Promise<void> {
  await openGroups(page)
  await openGroup(page, name)
  if (await page.locator("[data-e2e=group-current]").count() === 0) {
    await page.locator("[data-e2e=group-menu]").click()
    await page.getByRole("menuitem", { name: "Switch to this group" }).click()
    await expect(page.locator("[data-e2e=group-current]")).toBeVisible()
  }
  await page.getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Accounts" }).click()
  await expect(page.getByRole("heading", { level: 1, name: "Accounts", exact: true }))
    .toBeVisible()
  await expect(page.locator("[data-e2e=accounts-group]")).toHaveText(name)
}

/**
 * Opens the categories of the group named `name`: the group becomes the current one, as
 * `openAccounts` makes it, then the page loads at `/categories` (it sits in the account menu,
 * not in the main navigation) and waits for the live connection again.
 */
export async function openCategories(page: Page, name: string): Promise<void> {
  await openGroups(page)
  await openGroup(page, name)
  if (await page.locator("[data-e2e=group-current]").count() === 0) {
    await page.locator("[data-e2e=group-menu]").click()
    await page.getByRole("menuitem", { name: "Switch to this group" }).click()
    await expect(page.locator("[data-e2e=group-current]")).toBeVisible()
  }
  await gotoApp(
    page,
    "/categories",
    page.getByRole("heading", { level: 1, name: "Categories", exact: true }),
  )
  await expect(page.locator("[data-e2e=shell-ws-status]")).toHaveText("Online")
}

/**
 * Opens the budgets of the group named `name` the way `openCategories` opens its categories: the
 * group becomes the current one, then the page loads at `/budgets` and waits for the live
 * connection again.
 */
export async function openBudgets(page: Page, name: string): Promise<void> {
  await openGroups(page)
  await openGroup(page, name)
  if (await page.locator("[data-e2e=group-current]").count() === 0) {
    await page.locator("[data-e2e=group-menu]").click()
    await page.getByRole("menuitem", { name: "Switch to this group" }).click()
    await expect(page.locator("[data-e2e=group-current]")).toBeVisible()
  }
  await gotoApp(page, "/budgets", page.getByRole("heading", { level: 1, name: "Budgets" }))
  await expect(page.locator("[data-e2e=shell-ws-status]")).toHaveText("Online")
}
