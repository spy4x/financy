import { expect, type Page, test } from "@playwright/test"
import { AxeBuilder } from "@axe-core/playwright"

/** Where each Firefly III row of the table says its fact comes from: Firefly III's own pages. */
const SOURCES = [
  `https://docs.firefly-iii.org/references/faq/firefly-iii/general/`,
  `https://docs.firefly-iii.org/how-to/firefly-iii/features/currencies/`,
  `https://docs.firefly-iii.org/explanation/financial-concepts/exchange-rates/`,
  `https://docs.firefly-iii.org/how-to/data-importer/import/csv/`,
  `https://github.com/firefly-iii/firefly-iii`,
]
/** English and the one right-to-left language: each prefix the pages are checked under. */
const LANGUAGES = [{ prefix: ``, dir: `ltr` }, { prefix: `/ar`, dir: `rtl` }] as const

/** Runs axe-core over the whole page and returns each violation's rule and the elements it hit. */
async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).analyze()
  return result.violations.map((v) =>
    `${v.id}: ${v.nodes.map((node) => node.target.join(` `)).join(`, `)}`
  )
}

for (const { prefix, dir } of LANGUAGES) {
  test.describe(`in ${prefix || `English`}`, () => {
    test(`the hub lists the Firefly III comparison with its checked date`, async ({ page }) => {
      await page.goto(`${prefix}/alternatives`)
      await expect(page.locator(`html`)).toHaveAttribute(`dir`, dir)
      await expect(page.getByRole(`heading`, { level: 1 })).toHaveCount(1)
      const list = page.locator(`[data-e2e=alternatives-list]`)
      await expect(list.locator(`a[href="${prefix}/alternatives/firefly-iii"]`)).toHaveCount(1)
      await expect(list.locator(`time[datetime="2026-11-18"]`)).toHaveCount(1)
    })

    test(`the Firefly III page links every fact to its source and fits a 360 px phone`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 })
      await page.goto(`${prefix}/alternatives/firefly-iii`)
      await expect(page.locator(`html`)).toHaveAttribute(`dir`, dir)
      await expect(page.getByRole(`heading`, { level: 1 })).toHaveCount(1)
      await expect(page.locator(`[data-e2e=alternative-answer]`)).toContainText(`Firefly III`)
      const table = page.locator(`table`)
      for (const href of SOURCES) {
        await expect(table.locator(`a[href="${href}"]`).first(), href).toBeVisible()
      }
      // The table scrolls in its own box; the page itself never scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        360,
      )
    })

    for (const path of [`/alternatives`, `/alternatives/firefly-iii`]) {
      for (const scheme of [`light`, `dark`] as const) {
        test.describe(`in the ${scheme} theme`, () => {
          test.use({ colorScheme: scheme })

          test(`axe finds no accessibility problem on ${prefix}${path} in the ${scheme} theme`, async ({ page }) => {
            await page.goto(`${prefix}${path}`)
            // The dark tokens apply once /theme.js marks the root; check the page people see.
            const root = expect(page.locator(`html`))
            await (scheme === `dark` ? root : root.not).toHaveClass(/\bdark\b/)
            expect(await violations(page)).toEqual([])
          })
        })
      }
    }
  })
}

// Through the built server's own routing, which a unit test that calls a handler cannot see.
for (const path of [`/alternatives/ynab`, `/ar/alternatives/nope`]) {
  test(`${path} answers a 404`, async ({ request }) => {
    expect((await request.get(path, { maxRedirects: 0 })).status()).toBe(404)
  })
}
