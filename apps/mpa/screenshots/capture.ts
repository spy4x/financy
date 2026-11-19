/**
 * Captures the product screenshots and the Open Graph images of the public website.
 *
 * `deno task screenshots` in `apps/mpa`; README.md beside this file says what it needs. It signs up
 * four people on the local development stack, builds a sample household through the API, photographs
 * each screen on a phone in light and dark, encodes the pictures as WebP into `static/shots/`,
 * renders `og.html` into `static/og/`, and deletes the four accounts again whether or not the run
 * succeeded. A screen whose numbers differ from what the website's words say about it fails the run.
 */
import { type Browser, type BrowserContext, chromium, type Locator, type Page } from "playwright"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { gotoApp } from "../../../e2e/fixtures/app.ts"
import { stripeSignature, subscriptionEvent } from "../../../e2e/fixtures/billing.ts"
import { signUpWithCode } from "../../../e2e/fixtures/sign-up.ts"

export const APP = Deno.env.get("SHOTS_APP_URL") ?? "http://app.localhost"
const ADMIN = Deno.env.get("SHOTS_ADMIN_URL") ?? "http://admin.localhost"
const MPA = new URL("..", import.meta.url).pathname
export const MASTERS = `${MPA}screenshots/.out/masters`
export const CACHE = `${MPA}screenshots/.out/cache`
const SHOTS = `${MPA}static/shots`
const OG = `${MPA}static/og`

/**
 * The fonts of the Open Graph images: the `geist` npm package at an exact version, checked against
 * the integrity the registry publishes for it.
 */
const GEIST = {
  url: "https://registry.npmjs.org/geist/-/geist-1.7.2.tgz",
  integrity:
    "sha512-Gu5lDFa3pLRyoBlBPf0QIFHVdWAnpco7fS1bJm41jyLPFoguBgiubseUN2oLXMgqZ7uxAxDoXcHMhCY/fOTTgg==",
  files: {
    "geist-sans.woff2": "package/dist/fonts/geist-sans/Geist-Variable.woff2",
    "geist-mono.woff2": "package/dist/fonts/geist-mono/GeistMono-Variable.woff2",
  },
}

/** One password for the four people, made per run and never written anywhere. */
const PASSWORD = `Sd-${crypto.getRandomValues(new Uint32Array(4)).join("")}`

export interface Person {
  email: string
  firstName: string
  lastName: string
}

export const ADA: Person = { email: "ada@example.com", firstName: "Ada", lastName: "Lovelace" }
export const GRACE: Person = { email: "grace@example.com", firstName: "Grace", lastName: "Hopper" }
export const LINUS: Person = {
  email: "linus@example.com",
  firstName: "Linus",
  lastName: "Torvalds",
}
export const MARGARET: Person = {
  email: "margaret@example.com",
  firstName: "Margaret",
  lastName: "Hamilton",
}
const PEOPLE = [ADA, GRACE, LINUS, MARGARET]

/** The Open Graph card of one website page: its words (marketing brief 4.3) and picture. */
interface OgCard {
  file: string
  eyebrow: string
  title: string
  sub: string
  /** A dark picture under `static/`, such as `shots/for-expats-dark-780.webp`, or "" for words only. */
  shot: string
  /** How far down the screenshot its frame starts, in the card's pixels. */
  top?: number
  /** How wide the screenshot is drawn, in the card's pixels: 520, the frame's width, unless set. */
  width?: number
}

const OG_CARDS: OgCard[] = [
  {
    file: "home",
    eyebrow: "Finance tracker",
    title: "A finance tracker for every currency you use.",
    sub: "Financy · free to self-host · AGPL-3.0 · being rebuilt",
    shot: "shots/for-expats-dark-780.webp",
    // Starts at the total and ends after the London account, so no row's words are cut.
    top: 170,
  },
  {
    file: "features",
    eyebrow: "Features",
    title: "What Financy does today, and what it does not yet.",
    sub: "Households · live updates · offline · nine languages",
    shot: "shots/feature-budgets-dark-780.webp",
    // Starts at the month and ends after the last budget, so no row is cut.
    top: 184,
  },
  {
    file: "pricing",
    eyebrow: "Pricing",
    title: "$4 a month for your whole household.",
    sub: "Financy · or self-host free · AGPL-3.0",
    shot: "",
  },
  {
    file: "subscribe",
    eyebrow: "Newsletter",
    title: "What shipped in Financy, briefly.",
    sub: "A short email when Financy has news",
    shot: "",
  },
]

type Theme = "light" | "dark"

/** The widths every screenshot is delivered at. */
const WIDTHS = [780, 390]

/** Hidden caret, no transitions: added by the test browser, never by the site. */
const STEADY_CSS = `*, *::before, *::after { caret-color: transparent !important;
  transition: none !important; animation: none !important; }`

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>

/** What the screens need from the seeding. */
interface Seeded {
  householdId: string
  salaryId: string
  groceriesId: string
  transferId: string
  /** The moment every page's clock is fixed at, a few minutes after the data was made. */
  now: Date
  /** Ada's signed-in session on the app host. */
  appState: StorageState
  /** Linus's signed-in session on the admin host. */
  adminState: StorageState
  /** Grace's API context and id, for the entry that arrives while Ada's page is open. */
  grace: Page
  graceId: number
}

const failures: string[] = []

/** Origin headers the API's same-origin guard asks of a write. */
export function sameOrigin(origin = APP): Record<string, string> {
  return { origin, "sec-fetch-site": "same-origin" }
}

/** Throws with the response body unless the status is 200 or 201. */
export async function expectOk(
  what: string,
  response: { status(): number; text(): Promise<string> },
): Promise<void> {
  if (![200, 201].includes(response.status())) {
    throw new Error(`${what}: ${response.status()} ${await response.text()}`)
  }
}

export async function cleanupPeople(page: Page): Promise<void> {
  for (const person of PEOPLE) {
    const response = await page.request.post(`${APP}/api/test/cleanup-user`, {
      data: { login: person.email },
    })
    await expectOk(`cleanup of ${person.email}`, response)
  }
}

/** Signs `person` up in `page`'s context (the cookie lands there), names them, returns their id. */
async function signUp(page: Page, person: Person): Promise<number> {
  const response = await signUpWithCode(page.request, `${APP}/api/auth/password/sign-up`, {
    headers: sameOrigin(),
    data: { email: person.email, password: PASSWORD },
  })
  await expectOk(`sign-up of ${person.email}`, response)
  const { id } = await response.json() as { id: number }
  const named = await page.request.patch(`${APP}/api/users/me`, {
    headers: sameOrigin(),
    data: { firstName: person.firstName, lastName: person.lastName },
  })
  await expectOk(`name of ${person.email}`, named)
  return id
}

/** The four people, signed up, each with a browser context of their own. */
export interface SignedUp {
  pages: Map<Person, Page>
  ids: Map<Person, number>
}

/** Signs the four people up; Ada uses `ada`, the others a new context added to `contexts`. */
export async function signUpPeople(
  browser: Browser,
  contexts: BrowserContext[],
  ada: Page,
): Promise<SignedUp> {
  const pageFor = async () => {
    const context = await browser.newContext({ baseURL: APP })
    contexts.push(context)
    return await context.newPage()
  }
  const [grace, linus, margaret] = await Promise.all([pageFor(), pageFor(), pageFor()])
  const pages = new Map([[ADA, ada], [GRACE, grace], [LINUS, linus], [MARGARET, margaret]])
  const ids = new Map<Person, number>()
  for (const [person, page] of pages) ids.set(person, await signUp(page, person))
  return { pages, ids }
}

export async function createGroup(page: Page, name: string): Promise<string> {
  const id = uuidV7()
  const response = await page.request.post(`${APP}/api/groups`, {
    headers: sameOrigin(),
    data: { id, name },
  })
  await expectOk(`group ${name}`, response)
  return id
}

/** Adds a member through the development route; the product only invites. */
export async function addMember(page: Page, person: Person, groupId: string, role: 1 | 2 | 3) {
  const response = await page.request.post(`${APP}/api/test/add-member`, {
    data: { login: person.email, groupId, role },
  })
  await expectOk(`member ${person.email}`, response)
}

/**
 * Puts a group on Pro through the development billing provider: the signed webhook Stripe would
 * send after a checkout. Roles other than the default are a Pro feature.
 */
export async function upgradeToPro(page: Page, groupId: string): Promise<void> {
  const id = uuidV7().replace(/-/g, "")
  const body = subscriptionEvent({
    reference: groupId,
    subscriptionId: `sub_${id}`,
    customerId: `cus_${id}`,
    currentPeriodEnd: Math.floor(Date.now() / 1000) + 18 * 24 * 3600,
  })
  const webhook = await page.request.post(`${APP}/api/webhooks/billing`, {
    headers: {
      "content-type": "application/json",
      "stripe-signature": await stripeSignature(body),
    },
    data: body,
  })
  await expectOk(`Pro for ${groupId}`, webhook)
}

/** Runs one operation as `userId`, through the route that runs what the socket runs. */
export async function operation(
  page: Page,
  userId: number,
  name: string,
  data: unknown,
): Promise<void> {
  const response = await page.request.post(`${APP}/api/call/${name}`, {
    headers: {
      ...sameOrigin(),
      "content-type": "application/json",
      "x-realtime-user": String(userId),
      "idempotency-key": uuidV7(),
    },
    data: JSON.stringify(data),
  })
  await expectOk(`${name} ${JSON.stringify(data)}`, response)
}

/** What {@link seedHousehold} made that a screen opens or writes to. */
type Household = Pick<Seeded, "householdId" | "salaryId" | "groceriesId" | "transferId">

/**
 * Builds the household the website shows: four adults, and accounts in the euro, the dollar, the
 * pound and the baht only, the currencies the free daily rates cover. Two payments in another
 * currency state both amounts, so they keep the rate the bank charged. This month's budgets put
 * Groceries over its limit, Rent close to it and Travel well under it.
 */
async function seedHousehold(ada: Page, adaId: number, now: Date): Promise<Household> {
  const groupId = await createGroup(ada, "Sample household")
  await upgradeToPro(ada, groupId)
  await addMember(ada, GRACE, groupId, 3)
  await addMember(ada, MARGARET, groupId, 2)
  await addMember(ada, LINUS, groupId, 1)
  const call = (name: string, data: Record<string, unknown>) =>
    operation(ada, adaId, name, { groupId, ...data })
  const account = async (name: string, kind: number, currency: string, balance: number) => {
    const id = uuidV7()
    await call(`account.create`, { id, name, kind, currency, startingBalance: balance })
    return id
  }
  const category = async (name: string, kind: number, icon: string, color: string) => {
    const id = uuidV7()
    await call(`category.create`, { id, name, kind, icon, color, parentId: null })
    return id
  }
  const salaryId = await account("Salary account", 2, "EUR", 420_000)
  await account("Dollar savings", 4, "USD", 1_250_000)
  await account("London account", 2, "GBP", 184_000)
  const bangkok = await account("Bangkok account", 2, "THB", 8_650_000)
  const income = await category("Salary", 2, "shopping-cart", "#16a34a")
  const home = await category("Rent", 1, "shopping-cart", "#2563eb")
  const groceriesId = await category("Groceries", 1, "shopping-cart", "#d97706")
  const travel = await category("Travel", 1, "shopping-cart", "#9333ea")
  const entries = [
    { categoryId: income, kind: 2, amount: 380_000, currency: "EUR", memo: "Monthly salary" },
    { categoryId: home, kind: 1, amount: 110_000, currency: "EUR", memo: "Rent" },
    { categoryId: groceriesId, kind: 1, amount: 28_640, currency: "EUR", memo: "Weekly groceries" },
    {
      categoryId: travel,
      kind: 1,
      amount: 185_000,
      currency: "THB",
      accountAmount: 4_920,
      memo: "Hotel in Bangkok",
    },
    {
      categoryId: travel,
      kind: 1,
      amount: 8_400,
      currency: "GBP",
      accountAmount: 9_860,
      memo: "Train in London",
    },
  ]
  for (const entry of entries) {
    await call(`transaction.create`, { id: uuidV7(), accountId: salaryId, ...entry })
  }
  const transferId = uuidV7()
  await call(`transfer.create`, {
    id: transferId,
    fromAccountId: salaryId,
    toAccountId: bangkok,
    sentAmount: 50_000,
    receivedAmount: 1_825_000,
    memo: "Money for Bangkok",
    date: new Date(now.valueOf() - 2 * 24 * 3600_000).toISOString().slice(0, 10),
  })
  const month = now.toISOString().slice(0, 7)
  for (const [categoryId, amount] of [[groceriesId, 25_000], [home, 120_000], [travel, 40_000]]) {
    await call(`budget.set`, { categoryId, month, amount, expectedVersion: null })
  }
  return { householdId: groupId, salaryId, groceriesId, transferId }
}

/** Signs Linus in to the admin app as an administrator, and returns his page there. */
async function signInToAdmin(browser: Browser, contexts: BrowserContext[]): Promise<Page> {
  const context = await browser.newContext({ baseURL: ADMIN })
  contexts.push(context)
  const promoted = await context.request.post(`${APP}/api/test/set-role`, {
    data: { login: LINUS.email, role: 4 },
  })
  await expectOk(`administrator role of ${LINUS.email}`, promoted)
  const page = await context.newPage()
  await page.goto(`${ADMIN}/sign-in`)
  await page.locator("[data-e2e=auth-form-login]").fill(LINUS.email)
  await page.locator("[data-e2e=auth-form-password]").fill(PASSWORD)
  await page.locator("[data-e2e=auth-form-submit]").click()
  await page.locator("[data-e2e=admin-dashboard-title]").waitFor()
  return page
}

/**
 * Has the worker fetch today's exchange rates now and waits for it: the job otherwise runs at
 * 16:00 UTC, and a fresh stack holds no rate to total the accounts with.
 */
async function fetchRates(admin: Page): Promise<void> {
  const url = `${ADMIN}/api/admin/jobs/repeating`
  const started = await admin.request.post(`${url}/rates.fetch/run-now`, {
    headers: sameOrigin(ADMIN),
  })
  await expectOk(`the exchange rates job`, started)
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const response = await admin.request.get(url)
    await expectOk(`the repeating jobs`, response)
    const { jobs } = await response.json() as {
      jobs: { kind: string; lastRunAt: string | null; lastFailed: boolean; running: boolean }[]
    }
    const job = jobs.find(({ kind }) => kind === `rates.fetch`)
    if (job?.lastFailed) throw new Error(`the exchange rates job failed`)
    if (job?.lastRunAt && !job.running) return
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw new Error(`the exchange rates job did not finish in 90 seconds`)
}

/** Builds everything the screens show. Each person has a browser context of their own. */
async function seed(browser: Browser, contexts: BrowserContext[], ada: Page): Promise<Seeded> {
  const { pages, ids } = await signUpPeople(browser, contexts, ada)
  const adaId = ids.get(ADA)!
  // Ada has used the product for a while: her first-steps card is gone.
  await operation(ada, adaId, `onboarding.dismiss`, null)
  const now = new Date(Date.now() + 3 * 60_000)
  const household = await seedHousehold(ada, adaId, now)

  const admin = await signInToAdmin(browser, contexts)
  await fetchRates(admin)
  // The System page reports an error while no backup was ever recorded.
  const backup = await admin.request.post(`${APP}/api/test/record-backup`)
  await expectOk(`the recorded backup`, backup)

  return {
    ...household,
    now,
    appState: await ada.context().storageState(),
    adminState: await admin.context().storageState(),
    grace: pages.get(GRACE)!,
    graceId: ids.get(GRACE)!,
  }
}

interface ContextOptions {
  theme: Theme
  state: StorageState
  baseURL: string
}

/** Opens a phone-sized page with the clock fixed at the seeded moment. */
async function openPage(
  browser: Browser,
  contexts: BrowserContext[],
  seeded: Seeded,
  options: ContextOptions,
): Promise<Page> {
  const context = await browser.newContext({
    baseURL: options.baseURL,
    storageState: options.state,
    colorScheme: options.theme,
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    locale: "en-GB",
    timezoneId: "Europe/London",
  })
  contexts.push(context)
  const page = await context.newPage()
  await page.clock.setFixedTime(seeded.now)
  return page
}

/** Scrolls so `target`'s top sits just under the window's top edge: the shell has no header bar. */
async function scrollToTop(target: Locator): Promise<void> {
  await target.evaluate((element) => {
    globalThis.scrollTo({ top: element.getBoundingClientRect().top + globalThis.scrollY - 16 })
  })
}

/** Waits until the page is still, then writes the master PNG of `clip`. */
async function snap(page: Page, name: string, clip: Clip): Promise<void> {
  await page.addStyleTag({ content: STEADY_CSS })
  await page.waitForLoadState("networkidle")
  await page.evaluate(() => document.fonts.ready)
  // A focused control shows its ring; a picture has no keyboard user.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  // Nor a pointer: a row under the last click would show its hover colour.
  const viewport = page.viewportSize()!
  await page.mouse.move(viewport.width - 2, viewport.height / 2)
  await page.waitForTimeout(300)
  await page.screenshot({
    path: `${MASTERS}/${name}.png`,
    animations: "disabled",
    caret: "hide",
    clip,
  })
}

/** A part of the viewport, in CSS pixels. */
interface Clip {
  x: number
  y: number
  width: number
  height: number
}

/** A screen of the sample household: opened in each theme, waited for, checked and arranged. */
interface Screen {
  name: string
  /** The part of the viewport the picture keeps. Its height is also in the website's data. */
  clip: Clip
  open(page: Page, seeded: Seeded): Promise<void>
  /** Throws when the screen does not show what the website's alt text says it shows. */
  check(page: Page): Promise<void>
  /** The element that ends the crop: the run fails when it does not fit inside `clip`. */
  last(page: Page): Locator
  /** Shows the admin app, signed in as Linus, instead of the app, signed in as Ada. */
  admin?: boolean
  /** Undoes what `open` wrote, so the next screen reads the household as it was. */
  after?(seeded: Seeded): Promise<void>
}

/** Makes `groupId` the group the app opens with. */
async function selectGroup(page: Page, groupId: string): Promise<void> {
  const selected = await page.request.put(`${APP}/api/groups/selected`, {
    headers: sameOrigin(),
    data: { groupId },
  })
  await expectOk(`selected group ${groupId}`, selected)
}

/** Throws unless `scope` shows every one of `texts`, with spaces of any width read as spaces. */
async function expectTexts(scope: Locator, texts: string[]): Promise<void> {
  const shown = (await scope.innerText()).replace(/[  ]/g, ` `)
  const missing = texts.filter((text) => !shown.includes(text))
  if (missing.length) throw new Error(`the screen does not show: ${missing.join(`, `)}`)
}

/** Throws unless the field inside `scope` holds `value`. */
async function expectValue(scope: Locator, value: string): Promise<void> {
  const held = await scope.locator(`input`).first().inputValue()
  if (held !== value) throw new Error(`a field holds "${held}" instead of "${value}"`)
}

/** Throws unless the health badge inside `scope` reads OK. */
async function expectHealthy(scope: Locator): Promise<void> {
  const health = await scope.locator(`[data-health]`).first().getAttribute(`data-health`)
  if (health !== `ok`) throw new Error(`the health badge reads "${health}" instead of "ok"`)
}

/** The memo of the entry Grace adds while the live-sync picture's page is open. */
const LIVE_MEMO = `Farmers market`
/** That entry's id while it exists: it is made anew for each theme, and deleted after each. */
let liveEntryId: string | null = null

const SCREENS: Screen[] = [
  {
    // Also the multi-currency feature page's picture.
    name: "for-expats",
    // From the title to the end of the savings card: all four accounts the total adds up.
    clip: { x: 0, y: 0, width: 390, height: 634 },
    async open(page) {
      await gotoApp(page, "/accounts", page.locator("[data-e2e=accounts-total-amount]"))
    },
    check: (page) =>
      expectTexts(page.locator(`main`), [
        `Bangkok account`,
        `THB 104,750.00`,
        `London account`,
        `£1,840.00`,
        `Salary account`,
        `€5,965.80`,
        `Dollar savings`,
        `US$12,500.00`,
      ]),
    last: (page) => page.locator(`main`).getByText(`Dollar savings`),
  },
  {
    name: "for-couples",
    // From the title to the end of the spending card, below net and income.
    clip: { x: 0, y: 0, width: 390, height: 634 },
    async open(page, seeded) {
      await gotoApp(
        page,
        `/overview/${seeded.householdId}`,
        page.locator(`[data-e2e="overview-widget-money.income"]`),
      )
    },
    check: (page) => expectTexts(page.locator(`main`), [`Income`, `Spending`]),
    last: (page) => page.locator(`[data-e2e="overview-widget-money.spending"]`),
  },
  {
    // Also the households feature page's picture.
    name: "for-families",
    // The four members alone: the invitations below them stay out of the picture.
    clip: { x: 0, y: 176, width: 390, height: 440 },
    async open(page, seeded) {
      await gotoApp(
        page,
        `/groups/${seeded.householdId}/members`,
        page.locator("[data-e2e=group-member]").nth(3),
      )
      await scrollToTop(page.locator("[data-e2e=group-section-members]"))
    },
    check: (page) =>
      expectTexts(page.locator(`main`), [
        `Ada Lovelace`,
        `Owner`,
        `Grace Hopper`,
        `Admin`,
        `Margaret Hamilton`,
        `Editor`,
        `Linus Torvalds`,
        `Viewer`,
      ]),
    last: (page) => page.locator("[data-e2e=group-member]").nth(3),
  },
  {
    name: "for-small-business",
    // From the title to the end of the second payment, each with both amounts.
    clip: { x: 0, y: 0, width: 390, height: 548 },
    async open(page) {
      await gotoApp(page, "/transactions", page.getByText("Hotel in Bangkok"))
    },
    check: (page) => expectTexts(page.locator(`main`), [`Train in London`, `Hotel in Bangkok`]),
    last: (page) => page.getByText("Hotel in Bangkok"),
  },
  {
    name: "feature-live-sync",
    // From the title to the end of the second payment, as the small-business picture.
    clip: { x: 0, y: 0, width: 390, height: 548 },
    async open(page, seeded) {
      await gotoApp(page, "/transactions", page.getByText("Hotel in Bangkok"))
      // Grace writes through the API while Ada's page stays open: nothing reloads it.
      const id = uuidV7()
      await operation(seeded.grace, seeded.graceId, `transaction.create`, {
        groupId: seeded.householdId,
        id,
        accountId: seeded.salaryId,
        categoryId: seeded.groceriesId,
        kind: 1,
        amount: 1_840,
        currency: `EUR`,
        memo: LIVE_MEMO,
      })
      liveEntryId = id
      await page.getByText(LIVE_MEMO).waitFor()
    },
    check: (page) => expectTexts(page.locator(`main`), [LIVE_MEMO, `€18.40`]),
    last: (page) => page.getByText(LIVE_MEMO),
    // The budgets picture counts Groceries without this entry.
    async after(seeded) {
      if (!liveEntryId) return
      await operation(seeded.grace, seeded.graceId, `transaction.delete`, {
        groupId: seeded.householdId,
        id: liveEntryId,
        version: 1,
      })
      liveEntryId = null
    },
  },
  {
    name: "feature-self-hosting",
    admin: true,
    // From the title to the end of the cache card.
    clip: { x: 0, y: 0, width: 390, height: 704 },
    async open(page) {
      await gotoApp(page, "/system", page.locator("[data-e2e=admin-system-cache]"))
    },
    async check(page) {
      const summary = page.locator(`[data-e2e=admin-system-summary]`)
      if (await summary.getAttribute(`data-health`) !== `ok`) {
        throw new Error(`the System page does not say everything is working`)
      }
      await expectTexts(summary, [`Everything is working`])
      await expectHealthy(page.locator(`[data-e2e=admin-system-database]`))
      await expectHealthy(page.locator(`[data-e2e=admin-system-cache]`))
    },
    last: (page) => page.locator(`[data-e2e=admin-system-cache]`),
  },
  {
    name: "feature-transfers",
    // From the title to the end of the memo.
    clip: { x: 0, y: 0, width: 390, height: 752 },
    async open(page, seeded) {
      await gotoApp(
        page,
        `/transfers/${seeded.transferId}`,
        page.locator(`[data-e2e=transfer-rate]`),
      )
    },
    async check(page) {
      await expectValue(page.locator(`[data-e2e=transfer-sent-field]`), `500.00`)
      await expectValue(page.locator(`[data-e2e=transfer-received-field]`), `18250.00`)
      await expectTexts(page.locator(`[data-e2e=transfer-rate]`), [`1 EUR = 36.5 THB`])
      await expectTexts(page.locator(`[data-e2e=transfer-from]`), [`Salary account`])
      await expectTexts(page.locator(`[data-e2e=transfer-to]`), [`Bangkok account`])
    },
    last: (page) => page.locator(`[data-e2e=transfer-memo]`),
  },
  {
    name: "feature-budgets",
    // From the title to the end of the last budget.
    clip: { x: 0, y: 0, width: 390, height: 440 },
    async open(page) {
      await gotoApp(page, "/budgets", page.locator(`[data-e2e=budgets-list]`))
    },
    check: (page) =>
      expectTexts(page.locator(`[data-e2e=budgets-list]`), [
        `Groceries`,
        `€286.40`,
        `€250.00`,
        `€36.40`,
        `Rent`,
        `€1,100.00`,
        `€1,200.00`,
        `€100.00`,
        `Travel`,
        `€400.00`,
      ]),
    last: (page) => page.locator(`[data-e2e=budgets-list] > li`).last(),
  },
  {
    name: "feature-telegram-bot",
    // The dialog alone.
    clip: { x: 0, y: 221, width: 390, height: 403 },
    async open(page, seeded) {
      // The development stack has no bot: these are the two answers a running one gives.
      await page.route(`**/api/telegram`, (route) =>
        route.fulfill({
          json: { enabled: true, botUsername: `financy_sample_bot`, linkedAt: null },
        }))
      await page.route(`**/api/telegram/code`, (route) =>
        route.fulfill({
          json: {
            code: `SAMPLE-CODE`,
            expiresAt: new Date(seeded.now.valueOf() + 10 * 60_000).toISOString(),
            url: `https://t.me/financy_sample_bot?start=SAMPLE-CODE`,
          },
        }))
      await gotoApp(page, "/profile/notifications", page.locator(`[data-e2e=telegram-link]`))
      await page.locator(`[data-e2e=telegram-link]`).click()
      await page.locator(`[data-e2e=telegram-code]`).waitFor()
    },
    check: (page) =>
      expectTexts(page.locator(`[data-e2e=telegram-code-dialog]`), [
        `Open Telegram`,
        `/link SAMPLE-CODE`,
        `10 minutes`,
      ]),
    last: (page) => page.locator(`[data-e2e=telegram-code-dialog]`),
  },
]

/** Runs `shoot`, recording a failure instead of stopping, so one broken screen does not hide others. */
async function attempt(name: string, shoot: () => Promise<void>): Promise<void> {
  try {
    await shoot()
    console.log(`captured ${name}`)
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message.split("\n")[0] : error}`)
    console.error(`FAILED ${name}`, error)
  }
}

/** Throws when `last` ends below the picture's crop, so a taller screen cannot lose its end. */
async function expectInsideClip(last: Locator, clip: Clip): Promise<void> {
  const box = await last.boundingBox()
  if (!box) throw new Error(`the end of the crop is not on the screen`)
  const bottom = Math.ceil(box.y + box.height)
  if (bottom > clip.y + clip.height) {
    throw new Error(`the crop ends at ${clip.y + clip.height} px, its content at ${bottom} px`)
  }
}

async function captureScreens(browser: Browser, contexts: BrowserContext[], seeded: Seeded) {
  for (const theme of ["light", "dark"] as const) {
    for (const screen of SCREENS) {
      const name = `${screen.name}-${theme}`
      await attempt(name, async () => {
        const page = await openPage(browser, contexts, seeded, {
          theme,
          state: screen.admin ? seeded.adminState : seeded.appState,
          baseURL: screen.admin ? ADMIN : APP,
        })
        try {
          if (!screen.admin) await selectGroup(page, seeded.householdId)
          await screen.open(page, seeded)
          // A public page never shows a total that leaves money out for want of a rate.
          if (await page.getByText(/no exchange rate/i).count()) {
            throw new Error(`the stack has no rate for EUR, USD, GBP or THB`)
          }
          await screen.check(page)
          await expectInsideClip(screen.last(page), screen.clip)
          await snap(page, name, screen.clip)
        } finally {
          await screen.after?.(seeded)
          await page.context().close()
        }
      })
    }
  }
}

/** Runs a command and throws with its error output when it fails. */
export async function run(command: string, args: string[]): Promise<void> {
  const { code, stderr } = await new Deno.Command(command, { args, stdout: "null" }).output()
  if (code !== 0) {
    throw new Error(`${command} ${args.join(" ")}: ${new TextDecoder().decode(stderr)}`)
  }
}

/**
 * Encodes every master into its delivered widths with `cwebp`. Quality starts at 80 and steps down
 * until the file fits its budget of 70 KB.
 */
async function encodeShots(): Promise<void> {
  const budget = 70 * 1024
  for await (const entry of Deno.readDir(MASTERS)) {
    const match = entry.name.match(/^(.+)-(light|dark)\.png$/)
    if (!match) continue
    const [, name, theme] = match
    for (const width of WIDTHS) {
      const target = `${SHOTS}/${name}-${theme}-${width}.webp`
      let quality = 80
      for (;;) {
        await run("cwebp", [
          ...["-quiet", "-mt", "-m", "6", "-q", String(quality)],
          ...["-resize", String(width), "0", `${MASTERS}/${entry.name}`, "-o", target],
        ])
        if ((await Deno.stat(target)).size <= budget || quality <= 50) break
        quality -= 5
      }
      if ((await Deno.stat(target)).size > budget) {
        failures.push(`${target} is over its budget at quality ${quality}`)
      }
    }
  }
}

/** Downloads the pinned `geist` package once, checks its integrity and unpacks the two fonts. */
export async function geistFonts(): Promise<void> {
  const fontsReady = await Promise.all(
    Object.keys(GEIST.files).map((name) =>
      Deno.stat(`${CACHE}/${name}`).then(() => true, () => false)
    ),
  )
  if (fontsReady.every(Boolean)) return
  const response = await fetch(GEIST.url)
  if (!response.ok) throw new Error(`${GEIST.url}: ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-512", bytes))
  const integrity = `sha512-${btoa(String.fromCharCode(...digest))}`
  if (integrity !== GEIST.integrity) throw new Error(`${GEIST.url} does not match its integrity`)
  const archive = `${CACHE}/geist.tgz`
  await Deno.writeFile(archive, bytes)
  await run("tar", ["-xzf", archive, "-C", CACHE, ...Object.values(GEIST.files)])
  for (const [name, path] of Object.entries(GEIST.files)) {
    await Deno.rename(`${CACHE}/${path}`, `${CACHE}/${name}`)
  }
  await Deno.remove(`${CACHE}/package`, { recursive: true })
  await Deno.remove(archive)
}

/**
 * Renders `og.html` once per page at 1200×630. The page is served from a made-up origin that maps
 * to this app's files and the cached fonts, so it needs no server and loads nothing from outside.
 */
async function renderOgImages(browser: Browser, contexts: BrowserContext[]): Promise<void> {
  await geistFonts()
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  })
  contexts.push(context)
  const origin = "http://og.invalid"
  await context.route(`${origin}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    const file = path.startsWith("/fonts/") ? `${CACHE}/${path.slice(7)}` : `${MPA}${path.slice(1)}`
    try {
      await route.fulfill({ path: file })
    } catch {
      await route.fulfill({ status: 404 })
    }
  })
  await context.route((url) => !url.href.startsWith(origin), (route) => route.abort())
  try {
    for (const card of OG_CARDS) {
      await attempt(`og-${card.file}`, async () => {
        const page = await context.newPage()
        const query = new URLSearchParams({
          eyebrow: card.eyebrow,
          title: card.title,
          sub: card.sub,
          shot: card.shot ? `/static/${card.shot}` : "",
          top: String(card.top ?? 0),
          width: String(card.width ?? 520),
        })
        await page.goto(`${origin}/screenshots/og.html?${query}`)
        await page.evaluate(() => document.fonts.ready)
        await page.locator("body[data-ready]").waitFor({ state: "attached" })
        const master = `${MASTERS}/og-${card.file}.png`
        await page.screenshot({ path: master })
        await page.close()
        const target = `${OG}/${card.file}.png`
        await run("magick", [master, "-strip", "-define", "png:compression-level=9", target])
        if ((await Deno.stat(target)).size > 150 * 1024) {
          // A screenshot has too many colours for 150 KB: 256 of them, dithered, fit.
          await run("magick", [
            ...[master, "-strip", "-dither", "FloydSteinberg", "-colors", "256"],
            ...["-define", "png:compression-level=9", `PNG8:${target}`],
          ])
        }
        if ((await Deno.stat(target)).size > 150 * 1024) {
          failures.push(`${target} is over 150 KB`)
        }
      })
    }
  } finally {
    await context.close()
  }
}

async function main(): Promise<void> {
  const ogOnly = Deno.args.includes("--og-only")
  for (const dir of [MASTERS, CACHE, SHOTS, OG]) await Deno.mkdir(dir, { recursive: true })
  const browser = await chromium.launch()
  const contexts: BrowserContext[] = []
  try {
    if (!ogOnly) {
      const adaContext = await browser.newContext({ baseURL: APP })
      contexts.push(adaContext)
      const ada = await adaContext.newPage()
      await cleanupPeople(ada)
      try {
        const seeded = await seed(browser, contexts, ada)
        await captureScreens(browser, contexts, seeded)
      } finally {
        await cleanupPeople(ada)
      }
      await encodeShots()
    }
    await renderOgImages(browser, contexts)
  } finally {
    for (const context of contexts) await context.close().catch(() => {})
    await browser.close()
  }
  if (failures.length) {
    console.error(`\n${failures.length} failed:\n${failures.join("\n")}`)
    Deno.exit(1)
  }
  console.log(`Done: ${SHOTS} and ${OG}`)
}

if (import.meta.main) await main()
