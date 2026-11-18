import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { App } from "@spy4x/preact-server"
import AppWrapper from "./routes/_app.tsx"
import Layout from "./routes/_layout.tsx"
import { handler as hub } from "./routes/[[lang]]/alternatives/index.tsx"
import { handler as comparison } from "./routes/[[lang]]/alternatives/[slug].tsx"
import { handler as feature } from "./routes/[[lang]]/features/[slug].tsx"
import { alternativeIn, ALTERNATIVES as KEYED, ALTERNATIVES_UPDATED } from "./alternatives-data.ts"
import { SITE_PAGES } from "./pages.ts"
import { SITE_LANGUAGES, siteTranslator } from "./languages.ts"
import { pageMiddleware } from "./middleware.ts"
import type { State } from "./utils.ts"
import { siteEnglishText } from "@ui/site-text.ts"
import { importKindView } from "@ui/import-kinds.ts"

const english = siteEnglishText()
/** The comparisons in English. */
const ALTERNATIVES = KEYED.map((page) => alternativeIn(english, page))

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
  .get("{/:lang}?/alternatives", hub.GET!)
  .get("{/:lang}?/alternatives/:slug", comparison.GET!)
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
  return text.replaceAll(`&`, `&amp;`).replaceAll(`'`, `&#39;`).replaceAll(`"`, `&quot;`)
}

describe("the comparison pages", () => {
  it("gives every row a source on the other tool's own https site, never on Financy's", () => {
    for (const page of KEYED) {
      for (const row of page.rows) {
        const label = `${page.slug}: ${row.capability}`
        expect(row.source?.label, label).toBeTruthy()
        const url = new URL(row.source?.href ?? ``)
        expect(url.protocol, label).toBe(`https:`)
        expect(url.hostname, label).not.toMatch(/(^|\.)financy\.dev$/)
      }
      for (const [tag, href] of Object.entries(page.betterLinks)) {
        expect(new URL(href).protocol, `${page.slug} ${tag}`).toBe(`https:`)
      }
    }
  })

  it("draws every row's source as a link in the table", async () => {
    for (const page of ALTERNATIVES) {
      const { html } = await get(`/alternatives/${page.slug}`)
      for (const row of page.rows) {
        expect(html, row.capability).toContain(`href="${row.source.href}"`)
        expect(html, row.capability).toContain(escaped(row.source.label))
      }
    }
  })

  it("names the other tool in the answer's first sentence, in every language", () => {
    for (const language of SITE_LANGUAGES) {
      for (const page of KEYED.map((keys) => alternativeIn(siteTranslator(language), keys))) {
        const first = page.answer.split(/(?<=[.。!?؟])\s*/)[0]
        expect(first, `${language} ${page.slug}: ${page.answer}`).toContain(page.competitor)
      }
    }
  })

  it("lists the hub and every comparison in the page list, dated by the day its rows were checked", () => {
    const listed = new Map(SITE_PAGES.map((page) => [page.path, page.updated]))

    expect(listed.get(`/alternatives`)).toBe(ALTERNATIVES_UPDATED)
    for (const page of KEYED) {
      expect(listed.get(`/alternatives/${page.slug}`), page.slug).toBe(page.checked)
    }
    expect(ALTERNATIVES_UPDATED).toBe(`2026-11-18`)
  })

  it("answers an unknown comparison, or a property every object has, with the feature pages' 404", async () => {
    for (
      const path of [`/alternatives/ynab-x`, `/de/alternatives/nope`, `/alternatives/constructor`]
    ) {
      const { status, html } = await get(path)
      expect(status, path).toBe(404)
      expect(html, path).toContain(`data-e2e="feature-page-missing"`)
    }
  })

  it("describes each page with exactly its visible questions, its trail and its checked date", async () => {
    for (const page of ALTERNATIVES) {
      const { html } = await get(`/alternatives/${page.slug}`)
      const graph = jsonLdGraph(html)
      const faq = graph.find((entity) => entity["@type"] === `FAQPage`) as {
        mainEntity: { name: string; acceptedAnswer: { text: string } }[]
      }
      const questions = html.match(/<section id="questions"[\s\S]*?<\/section>/)?.[0] ?? ``
      const visible = [...questions.matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>/g)]
        .map((match) => match[1].replace(/<[^>]+>/g, ``).trim())

      expect(visible.length, page.slug).toBe(page.questions.length)
      expect(faq.mainEntity.map(({ name }) => escaped(name))).toEqual(visible)
      expect(faq.mainEntity.map(({ acceptedAnswer }) => acceptedAnswer.text))
        .toEqual(page.questions.map(({ answer }) => answer))
      const webPage = graph.find((entity) => entity["@type"] === `WebPage`)!
      expect(webPage.dateModified, page.slug).toBe(page.checked)
      const trail = graph.find((entity) => entity["@type"] === `BreadcrumbList`) as {
        itemListElement: { name: string }[]
      }
      expect(trail.itemListElement.map(({ name }) => name)).toEqual(
        [`Financy`, `Alternatives`, page.competitor],
      )
      expect(graph.map((entity) => entity["@type"])).not.toContain(`Review`)
      expect(html).not.toContain(`AggregateRating`)
    }
  })

  it("describes the hub as a collection that lists every comparison", async () => {
    const graph = jsonLdGraph((await get(`/de/alternatives`)).html)
    const collection = graph.find((entity) => entity["@type"] === `CollectionPage`)!
    const list = graph.find((entity) => entity["@type"] === `ItemList`) as {
      "@id": string
      itemListElement: { url: string }[]
    }

    expect(collection.mainEntity).toEqual({ "@id": list["@id"] })
    expect(collection.dateModified).toBe(ALTERNATIVES_UPDATED)
    expect(list.itemListElement.map(({ url }) => url)).toEqual(
      KEYED.map(({ slug }) => `${site}/de/alternatives/${slug}`),
    )
  })

  it("lists each comparison on the hub with its title as a link and its checked date", async () => {
    const { status, html } = await get(`/alternatives`)

    expect(status).toBe(200)
    for (const page of ALTERNATIVES) {
      expect(html).toMatch(
        new RegExp(`<a href="/alternatives/${page.slug}"[^>]*>${escaped(page.title)}</a>`),
      )
      expect(html).toContain(`<time datetime="${page.checked}">`)
    }
  })

  it("keeps each title under 60 characters with the site's name, and each description under 155, in every language", () => {
    for (const language of SITE_LANGUAGES) {
      const t = siteTranslator(language)
      const hub = {
        slug: `hub`,
        title: t.t(`Alternatives.title`),
        description: t.t(`Alternatives.description`),
      }
      for (const page of [hub, ...KEYED.map((keys) => alternativeIn(t, keys))]) {
        const label = `${language} ${page.slug}`
        const title = page.title.includes(`Financy`) ? page.title : `${page.title} · Financy`
        expect(title.length, `${label}: ${title}`).toBeLessThan(60)
        expect(page.description.length, `${label}: ${page.description}`).toBeLessThan(155)
      }
    }
  })

  it("claims statement import for Financy only once the app has a screen for it", () => {
    const row = KEYED.flatMap((page) => page.rows)
      .find((row) => row.capability === `AlternativeFirefly.rowImport`)
    const screen = importKindView(`bank-statement`, true)
    expect(row?.values[0]).toBe(screen === null ? `no` : `yes`)
  })

  it("links back from each feature page a comparison names, in the page's language", async () => {
    for (const page of KEYED) {
      for (const slug of page.features) {
        const { html } = await get(`/fr/features/${slug}`)
        const line = html.match(/data-e2e="feature-page-comparison"[\s\S]*?<\/p>/)?.[0] ?? ``
        expect(line, slug).toContain(`href="/fr/alternatives/${page.slug}"`)
        expect(line, slug).toContain(page.competitor)
      }
    }
    const { html } = await get(`/features/live-sync`)
    expect(html).not.toContain(`data-e2e="feature-page-comparison"`)
  })
})
