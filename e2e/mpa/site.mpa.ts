import { expect, test } from "@playwright/test"
import { uuidV7 } from "@jsr/spy4x__platform/universal/uuid"

// The public website is plain links and forms: a visitor needs no script to get through it.
test.use({ javaScriptEnabled: false })

test("a visitor without JavaScript reads what Financy is on the home page and subscribes there", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Financy is a free, open-source (AGPL-3.0) finance tracker for a person or a family, in any mix of currencies: self-host it, or use the paid cloud.",
  )

  await page.getByRole("main").getByRole("link", { name: "Get notified" }).click()
  await expect(page).toHaveURL("/#newsletter")
  // A fresh address each run: the per-address limit allows three confirm mails an hour.
  const email = `mpa-site-${uuidV7().slice(-8)}@example.com`
  await page.locator("[data-e2e=home-subscribe-email]").fill(email)
  await page.locator("[data-e2e=home-subscribe-submit]").click()
  // The website answered the post with a redirect, so a reload asks for no second mail.
  await expect(page).toHaveURL("/subscribe?state=sent")
  await expect(page.locator("[data-e2e=subscribe-sent]")).toBeVisible()
})

test("robots.txt points crawlers at a sitemap that lists the features page", async ({ request, baseURL }) => {
  const robots = await request.get("/robots.txt")
  expect(robots.ok()).toBe(true)
  expect(await robots.text()).toContain(`Sitemap: ${new URL(baseURL!).origin}/sitemap.xml`)

  const sitemap = await request.get("/sitemap.xml")
  expect(sitemap.ok()).toBe(true)
  expect(await sitemap.text()).toContain(`<loc>${new URL(baseURL!).origin}/features</loc>`)
})

test("the home page fits a 375 px phone with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto("/")

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})

test("a keyboard user skips the header: the first Tab shows the skip link and Enter lands on the content", async ({ page }) => {
  await page.goto("/privacy")

  await page.keyboard.press("Tab")
  const skip = page.getByRole("link", { name: "Skip to content" })
  await expect(skip).toBeFocused()
  await expect(skip).toBeInViewport()
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/#main$/)
  await expect(page.getByRole("main")).toBeFocused()
})
