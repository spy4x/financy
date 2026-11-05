import { expect, type Page, test } from "@playwright/test"
import { watchCspViolations } from "../fixtures/csp.ts"

/**
 * The website's analytics against the stand-in tracker `spa-shell.ts` serves at
 * `MPA_UMAMI_ORIGIN` (`e2e/mpa/run.sh`), which keeps every `umami.track` call in `__umamiEvents`.
 * Clicks and submits are stopped before they navigate, so the calls stay readable.
 */

const UMAMI = Deno.env.get("MPA_UMAMI_ORIGIN")!

interface Tracked {
  name: string
  data?: Record<string, unknown>
}

function events(page: Page): Promise<Tracked[]> {
  return page.evaluate(() =>
    (globalThis as unknown as { __umamiEvents?: Tracked[] }).__umamiEvents ?? []
  )
}

/**
 * Keeps the page where it is after a click on a link, or after a submit, once the website's own
 * listeners (which run first, in the capture phase) have seen it.
 */
function stayOnPage(page: Page, type: "click" | "submit"): Promise<void> {
  return page.evaluate((type) => {
    document.addEventListener(type, (event) => event.preventDefault())
  }, type)
}

test("a page loads the tracker from the Umami origin and the website's own events, with no refusal", async ({ context, page }) => {
  const violations = await watchCspViolations(context)
  await page.goto("/")

  const tracker = page.locator(`script[src="${UMAMI}/script.js"]`)
  await expect(tracker).toHaveAttribute("data-do-not-track", "true")
  await expect(tracker).toHaveAttribute("data-domains", new URL(page.url()).hostname)
  await expect(page.locator(`script[src="/analytics.js"]`)).toHaveCount(1)
  // The stand-in ran, so the policy let the tracker in.
  await expect.poll(() =>
    page.evaluate(() => typeof (globalThis as unknown as { umami?: unknown }).umami)
  ).toBe("object")
  expect(violations).toEqual([])
})

// The shared header takes no `data-umami-event`, so `/analytics.js` names its links by where they go.
test("counts the shared header's GitHub and Docs links as clicked in the header", async ({ page }) => {
  await page.goto("/")
  await stayOnPage(page, "click")
  await page.getByRole("navigation", { name: "Main navigation" }).first()
    .getByRole("link", { name: "GitHub" }).click()
  await page.getByRole("navigation", { name: "Main navigation" }).first()
    .getByRole("link", { name: "Docs" }).click()

  expect(await events(page)).toEqual([
    { name: "github", data: { from: "header" } },
    { name: "internal-link", data: { to: "/docs", from: "header" } },
  ])
})

test("counts the 404 page once it has loaded", async ({ page }) => {
  await page.goto("/no-such-page")

  await expect.poll(() => events(page)).toEqual([
    { name: "not-found", data: { path: "/no-such-page" } },
  ])
})

test("loads no tracker on a page whose address carries a newsletter token", async ({ page }) => {
  await page.goto("/unsubscribe?list=news&token=not-a-real-token")

  await expect(page.locator(`script[src="${UMAMI}/script.js"]`)).toHaveCount(0)
  await expect(page.locator(`script[src="/analytics.js"]`)).toHaveCount(0)
})
