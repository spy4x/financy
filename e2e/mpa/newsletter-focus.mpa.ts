import { expect, type Page, test } from "@playwright/test"

// "Get notified" leads to the home page's newsletter form, and `/field-focus.js` puts the cursor
// in its email field. Without JavaScript the link only scrolls there (`site.mpa.ts`).

/** The email field has focus, and the form's heading is still on screen above it. */
async function expectReadyToType(page: Page) {
  await expect(page).toHaveURL(/\/#newsletter$/)
  await expect(page.locator("#home-email")).toBeFocused()
  await expect(page.locator("#newsletter-title")).toBeInViewport()
}

test("the header's Get notified on another page lands in the home page's email field", async ({ page }) => {
  await page.goto("/pricing")

  await page.getByRole("banner").getByRole("link", { name: "Get notified" }).click()
  await expectReadyToType(page)
})

test("every Get notified on the home page puts the cursor in the email field, also when the address already ends in #newsletter", async ({ page }) => {
  await page.goto("/")
  const notify = page.getByRole("main").getByRole("link", { name: "Get notified" })
  await expect(notify).toHaveCount(2)
  const header = page.getByRole("banner").getByRole("link", { name: "Get notified" })

  // The hero's, then the cloud card's and the header's, with the address already at the form.
  for (const link of [notify.first(), notify.last(), header]) {
    await page.getByRole("heading", { level: 1 }).click()
    await expect(page.locator("#home-email")).not.toBeFocused()
    await link.click()
    await expectReadyToType(page)
  }
})
