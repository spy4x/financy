/**
 * Records the README's pictures of Financy from the running app, with the website's "Sample
 * household": four stills in light and dark, the add-a-transaction GIF and the GitHub social
 * preview. Other sites reuse the files, so each still ships unframed: rounded corners on a
 * transparent background, each site adding its own backdrop.
 *
 * - `<screen>-<theme>-2560.png`, `-1280.webp` and `-2560.webp` for `accounts`, `transactions`,
 *   `budgets` and `overview`: a 1280×800 window at device scale 2, cropped to the height of what
 *   the screen shows. A screen that does not show what the README says it shows fails the run.
 * - `add-transaction-dark-1280.gif`: Transactions at rest, T opens the editor, an amount in baht
 *   on "Bangkok account" is typed and saved, the new row holds on top, then a fade back to the
 *   first frame.
 * - `social-preview-1280.png`: the dark Accounts still in the website's home card
 *   (`apps/mpa/screenshots/og.html`), at GitHub's 1280×640. Only the owner can upload it: GitHub's
 *   repository settings, "Social preview".
 *
 * It signs up, seeds and deletes the same four people as `apps/mpa/screenshots/capture.ts`, with
 * that file's helpers, so the two scripts never run at the same time. The four accounts are deleted
 * through the development route `/api/test/cleanup-user` before the run and after it, also when it
 * fails. It needs the development stack (`ENV=dev`, `admin` in `COMPOSE_PROFILES`) at
 * http://app.localhost and http://admin.localhost (`SHOTS_APP_URL` and `SHOTS_ADMIN_URL` name
 * others), and `ffmpeg`, `cwebp` and `magick` on the PATH. The `recapture-shots` skill runs it:
 *
 * ```sh
 * deno run -A docs/screenshots/record.ts
 * ```
 *
 * `CHROME_PATH` points Playwright at a Chromium already on disk instead of its own download.
 */
import { type Browser, type BrowserContext, chromium, type Locator, type Page } from "playwright"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { gotoApp } from "../../e2e/fixtures/app.ts"
import { clickLike, moveLike, type Point } from "../../media/demo/recipe/human-mouse.ts"
import {
  APP,
  CACHE,
  cardContext,
  cleanupPeople,
  encodeWebp,
  expectRates,
  expectTexts,
  OG_CARDS,
  openPage,
  operation,
  run,
  seed,
  type Seeded,
  selectGroup,
  settle,
  shootCard,
} from "../../apps/mpa/screenshots/capture.ts"

const OUT_DIR = new URL(".", import.meta.url).pathname
const RECIPE = new URL("../../media/demo/recipe/", import.meta.url).pathname
const VIEWPORT = { width: 1280, height: 800 }
const THEMES = ["light", "dark"] as const
type Theme = typeof THEMES[number]
/** Space kept below a still's last element, in CSS pixels. */
const MARGIN = 24
/** The budget of each WebP, and of the GIF, in bytes. */
const BUDGET = { webp: 150 * 1024, gif: 2 * 1024 * 1024 }
/** The GIF's frames a second, its closing fade into the first frame, and how long that holds. */
const FPS = 12
const FADE = 0.5
const HOLD = 0.2

/** Grace's entry, so the transactions list shows a second member. */
const GRACE_ENTRY = { amount: 28_640, currency: `EUR`, memo: `Weekly groceries` }

/** A screen of the README: where it is, when it has loaded, and what it must show. */
interface Screen {
  name: string
  path(seeded: Seeded): string
  ready(page: Page): Locator
  /** Throws when the screen does not show what the README says it shows. */
  check(page: Page): Promise<void>
  /** Where the crop ends, in CSS pixels, when not after everything in `main`. */
  end?(page: Page): Promise<number>
  /** What `check` names that must also end inside that crop, when `end` cuts the screen short. */
  inside?(page: Page): Locator[]
}

/** Throws unless `locator` is on the screen. */
async function expectVisible(locator: Locator, what: string): Promise<void> {
  if (!await locator.first().isVisible()) throw new Error(`the screen does not show ${what}`)
}

const SCREENS: Screen[] = [
  {
    // The README's hero: every currency, one total.
    name: `accounts`,
    path: () => `/accounts`,
    ready: (page) => page.locator(`[data-e2e=accounts-total-amount]`),
    async check(page) {
      await expectTexts(page.locator(`main`), [
        `Bangkok account`,
        `THB 104,750.00`,
        `London account`,
        `£1,840.00`,
        `Salary account`,
        `€5,965.80`,
        `Dollar savings`,
        `US$12,500.00`,
      ])
      await expectVisible(page.locator(`[data-e2e=accounts-total-amount]`), `the total`)
      await expectVisible(page.locator(`[data-e2e=accounts-total-rates]`), `the rates date`)
      await expectVisible(page.locator(`[data-e2e=rail-shell-rail]`), `the rail`)
    },
  },
  {
    name: `transactions`,
    path: () => `/transactions`,
    // Grace's name comes with the members, and the transfer with the transfers, after the rows.
    ready: (page) => page.locator(`[data-e2e=transaction-meta]`, { hasText: `Grace` }),
    // A baht payment with both amounts, the transfer, and entries by two members.
    async check(page) {
      await page.getByText(`Money for Bangkok`).waitFor({ timeout: 15_000 })
      await expectTexts(page.locator(`main`), [
        `Hotel in Bangkok`,
        `THB 1,850.00`,
        `€49.20`,
        `Money for Bangkok`,
        GRACE_ENTRY.memo,
        `Grace`,
        `You`,
      ])
    },
    // The list is taller than the window: the crop ends after the last row that fits.
    end: (page) => lastFitting(page.locator(`main li`)),
    inside: (page) =>
      [`Hotel in Bangkok`, `Money for Bangkok`, GRACE_ENTRY.memo].map((text) =>
        page.locator(`main li`).filter({ hasText: text }).first()
      ),
  },
  {
    name: `budgets`,
    path: () => `/budgets`,
    ready: (page) => page.locator(`[data-e2e=budgets-list]`),
    check: (page) =>
      expectTexts(page.locator(`[data-e2e=budgets-list]`), [`Groceries`, `Rent`, `Travel`]),
  },
  {
    name: `overview`,
    path: (seeded) => `/overview/${seeded.householdId}`,
    ready: (page) => page.locator(`[data-e2e="overview-widget-money.spending"]`),
    async check(page) {
      await expectTexts(page.locator(`main`), [`Net`, `Income`, `Spending`])
      await expectVisible(page.locator(`[data-e2e=overview-range]`), `the range picker`)
    },
    // The three key numbers and the range picker above them. The widgets below are hidden, so the
    // margin under the cards shows no sliver of the next one.
    async end(page) {
      const spending = page.locator(`[data-e2e="overview-widget-money.spending"]`)
      await spending.evaluate((card) => {
        const bottom = card.getBoundingClientRect().bottom
        const widgets = document.querySelectorAll<HTMLElement>(`[data-e2e^=overview-widget-]`)
        for (const widget of widgets) {
          if (widget.getBoundingClientRect().top > bottom) widget.style.visibility = `hidden`
        }
      })
      return bottomOf(spending)
    },
  },
]

/** The bottom of the lowest of `rows` that ends inside the window, margin included. */
async function lastFitting(rows: Locator): Promise<number> {
  const limit = VIEWPORT.height - MARGIN
  const bottoms = await rows.evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect().bottom)
  )
  const fitting = bottoms.filter((bottom) => bottom <= limit)
  if (!fitting.length) throw new Error(`no row ends inside the window`)
  return Math.max(...fitting)
}

/**
 * Opens a 1280×800 page signed in as Ada in the sample household, with the clock fixed, ready for
 * a picture: Financy's rail without Seed's example screens, and no focus ring on the heading the
 * app focuses after each navigation.
 */
async function openDesktop(
  browser: Browser,
  contexts: BrowserContext[],
  seeded: Seeded,
  theme: Theme,
  device: { deviceScaleFactor: number; recordVideo?: { dir: string; size: typeof VIEWPORT } },
): Promise<Page> {
  const page = await openPage(browser, contexts, seeded, {
    theme,
    state: seeded.appState,
    baseURL: APP,
    device: { viewport: VIEWPORT, isMobile: false, hasTouch: false, ...device },
  })
  const context = page.context()
  // Financy runs without the example (`SPA_NOTES=false`), but the development server answers
  // with the committed `apps/spa/public/config.json`, which keeps it on.
  await context.route(
    `${APP}/config.json*`,
    (route) => route.fulfill({ json: { env: `dev`, notes: `false` } }),
  )
  await context.addInitScript(() => {
    addEventListener(`focusin`, (event) => {
      const target = event.target
      if (target instanceof HTMLElement && /^H[1-6]$/.test(target.tagName)) target.blur()
    }, true)
  })
  await selectGroup(page, seeded.householdId)
  return page
}

/**
 * The bottom of `scope`'s lowest visible box, in CSS pixels from the window's top: an innermost
 * element, or one a person sees the edge of (a border, a background or a shadow), so a card's
 * padding and border count while a layout wrapper's empty padding does not. A wrapper that
 * reaches the window's bottom never counts, because one such as `main` stretches to the window's
 * height; an innermost element always does, so content below the window still fails the crop.
 */
function bottomOf(scope: Locator): Promise<number> {
  return scope.evaluate((element) =>
    Math.max(
      ...[element, ...element.querySelectorAll(`*`)]
        .filter((child) => child.checkVisibility())
        .filter((child) => {
          if (child.childElementCount === 0) return true
          if (child.getBoundingClientRect().bottom >= innerHeight) return false
          const style = getComputedStyle(child)
          return parseFloat(style.borderBottomWidth) > 0 ||
            style.boxShadow !== `none` ||
            !/^transparent$|[,/]\s*0\)$/.test(style.backgroundColor)
        })
        .map((child) => child.getBoundingClientRect().bottom),
    )
  )
}

/**
 * Photographs `screen` at device scale 2, from the window's top to its content's end. Throws when
 * the content does not fit the 800 px window, so a taller screen never loses its end.
 */
async function capture(
  browser: Browser,
  contexts: BrowserContext[],
  seeded: Seeded,
  screen: Screen,
  theme: Theme,
): Promise<{ png: Uint8Array; height: number }> {
  const page = await openDesktop(browser, contexts, seeded, theme, { deviceScaleFactor: 2 })
  try {
    await gotoApp(page, screen.path(seeded), screen.ready(page))
    await expectRates(page)
    await screen.check(page)
    await settle(page)
    const end = await (screen.end?.(page) ?? bottomOf(page.locator(`main`)))
    const height = Math.ceil(end) + MARGIN
    if (height > VIEWPORT.height) {
      throw new Error(`${screen.name}: its content ends at ${height} px, below the window`)
    }
    for (const part of screen.inside?.(page) ?? []) {
      const box = await part.boundingBox()
      if (!box || box.y + box.height > end) {
        throw new Error(`${screen.name}: ${part} ends below the picture's crop`)
      }
    }
    const png = await page.screenshot({
      clip: { x: 0, y: 0, width: VIEWPORT.width, height },
      animations: `disabled`,
      caret: `hide`,
    })
    return { png, height }
  } finally {
    await page.context().close()
  }
}

function dataUrl(bytes: Uint8Array): string {
  let binary = ``
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/png;base64,${btoa(binary)}`
}

/** Rounds a still's corners on a transparent background, at the still's own 2x size. */
async function rounded(browser: Browser, png: Uint8Array, height: number): Promise<Uint8Array> {
  const context = await browser.newContext({
    viewport: { width: VIEWPORT.width, height },
    deviceScaleFactor: 2,
  })
  try {
    const page = await context.newPage()
    await page.setContent(`<!doctype html><body style="margin:0;background:transparent">
      <img src="${dataUrl(png)}" style="display:block;width:${VIEWPORT.width}px;height:${height}px;
      border-radius:12px"></body>`)
    await page.locator(`img`).evaluate((img: HTMLImageElement) => img.decode())
    return await page.screenshot({ omitBackground: true })
  } finally {
    await context.close()
  }
}

/** Writes a still's PNG and its two WebPs, and answers the PNG's path. */
async function writeStill(name: string, png: Uint8Array, dir: string): Promise<string> {
  const raw = `${dir}/${name}.png`
  const target = `${OUT_DIR}${name}-2560.png`
  await Deno.writeFile(raw, png)
  await run(`magick`, [raw, `-strip`, `-define`, `png:compression-level=9`, target])
  for (const width of [1280, 2560]) {
    const webp = `${OUT_DIR}${name}-${width}.webp`
    if (!await encodeWebp(target, webp, width, BUDGET.webp)) {
      throw new Error(`${webp} stays above ${BUDGET.webp} bytes at quality 50`)
    }
  }
  return target
}

/** The social preview: the website's home card, at GitHub's size, with the dark Accounts still. */
async function socialPreview(browser: Browser, accounts: string, dir: string): Promise<void> {
  const home = OG_CARDS.find((card) => card.file === `home`)
  if (!home) throw new Error(`capture.ts has no home card`)
  const context = await cardContext(browser, { width: 1280, height: 640 }, {
    "/static/readme-accounts.png": accounts,
  })
  try {
    const target = `${OUT_DIR}social-preview-1280.png`
    const card = { ...home, shot: `readme-accounts.png`, top: 0, left: 175, width: 785 }
    const size = await shootCard(context, card, `${dir}/social-card-master.png`, target)
    if (size > 1024 * 1024) throw new Error(`${target} is over GitHub's 1 MB`)
  } finally {
    await context.close()
  }
}

/** What `recordGif` hands to `toGif`, in seconds from the video's start. */
interface Recording {
  video: string
  /** Where the GIF starts: Transactions at rest. */
  start: number
  /** The stretch left out: from saving until the "Transaction added" toast has gone. */
  cut: [number, number]
  /** Where the GIF's hold on the new row ends. */
  end: number
}

/**
 * Records adding a baht expense the way a person does: T opens the editor, the drawn pointer picks
 * the account and the category, the amount and a memo are typed, Enter saves.
 */
async function recordGif(
  browser: Browser,
  contexts: BrowserContext[],
  seeded: Seeded,
  dir: string,
): Promise<Recording> {
  // Right of the list and above the toast, which stops its timer while the pointer is over it.
  const rest = { x: 1170, y: 400 }
  const page = await openDesktop(browser, contexts, seeded, `dark`, {
    deviceScaleFactor: 1,
    recordVideo: { dir, size: VIEWPORT },
  })
  // The video starts with the page: its clock is near enough to this one.
  const started = Date.now()
  const now = () => (Date.now() - started) / 1000
  const pointer: Point = { ...rest }
  let recording: Omit<Recording, `video`>
  try {
    const context = page.context()
    await context.addInitScript(`globalThis.__demoPointerOptions = ${JSON.stringify(rest)}`)
    await context.addInitScript({ path: `${RECIPE}pointer.js` })
    await context.addInitScript({ path: `${RECIPE}keys.js` })
    await gotoApp(page, `/transactions`, page.getByText(`Hotel in Bangkok`))
    await expectRates(page)
    await settle(page)
    await page.mouse.move(rest.x, rest.y)
    await page.waitForTimeout(300)
    const start = now()
    await page.waitForTimeout(1200)

    await page.keyboard.press(`t`)
    const amount = page.locator(`[data-e2e=transaction-amount-field] input[type=text]`)
    await amount.waitFor()
    await page.waitForTimeout(300)
    // A native list draws outside the page, where no recording sees it: the pointer goes to the
    // field and the choice lands in it.
    for (const [field, label] of [[`account`, `Bangkok account · THB`], [`category`, `Travel`]]) {
      const select = page.locator(`select[data-e2e=transaction-${field}]`)
      const box = await select.boundingBox()
      if (!box) throw new Error(`the editor has no ${field} field`)
      await moveLike(page, pointer, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
      await page.waitForTimeout(150)
      await select.selectOption({ label })
      await page.waitForTimeout(300)
    }
    // The editor keeps the last entry's currency, so the person picks baht as well.
    const currency = page.locator(`[data-e2e=transaction-currency-field] input`)
    await clickLike(page, pointer, currency)
    await currency.selectText()
    await page.keyboard.type(`THB`, { delay: 110 })
    await page.keyboard.press(`Enter`)
    // The amount is in the account's own currency: no second amount to convert.
    await page.locator(`[data-e2e=transaction-amount-field]`, { hasText: `THB` }).waitFor({
      timeout: 10_000,
    })
    await page.locator(`[data-e2e=transaction-account-amount-field]`).waitFor({
      state: `detached`,
      timeout: 10_000,
    })
    await page.waitForTimeout(200)
    await clickLike(page, pointer, amount)
    await amount.selectText()
    await page.keyboard.type(`450`, { delay: 130 })
    await page.waitForTimeout(250)
    const memo = page.locator(`input[data-e2e=transaction-memo]`)
    await clickLike(page, pointer, memo)
    await page.keyboard.type(`Street food`, { delay: 70 })
    if (await memo.inputValue() !== `Street food`) throw new Error(`the memo did not take its text`)
    await page.waitForTimeout(400)

    const saved = now()
    await page.keyboard.press(`Enter`)
    const row = page.locator(`li[data-e2e^=transaction-]`).first()
    await row.filter({ hasText: `Street food` }).filter({ hasText: `THB 450.00` }).waitFor()
    // The pointer leaves the list, where it would light up a row, while the cut hides it.
    await page.mouse.move(rest.x, rest.y)
    await page.locator(`[data-e2e=toasts] > *`).first().waitFor({
      state: `detached`,
      timeout: 30_000,
    })
    const back = now() + 0.2
    await page.waitForTimeout(1800)
    recording = { start, cut: [saved, back], end: now() }
  } finally {
    await page.context().close()
  }
  const video = await page.video()?.path()
  if (!video) throw new Error(`the recording context produced no video`)
  return { video, ...recording }
}

/**
 * Converts the recording to a 12 fps GIF from `start` to `end` without the cut, ending in a fade
 * into its first frame, so it loops without a jump. Fewer colours are tried until it fits.
 */
async function toGif({ video, start, cut: [from, to], end }: Recording, dir: string) {
  const out = `${OUT_DIR}add-transaction-dark-1280.gif`
  const first = `${dir}/first.png`
  const seek = [`-y`, `-loglevel`, `error`, `-ss`, start.toFixed(2), `-i`, video]
  await run(`ffmpeg`, [...seek, `-frames:v`, `1`, first])
  const length = end - start - (to - from)
  for (const colors of [256, 192, 128, 96]) {
    const graph = [
      `[0:v]fps=${FPS},select='not(between(t,${(from - start).toFixed(2)},${
        (to - start).toFixed(2)
      }))',setpts=N/${FPS}/TB,trim=duration=${length.toFixed(2)},format=rgb24[main]`,
      `[1:v]fps=${FPS},trim=duration=${FADE + HOLD},setpts=PTS-STARTPTS,format=rgb24[first]`,
      `[main][first]xfade=transition=fade:duration=${FADE}:offset=${
        (length - FADE).toFixed(2)
      },split[a][b]`,
      `[a]palettegen=max_colors=${colors}:stats_mode=diff[p]`,
      `[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    ].join(`;`)
    await run(`ffmpeg`, [
      ...seek,
      ...[`-loop`, `1`, `-t`, String(FADE + HOLD + 0.5), `-i`, first],
      ...[`-filter_complex`, graph, `-loop`, `0`, out],
    ])
    const { size } = await Deno.stat(out)
    console.log(`${out}: ${(length + HOLD).toFixed(1)} s, ${colors} colours, ${size} B`)
    if (size <= BUDGET.gif) return
  }
  throw new Error(`${out} stays above ${BUDGET.gif} bytes`)
}

async function main(): Promise<void> {
  await Deno.mkdir(CACHE, { recursive: true })
  const browser = await chromium.launch({
    executablePath: Deno.env.get(`CHROME_PATH`) || undefined,
  })
  const contexts: BrowserContext[] = []
  const dir = await Deno.makeTempDir({ prefix: `readme-pictures-` })
  try {
    const adaContext = await browser.newContext({ baseURL: APP })
    contexts.push(adaContext)
    const ada = await adaContext.newPage()
    await cleanupPeople(ada)
    try {
      const seeded = await seed(browser, contexts, ada)
      // Grace, not Ada, did the weekly shop: the list shows two members with the website's totals
      // and the same number of rows, all of which a 1280×800 window fits with the transfer.
      await operation(seeded.grace, seeded.graceId, `transaction.delete`, {
        groupId: seeded.householdId,
        id: seeded.entryIds[GRACE_ENTRY.memo],
        version: 1,
      })
      await operation(seeded.grace, seeded.graceId, `transaction.create`, {
        id: uuidV7(),
        groupId: seeded.householdId,
        accountId: seeded.salaryId,
        categoryId: seeded.groceriesId,
        kind: 1,
        ...GRACE_ENTRY,
      })
      let accountsDark = ``
      for (const theme of THEMES) {
        for (const screen of SCREENS) {
          const { png, height } = await capture(browser, contexts, seeded, screen, theme)
          const name = `${screen.name}-${theme}`
          const path = await writeStill(name, await rounded(browser, png, height), dir)
          if (name === `accounts-dark`) accountsDark = path
          console.log(`captured ${name}`)
        }
      }
      await socialPreview(browser, accountsDark, dir)
      await toGif(await recordGif(browser, contexts, seeded, dir), dir)
    } finally {
      await cleanupPeople(ada)
    }
  } finally {
    for (const context of contexts) await context.close().catch(() => {})
    await browser.close()
    await Deno.remove(dir, { recursive: true })
  }
  console.log(`Done: ${OUT_DIR}`)
}

if (import.meta.main) await main()
