import { expect, type Page, test } from "@playwright/test"
import { AxeBuilder } from "@axe-core/playwright"

/** Each comparison, with the other tool's own pages its table says its facts come from. */
const COMPARISONS = [
  {
    slug: `ynab-multiple-currencies`,
    name: `YNAB`,
    checked: `2026-11-19`,
    sources: [
      `https://www.ynab.com/pricing`,
      `https://support.ynab.com/en_us/using-multiple-currencies-in-ynab-a-guide-SyBF6PHno`,
      `https://www.ynab.com/features/subscription-sharing`,
    ],
  },
  {
    slug: `actual-budget`,
    name: `Actual Budget`,
    checked: `2026-11-19`,
    sources: [
      `https://actualbudget.org/docs/budgeting/multi-currency/`,
      `https://actualbudget.org/docs/config/multi-user/`,
      `https://actualbudget.org/`,
      `https://actualbudget.org/docs/advanced/bank-sync/`,
      `https://actualbudget.org/docs/transactions/importing/`,
      `https://actualbudget.org/docs/install/`,
      `https://github.com/actualbudget/actual`,
    ],
  },
  {
    slug: `firefly-iii`,
    name: `Firefly III`,
    checked: `2026-11-18`,
    sources: [
      `https://docs.firefly-iii.org/references/faq/firefly-iii/general/`,
      `https://docs.firefly-iii.org/how-to/firefly-iii/features/currencies/`,
      `https://docs.firefly-iii.org/explanation/financial-concepts/exchange-rates/`,
      `https://docs.firefly-iii.org/tutorials/firefly-iii/importing-data/`,
      `https://github.com/firefly-iii/firefly-iii`,
    ],
  },
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
    test(`the hub lists every comparison with its checked date`, async ({ page }) => {
      await page.goto(`${prefix}/alternatives`)
      await expect(page.locator(`html`)).toHaveAttribute(`dir`, dir)
      await expect(page.getByRole(`heading`, { level: 1 })).toHaveCount(1)
      const items = page.locator(`[data-e2e=alternatives-list] > li`)
      await expect(items).toHaveCount(COMPARISONS.length)
      for (const [index, { slug, checked }] of COMPARISONS.entries()) {
        const item = items.nth(index)
        await expect(item.locator(`a[href="${prefix}/alternatives/${slug}"]`)).toHaveCount(1)
        await expect(item.locator(`time[datetime="${checked}"]`)).toHaveCount(1)
      }
    })

    for (const { slug, name, sources } of COMPARISONS) {
      test(`the ${name} page links every fact to its source and fits a 360 px phone`, async ({ page }) => {
        await page.setViewportSize({ width: 360, height: 800 })
        await page.goto(`${prefix}/alternatives/${slug}`)
        await expect(page.locator(`html`)).toHaveAttribute(`dir`, dir)
        await expect(page.getByRole(`heading`, { level: 1 })).toHaveCount(1)
        await expect(page.locator(`[data-e2e=alternative-answer]`)).toContainText(name)
        const table = page.locator(`table`)
        for (const href of sources) {
          await expect(table.locator(`a[href="${href}"]`).first(), href).toBeVisible()
        }
        // The table scrolls in its own box; the page itself never scrolls sideways.
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          360,
        )
      })
    }

    for (const path of [`/alternatives`, ...COMPARISONS.map((c) => `/alternatives/${c.slug}`)]) {
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
