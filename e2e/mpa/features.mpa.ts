import { expect, type Page, test } from "@playwright/test"
import { AxeBuilder } from "@axe-core/playwright"

const REPOSITORY = `https://github.com/spy4x/financy`
/** The repository root, where each code link's path must exist. */
const ROOT = new URL(`../../`, import.meta.url)
/** The sections of `/features`: what works today, then the questions. */
const SECTIONS = [
  `sign-in`,
  `teams`,
  `realtime`,
  `offline`,
  `export`,
  `languages`,
  `deploy`,
  `faq`,
] as const

/** Runs axe-core over the whole page and returns each violation's rule and the elements it hit. */
async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).analyze()
  return result.violations.map((v) =>
    `${v.id}: ${v.nodes.map((node) => node.target.join(` `)).join(`, `)}`
  )
}

test.describe(`without JavaScript`, () => {
  test.use({ javaScriptEnabled: false })

  test(`the features page shows its heading and every in-page link lands on a section`, async ({ page }) => {
    await page.goto(`/features`)
    await expect(page.getByRole(`heading`, { level: 1 })).toHaveText(
      `What Financy does today, and what comes next`,
    )

    const hrefs = await page.getByRole(`navigation`, { name: `On this page` }).getByRole(`link`)
      .evaluateAll((links) => links.map((link) => link.getAttribute(`href`)!))
    expect(hrefs).toEqual(SECTIONS.map((id) => `#${id}`))
    for (const href of hrefs) {
      await expect(page.locator(`section${href}`), href).toHaveCount(1)
    }
  })

  test(`every code link points at a file or folder that exists in the repository`, async ({ page }) => {
    await page.goto(`/features`)
    const hrefs = await page.locator(`[data-e2e=feature-code-link]`)
      .evaluateAll((links) => links.map((link) => link.getAttribute(`href`)!))
    expect(hrefs.length).toBe(SECTIONS.length - 1)
    for (const href of hrefs) {
      const match = href.match(new RegExp(`^${REPOSITORY}/(tree|blob)/main/(.+)$`))
      expect(match, href).not.toBeNull()
      const info = Deno.statSync(new URL(match![2], ROOT))
      expect(info.isDirectory, href).toBe(match![1] === `tree`)
    }
    expect(hrefs.every((href) => href.startsWith(REPOSITORY))).toBe(true)
  })

  test(`the admin panel's old screenshots are gone`, async ({ page }) => {
    for (const theme of [`light`, `dark`]) {
      for (const width of [1280, 640]) {
        const path = `/shots/admin-overview-${theme}-${width}.webp`
        expect((await page.request.get(path)).status(), path).toBe(404)
      }
    }
  })

  test(`the features page fits a 375 px phone with no sideways scroll`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`/features`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  })
})

// Through the built server's own routing, which a unit test that calls a handler cannot see.
for (const path of [`/compare`, `/admin`, `/mvp`, `/features/admin`, `/de/compare`, `/de/admin`]) {
  test(`${path} answers a plain 404`, async ({ request }) => {
    const response = await request.get(path, { maxRedirects: 0 })

    expect(response.status()).toBe(404)
  })
}

/** The three feature loops, the page each plays on, and the name its play button carries. */
const LOOPS = [
  [`realtime`, `/features/realtime`, `Realtime sync`],
  [`offline`, `/features/offline`, `Offline editing`],
  [`shortcuts`, `/features/shortcuts`, `Keyboard shortcuts`],
] as const

for (const [loop, path, name] of LOOPS) {
  test(`${path} plays the ${loop} loop, captioned, with a button that names it`, async ({ page }) => {
    await page.goto(path)
    const figure = page.locator(`[data-e2e=loop-${loop}]`)
    await expect(figure.locator(`figcaption`)).not.toBeEmpty()
    await expect(figure.locator(`img`)).toHaveAttribute(
      `src`,
      new RegExp(`/video/${loop}-loop-dark-`),
    )
    await expect(figure.getByRole(`button`, { name: new RegExp(`: ${name}$`) })).toBeVisible()
  })
}

test(`the video route answers a byte range of every loop and of the demo video`, async ({ request }) => {
  const files = [
    ...LOOPS.flatMap(([loop]) => [`webm`, `mp4`].map((ext) => `${loop}-loop-dark.${ext}`)),
    `demo.webm`,
    `demo.mp4`,
  ]
  for (const name of files) {
    const response = await request.get(`/video/${name}`, { headers: { Range: `bytes=0-99` } })
    expect(response.status(), name).toBe(206)
    expect((await response.body()).byteLength, name).toBe(100)
  }
})

test.describe(`a screenshot's lightbox`, () => {
  test.use({ colorScheme: `dark` })

  test(`opens the widest file of the page's theme from the keyboard and gives focus back`, async ({ page }) => {
    await page.goto(`/features/sign-in`)
    const shot = page.getByRole(`button`, { name: /^Zoom: / }).first()
    await shot.focus()
    await page.keyboard.press(`Enter`)

    const viewer = page.getByRole(`dialog`)
    await expect(viewer).toBeVisible()
    await expect(viewer.locator(`img`)).toHaveAttribute(`src`, /-dark-1280\.webp(\?|$)/)
    await page.keyboard.press(`Escape`)
    await expect(viewer).toBeHidden()
    await expect(shot).toBeFocused()
  })

  test(`never zooms a feature loop's poster`, async ({ page }) => {
    for (const [loop, path] of LOOPS) {
      await page.goto(path)
      const figure = page.locator(`[data-e2e=loop-${loop}]`)
      await expect(figure.locator(`img`).first()).toBeAttached()
      // Once the clip is live the poster is hidden from the accessibility tree, so the zoom marks
      // are read off the element: a zoomable image is a Tab stop with a button's role.
      await expect(figure.locator(`img[role=button], img[tabindex]`)).toHaveCount(0)
    }
  })

  // A feature page loads the lightbox only when its picture is a screenshot: deploy draws a diagram.
  for (
    const [path, loads] of [[`/pricing`, false], [`/features/deploy`, false], [
      `/features/sign-in`,
      true,
    ]] as const
  ) {
    test(`${path} ${loads ? `loads` : `does not load`} the lightbox's JavaScript`, async ({ page }) => {
      const asked: string[] = []
      page.on(`request`, (request) => asked.push(request.url()))
      await page.goto(path, { waitUntil: `networkidle` })
      expect(asked.some((url) => url.includes(`shot_lightbox`))).toBe(loads)
    })
  }
})

// axe-core runs as a script in the page, so these checks keep JavaScript on: /theme.js then picks
// the theme the device asks for, as it does for most visitors.
for (const scheme of [`light`, `dark`] as const) {
  test.describe(`in the ${scheme} theme`, () => {
    test.use({ colorScheme: scheme })

    for (const width of [375, 1280]) {
      test(`axe finds no accessibility problem in the ${scheme} theme at ${width} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`/features`)
        // The dark tokens apply once /theme.js marks the root; check the page that people see.
        const root = expect(page.locator(`html`))
        await (scheme === `dark` ? root : root.not).toHaveClass(/\bdark\b/)
        expect(await violations(page)).toEqual([])
      })
    }
  })
}
