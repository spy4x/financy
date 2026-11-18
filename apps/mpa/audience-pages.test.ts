import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { App } from "@spy4x/preact-server"
import { PLANS } from "@domain/billing"
import AppWrapper from "./routes/_app.tsx"
import Layout from "./routes/_layout.tsx"
import { handler as audience } from "./routes/[[lang]]/for/[slug].tsx"
import { handler as feature } from "./routes/[[lang]]/features/[slug].tsx"
import { householdValues, planPrice } from "./routes/[[lang]]/pricing.tsx"
import { handler as sitemap } from "./routes/sitemap.xml.ts"
import { AUDIENCE_PAGES as KEYED, audiencePageIn, ECB_CURRENCIES } from "./audience-data.ts"
import { FEATURE_PAGES } from "./features-data.tsx"
import { SITE_PAGES } from "./pages.ts"
import { SITE_LANGUAGES, siteTranslator } from "./languages.ts"
import { pageMiddleware } from "./middleware.ts"
import type { State } from "./utils.ts"
import { siteEnglishText } from "@ui/site-text.ts"

const english = siteEnglishText()
/** The audience pages in English. */
const PAGES = KEYED.map((page) => audiencePageIn(english, page))
const SLUGS = [`expats`, `couples`, `families`, `small-business`]

const site = `https://www.example.com`
const info = {
  remoteAddr: { transport: "tcp", hostname: "192.0.2.7", port: 4000 },
  completed: Promise.resolve(),
} as Deno.ServeHandlerInfo<Deno.NetAddr>

const view = (component: unknown) => component as Parameters<App<State>["appWrapper"]>[0]

const handler = new App<State>()
  .use(
    pageMiddleware(
      { apiUrl: "http://api:8000", webAppOrigin: site, apiOrigin: "https://app.example.com" },
      () => Promise.reject(new Error("the page called the API")),
      () => true,
    ),
  )
  .appWrapper(view(AppWrapper))
  .layout("*", view(Layout))
  .get("/sitemap.xml", sitemap.GET!)
  .get("{/:lang}?/for/:slug", audience.GET!)
  .get("{/:lang}?/features/:slug", feature.GET!)
  .handler()

async function get(path: string) {
  const response = await handler(new Request(`${site}${path}`), info)
  return { status: response.status, html: await response.text() }
}

function jsonLdGraph(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]
    .flatMap((match) => JSON.parse(match[1])["@graph"])
}

/** Text as the HTML escapes it, for a match against the page. */
function escaped(text: string): string {
  return text.replaceAll(`&`, `&amp;`).replaceAll(`"`, `&quot;`)
}

describe("the audience pages", () => {
  it("lists exactly the four audiences, in the order the links show them", () => {
    expect(PAGES.map(({ slug }) => slug)).toEqual(SLUGS)
  })

  it("keeps every title and description short enough for a search result, in every language", () => {
    for (const language of SITE_LANGUAGES) {
      for (const keys of KEYED) {
        const page = audiencePageIn(siteTranslator(language), keys)
        const name = `${language} ${page.slug}`
        expect(`${page.title} · Financy`.length, name).toBeLessThanOrEqual(60)
        expect(page.description.length, name).toBeLessThan(155)
      }
    }
  })

  it("closes each page with two feature pages that exist", () => {
    const slugs = FEATURE_PAGES.map(({ slug }) => slug)
    for (const page of PAGES) {
      for (const slug of page.features) expect(slugs, page.slug).toContain(slug)
    }
  })

  it("lists the European Central Bank's 29 quoted currencies and the euro", () => {
    expect(ECB_CURRENCIES.length).toBe(30)
    expect(new Set(ECB_CURRENCIES).size).toBe(30)
    expect(ECB_CURRENCIES).toContain(`EUR`)
    // The page promises only what the free daily rates cover.
    expect(ECB_CURRENCIES).not.toContain(`VND`)
  })

  for (const keys of KEYED) {
    const page = audiencePageIn(english, keys)
    describe(`/for/${page.slug}`, () => {
      it("answers with its heading, its answer and every section in order", async () => {
        const { status, html } = await get(`/for/${page.slug}`)
        expect(status).toBe(200)
        const order = [
          escaped(page.h1),
          escaped(page.answer),
          `data-e2e="audience-demo"`,
          `data-e2e="audience-updated"`,
          `/shots/${page.shot.name}-`,
          `id="how"`,
          `id="${page.block.id}"`,
          `id="limits"`,
          `id="questions"`,
          `data-e2e="audience-demo-end"`,
          `feature-${page.features[0]}`,
          `data-e2e="audience-also"`,
        ]
        const positions = order.map((text) => html.indexOf(text))
        for (const [index, position] of positions.entries()) {
          expect(position, order[index]).toBeGreaterThan(-1)
        }
        expect(positions).toEqual(positions.toSorted((a, b) => a - b))
      })

      it("counts both demo buttons as try-demo from this page", async () => {
        const { html } = await get(`/for/${page.slug}`)
        const buttons = html.match(/<a[^>]*data-e2e="audience-demo(-end)?"[^>]*>/g) ?? []
        expect(buttons.length).toBe(2)
        for (const button of buttons) {
          expect(button).toContain(`data-umami-event="try-demo"`)
          expect(button).toContain(`data-umami-event-from="for-${page.slug}"`)
        }
      })

      it("links the other three audience pages and never itself", async () => {
        const { html } = await get(`/for/${page.slug}`)
        const also = html.slice(html.indexOf(`data-e2e="audience-also"`))
        const nav = also.slice(0, also.indexOf(`</nav>`))
        for (const slug of SLUGS) {
          expect(nav.includes(`href="/for/${slug}"`), slug).toBe(slug !== page.slug)
        }
      })

      it("describes itself as a page, a two-level trail, questions and the software", async () => {
        const graph = jsonLdGraph((await get(`/for/${page.slug}`)).html)
        const types = graph.flatMap((node) => node["@type"])
        for (const type of [`WebPage`, `BreadcrumbList`, `FAQPage`, `SoftwareApplication`]) {
          expect(types, type).toContain(type)
        }
        const trail = graph.find((node) => node["@type"] === `BreadcrumbList`)
        expect((trail?.itemListElement as unknown[]).length).toBe(2)
      })

      it("is listed in the sitemap", async () => {
        expect(SITE_PAGES.map(({ path }) => path)).toContain(`/for/${page.slug}`)
        const { html: xml } = await get(`/sitemap.xml`)
        expect(xml).toContain(`<loc>${site}/for/${page.slug}</loc>`)
      })

      it("is linked from the footer", async () => {
        const { html } = await get(`/features/multi-currency`)
        expect(html).toContain(`href="/for/${page.slug}"`)
      })
    })
  }

  it("says the small-business page is not accounting software right after the answer", async () => {
    const page = PAGES.find(({ slug }) => slug === `small-business`)!
    const { html } = await get(`/for/small-business`)
    const answer = html.indexOf(`data-e2e="audience-answer"`)
    const disclaimer = html.indexOf(`data-e2e="audience-disclaimer"`)
    const demo = html.indexOf(`data-e2e="audience-demo"`)
    expect(page.disclaimer).toContain(`not accounting software`)
    expect(html).toContain(escaped(page.disclaimer!))
    expect(answer).toBeLessThan(disclaimer)
    expect(disclaimer).toBeLessThan(demo)
  })

  it("shows the couples page the Household plan's current prices", async () => {
    const plan = PLANS.find(({ yearlyAmount }) => yearlyAmount) as {
      amount: number
      yearlyAmount: number
    }
    const { amount, yearlyAmount } = plan
    try {
      plan.amount = amount + 700
      plan.yearlyAmount = yearlyAmount + 9_300
      const { html } = await get(`/for/couples`)
      expect(html).toContain(planPrice(plan.amount, `USD`, `en`))
      expect(html).toContain(planPrice(plan.yearlyAmount, `USD`, `en`))
    } finally {
      plan.amount = amount
      plan.yearlyAmount = yearlyAmount
    }
  })

  it("isolates the price in Arabic, so the currency sign stays beside its number", async () => {
    const plan = PLANS.find(({ yearlyAmount }) => yearlyAmount)!
    const { html: arabic } = await get(`/ar/for/couples`)
    expect(arabic).toContain(`\u2066${planPrice(plan.amount, `USD`, `ar`)}\u2069`)
    const { html: english } = await get(`/for/couples`)
    expect(english).not.toContain(`\u2066`)
  })

  it("leaves the prices of every left-to-right language exactly as formatted", () => {
    const plan = PLANS.find(({ yearlyAmount }) => yearlyAmount)!
    for (const language of SITE_LANGUAGES.filter((language) => language !== `ar`)) {
      const { monthly, yearly } = householdValues(language)
      expect(monthly, language).toBe(planPrice(plan.amount, `USD`, language))
      expect(yearly, language).toBe(planPrice(plan.yearlyAmount!, `USD`, language))
    }
  })

  it("keeps audience slugs out of the feature pages", async () => {
    for (const slug of SLUGS) expect((await get(`/features/${slug}`)).status, slug).toBe(404)
  })

  for (const slug of [`constructor`, `__proto__`, `nobody`]) {
    it(`answers 404 with a way to the features for /for/${slug}`, async () => {
      const { status, html } = await get(`/for/${slug}`)
      expect(status).toBe(404)
      expect(html).toContain(`data-e2e="feature-page-missing"`)
      expect(html).toContain(`href="/features"`)
    })
  }
})
