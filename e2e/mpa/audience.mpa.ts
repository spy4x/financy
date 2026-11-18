import { expect, type Page, test } from "@playwright/test"
import { AxeBuilder } from "@axe-core/playwright"

const SLUGS = [`expats`, `couples`, `families`, `small-business`]

/** Runs axe-core over the whole page and returns each violation's rule and the elements it hit. */
async function violations(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).analyze()
  return result.violations.map((v) =>
    `${v.id}: ${v.nodes.map((node) => node.target.join(` `)).join(`, `)}`
  )
}

for (const slug of SLUGS) {
  test.describe(`/for/${slug}`, () => {
    test(`shows the demo button on the first screen of a phone`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`/for/${slug}`)
      await expect(page.getByRole(`heading`, { level: 1 })).toHaveCount(1)
      const demo = page.locator(`[data-e2e=audience-demo]`)
      await expect(demo).toBeInViewport({ ratio: 1 })
      await expect(demo).toHaveAttribute(`data-umami-event-from`, `for-${slug}`)
    })

    test(`never scrolls sideways on a 320 px phone`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 800 })
      await page.goto(`/for/${slug}`)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        320,
      )
    })

    test(`reserves the screenshot's space and loads it`, async ({ page }) => {
      await page.goto(`/for/${slug}`)
      const shot = page.locator(`figure img`)
      await expect(shot).toHaveAttribute(`width`, /\d+/)
      await expect(shot).toHaveAttribute(`height`, /\d+/)
      await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth))
        .toBeGreaterThan(0)
    })

    for (const colorScheme of [`light`, `dark`] as const) {
      test.describe(`in the ${colorScheme} theme`, () => {
        test.use({ colorScheme })

        test(`has no accessibility violations`, async ({ page }) => {
          await page.goto(`/for/${slug}`)
          await expect(page.locator(`html`)).toHaveClass(
            colorScheme === `dark` ? /\bdark\b/ : /^(?!.*\bdark\b)/,
          )
          expect(await violations(page)).toEqual([])
        })
      })
    }
  })
}

test(`the features page links every audience page`, async ({ page }) => {
  await page.goto(`/features`)
  const list = page.locator(`[data-e2e=features-audiences]`)
  for (const slug of SLUGS) await expect(list.locator(`a[href="/for/${slug}"]`)).toHaveCount(1)
})

test(`an unknown audience answers 404 with a way to the features`, async ({ page, request }) => {
  expect((await request.get(`/for/constructor`)).status()).toBe(404)
  await page.goto(`/for/constructor`)
  await expect(page.locator(`[data-e2e=feature-page-missing] a[href="/features"]`)).toBeVisible()
})
