/**
 * Records the website's three silent feature loops from the real SPA: live sync between two people,
 * an entry added with no connection, and the keyboard shortcuts. They are recorded in the light
 * theme only, the one most of Financy's households use (`loops.ts` beside the routes names them).
 *
 * `deno task loops` in `apps/mpa`; README.md beside this file says what it needs. It signs up the
 * same four people as `capture.ts`, builds the same household, fetches the day's exchange rates,
 * plays each loop at 720×450 CSS px and device scale 2 with a drawn pointer moved at a person's
 * pace, and records Chromium's screencast. Each take adds the entries it needs and removes them
 * again, so no take sees another's. Each clip ends with a fade into its own first frame, so it loops
 * without a jump. It writes an AV1 WebM and an H.264 MP4 of every clip into `media/video/` and the
 * first frame, at 720 and 1440 px, as the WebP poster into `static/video/`. The four accounts are
 * deleted again whether or not the run succeeded.
 */
import { type Browser, type BrowserContext, chromium, type Page } from "playwright"
import { gotoApp } from "../../../e2e/fixtures/app.ts"
import { clickLike, moveLike, type Point } from "../../../media/demo/recipe/human-mouse.ts"
import { concatList, Recorder } from "../../../docs/screenshots/screencast.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import {
  ADA,
  APP,
  cleanupPeople,
  expectOk,
  fetchRates,
  type Household,
  MARGARET,
  operation,
  sameOrigin,
  seedHousehold,
  signInToAdmin,
  signUpPeople,
} from "./capture.ts"
import { LOOP_NAMES, LOOP_SIZE, type LoopName } from "../loops.ts"

type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>

/** Someone the loops act as: their API context, id and signed-in session on the app host. */
interface Actor {
  page: Page
  id: number
  state: StorageState
}

/** What the loops need from the seeding. */
interface Seeded {
  household: Household
  ada: Actor
  margaret: Actor
}

/** Signs one person in to the household and clears the first-steps card from their screens. */
async function settle(page: Page, id: number, groupId: string): Promise<Actor> {
  const selected = await page.request.put(`${APP}/api/groups/selected`, {
    headers: sameOrigin(),
    data: { groupId },
  })
  await expectOk(`selected household`, selected)
  await operation(page, id, `onboarding.dismiss`, null)
  return { page, id, state: await page.context().storageState() }
}

/** Builds the website's household and fetches the rates an entry made offline converts with. */
async function seed(browser: Browser, contexts: BrowserContext[], ada: Page): Promise<Seeded> {
  const { pages, ids } = await signUpPeople(browser, contexts, ada)
  const household = await seedHousehold(ada, ids.get(ADA)!, new Date())
  await fetchRates(await signInToAdmin(browser, contexts))
  return {
    household,
    ada: await settle(ada, ids.get(ADA)!, household.householdId),
    margaret: await settle(pages.get(MARGARET)!, ids.get(MARGARET)!, household.householdId),
  }
}

/** Adds a Travel expense on the Salary account as `actor`, which the editor then prefills from. */
async function addTravel(
  actor: Actor,
  { household }: Seeded,
  entry: { amount: number; currency: string; accountAmount?: number },
): Promise<string> {
  const id = uuidV7()
  await operation(actor.page, actor.id, `transaction.create`, {
    id,
    groupId: household.householdId,
    accountId: household.salaryId,
    categoryId: household.travelId,
    kind: 1,
    ...entry,
  })
  return id
}

/** Removes a take's entries, none of which was edited: each is still at its first version. */
async function removeEntries(seeded: Seeded, ids: string[]): Promise<void> {
  const groupId = seeded.household.householdId
  for (const id of ids) {
    await operation(seeded.ada.page, seeded.ada.id, `transaction.delete`, {
      groupId,
      id,
      version: 1,
    })
  }
}

/** The list's row that shows `amount`. */
const rowOf = (page: Page, amount: string) =>
  page.locator(`li[data-e2e^=transaction-]`).filter({ hasText: amount }).first()

/** The id of the list's row that shows `amount`, once it is there. */
async function rowId(page: Page, amount: string): Promise<string> {
  const row = rowOf(page, amount)
  await row.waitFor()
  return (await row.getAttribute(`data-e2e`))!.slice(`transaction-`.length)
}

const amountField = (page: Page) =>
  page.locator(`[data-e2e=transaction-amount-field] input[type=text]`)

const MPA = new URL("..", import.meta.url).pathname
const VIDEO_DIR = `${MPA}media/video`
const POSTER_DIR = `${MPA}static/video`
const POINTER = new URL("../../../media/demo/recipe/pointer.js", import.meta.url).pathname
const KEYS = new URL("../../../media/demo/recipe/keys.js", import.meta.url).pathname
const FPS = 15
/** Each file's ceiling in bytes; the encoder steps its quality down until a file fits. */
const BUDGET = { video: 600_000, poster: { 720: 18_000, 1440: 90_000 } }
/** How long the closing fade into the first frame lasts, and how long that frame then holds. */
const FADE = 0.5
const HOLD = 0.2

/** One recorded clip: one concat list per window, laid side by side, and its length in seconds. */
interface Take {
  lists: string[]
  seconds: number
}

/** A recording window: its page, its screencast and where its pointer is. */
interface Window {
  page: Page
  rec: Recorder
  pointer: Point
}

/**
 * Opens a recording window signed in as `actor`, `width` CSS px wide, its screencast ready. The
 * pointer starts at `start`, a spot off the text the clip is about.
 */
async function openWindow(
  browser: Browser,
  contexts: BrowserContext[],
  actor: Actor,
  width: number,
  frames: string,
  start: Point,
): Promise<Window> {
  const viewport = { width, height: LOOP_SIZE.height }
  const context = await browser.newContext({
    baseURL: APP,
    storageState: actor.state,
    colorScheme: `light`,
    viewport,
    deviceScaleFactor: 2,
    locale: `en-GB`,
    timezoneId: `Europe/London`,
  })
  contexts.push(context)
  // Financy runs without Seed's notes example (`SPA_NOTES=false`), but the development server
  // answers with the committed `apps/spa/public/config.json`, which keeps it on.
  await context.route(
    `${APP}/config.json*`,
    (route) => route.fulfill({ json: { env: `dev`, notes: `false` } }),
  )
  await context.addInitScript(
    `globalThis.__demoPointerOptions = ${JSON.stringify({ ...start, mark: 40 })}`,
  )
  await context.addInitScript({ path: POINTER })
  await context.addInitScript({ path: KEYS })
  // After each route change the app focuses the page's heading for screen readers, and its focus
  // outline would frame "Transactions" in every list beat: the focus leaves it at once.
  await context.addInitScript(() => {
    addEventListener(`focusin`, (event) => {
      const target = event.target
      if (target instanceof HTMLElement && /^H[1-6]$/.test(target.tagName)) target.blur()
    }, true)
  })
  const page = await context.newPage()
  const dir = `${frames}/${contexts.length}`
  await Deno.mkdir(dir, { recursive: true })
  const rec = new Recorder(await context.newCDPSession(page), dir, viewport)
  return { page, rec, pointer: { ...start } }
}

/**
 * Starts the screencasts, lets the first frames arrive, then begins one shot in every window. The
 * function it returns waits until that many seconds of the shot have passed, so a beat lands on its
 * second however long the steps before it took.
 */
async function begin(windows: Window[]): Promise<(second: number) => Promise<void>> {
  for (const { rec } of windows) await rec.start()
  await windows[0].page.waitForTimeout(500)
  for (const { rec } of windows) await rec.begin()
  const started = Date.now()
  return (second) =>
    windows[0].page.waitForTimeout(Math.max(0, started + second * 1000 - Date.now()))
}

/** Ends the shot in every window, stops the screencasts and writes each window's concat list. */
async function finish(windows: Window[], frames: string): Promise<Take> {
  const lists: string[] = []
  let seconds = Infinity
  for (const [index, { rec }] of windows.entries()) {
    rec.end()
    await rec.stop()
    const list = `${frames}/list-${index}.txt`
    await Deno.writeTextFile(list, concatList(rec.segments, FPS))
    seconds = Math.min(seconds, rec.segments.reduce((sum, s) => sum + s.end - s.frames[0].at, 0))
    lists.push(list)
  }
  return { lists, seconds }
}

/** Waits for the socket to be up, so a take starts from the online state it shows. */
const online = (page: Page) =>
  page.locator(`[data-e2e=shell-ws-status]`, { hasText: `Online` }).waitFor()

/** Margaret adds an expense on the left; Ada's Travel budget on the right grows by itself. */
async function realtime(
  browser: Browser,
  contexts: BrowserContext[],
  seeded: Seeded,
  frames: string,
): Promise<Take> {
  const setup = await addTravel(seeded.margaret, seeded, { amount: 2_400, currency: `EUR` })
  const half = LOOP_SIZE.width / 2
  const left = await openWindow(browser, contexts, seeded.margaret, half, frames, {
    x: 300,
    y: 285,
  })
  const right = await openWindow(browser, contexts, seeded.ada, half, frames, { x: 0, y: 0 })
  const travel = right.page.locator(`[data-e2e=budget-${seeded.household.travelId}]`)
  await gotoApp(left.page, `/transactions/new`, amountField(left.page))
  await gotoApp(right.page, `/budgets`, travel.filter({ hasText: `€171.80` }))
  await Promise.all([online(left.page), online(right.page)])
  // Travel, the last row, sits under the fold: with the month's stepper at the top, it is in view.
  await right.page.locator(`[data-e2e=budgets-stepper-narrow]`).evaluate((stepper) =>
    globalThis.scrollBy({ top: stepper.getBoundingClientRect().top - 8 })
  )
  // One pointer: the right window only watches.
  await right.page.evaluate(() => {
    ;(globalThis as unknown as { __demoPointerVisible(v: boolean): void }).__demoPointerVisible(
      false,
    )
  })
  const windows = [left, right]
  const at = await begin(windows)
  const { page, pointer } = left
  await at(1)
  await clickLike(page, pointer, amountField(page), { scroll: false })
  await at(1.6)
  await page.keyboard.type(`64.50`, { delay: 130 })
  await at(2.6)
  await page.keyboard.press(`Enter`)
  const added = await rowId(page, `€64.50`)
  await hideEnterCap(page)
  await travel.filter({ hasText: `€236.30` }).waitFor()
  await at(6.3)
  const take = await finish(windows, frames)
  await removeEntries(seeded, [setup, added])
  return take
}

/** The key cap outlives the form: on the list it would look like a second Enter. */
const hideEnterCap = (page: Page) =>
  page.evaluate(() => {
    for (const node of document.querySelectorAll<HTMLElement>(`[data-demo]`)) {
      if (node.textContent === `Enter`) node.style.opacity = `0`
    }
  })

/**
 * Keeps a closed socket closed until the network returns (`testBackoff` in
 * apps/spa/src/realtime/index.ts). Call it before the page's first load.
 */
const slowReconnect = (page: Page) =>
  page.addInitScript(() => {
    ;(globalThis as { __REALTIME_BACKOFF__?: unknown }).__REALTIME_BACKOFF__ = {
      baseMs: 60_000,
      maxMs: 60_000,
      jitterRatio: 0,
    }
  })

/** With no connection, Ada adds a baht expense; back online, it is sent and shows its euros. */
async function offline(
  browser: Browser,
  contexts: BrowserContext[],
  seeded: Seeded,
  frames: string,
): Promise<Take> {
  const setup = await addTravel(seeded.ada, seeded, {
    amount: 32_000,
    currency: `THB`,
    accountAmount: 850,
  })
  const start = { x: 640, y: 120 }
  const window = await openWindow(browser, contexts, seeded.ada, LOOP_SIZE.width, frames, start)
  const { page, rec, pointer } = window
  await slowReconnect(page)
  const status = page.locator(`[data-e2e=shell-ws-status]`)
  const add = page.locator(`[data-e2e=transaction-new]`)
  await gotoApp(page, `/transactions`, rowOf(page, `THB 320.00`))
  await online(page)
  // The editor's code loads now: with no network it could not load later.
  await add.click()
  await amountField(page).waitFor()
  await page.goBack()
  await rowOf(page, `THB 320.00`).waitFor()
  // The drawn pointer follows the mouse: back to where the clip starts it.
  await page.mouse.move(start.x, start.y)
  try {
    const at = await begin([window])
    await at(0.6)
    // A browser keeps an open socket through `setOffline`, so the socket closes first.
    const closed = await seeded.ada.page.request.post(`${APP}/api/test/close-sockets`, {
      data: { login: ADA.email },
    })
    await expectOk(`closing the sockets`, closed)
    await status.filter({ hasText: `Offline` }).waitFor()
    await page.context().setOffline(true)
    // The socket takes a varying time to close: the beats after it count from "Offline".
    const offlineAt = Date.now()
    const after = (second: number) =>
      page.waitForTimeout(Math.max(0, offlineAt + second * 1000 - Date.now()))
    await after(0.4)
    await clickLike(page, pointer, add, { scroll: false })
    await page.locator(`[data-e2e=transaction-offline]`).waitFor()
    await after(1.1)
    await page.keyboard.type(`240`, { delay: 150 })
    await after(1.65)
    await page.keyboard.press(`Enter`)
    const row = rowOf(page, `THB 240.00`)
    await row.filter({ hasText: `Converted when back online` }).waitFor()
    await hideEnterCap(page)
    await page.locator(`[data-e2e=offline-status]`).waitFor()
    // "Transaction added" covers the row's amounts: the pointer closes it.
    const toast = page.locator(`[data-e2e=toasts] button[aria-label]`).first()
    // It slides in: aimed at before it stops, the click lands beside it.
    await page.locator(`[data-e2e=toasts]`).evaluate((stack) =>
      Promise.all(stack.getAnimations({ subtree: true }).map((animation) => animation.finished))
    )
    await clickLike(page, pointer, toast, { scroll: false })
    await toast.waitFor({ state: `detached` })
    // The waiting row, uncovered, stays long enough to read, and the pointer leaves its amounts
    // for where the clip starts and ends.
    const uncovered = Date.now()
    await moveLike(page, pointer, start)
    await page.waitForTimeout(Math.max(0, uncovered + 1000 - Date.now()))
    // The wait for the reconnect is cut: the clip goes straight to the entry that was sent.
    rec.end()
    await page.context().setOffline(false)
    await online(page)
    await page.locator(`[data-e2e=offline-status]`).waitFor({ state: `detached` })
    await row.locator(`[data-e2e=transaction-account-amount]`, { hasText: `€` })
      .waitFor({ timeout: 30_000 })
    const added = await rowId(page, `THB 240.00`)
    await rec.begin()
    await page.waitForTimeout(2300)
    const take = await finish([window], frames)
    await removeEntries(seeded, [setup, added])
    return take
  } finally {
    await page.context().setOffline(false)
  }
}

/** T adds an entry, then Ctrl+K finds a hotel from a typo, Cyrillic and the wrong layout. */
async function shortcuts(
  browser: Browser,
  contexts: BrowserContext[],
  seeded: Seeded,
  frames: string,
): Promise<Take> {
  const setup = await addTravel(seeded.ada, seeded, { amount: 2_400, currency: `EUR` })
  // Right of the filters, where nothing is written.
  const spot = { x: 640, y: 135 }
  const window = await openWindow(browser, contexts, seeded.ada, LOOP_SIZE.width, frames, spot)
  const { page, pointer } = window
  await gotoApp(page, `/transactions`, rowOf(page, `€24.00`))
  await online(page)
  const at = await begin([window])
  await at(0.5)
  await page.keyboard.press(`t`)
  await amountField(page).waitFor()
  await page.keyboard.type(`18.90`, { delay: 110 })
  await page.keyboard.press(`Enter`)
  const added = await rowId(page, `€18.90`)
  // "Transaction added" covers the new row's amount and would stay beside the hotel payment, as if
  // that were the €18.90: the pointer closes it, once it has stopped sliding in.
  const toast = page.locator(`[data-e2e=toasts] button[aria-label]`).first()
  await page.locator(`[data-e2e=toasts]`).evaluate((stack) =>
    Promise.all(stack.getAnimations({ subtree: true }).map((animation) => animation.finished))
  )
  await clickLike(page, pointer, toast, { scroll: false })
  await toast.waitFor({ state: `detached` })
  await moveLike(page, pointer, spot)
  await at(3.4)
  await page.keyboard.press(`Control+k`)
  const palette = page.locator(`[data-e2e=search]`)
  await palette.getByRole(`combobox`).waitFor()
  const hotel = palette.getByRole(`option`).filter({ hasText: `Hotel in Bangkok` })
  await at(3.7)
  for (const [index, query] of [`htoel`, `отель`, `рщеуд`].entries()) {
    if (index) await page.keyboard.press(`Control+a`)
    await page.keyboard.type(query, { delay: 85 })
    await at(3.7 + (index + 1) * 0.85)
    if (!await hotel.isVisible()) throw new Error(`search for ${query} lost the hotel payment`)
  }
  await page.keyboard.press(`Enter`)
  await page.waitForURL(/\/transactions\/[0-9a-f-]{36}/)
  await page.locator(`[data-e2e=transaction-amount-field]`, { hasText: `THB` }).waitFor()
  await page.waitForFunction(
    (selector) => document.querySelector<HTMLInputElement>(selector)?.value === `1850.00`,
    `[data-e2e=transaction-amount-field] input[type=text]`,
  )
  await at(7.6)
  const take = await finish([window], frames)
  await removeEntries(seeded, [setup, added])
  return take
}

const CHOREOGRAPHY: Record<
  LoopName,
  (b: Browser, c: BrowserContext[], s: Seeded, f: string) => Promise<Take>
> = { realtime, offline, shortcuts }

/** Runs ffmpeg and throws with its error output when it fails. */
async function ffmpeg(args: string[]): Promise<void> {
  const { success, stderr } = await new Deno.Command("ffmpeg", {
    args: ["-hide_banner", "-loglevel", "error", "-y", ...args],
    stdout: "null",
  }).output()
  if (!success) throw new Error(`ffmpeg ${args.join(" ")}: ${new TextDecoder().decode(stderr)}`)
}

/**
 * The filter graph of a take: its windows side by side, ending in a fade into the first frame,
 * which then holds for `HOLD`, so the clip's first and last frames are the same picture.
 */
function loopFilter(take: Take, firsts: string[]): { inputs: string[]; graph: string } {
  const count = take.lists.length
  const inputs = [
    ...take.lists.flatMap((list) => ["-f", "concat", "-safe", "0", "-i", list]),
    ...firsts.flatMap((file) => ["-loop", "1", "-t", String(FADE + HOLD + 0.2), "-i", file]),
  ]
  const still = FADE + HOLD
  // The screencast's JPEGs are full range; video players expect the limited range.
  const lane = (index: number, length: number) =>
    `[${index}:v]` + [
      `fps=${FPS}`,
      `trim=duration=${length.toFixed(3)}`,
      `setpts=PTS-STARTPTS`,
      `scale=in_range=pc:out_range=tv`,
      `format=yuv420p`,
    ].join(",")
  const parts = [
    ...take.lists.map((_, i) => `${lane(i, take.seconds)}[m${i}]`),
    ...firsts.map((_, i) => `${lane(count + i, still)}[s${i}]`),
  ]
  const join = (prefix: string, out: string) =>
    count === 1
      ? `[${prefix}0]null[${out}]`
      : `${take.lists.map((_, i) => `[${prefix}${i}]`).join("")}hstack=inputs=${count}[${out}]`
  parts.push(join("m", "main"), join("s", "still"))
  parts.push(
    `[main][still]xfade=transition=fade:duration=${FADE}:offset=${
      (take.seconds - FADE).toFixed(3)
    },format=yuv420p[out]`,
  )
  return { inputs, graph: parts.join(";") }
}

/** Encodes a take with one codec, stepping the quality down until the file fits the budget. */
async function encode(
  take: Take,
  firsts: string[],
  out: string,
  codec: (quality: number) => string[],
  qualities: number[],
): Promise<number> {
  const { inputs, graph } = loopFilter(take, firsts)
  for (const quality of qualities) {
    await ffmpeg([
      ...inputs,
      "-filter_complex",
      graph,
      "-map",
      "[out]",
      "-an",
      "-r",
      String(FPS),
      ...codec(quality),
      out,
    ])
    const { size } = await Deno.stat(out)
    if (size <= BUDGET.video) return size
  }
  throw new Error(`${out} stays above its budget of ${BUDGET.video} bytes`)
}

/** Writes the clip's first frame as the WebP poster at both widths, within each width's budget. */
async function posters(take: Take, firsts: string[], name: string): Promise<void> {
  const frame = `${take.lists[0]}.png`
  const { inputs, graph } = loopFilter(take, firsts)
  await ffmpeg([...inputs, "-filter_complex", graph, "-map", "[out]", "-frames:v", "1", frame])
  for (const width of [720, 1440] as const) {
    const out = `${POSTER_DIR}/${name}-${width}.webp`
    for (let quality = 82;; quality -= 6) {
      const { success, stderr } = await new Deno.Command("cwebp", {
        args: ["-quiet", "-q", String(quality), "-resize", String(width), "0", frame, "-o", out],
      }).output()
      if (!success) throw new Error(`cwebp ${out}: ${new TextDecoder().decode(stderr)}`)
      if ((await Deno.stat(out)).size <= BUDGET.poster[width]) break
      if (quality <= 40) throw new Error(`${out} stays above ${BUDGET.poster[width]} bytes`)
    }
  }
}

/** Records one loop and writes its two videos and two posters. */
async function record(
  browser: Browser,
  seeded: Seeded,
  loop: LoopName,
): Promise<void> {
  const frames = await Deno.makeTempDir({ prefix: `loop-${loop}-` })
  const contexts: BrowserContext[] = []
  try {
    const take = await CHOREOGRAPHY[loop](browser, contexts, seeded, frames)
    const firsts = take.lists.map((list) => Deno.readTextFileSync(list).match(/^file '(.+)'$/m)![1])
    const name = `${loop}-loop-light`
    const webm = await encode(take, firsts, `${VIDEO_DIR}/${name}.webm`, (crf) => [
      ...["-c:v", "libsvtav1", "-preset", "5", "-crf", String(crf), "-g", "150"],
      ...["-svtav1-params", "tune=0", "-pix_fmt", "yuv420p"],
    ], [30, 34, 38, 42, 46])
    const mp4 = await encode(take, firsts, `${VIDEO_DIR}/${name}.mp4`, (crf) => [
      ...["-c:v", "libx264", "-preset", "slow", "-crf", String(crf), "-profile:v", "high"],
      ...["-level", "4.0", "-pix_fmt", "yuv420p", "-movflags", "+faststart"],
    ], [22, 25, 28, 31, 34])
    await posters(take, firsts, name)
    console.log(`${name}: ${take.seconds.toFixed(1)} s, webm ${webm} B, mp4 ${mp4} B`)
  } finally {
    for (const context of contexts) await context.close().catch(() => {})
    await Deno.remove(frames, { recursive: true })
  }
}

async function main(): Promise<void> {
  const only = Deno.args.filter((arg) => (LOOP_NAMES as readonly string[]).includes(arg))
  const loops = only.length ? only as LoopName[] : LOOP_NAMES
  for (const dir of [VIDEO_DIR, POSTER_DIR]) await Deno.mkdir(dir, { recursive: true })
  // The screencast sends frames at the CSS size unless the browser itself runs at scale 2.
  const browser = await chromium.launch({ args: ["--force-device-scale-factor=2"] })
  const contexts: BrowserContext[] = []
  try {
    const adaContext = await browser.newContext({ baseURL: APP })
    contexts.push(adaContext)
    const ada = await adaContext.newPage()
    await cleanupPeople(ada)
    try {
      const seeded = await seed(browser, contexts, ada)
      for (const loop of loops) await record(browser, seeded, loop)
    } finally {
      await cleanupPeople(ada)
    }
  } finally {
    for (const context of contexts) await context.close().catch(() => {})
    await browser.close()
  }
}

if (import.meta.main) await main()
