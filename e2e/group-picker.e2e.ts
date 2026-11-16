import { type APIRequestContext, type Locator, type Page } from "@playwright/test"
import { expect, test } from "./fixtures/stack.ts"
import { gotoApp, signIn } from "./fixtures/app.ts"
import { openGroups } from "./fixtures/groups.ts"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"
import { freePlanAllowsNothing, payForGroup, signUpWithCode } from "./fixtures/sign-up.ts"

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

async function signInOnline(page: Page, email: string): Promise<void> {
  await signIn(page, email, password)
  await expect(page.locator("[data-e2e=shell-ws-status]")).toHaveText("Online")
}

/**
 * Waits for the worker's welcome note in the group, so what a spec adds next is ordered
 * after it. A spec that counts or lists a new account's notes must account for it. When the free
 * plan allows nothing there is none: the sign-up fixture pays only after the worker was refused.
 * Returns the titles the group starts with.
 */
async function welcomeNoteIn(page: Page, groupId: string): Promise<string[]> {
  const expected = await freePlanAllowsNothing(page.request, apiBase) ? [] : ["Welcome"]
  await expect.poll(async () => {
    const listed = await page.request.get(`${apiBase}/api/groups/${groupId}/notes?limit=100`)
    return (await listed.json()).notes.map((note: { title: string }) => note.title)
  }, { message: "the worker makes the welcome note", timeout: 15_000 }).toEqual(expected)
  return expected
}

/** One group of the person's, with a note in it. */
async function noteIn(page: Page, groupId: string, title: string): Promise<void> {
  const note = await page.request.post(`${apiBase}/api/groups/${groupId}/notes`, {
    headers,
    data: { id: uuidV7(), title, body: "" },
  })
  expect(note.status(), await note.text()).toBe(201)
}

async function sharedGroup(page: Page, name: string): Promise<string> {
  const id = uuidV7()
  const created = await page.request.post(`${apiBase}/api/groups`, {
    headers,
    data: { id, name },
  })
  expect(created.status(), await created.text()).toBe(201)
  await payForGroup(page.request, apiBase, id)
  return id
}

async function personalGroup(page: Page): Promise<{ id: string; name: string }> {
  const list = await page.request.get(`${apiBase}/api/groups`)
  const groups: { id: string; name: string }[] = (await list.json()).groups
  const personal = groups.find((group) => group.name === "Personal")
  expect(personal, "a new user has a group named Personal").toBeDefined()
  return personal!
}

/** The notes page's group: its name under the "Notes" heading. */
const heading = (page: Page, name: string) =>
  page.locator("[data-e2e=notes-group]").filter({ hasText: new RegExp(`^${name}$`) })

/** Opens `path` and waits until the app has booted there. */
const open = (page: Page, path: string) =>
  gotoApp(page, path, page.locator("[data-e2e=shell-ws-status]"))

/**
 * Chooses `choice`, an item of the sidebar's switcher, with the keyboard alone: Enter opens the
 * menu on the first group, the arrow keys move to the item, Enter chooses it.
 */
async function chooseWithKeyboard(page: Page, choice: Locator): Promise<void> {
  await page.locator("[data-e2e=group-picker]").focus()
  await page.keyboard.press("Enter")
  await expect(choice).toBeVisible()
  for (let step = 0; step < 10; step++) {
    if (await choice.evaluate((item) => item === document.activeElement)) break
    await page.keyboard.press("ArrowDown")
  }
  await expect(choice).toBeFocused()
  await page.keyboard.press("Enter")
}

/** Picks the group named `groupName` from the sidebar's switcher with the keyboard alone. */
function pickWithKeyboard(page: Page, groupName: string): Promise<void> {
  return chooseWithKeyboard(
    page,
    page.getByRole("menuitemradio", { name: new RegExp(groupName) }),
  )
}

test.describe("notes at /notes with a group picker", () => {
  test("/notes shows only the selected group's notes, and the picker switches groups with the keyboard alone", async ({ browser, request }) => {
    const user = "e2e_picker_keyboard@example.com"
    await cleanup(request, user)
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    try {
      await signUp(request, user)
      const page = await context.newPage()
      await signInOnline(page, user)
      const personal = await personalGroup(page)
      const starter = await welcomeNoteIn(page, personal.id)
      const team = await sharedGroup(page, "Team B")
      await noteIn(page, personal.id, "Only in personal")
      await noteIn(page, team, "Only in team")

      await open(page, "/notes")
      await expect(heading(page, personal.name)).toBeVisible()
      const titles = page.locator("[data-e2e=note-item-title]")
      // Newest change first: the person's note, then the welcome note the worker made.
      await expect(titles).toHaveText(["Only in personal", ...starter])

      await pickWithKeyboard(page, "Team B")
      await expect(heading(page, "Team B")).toBeVisible()
      await expect(titles).toHaveText(["Only in team"])
      await expect(page).toHaveURL("/notes")

      // The choice survives a reload. The page shows the device's copy until the server answers, so
      // this alone does not prove the server kept the choice; the next spec does.
      await open(page, page.url())
      await expect(heading(page, "Team B")).toBeVisible()
      await expect(titles).toHaveText(["Only in team"])

      // The switcher opens the selected group's Activity and the groups page, by keyboard.
      await chooseWithKeyboard(page, page.getByRole("menuitem", { name: "Activity" }))
      await expect(page).toHaveURL(`/groups/${team}/activity`)
      await chooseWithKeyboard(page, page.getByRole("menuitem", { name: "All groups" }))
      await expect(page).toHaveURL("/groups")
    } finally {
      await context.close()
      await cleanup(request, user)
    }
  })

  test("on a phone, the tab bar holds the four destinations and Account, and the Account sheet opens the group's Activity and all groups", async ({ browser, request }) => {
    const user = "e2e_picker_phone@example.com"
    await cleanup(request, user)
    const context = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      viewport: { width: 390, height: 844 },
    })
    const fits = (page: Page) =>
      page.evaluate(() =>
        document.documentElement.scrollWidth <= document.documentElement.clientWidth
      )
    try {
      await signUp(request, user)
      const page = await context.newPage()
      await signInOnline(page, user)
      const personal = await personalGroup(page)
      await open(page, "/transactions")

      await expect(page.locator("[data-e2e=rail-shell-tabbar] [data-e2e=rail-shell-entry]"))
        .toHaveText(["Overview", "Transactions", "Accounts", "Categories"])
      await expect(page.locator("[data-e2e=rail-shell-more]")).toBeVisible()
      expect(await fits(page)).toBe(true)
      await page.screenshot({ path: test.info().outputPath(`tab-bar-390.png`) })

      await page.locator("[data-e2e=rail-shell-more]").click()
      const activity = page.locator("[data-e2e=group-sheet-activity]")
      await expect(activity).toBeVisible()
      expect(await fits(page)).toBe(true)
      await page.screenshot({ path: test.info().outputPath(`account-sheet-390.png`) })
      await activity.click()
      await expect(page).toHaveURL(`/groups/${personal.id}/activity`)

      await openGroups(page)
      await expect(page).toHaveURL("/groups")
    } finally {
      await context.close()
      await cleanup(request, user)
    }
  })

  test("a group chosen on one device moves the person's other device, without a reload", async ({ browser, request }) => {
    const user = "e2e_picker_devices@example.com"
    await cleanup(request, user)
    const baseURL = test.info().project.use.baseURL
    const laptopContext = await browser.newContext({ baseURL })
    const phoneContext = await browser.newContext({ baseURL })
    try {
      await signUp(request, user)
      const laptop = await laptopContext.newPage()
      const phone = await phoneContext.newPage()
      await signInOnline(laptop, user)
      await signInOnline(phone, user)
      const personal = await personalGroup(laptop)
      const team = await sharedGroup(laptop, "Shared view")
      await noteIn(laptop, team, "Seen on both")

      await open(laptop, "/notes")
      await open(phone, "/notes")
      await expect(heading(phone, personal.name)).toBeVisible()
      await expect(phone.locator("[data-e2e=shell-ws-status]")).toHaveText("Online")
      let phoneLoads = 0
      phone.on("load", () => phoneLoads++)

      await pickWithKeyboard(laptop, "Shared view")

      await expect(heading(phone, "Shared view")).toBeVisible({ timeout: 15_000 })
      await expect(phone.locator("[data-e2e=note-item-title]")).toHaveText(["Seen on both"])
      expect(phoneLoads, "the other device learns it over the socket, without a page load")
        .toBe(0)
    } finally {
      await laptopContext.close()
      await phoneContext.close()
      await cleanup(request, user)
    }
  })

  test("an old /groups/:groupId/notes link opens /notes for the selected group and /groups for any other, and selects nothing", async ({ browser, request }) => {
    const user = "e2e_picker_redirect@example.com"
    await cleanup(request, user)
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    try {
      await signUp(request, user)
      const page = await context.newPage()
      await signInOnline(page, user)
      const personal = await personalGroup(page)
      const team = await sharedGroup(page, "Old link team")
      await noteIn(page, personal.id, "In the selected group")

      await open(page, `/groups/${personal.id}/notes`)
      await expect(page).toHaveURL("/notes")
      await expect(heading(page, personal.name)).toBeVisible()

      // A link to a group that is not selected must not select it.
      await open(page, `/groups/${team}/notes`)
      await expect(page).toHaveURL("/groups")
      const selected = await page.request.get(`${apiBase}/api/groups/selected`)
      expect((await selected.json()).groupId).toBe(personal.id)
    } finally {
      await context.close()
      await cleanup(request, user)
    }
  })

  test("a group the person cannot see cannot be selected, and the server keeps their current one", async ({ browser, request }) => {
    const user = "e2e_picker_refused@example.com"
    await cleanup(request, user)
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL })
    try {
      await signUp(request, user)
      const page = await context.newPage()
      await signInOnline(page, user)
      const personal = await personalGroup(page)

      const refused = await page.request.put(`${apiBase}/api/groups/selected`, {
        headers,
        data: { groupId: uuidV7() },
      })
      expect(refused.status()).toBe(404)
      const selected = await page.request.get(`${apiBase}/api/groups/selected`)
      expect((await selected.json()).groupId).toBe(personal.id)
    } finally {
      await context.close()
      await cleanup(request, user)
    }
  })
})
