/// <reference lib="deno.ns" />
/**
 * Records Financy's demo video from this checkout's own app, and encodes it into `media/demo/`
 * (see README.md beside this file).
 *
 * `deno task demo-video` records and encodes. `deno task demo-video --encode` only encodes the last
 * take again (`media/demo/.take/`, gitignored), after a change to `captions.vtt` or the music.
 *
 * What it does:
 *
 * 1. Off camera: starts the development stack of this checkout apart from any other one here
 *    (`stack.ts`), builds the website's sample household with the helpers of
 *    `apps/mpa/screenshots/capture.ts` (four people, accounts in four currencies, budgets), fetches
 *    the day's exchange rates, and keeps Ada's and Grace's signed-in sessions. No password is ever
 *    on screen.
 * 2. On camera, as Ada, in the light theme: the accounts and their total, a transfer from euros to
 *    baht converted at the day's rate, a dinner in baht added with the `t` shortcut, Grace's
 *    groceries arriving live from her own session, the month's budgets and the overview.
 * 3. `encode.ts` adds the title and end cards, burns in the captions this run wrote to
 *    `captions.vtt`, lays the music under it, and writes the videos and posters.
 *
 * On exit, failed, stopped with Ctrl-C (SIGINT) or SIGTERM, or not, it closes the browser and
 * removes the stack (`stack.ts`, `Stack.stop`).
 */
import { type Browser, type BrowserContext, chromium, type Locator, type Page } from "playwright"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { CARD_SECONDS, encodeDemo } from "./encode.ts"
import { clickLike, moveLike, parkLike, type Point, scrollLike } from "./human-mouse.ts"
import { HOSTS, run, startStack } from "./stack.ts"
import { type Screen, sleep, Take } from "./take.ts"

const OUT = new URL("../", import.meta.url).pathname.replace(/\/$/, "")
const TAKE = `${OUT}/.take`
const RECIPE = new URL("./", import.meta.url).pathname

/** Every frame is 2560×1600; the encoder scales it to 1280×800. */
const FRAME = { width: 2560, height: 1600 }
/**
 * The app is drawn at 800×500 CSS pixels, so its text stays readable where a site plays the video
 * about 528 px wide. The rail still shows at this width.
 */
const PAGE_VIEWPORT = { width: 800, height: 500 }

const TITLE = "Financy"
/** The encoder takes one line of at most 64 characters. */
const CLAIM = "A finance tracker for a person or a family, in any currency"
const END = "github.com/spy4x/financy"

/** What the video types and picks: made up, like the household. */
const TRANSFER = { from: "Salary account", to: "Bangkok account", sent: "200", memo: "Money for the trip" }
const DINNER = { account: "Bangkok account", currency: "THB", amount: "1250", category: "Travel", memo: "Dinner at the night market" }
/** Grace's entry, in cents of euro: €38.20. */
const GROCERIES = { amount: 3_820, memo: "Bakery and fruit" }

type State = Awaited<ReturnType<BrowserContext["storageState"]>>

/** What the take needs from the seeding. */
interface Seeded {
  groupId: string
  salaryId: string
  groceriesId: string
  ada: State
  /** Grace's API page and id, for the entry that arrives while Ada's page is open. */
  grace: Page
  graceId: number
  operation: (page: Page, userId: number, name: string, data: unknown) => Promise<void>
}

/**
 * Builds the website's sample household on the stack with the screenshot script's own helpers,
 * fetches the day's rates, and opens the household for Ada with her first-steps card put away.
 */
async function seed(browser: Browser, contexts: BrowserContext[]): Promise<Seeded> {
  // capture.ts reads its hosts when it loads.
  Deno.env.set("SHOTS_APP_URL", HOSTS.app)
  Deno.env.set("SHOTS_ADMIN_URL", HOSTS.admin)
  const capture = await import("../../../apps/mpa/screenshots/capture.ts")
  const context = await browser.newContext({ baseURL: HOSTS.app })
  contexts.push(context)
  // A cold dev server compiles a page's modules on its first load, well past capture.ts's 30 s.
  const warm = await context.newPage()
  await open(warm, `${HOSTS.admin}/sign-in`, warm.locator("[data-e2e=auth-form-login]"))
  await open(warm, `${HOSTS.app}/sign-in`, warm.locator("[data-e2e=auth-form-login]"))
  await warm.close()
  const ada = await context.newPage()
  const { pages, ids } = await capture.signUpPeople(browser, contexts, ada)
  const adaId = ids.get(capture.ADA)!
  const household = await capture.seedHousehold(ada, adaId, new Date())
  await capture.fetchRates(await capture.signInToAdmin(browser, contexts))
  await capture.selectGroup(ada, household.householdId)
  await capture.operation(ada, adaId, `onboarding.dismiss`, null)
  return {
    groupId: household.householdId,
    salaryId: household.salaryId,
    groceriesId: household.groceriesId,
    ada: await context.storageState(),
    grace: pages.get(capture.GRACE)!,
    graceId: ids.get(capture.GRACE)!,
    operation: capture.operation,
  }
}

/** The recording context: the page size, the light theme, the drawn pointer and key caps. */
async function recordingContext(
  browser: Browser,
  storageState: State,
  userAgent: string,
  start: Point,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: PAGE_VIEWPORT,
    deviceScaleFactor: FRAME.width / PAGE_VIEWPORT.width,
    colorScheme: "light",
    locale: "en-GB",
    timezoneId: "Etc/UTC",
    userAgent,
    storageState,
  })
  // The click mark keeps its 64 px on the finished video at this page scale.
  const mark = Math.round(64 * PAGE_VIEWPORT.width / 1280)
  await context.addInitScript(`window.__demoPointerOptions = ${JSON.stringify({ ...start, mark })}`)
  await context.addInitScript({ path: `${RECIPE}pointer.js` })
  await context.addInitScript({ path: `${RECIPE}keys.js` })
  return context
}

/** Opens `path` (on the app, or a full URL) and waits for `ready`, loading again when a cold dev server stalls. */
async function open(page: Page, path: string, ready: Locator): Promise<void> {
  for (let attempt = 1;; attempt++) {
    try {
      await page.goto(new URL(path, HOSTS.app).href, { timeout: 120_000 })
      await ready.first().waitFor({ timeout: 120_000 })
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {})
      return
    } catch (error) {
      if (attempt === 3) throw error
    }
  }
}

/** How long a page may take to answer a click on camera; the rest of the wait plays faster. */
const ANSWER_S = 0.5
/** Typing pace on camera, in seconds a key, however long the keys took to reach the page. */
const KEY_S = 0.065

/** Clicks `field` like a person, then types `text` at {@link KEY_S} a key. */
async function typeAtPace(take: Take, page: Page, pointer: Point, field: Locator, text: string) {
  await clickLike(page, pointer, field)
  await take.within(text.length * KEY_S, () => page.keyboard.type(text, { delay: 55 }))
}

/**
 * Picks `label` in a native `<select>`: headless Chromium never draws the open list, so the
 * pointer clicks the field, the option is chosen behind it, and the field shows the choice.
 */
async function choose(page: Page, pointer: Point, select: Locator, label: string | RegExp) {
  await clickLike(page, pointer, select)
  const options = await select.locator("option").allTextContents()
  const option = options.find((text) => typeof label === "string" ? text === label : label.test(text))
  if (!option) throw new Error(`no option ${label} in ${options.join(", ")}`)
  await select.selectOption({ label: option })
  await sleep(500)
}

/**
 * Closes the toast a save shows: it stays ten seconds for its Undo, over the balances the next
 * caption talks about.
 */
async function dismissToast(page: Page, pointer: Point) {
  await clickLike(page, pointer, page.getByRole("button", { name: "Dismiss" }).first(), { scroll: false })
  await sleep(400)
}

/** The rail's link to `path`. */
const rail = (page: Page, path: string) =>
  page.locator(`a[data-e2e=rail-shell-entry][href="${path}"]`).first()

const TOTAL = "[data-e2e=accounts-total-amount]"
const accountRow = (page: Page, name: string) =>
  page.locator(`li[data-e2e^=account-]`).filter({
    has: page.locator(`[data-e2e=account-name]`, { hasText: name }),
  }).first()
const transactionRow = (page: Page, memo: string) =>
  page.locator(`[data-e2e=transaction-row]`).filter({ hasText: memo }).first()

/** The take, as Ada: one page, one shot, every step in the spec's order. */
async function takePart(take: Take, browser: Browser, seeded: Seeded, userAgent: string) {
  const start = { x: 560, y: 300 }
  const context = await recordingContext(browser, seeded.ada, userAgent, start)
  const page = await context.newPage()
  const p = { ...start }

  // Off camera: open every screen once, so a cold dev server compiles nothing on camera.
  await open(page, "/transactions", page.locator("[data-e2e=transaction-new]"))
  await open(page, "/transactions/new", page.locator("[data-e2e=transaction-account]"))
  await open(page, "/transfers/new", page.locator("[data-e2e=transfer-from]"))
  await open(page, "/budgets", page.locator("[data-e2e=budget-change]"))
  await open(page, "/overview", page.locator("[data-e2e=budget-widget-link]"))
  await open(page, "/accounts", page.locator(TOTAL))
  await page.evaluate(() => document.fonts.ready)

  const screen: Screen = await take.watch(page, FRAME)
  try {
    // The poster: the accounts as they open, without the pointer.
    await page.evaluate(`__demoPointerVisible(false)`)
    await page.screenshot({ path: `${TAKE}/poster.png` })
    await page.evaluate(`__demoPointerVisible(true)`)
    await page.mouse.move(start.x, start.y)

    await take.begin(screen)
    await take.caption("One household, four currencies, one total in euros")
    await sleep(1200)
    await moveLike(page, p, { x: 300, y: 190 })
    await sleep(600)

    await take.caption("Each account keeps its own currency")
    const bangkok = accountRow(page, TRANSFER.to)
    const bangkokBox = (await bangkok.boundingBox())!
    await moveLike(page, p, { x: 600, y: Math.round(bangkokBox.y + bangkokBox.height / 2) })
    await sleep(900)
    await scrollLike(page, 170)
    await sleep(400)
    const dollars = (await accountRow(page, "Dollar savings").boundingBox())!
    await moveLike(page, p, { x: 600, y: Math.round(dollars.y + dollars.height / 2) })
    await sleep(1000)
    await take.readPrevious(0.3)

    await take.caption("Send €200 from Salary to the Bangkok account")
    await clickLike(page, p, rail(page, "/transactions"), { scroll: false })
    await take.within(ANSWER_S, () => page.locator("[data-e2e=transactions-menu]").first().waitFor())
    await sleep(300)
    await clickLike(page, p, page.locator("[data-e2e=transactions-menu]"), { scroll: false })
    await sleep(400)
    await clickLike(page, p, page.locator("[data-e2e=transfer-new]"), { scroll: false })
    await take.within(ANSWER_S, () => page.locator("[data-e2e=transfer-from]").first().waitFor())
    await sleep(400)
    await choose(page, p, page.locator("[data-e2e=transfer-from]"), new RegExp(`^${TRANSFER.from}`))
    await choose(page, p, page.locator("[data-e2e=transfer-to]"), new RegExp(`^${TRANSFER.to}`))
    await typeAtPace(
      take,
      page,
      p,
      page.locator("[data-e2e=transfer-sent-field] input").first(),
      TRANSFER.sent,
    )
    await sleep(500)

    await take.caption("Leave the baht empty to convert at today's rate")
    const received = page.locator("[data-e2e=transfer-received-field]")
    await received.waitFor()
    const receivedBox = (await received.boundingBox())!
    if (receivedBox.y + receivedBox.height > PAGE_VIEWPORT.height - 70) {
      await scrollLike(page, Math.round(receivedBox.y - 120))
    }
    const hint = (await received.boundingBox())!
    await moveLike(page, p, { x: Math.round(hint.x + hint.width - 40), y: Math.round(hint.y + 40) })
    await sleep(1400)
    await typeAtPace(take, page, p, page.locator("[data-e2e=transfer-memo]"), TRANSFER.memo)
    await sleep(300)
    await clickLike(page, p, page.locator("[data-e2e=transfer-save]"))
    await take.within(ANSWER_S, () => page.locator("[data-e2e=transaction-new]").first().waitFor())
    await sleep(600)
    await dismissToast(page, p)
    await take.readPrevious(0.2)

    await take.caption("Both balances move, each in its own currency")
    await clickLike(page, p, rail(page, "/accounts"), { scroll: false })
    await take.within(ANSWER_S, () => page.locator(TOTAL).first().waitFor())
    await sleep(500)
    const salary = (await accountRow(page, TRANSFER.from).boundingBox())!
    const thb = (await accountRow(page, TRANSFER.to).boundingBox())!
    await moveLike(page, p, { x: 640, y: Math.round(thb.y + thb.height / 2) })
    await sleep(900)
    await moveLike(page, p, { x: 640, y: Math.round(salary.y + salary.height / 2) })
    await sleep(900)
    await take.readPrevious(0.2)

    await take.caption("Add a dinner in baht with one key: T")
    await clickLike(page, p, rail(page, "/transactions"), { scroll: false })
    await take.within(ANSWER_S, () => page.locator("[data-e2e=transaction-new]").first().waitFor())
    await parkLike(page, p)
    await sleep(600)
    await page.keyboard.press("t")
    await take.within(ANSWER_S, () => page.locator("[data-e2e=transaction-account]").first().waitFor())
    await sleep(600)
    await choose(page, p, page.locator("[data-e2e=transaction-account]"), new RegExp(`^${DINNER.account}`))
    // The form starts in the last currency used, not the account's: pick the baht by its code.
    const currency = page.locator("[data-e2e=transaction-currency-field] input").first()
    await clickLike(page, p, currency)
    await page.keyboard.press("ControlOrMeta+a")
    await take.within(3 * KEY_S, () => page.keyboard.type(DINNER.currency, { delay: 55 }))
    await page.getByRole("option").first().waitFor()
    await sleep(400)
    await page.keyboard.press("Enter")
    await sleep(400)
    if (!(await currency.inputValue()).includes(DINNER.currency)) {
      throw new Error(`the currency reads ${await currency.inputValue()}, not ${DINNER.currency}`)
    }
    await typeAtPace(
      take,
      page,
      p,
      page.locator("[data-e2e=transaction-amount-field] input[type=text]"),
      DINNER.amount,
    )
    await choose(page, p, page.locator("[data-e2e=transaction-category]"), DINNER.category)
    await typeAtPace(take, page, p, page.locator("[data-e2e=transaction-memo]"), DINNER.memo)
    await sleep(300)
    await clickLike(page, p, page.locator("[data-e2e=transaction-save]"))
    await take.within(ANSWER_S, () => transactionRow(page, DINNER.memo).waitFor())
    await dismissToast(page, p)
    await parkLike(page, p)
    await sleep(900)
    await take.readPrevious(0.2)

    await take.caption("Grace adds groceries on her phone, and it appears live")
    await sleep(600)
    // Grace writes from her own session while Ada's page stays open: nothing reloads it.
    await seeded.operation(seeded.grace, seeded.graceId, `transaction.create`, {
      groupId: seeded.groupId,
      id: uuidV7(),
      accountId: seeded.salaryId,
      categoryId: seeded.groceriesId,
      kind: 1,
      amount: GROCERIES.amount,
      currency: `EUR`,
      memo: GROCERIES.memo,
    })
    await take.within(1, () => transactionRow(page, GROCERIES.memo).waitFor())
    await sleep(1800)
    await take.readPrevious(0.2)

    await take.caption("Budgets this month: Groceries over, Travel well under")
    await clickLike(page, p, rail(page, "/overview"), { scroll: false })
    const budgets = page.locator("[data-e2e=budget-widget-link]")
    await take.within(ANSWER_S, () => budgets.first().waitFor())
    await sleep(500)
    await clickLike(page, p, page.locator("[data-e2e=budget-widget-link]"))
    await take.within(ANSWER_S, () => page.locator("[data-e2e=budget-change]").first().waitFor())
    await parkLike(page, p)
    await sleep(1500)
    await take.readPrevious(0.3)

    await take.caption("Every view totals in the household's currency")
    await clickLike(page, p, rail(page, "/overview"), { scroll: false })
    await take.within(ANSWER_S, () => page.locator("[data-e2e=money-widget-link]").first().waitFor())
    await sleep(800)
    await take.readPrevious(0.2)

    await take.caption("Free to host yourself, or use the cloud")
    await parkLike(page, p)
    await sleep(600)
    await take.readPrevious(0.3)
    take.end()
  } finally {
    await take.stop([screen])
    await context.close()
  }
}

/** Records the whole take into {@link TAKE}. */
async function record(): Promise<void> {
  await Deno.remove(TAKE, { recursive: true }).catch(() => {})
  await Deno.mkdir(`${TAKE}/frames`, { recursive: true })
  const take = new Take(`${TAKE}/frames`)
  // Playwright's own signal handlers would close the browser and exit before the cleanup below.
  const browser = await chromium.launch({
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  })
  const contexts: BrowserContext[] = []
  let stopStack: (() => Promise<void>) | null = null
  // Deno skips `finally` when a signal ends the process, so Ctrl-C and SIGTERM run the same
  // cleanup themselves, once, and then exit.
  let released: Promise<void> | null = null
  const release = () =>
    released ??= (async () => {
      for (const context of contexts) await context.close().catch(() => {})
      await browser.close().catch(() => {})
      await stopStack?.()
    })()
  // The listeners stay through the encoding, so Ctrl-C ends it too; the cleanup has run by
  // then, so they only exit.
  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]] as const) {
    Deno.addSignalListener(signal, () => {
      console.error(`${signal}: removing the stack, then exiting`)
      release().finally(() => Deno.exit(code))
    })
  }
  try {
    const agent = await browser.newPage()
    const userAgent = (await agent.evaluate(() => navigator.userAgent)).replace("Headless", "")
    await agent.close()

    await startStack((stop) => stopStack = stop)
    const seeded = await seed(browser, contexts)
    await takePart(take, browser, seeded, userAgent)

    await writeTake(take)
    await Deno.writeTextFile(`${OUT}/captions.vtt`, take.vtt(CARD_SECONDS.title))
    console.log(`take: ${take.seconds().toFixed(1)} s in ${take.shots.length} shots`)
  } finally {
    await release()
  }
}

/**
 * Writes the take as one lossless 1280×800, 30 fps video, `take.mkv`, from one frame per slot,
 * and drops the frames.
 */
async function writeTake(take: Take): Promise<void> {
  const seq = `${TAKE}/seq`
  await Deno.mkdir(seq)
  for (const [i, file] of take.sequence().entries()) {
    await Deno.link(file, `${seq}/${String(i).padStart(6, "0")}.jpg`)
  }
  await run([
    ...["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-threads", "2"],
    ...["-framerate", "30", "-i", `${seq}/%06d.jpg`],
    ...["-vf", "scale=1280:800:flags=lanczos:out_range=tv"],
    ...["-c:v", "libx264", "-qp", "0", "-preset", "veryfast", "-pix_fmt", "yuv444p"],
    `${TAKE}/take.mkv`,
  ])
  await Deno.remove(seq, { recursive: true })
  await Deno.remove(`${TAKE}/frames`, { recursive: true })
}

/** Encodes the last take into `media/demo/`. */
async function encode(): Promise<void> {
  await encodeDemo({
    take: `${TAKE}/take.mkv`,
    out: OUT,
    title: TITLE,
    claim: CLAIM,
    end: END,
    poster: `${TAKE}/poster.png`,
    // Leaves CPU to the other sessions on a shared machine.
    threads: 2,
  })
}

if (import.meta.main) {
  if (!Deno.args.includes("--encode")) await record()
  await encode()
}
