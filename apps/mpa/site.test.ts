import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { App } from "@spy4x/preact-server"
import { h } from "preact"
import { renderToString } from "preact-render-to-string"
import AppWrapper from "./routes/_app.tsx"
import Layout from "./routes/_layout.tsx"
import Features from "./routes/[[lang]]/features.tsx"
import { handler as featurePage } from "./routes/[[lang]]/features/[slug].tsx"
import Home, { HOME_HEAD, STATUS_UPDATED } from "./routes/index.tsx"
import Pricing, { PRICING_UPDATED } from "./routes/[[lang]]/pricing.tsx"
import Privacy, { PRIVACY_HEAD } from "./routes/[[lang]]/privacy.tsx"
import Terms, { TERMS_HEAD } from "./routes/[[lang]]/terms.tsx"
import ApiDocs from "./routes/[[lang]]/docs/api.tsx"
import DocsIndex from "./routes/[[lang]]/docs/index.tsx"
import { handler as doc } from "./routes/[[lang]]/docs/[slug].tsx"
import { handler as changelog } from "./routes/[[lang]]/changelog.tsx"
import { handler as changelogFeed } from "./routes/changelog.xml.ts"
import { handler as robots } from "./routes/robots.txt.ts"
import { handler as subscribe } from "./routes/[[lang]]/subscribe/index.ts"
import { handler as theme } from "./routes/theme.js.ts"
import { handler as sitemap } from "./routes/sitemap.xml.ts"
import { handler as llms } from "./routes/llms.txt.ts"
import { handler as unsubscribe } from "./routes/[[lang]]/unsubscribe.ts"
import { languageMiddleware, pageMiddleware } from "./middleware.ts"
import { machineText, ogImageAlt, type OgImageKey, REPOSITORY_URL } from "./site.tsx"
import { NotYetList } from "./components/features-section.tsx"
import { SiteLanguage } from "./use-site.tsx"
import { SITE_PAGES, type SitePage } from "./pages.ts"
import { DOC_SLUGS } from "./docs-site.ts"
import { localePath, pathLanguage, SITE_LANGUAGES, siteTranslator } from "./languages.ts"
import type { MpaConfig } from "./config.ts"
import type { State } from "./utils.ts"

/** Every address of `pages` the sitemap lists, in its order: each language of a translated page. */
const everyLanguage = (pages: readonly SitePage[]) =>
  pages.flatMap(({ path, oneLanguage }) =>
    oneLanguage ? [path] : SITE_LANGUAGES.map((language) => localePath(language, path))
  )

/** The website on its own domain, so a link to the website and a link to the SPA differ. */
const config = {
  apiUrl: "http://api:8000",
  webAppOrigin: "https://www.example.com",
  apiOrigin: "https://app.example.com",
}
const site = config.webAppOrigin
const spa = config.apiOrigin
const info = {
  remoteAddr: { transport: "tcp", hostname: "192.0.2.7", port: 4000 },
  completed: Promise.resolve(),
} as Deno.ServeHandlerInfo<Deno.NetAddr>

const neverCalled = () => Promise.reject(new Error("the website called the API"))

/** A page component, typed for `App.route`: `define.page` types its props for one handler. */
const view = (component: unknown) => component as Parameters<App<State>["appWrapper"]>[0]

/** The website's pages behind its middleware and its `_app` document, as in production. */
function siteWith(newsletter: () => boolean, siteConfig: MpaConfig = config) {
  return new App<State>()
    .use(pageMiddleware(siteConfig, neverCalled, newsletter))
    .appWrapper(view(AppWrapper))
    .layout("*", view(Layout))
    .route("/", { component: view(Home) })
    .route("/features", { component: view(Features) })
    .get("{/:lang}?/features/:slug", featurePage.GET!)
    .route("/pricing", { component: view(Pricing) })
    .route("/privacy", { component: view(Privacy) })
    .route("/docs/api", { component: view(ApiDocs) })
    .route("/docs", { component: view(DocsIndex) })
    .get("/docs/:slug", doc.GET!)
    .get("/:lang/docs/:slug", doc.GET!)
    .get("/changelog", changelog.GET!)
    .get("/changelog.xml", changelogFeed.GET!)
    .route("/terms", { component: view(Terms) })
    .get("/subscribe", subscribe.GET!)
    .get("/robots.txt", robots.GET!)
    .get("/theme.js", theme.GET!)
    .get("/sitemap.xml", sitemap.GET!)
    .get("/llms.txt", llms.GET!)
    .get("/unsubscribe", unsubscribe.GET!)
    // Last: the server takes the first route that fits, and `/:lang` fits `/llms.txt` too.
    .route("/:lang", { component: view(Home) }, { middlewares: [languageMiddleware] })
    .handler()
}
const handler = siteWith(() => true)
/** The same website while the API takes no subscriptions. */
const withoutNewsletter = siteWith(() => false)
/** The same website counting visits in a Umami. */
const UMAMI = {
  origin: "https://stats.example.com",
  websiteId: "0199f1a2-0000-7000-8000-000000000001",
}
const withAnalytics = siteWith(() => true, { ...config, analytics: UMAMI })

async function page(path: string, app = handler): Promise<{ status: number; html: string }> {
  const response = await app(new Request(`${site}${path}`), info)
  return { status: response.status, html: await response.text() }
}

/** The `<a>` whose text is `text`, or `undefined`: its whole opening tag, to read `href` from. */
function linkNamed(html: string, text: string): string | undefined {
  return [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
    .find((match) => linkText(match[1]) === text)?.[0]
}

/** A link's text as a reader hears it: its tags dropped and its whitespace collapsed. */
function linkText(inner: string): string {
  return inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

function hrefOf(tag: string | undefined): string | undefined {
  return tag?.match(/href="([^"]*)"/)?.[1]
}

function headingOne(html: string): string | undefined {
  return html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)?.[1].replace(/<[^>]+>/g, "").trim()
}

/** The `content` of the `<meta>` whose `property` or `name` is `key`. */
function metaContent(html: string, key: string): string | undefined {
  // The text a reader sees, so a quote in a description counts as one character, not as `&quot;`.
  return html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1]
    .replaceAll("&quot;", `"`).replaceAll("&#39;", "'").replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">").replaceAll("&amp;", "&")
}

/** The entities of the page's JSON-LD `@graph`, or none when the page has no structured data. */
function jsonLdGraph(html: string): Record<string, unknown>[] {
  const scripts = [
    ...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
  ]
  return scripts.flatMap((match) => JSON.parse(match[1])["@graph"])
}

/** Whether a JSON-LD entity has the type `type`, alone or among several. */
function isType(entity: Record<string, unknown>, type: string): boolean {
  return [entity["@type"]].flat().includes(type)
}

/**
 * Every `@id` a graph defines (an object with more than its id) and every one it only points at
 * (an object that holds nothing but `@id`), at any depth.
 */
function graphIds(graph: unknown): { defined: Set<string>; referenced: Set<string> } {
  const defined = new Set<string>()
  const referenced = new Set<string>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!value || typeof value !== "object") return
    const record = value as Record<string, unknown>
    if (typeof record["@id"] === "string") {
      ;(Object.keys(record).length === 1 ? referenced : defined).add(record["@id"])
    }
    Object.values(record).forEach(walk)
  }
  walk(graph)
  return { defined, referenced }
}

/** The markup between the first opening `<tag` and its matching close, for a tag never nested. */
function element(html: string, tag: string): string | undefined {
  return html.match(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`))?.[0]
}

describe("the public website", () => {
  it("answers the home page with what Financy is as its heading, the notify and GitHub links and its head tags", async () => {
    const { status, html } = await page("/")
    const main = element(html, "main")!

    expect(status).toBe(200)
    expect(headingOne(html)).toBe(
      "Financy is a free, open-source (AGPL\u20113.0) finance tracker for a person or a family, in any mix of currencies: self-host it, or wait for the paid cloud.",
    )
    expect(hrefOf(linkNamed(main, "Get notified"))).toBe("#newsletter")
    expect(hrefOf(linkNamed(main, "Follow the build on GitHub"))).toBe(REPOSITORY_URL)
    expect(html).toContain(`<title>Financy: self-hosted multi-currency finance tracker</title>`)
    expect(html).toContain(`<link rel="canonical" href="${site}/"`)
    expect(metaContent(html, "og:url")).toBe(`${site}/`)
    expect(metaContent(html, "description")).toBe(machineText(HOME_HEAD.description))
    expect(html.match(/<title>/g)).toHaveLength(1)
  })

  it("opens the home page with the sentence that says what Financy is, in every language", async () => {
    for (const language of SITE_LANGUAGES) {
      const path = localePath(language, "/")
      const { status, html } = await page(path)
      const heading = headingOne(html)?.replaceAll("&#39;", "'").replaceAll("&quot;", '"')

      expect(status, path).toBe(200)
      expect(heading, path).toBe(siteTranslator(language).t(`HomeHero.title`))
      expect(heading, path).toContain("Financy")
      expect(heading, path).toContain("AGPL\u20113.0")
    }
  })

  it("answers the home page with GitHub as its only action while the newsletter is off", async () => {
    const { html } = await page("/", withoutNewsletter)
    const main = element(html, "main")!

    expect(linkNamed(html, "Get notified")).toBeUndefined()
    expect(main).not.toContain(`id="newsletter"`)
    expect(hrefOf(linkNamed(main, "Follow the build on GitHub"))).toBe(REPOSITORY_URL)
  })

  it("labels the header button just GitHub, in every language, while the newsletter is off", async () => {
    for (const language of SITE_LANGUAGES) {
      const { html } = await page(localePath(language, "/"), withoutNewsletter)
      const button = element(html, "header")!
        .match(/<a\b[^>]*data-e2e="site-github"[^>]*>([\s\S]*?)<\/a>/)

      expect(hrefOf(button?.[0]), language).toBe(REPOSITORY_URL)
      expect(linkText(button?.[1] ?? ""), language).toBe("GitHub")
    }
  })

  // Their 404 comes from the built server's routing, which e2e/mpa/features.mpa.ts walks.
  it("links /compare, /admin and /mvp from no page, in any language", async () => {
    for (const path of everyLanguage(SITE_PAGES)) {
      const { html } = await page(path)
      expect(html, path).not.toMatch(/href="[^"]*\/(?:compare|admin|mvp)"/)
    }
  })

  it("names a page after its own title, then the site, when the title does not name Financy", async () => {
    const { html } = await page("/features/no-such-feature")

    expect(html).toContain(`<title>This feature page isn't here · Financy</title>`)
  })

  it("keeps every title within 60 characters and naming Financy once, and every description within 155", async () => {
    // The docs and the changelog still describe Seed: #91 and #90 rewrite them.
    for (
      const { path } of SITE_PAGES.filter(({ path }) =>
        !path.startsWith("/docs") && path !== "/changelog"
      )
    ) {
      const { html } = await page(path)
      const title = html.match(/<title>([^<]*)<\/title>/)![1].replaceAll("&#39;", "'")
      const description = metaContent(html, "description")!

      expect(title.length, `${path}: ${title}`).toBeLessThanOrEqual(60)
      expect(title.match(/Financy/g), `${path}: ${title}`).toHaveLength(1)
      expect(description.length, `${path}: ${description}`).toBeLessThanOrEqual(155)
    }
  })

  it("gives every page its tab icon and the canvas of the page's palette as its theme colour", async () => {
    for (const path of ["/", "/pricing", "/subscribe"]) {
      const { html } = await page(path)

      expect(html, path).toContain(`<link rel="icon" type="image/svg+xml" href="/favicon.svg"`)
      // Dark only with JavaScript on, since only /theme.js darkens the page.
      expect(html, path).toContain(
        `<meta name="theme-color" content="#f3f4f6" media="not all and (prefers-color-scheme: dark) and (scripting: enabled)"`,
      )
      expect(html, path).toContain(
        `<meta name="theme-color" content="#080b10" media="(prefers-color-scheme: dark) and (scripting: enabled)"`,
      )
    }
  })

  it("opens the deploy guide itself from Read the deploy guide on /pricing", async () => {
    const { html } = await page("/pricing")

    expect(hrefOf(linkNamed(html, "Read the deploy guide"))).toBe(
      `${REPOSITORY_URL}/blob/main/docs/deploy.md`,
    )
  })

  it("starts every page with a link that skips to the main content, then one header, main and footer", async () => {
    for (const path of ["/", "/privacy", "/subscribe"]) {
      const { html } = await page(path)
      const body = html.slice(html.indexOf("<body"))

      expect(body.match(/<a\b[^>]*>/)?.[0], path).toContain(`href="#main"`)
      expect(linkNamed(body, "Skip to content"), path).toContain(`href="#main"`)
      expect(body.match(/<main\b[^>]*>/g), path).toEqual([
        `<main id="main" tabindex="-1" class="outline-none">`,
      ])
      // The site's own header and footer; a page may add a header of its own inside `<main>`.
      expect(body.slice(0, body.indexOf("<main")).match(/<header\b/g), path).toHaveLength(1)
      expect(body.slice(body.indexOf("</main>")).match(/<footer\b/g), path).toHaveLength(1)
    }
  })

  it("leads the header to every section of the site and the newsletter, and links no sign-in", async () => {
    const { html } = await page("/")
    const header = element(html, "header")!
    const footer = element(html, "footer")!

    const nav = [...header.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)]
      .map((match) => [linkText(match[1]), hrefOf(match[0])])
    expect(nav).toEqual(expect.arrayContaining([
      ["Features", "/features"],
      ["Docs", "/docs"],
      ["GitHub", REPOSITORY_URL],
      ["Get notified", "/#newsletter"],
    ]))
    expect(nav.map(([name]) => name)).not.toContain("Pricing")
    expect(linkNamed(header, "Sign in")).toBeUndefined()
    expect(linkNamed(footer, "Sign in")).toBeUndefined()
    expect(header).not.toContain(`href="${site}/sign-`)
  })

  it("marks the header's Docs as the current page on the docs index, and as its section on every guide", async () => {
    const pages = [["/docs", "Docs", "page"], ["/docs/get-started", "Docs", "true"], [
      "/de/docs/deploy",
      "Doku",
      "true",
    ]]
    for (const [path, docs, current] of pages) {
      const header = element((await page(path)).html, "header")!
      expect(linkNamed(header, docs), path).toContain(`aria-current="${current}"`)
    }
    const header = element((await page("/features")).html, "header")!
    expect(linkNamed(header, "Docs")).not.toContain(`aria-current`)
  })

  const ogCards: [string, OgImageKey][] = [
    ["/", "home"],
    ["/subscribe", "subscribe"],
    ["/pricing", "pricing"],
    ["/privacy", "home"],
    ["/terms", "home"],
  ]
  for (const [path, key] of ogCards) {
    it(`shares ${path} with the ${key} card, its size and its alt text`, async () => {
      const { html } = await page(path)

      expect(metaContent(html, "og:image")).toBe(`${site}/og/${key}.png`)
      expect(metaContent(html, "og:image:width")).toBe("1200")
      expect(metaContent(html, "og:image:height")).toBe("630")
      expect(metaContent(html, "og:image:alt")).toBe(ogImageAlt(key))
      expect(metaContent(html, "og:site_name")).toBe("Financy")
    })
  }

  it("opens the lead of /pricing with one sentence that says what Financy is", async () => {
    const { html } = await page("/pricing")
    const lead = html.slice(html.indexOf("</h1>")).match(/<p\b[^>]*>([\s\S]*?)<\/p>/)![1]
      .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()

    expect(lead).toMatch(/^Financy is a free, open-source \(AGPL\u20113\.0\) finance tracker\./)
  })

  it("calls 2FA, groups and per-member billing by one name, the app's, on every page", async () => {
    // The guides are the repository's docs, written for developers and shown as they are: Stripe's
    // "seats" and the "second factor" of the code are their words.
    for (const { path } of SITE_PAGES.filter(({ path }) => !path.startsWith("/docs/"))) {
      const { html } = await page(path)
      // What a reader hears or a crawler reads: the text, and the alt, title, label and meta words.
      const words = [...html.matchAll(/\b(?:alt|title|aria-label|content)="([^"]*)"/g)]
        .map((match) => match[1])
      // "Product team" is the name of a sample group the admin panel video shows.
      const text = [html.replace(/<[^>]+>/g, " "), ...words].join(" ")
        .replaceAll("Product team", " ").replace(/\s+/g, " ")

      expect(text, path).not.toMatch(/second factor/i)
      expect(text, path).not.toMatch(/\b(?:teams?|seats?)\b/i)
      expect(text, path).not.toMatch(/server you own/i)
    }
  })

  it('names every link for where it goes, never a bare "Learn more"', async () => {
    // The generic texts Lighthouse's "Links do not have descriptive text" audit flags.
    const generic =
      /^(?:click here|click this|go|here|information|learn more|more|more info|more information|read more|right here|see more|start|this)$/i
    for (const { path } of SITE_PAGES) {
      const { html } = await page(path)
      const names = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((match) =>
        linkText(match[1])
      )

      expect(names.filter((name) => generic.test(name)), path).toEqual([])
    }
  })

  it("says where the footer's link to antonshubin.com goes, and offers no hire link", async () => {
    const footer = element((await page("/")).html, "footer")!

    expect(hrefOf(linkNamed(footer, "About Anton (opens antonshubin.com)"))).toBe(
      "https://antonshubin.com",
    )
    expect(linkNamed(footer, "Hire me")).toBeUndefined()
  })

  it("links a Not built yet item that has an open issue to that issue, by its number", () => {
    // No item on /features has an issue today, so the list is drawn with one of its own.
    const tracked = { label: `Right-to-left`, issue: `${REPOSITORY_URL}/issues/215` }
    const html = renderToString(
      h(SiteLanguage, { language: `en`, children: h(NotYetList, { items: [tracked] }) }),
    )

    const links = [...html.matchAll(/<a href="([^"]*)"[^>]*>issue #(\d+)<\/a>/g)]
      .map(([, href, number]) => ({ href, number }))
    expect(links).toEqual([{ href: tracked.issue, number: `215` }])
  })

  it("says on /features that Financy is translated, and names every language (#276)", async () => {
    const { html } = await page("/features")

    expect(html).toContain(`In nine languages`)
    expect(html).toContain(
      `speak English, Russian, Spanish, German, Brazilian Portuguese, Arabic, French, Japanese, and Simplified Chinese.`,
    )
  })

  it("lists passkeys on /features as built, not under Not built yet", async () => {
    const { html } = await page("/features")

    expect(html).toContain(`continue with Google or GitHub, use a passkey`)
    expect(html).not.toContain(`issues/222`)
  })

  it("ends /features with its questions, listed under On this page and in its structured data", async () => {
    const { html } = await page("/features")
    const graph = jsonLdGraph(html)

    const faqAt = html.indexOf(`<section id="faq"`)
    expect(faqAt).toBeGreaterThan(html.indexOf(`id="deploy"`))
    expect(html).toContain(`href="#faq"`)
    const faq = graph.find((entity) => entity["@type"] === "FAQPage")!
    const questions = (faq.mainEntity as { name: string }[]).map((question) => question.name)
    expect(questions.length).toBeGreaterThanOrEqual(3)
    for (const question of questions) expect(html).toContain(`>${question}<`)
  })

  it("describes the home page as the site, the source code, its author and its questions", async () => {
    const { html } = await page("/")
    const graph = jsonLdGraph(html)

    expect(graph.flatMap((entity) => entity["@type"])).toEqual(
      expect.arrayContaining(["WebSite", "SoftwareSourceCode", "Person", "FAQPage"]),
    )
    const source = graph.find((entity) => isType(entity, "SoftwareSourceCode"))!
    expect(source.codeRepository).toBe(REPOSITORY_URL)
    const faq = graph.find((entity) => entity["@type"] === "FAQPage")!
    const questions = (faq.mainEntity as { name: string }[]).map((question) => question.name)
    expect(questions.length).toBeGreaterThan(0)
    for (const question of questions) expect(html).toContain(`>${question}<`)
  })

  it("describes Financy as one product, with one id that the pages about it point at", async () => {
    const home = graphIds(jsonLdGraph((await page("/")).html))

    for (const { path } of SITE_PAGES) {
      const graph = jsonLdGraph((await page(path)).html)
      const { defined, referenced } = graphIds(graph)

      for (const id of referenced) {
        expect(defined.has(id) || home.defined.has(id), `${path} points at ${id}`).toBe(true)
      }
      for (const entity of graph) {
        if (isType(entity, "SoftwareApplication") || isType(entity, "SoftwareSourceCode")) {
          expect(entity["@id"], path).toBe(`${site}/#software`)
        }
      }
    }
    for (const path of ["/", "/features", "/pricing"]) {
      const { defined, referenced } = graphIds(jsonLdGraph((await page(path)).html))
      expect(defined.has(`${site}/#software`) || referenced.has(`${site}/#software`), path)
        .toBe(true)
    }
  })

  it("gives Financy the AGPL-3.0 licence in its structured data on every page that describes it", async () => {
    for (const path of ["/", "/features", "/pricing"]) {
      const software = jsonLdGraph((await page(path)).html)
        .find((entity) => isType(entity, "SoftwareApplication"))

      expect(software?.license, path).toBe("https://www.gnu.org/licenses/agpl-3.0.html")
    }
  })

  it("names the author's profiles and company, as antonshubin.com does", async () => {
    const graph = jsonLdGraph((await page("/")).html)

    const person = graph.find((entity) => isType(entity, "Person"))!
    expect(person.sameAs).toEqual(expect.arrayContaining([
      "https://github.com/spy4x",
      "https://www.linkedin.com/in/anton-shubin",
      "https://www.upwork.com/freelancers/ashubin",
    ]))
    expect(person.worksFor).toMatchObject({
      "@type": "Organization",
      "@id": "https://neatsoft.dev/#org",
      name: "NeatSoft PTE LTD",
    })
  })

  it("roots every page's breadcrumb trail at the home page's full address", async () => {
    // The home page is the root itself, and the newsletter page has no structured data.
    for (const { path } of SITE_PAGES.filter(({ path }) => path !== "/" && path !== "/subscribe")) {
      const graph = jsonLdGraph((await page(path)).html)
      const crumbs = graph.find((entity) => isType(entity, "BreadcrumbList"))

      expect(crumbs, path).toBeDefined()
      expect((crumbs!.itemListElement as unknown[])[0], path).toEqual({
        "@type": "ListItem",
        position: 1,
        name: "Financy",
        item: `${site}/`,
      })
    }
  })

  it("describes a legal page as a page of the site, one step below the home page", async () => {
    for (const [path, name] of [["/privacy", "Privacy"], ["/terms", "Terms"]]) {
      const graph = jsonLdGraph((await page(path)).html)

      const webPage = graph.find((entity) => entity["@type"] === "WebPage")
      expect(webPage, path).toMatchObject({
        url: `${site}${path}`,
        isPartOf: { "@id": `${site}/#website` },
      })
      const crumbs = graph.find((entity) => entity["@type"] === "BreadcrumbList")
      expect(crumbs?.itemListElement, path).toEqual([
        { "@type": "ListItem", position: 1, name: "Financy", item: `${site}/` },
        { "@type": "ListItem", position: 2, name, item: `${site}${path}` },
      ])
    }
  })

  it("serves the theme script from its own origin, as the content security policy requires", async () => {
    const { html } = await page("/")
    const response = await handler(new Request(`${site}/theme.js`), info)

    expect(html).toMatch(/<head>[\s\S]*<script src="\/theme.js"[^>]*><\/script>[\s\S]*<\/head>/)
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8")
    expect(await response.text()).toContain("prefers-color-scheme")
  })

  it("names no price above $0 in the pricing page's description", async () => {
    const { html } = await page("/pricing")

    for (const key of ["description", "og:description"]) {
      const description = metaContent(html, key)!
      expect(description, key).toContain("free")
      expect(description.match(/\$\s?[\d,.]+/g) ?? [], key).toEqual(
        description.match(/\$0\b/g) ?? [],
      )
    }
  })

  it("offers only self-hosted Financy, at no cost, in the pricing page's structured data", async () => {
    const graph = jsonLdGraph((await page("/pricing")).html)

    const software = graph.find((entity) => isType(entity, "SoftwareApplication"))!
    expect(software.offers).toEqual({
      "@type": "Offer",
      name: "Self-hosted",
      description: "Free to run on your own server under AGPL-3.0.",
      price: 0,
      priceCurrency: "USD",
    })
    const offers = JSON.stringify(graph).match(/"@type":"Offer"/g)
    expect(offers).toHaveLength(1)
    expect(graph.map((entity) => entity["@type"])).toEqual(
      expect.arrayContaining(["Person", "FAQPage", "BreadcrumbList"]),
    )
  })

  it("shows the API reference from docs/token-api.md, with its sections and the footer link to it", async () => {
    const { status, html } = await page("/docs/api")

    expect(status).toBe(200)
    expect(headingOne(html)).toBe("API reference")
    expect(html).toContain(`<h2 id="quick-start">Quick start</h2>`)
    expect(hrefOf(linkNamed(html, "Quick start"))).toBe("#quick-start")
    expect(hrefOf(linkNamed(html, "API docs"))).toBe("/docs/api")
    expect(hrefOf(linkNamed(html, "docs/token-api.md"))).toBe(
      `${REPOSITORY_URL}/blob/main/docs/token-api.md`,
    )
  })

  it("leads /docs with Get started, then lists every published guide and the API reference in the four sections", async () => {
    const { status, html } = await page("/docs")

    expect(status).toBe(200)
    expect(headingOne(html)).toBe("Financy docs")
    const groups = [...html.matchAll(/<h2 id="docs-[^"]*"[^>]*>([\s\S]*?)<\/h2>/g)]
      .map((m) => linkText(m[1]))
    expect(groups).toEqual(["New to Financy?", "Get started", "Guides", "Concepts", "Reference"])
    const first = /<section[^>]*data-e2e="docs-first"[\s\S]*?<\/section>/.exec(html)![0]
    expect(hrefOf(linkNamed(first, "Get started"))).toBe("/docs/get-started")
    expect(html.indexOf(`href="/docs/get-started"`)).toBeLessThan(
      html.indexOf(`href="/docs/products"`),
    )
    for (const slug of DOC_SLUGS) expect(html, slug).toContain(`href="/docs/${slug}"`)
    expect(html).toMatch(/<a href="\/docs\/api"[^>]*><span[^>]*>API reference<\/span>/)
  })

  it("draws a guide with its trail, its TechArticle and its links pointed at the website", async () => {
    const { status, html } = await page("/docs/deploy")

    expect(status).toBe(200)
    expect(headingOne(html)).toBe("Deploy to a server")
    expect(html).toContain(`<link rel="canonical" href="${site}/docs/deploy"`)
    const article = jsonLdGraph(html).find((entity) => isType(entity, "TechArticle"))
    expect(article?.headline).toBe("Deploy to a server")
    expect(html).toContain(`href="/docs/apps"`)
    expect(html).not.toContain(`href="apps.md`)
    expect(html).not.toContain("Also on the website")
  })

  it("draws a guide in English at a translated address, with its canonical in English", async () => {
    const { status, html } = await page("/de/docs/deploy")

    expect(status).toBe(200)
    expect(html).toContain(`data-e2e="english-only"`)
    expect(html).toMatch(/<div lang="en" dir="ltr"/)
    expect(html).toContain(`<link rel="canonical" href="${site}/docs/deploy"`)
    expect(html).toContain(`href="/de/docs/apps"`)
  })

  it("answers 404 for an internal doc, as for an unknown one, with the way to the docs", async () => {
    for (const path of ["/docs/handoff", "/docs/no-such-doc"]) {
      const { status, html } = await page(path)

      expect(status, path).toBe(404)
      expect(headingOne(html), path).toBe("This doc isn't here")
      expect(html, path).toContain(`href="/docs"`)
      expect(html, path).toContain(`name="robots" content="noindex`)
    }
  })

  it("shows the changelog's empty state when the build read no history", async () => {
    const { status, html } = await page("/changelog")

    expect(status).toBe(200)
    expect(html).toContain(`data-e2e="changelog-empty"`)
    expect(html).toMatch(
      /<link rel="alternate" type="application\/rss\+xml"[^>]*href="https:\/\/www\.example\.com\/changelog\.xml"/,
    )
  })

  it("serves the changelog feed as RSS, and names it in robots.txt", async () => {
    const response = await handler(new Request(`${site}/changelog.xml`), info)
    const xml = await response.text()

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8")
    expect(xml).toMatch(/^<\?xml[^>]*\?>\s*<rss version="2.0"/)
    expect(xml).toContain(`<link>${site}/changelog</link>`)
    const robots = await (await handler(new Request(`${site}/robots.txt`), info)).text()
    expect(robots).toContain(`# Changelog feed: ${site}/changelog.xml`)
  })

  it("links the docs and the changelog from every page's footer", async () => {
    const footer = element((await page("/")).html, "footer")!

    expect(hrefOf(linkNamed(footer, "Docs"))).toBe("/docs")
    expect(hrefOf(linkNamed(footer, "Changelog"))).toBe("/changelog")
  })

  for (const [path, title] of [["/privacy", "Privacy"], ["/terms", "Terms"]]) {
    it(`answers ${path} with its heading, its "In short" summary in place of the template notice, and its canonical address`, async () => {
      const { status, html } = await page(path)

      expect(status).toBe(200)
      expect(headingOne(html)).toBe(title)
      expect(html).toContain(`data-e2e="tldr-box"`)
      expect(html).not.toContain("A starting point, not legal advice")
      expect(html).toContain(`<link rel="canonical" href="${site}${path}"`)
    })
  }

  it("links both legal pages and posts the footer's newsletter form to /subscribe", async () => {
    const { html } = await page("/pricing")

    expect(hrefOf(linkNamed(html, "Privacy"))).toBe("/privacy")
    expect(hrefOf(linkNamed(html, "Terms"))).toBe("/terms")
    const form = html.match(/<form method="post" action="\/subscribe"[\s\S]*?<\/form>/)?.[0]
    expect(form).toContain(`name="list" value="news"`)
    expect(form).toContain(`name="email"`)
  })

  it("offers the newsletter form once on the home page, in its content, and not again in the footer", async () => {
    const home = (await page("/")).html
    const pricing = (await page("/pricing")).html

    expect(home.match(/<form method="post" action="\/subscribe"/g)).toHaveLength(1)
    expect(home).not.toContain(`id="footer-news"`)
    expect(hrefOf(linkNamed(home, "Privacy"))).toBe("/privacy")
    // A page without the form in its content keeps the footer's.
    expect(pricing).toContain(`id="footer-news"`)
  })

  it("offers no newsletter form on any page while subscriptions are off, and keeps the rest of the footer", async () => {
    for (const path of ["/", "/pricing", "/privacy", "/terms"]) {
      const { status, html } = await page(path, withoutNewsletter)

      expect(status, path).toBe(200)
      expect(html, path).not.toContain(`action="/subscribe"`)
      expect(html, path).not.toContain(`id="footer-news"`)
      expect(hrefOf(linkNamed(html, "Privacy")), path).toBe("/privacy")
    }
  })

  it("leaves the newsletter page out of the sitemap while subscriptions are off", async () => {
    const response = await withoutNewsletter(new Request(`${site}/sitemap.xml`), info)

    const locs = [...(await response.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
    expect(locs).toEqual(
      everyLanguage(SITE_PAGES.filter(({ path }) => path !== "/subscribe")).map((path) =>
        `${site}${path}`
      ),
    )
  })

  it("keeps a page a mailed link opens out of search results", async () => {
    const { html } = await page("/unsubscribe")

    expect(html).toContain(`<meta name="robots" content="noindex, nofollow"`)
  })

  it("points robots.txt at the sitemap on the website's own origin", async () => {
    const response = await handler(new Request(`${site}/robots.txt`), info)

    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8")
    expect(await response.text()).toContain(`Sitemap: ${site}/sitemap.xml`)
  })

  it("lists every public page in the sitemap at the website's own origin", async () => {
    const response = await handler(new Request(`${site}/sitemap.xml`), info)
    const xml = await response.text()

    expect(response.headers.get("content-type")).toBe("application/xml; charset=utf-8")
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
    // A translated page is listed in every language; an English-only one once.
    expect(locs).toEqual(
      [
        "/",
        "/ru",
        "/es",
        "/de",
        "/pt-BR",
        "/ar",
        "/fr",
        "/ja",
        "/zh-CN",
        "/features",
        "/ru/features",
        "/es/features",
        "/de/features",
        "/pt-BR/features",
        "/ar/features",
        "/fr/features",
        "/ja/features",
        "/zh-CN/features",
        "/docs/api",
        "/docs",
        ...DOC_SLUGS.map((slug) => `/docs/${slug}`),
        "/changelog",
        "/subscribe",
        "/ru/subscribe",
        "/es/subscribe",
        "/de/subscribe",
        "/pt-BR/subscribe",
        "/ar/subscribe",
        "/fr/subscribe",
        "/ja/subscribe",
        "/zh-CN/subscribe",
        "/privacy",
        "/terms",
      ]
        .map((path) => `${site}${path}`),
    )
  })

  it("dates every sitemap entry with the day its page last changed", async () => {
    const xml = await (await handler(new Request(`${site}/sitemap.xml`), info)).text()
    const lastmods = Object.fromEntries(
      [...xml.matchAll(/<loc>([^<]+)<\/loc>\n(?:\s*<lastmod>([^<]+)<\/lastmod>)?/g)]
        .map((match) => [match[1].slice(site.length), match[2]]),
    )

    // Every language of a page carries the English page's date: the translation says the same.
    expect(lastmods["/de/subscribe"]).toBe("2026-11-04T00:00:00.000Z")
    expect(lastmods["/ar"]).toBe("2026-11-06T00:00:00.000Z")
    expect(Object.values(lastmods)).not.toContain(undefined)
    const english = Object.fromEntries(
      Object.entries(lastmods).filter(([path]) => pathLanguage(path).language === "en"),
    )
    expect(english).toEqual({
      "/": "2026-11-06T00:00:00.000Z",
      "/features": "2026-11-06T00:00:00.000Z",
      "/docs/api": "2026-10-23T00:00:00.000Z",
      // With no history to read, as under `deno test`, the guides and the changelog carry the day
      // they were first published.
      "/docs": "2026-11-01T00:00:00.000Z",
      ...Object.fromEntries(DOC_SLUGS.map((slug) => [`/docs/${slug}`, "2026-11-01T00:00:00.000Z"])),
      "/changelog": "2026-11-01T00:00:00.000Z",
      "/subscribe": "2026-11-04T00:00:00.000Z",
      "/privacy": "2026-11-07T00:00:00.000Z",
      "/terms": "2026-11-07T00:00:00.000Z",
    })
  })

  it("names on the privacy page the controller, every company that handles data and every kind of record Financy stores (#86)", async () => {
    const { html } = await page("/privacy", withAnalytics)

    expect(html).toContain(`NeatSoft PTE LTD in Singapore`)
    for (
      const processor of [
        `Stripe`,
        `The mail provider`,
        `Exchange-rate sources`,
        `Umami`,
        `DeepSeek`,
        `Google or GitHub`,
        `Your browser&#39;s push service`,
        `Telegram`,
      ]
    ) expect(html).toContain(`<strong>${processor}</strong>`)
    for (
      const group of [
        `Your account`,
        `Your household`,
        `Your finances`,
        `Imports`,
        `Connections`,
        `Payments`,
      ]
    ) expect(html).toContain(`>${group}</h3>`)
    for (
      const record of [
        `your passkeys`,
        `the Google or GitHub account you linked`,
        `API tokens, if you create any`,
        `The time zone and language of the first device you signed in on`,
        `short-lived cookies hold the step you are on`,
        `its invitations`,
        `crypto holdings`,
        `every transaction and`,
        `Categories, monthly budgets and recurring transactions`,
        `A bank statement you upload, until its import is saved or abandoned`,
        `your Telegram account&#39;s id`,
        `Stripe&#39;s customer and subscription numbers`,
      ]
    ) expect(html).toContain(record)
    expect(html).toContain(`Frankfurter`)
    expect(html).toContain(`It is not end-to-end encrypted`)
  })

  it("says on the privacy page that a deleted household stays restorable for 30 days and leaves the backups about seven months after the delete (#86)", async () => {
    const { html } = await page("/privacy")
    const summary = html.slice(html.indexOf(`data-e2e="tldr-box"`), html.indexOf(`</section>`))

    expect(html).not.toContain(`leaves the live database at once`)
    expect(html).toContain(`stays restorable for 30 days and is then removed for good`)
    expect(html).toContain(`deleted for good 7 days later`)
    expect(html).toContain(`gone from them about seven months after the delete`)
    expect(html).toContain(`activity log is kept for a year, and outlives a deleted household`)
    expect(summary).toContain(
      `can be restored for 30 days and is gone from the backups about seven months`,
    )
  })

  it("lists on the privacy page what operators see in the admin panel, uploaded files included, and when anyone looks at a household's finances (#86)", async () => {
    const { html } = await page("/privacy")

    expect(html).toContain(
      `its sign-in records with IP addresses, its devices, notifications and API`,
    )
    expect(html).toContain(`and each household&#39;s members, plan and overview`)
    expect(html).toContain(
      `open and download a household&#39;s uploaded files, and each time they open one, it is recorded`,
    )
    expect(html).toContain(`The small image previews in the file list are not recorded`)
    expect(html).toContain(
      `except when the household asks for help with a problem, or when the law requires it`,
    )
  })

  it("says on the privacy page that a sign-in cookie holds a reference to the code, never the code (#86)", async () => {
    const { html } = await page("/privacy")

    expect(html).toContain(`a signed reference to the code we sent you (never the code itself)`)
  })

  it("states on the terms page the price in US dollars, the renewal, the 30-day money-back guarantee and that Financy gives no financial advice (#86)", async () => {
    const { html } = await page("/terms")

    expect(html).toContain(`$4 a month or $40 a year, in US dollars, per household of up to 6`)
    expect(html).toContain(`$40 today, then $40 every year until you cancel.`)
    expect(html).toContain(`$4 today, then $4 every month until you cancel.`)
    expect(html).toContain(`If you are a consumer in Germany`)
    expect(html).toContain(`If you ask within 30 days of your first payment, I refund it in full`)
    expect(html).toContain(
      `Your rights under the consumer law of the country you live in come on top of these`,
    )
    expect(html).toContain(`It does not give financial, tax or investment advice`)
    expect(html).toContain(`A total in your base currency is an estimate`)
  })

  it("says on the privacy page that data stays in Singapore on an unencrypted disk, with no EU representative yet (#86)", async () => {
    const { html } = await page("/privacy")

    expect(html).toContain(`stored in Singapore, on a server NeatSoft runs itself`)
    expect(html).toContain(`NeatSoft&#39;s own machines in Singapore and Vietnam`)
    expect(html).toContain(`the EU has not recognised Singapore`)
    expect(html).toContain(`a contact that EU residents and regulators can write to`)
    expect(html).toContain(`>the GitHub issue about it</a> or write to`)
    expect(html).toContain(`Financy has none yet. It will name one once 10 households in the EU`)
    expect(html).toContain(`The server&#39;s own disk is not encrypted`)
    expect(html).not.toMatch(/encrypted[^.]*(on (the server&#39;s )?disk|at rest)/)
    expect(html).toContain(
      `Your data is encrypted on its way to Financy and in backups. It is not end-to-end encrypted.`,
    )
    expect(html).toContain(`Financy&#39;s cloud uses DeepSeek, a company in China.`)
    expect(html).toContain(`<strong>DeepSeek</strong> (China)`)
    expect(html).toContain(`own API key for another AI provider, with the API address`)
    expect(html).toContain(`href="mailto:privacy@financy.dev"`)
  })

  it("states on the terms page the renewal refund windows, Singapore law and the contact address (#86)", async () => {
    const { html } = await page("/terms")

    expect(html).toContain(`If you have not used Financy since the renewal, ask within 14 days`)
    expect(html).toContain(`which means you opened the app or wrote to the Financy bot`)
    expect(html).toContain(`ask within 5 days of the charge and I still refund it in full.`)
    expect(html).toContain(`<h2 id="law">Law and courts</h2>`)
    expect(html).toContain(`follow the law of Singapore`)
    expect(html).toContain(`href="mailto:hi@financy.dev"`)
  })

  it("keeps Seed's site, Seed's demo and any trial offer off both legal pages (#86)", async () => {
    for (const path of ["/privacy", "/terms"]) {
      const { html } = await page(path, withAnalytics)
      const article = html.slice(html.indexOf("<h1"), html.indexOf("<footer"))

      expect(article, path).not.toMatch(/seedsaas|Seed demo|demo of Seed|Seed&#39;s demo/i)
      for (const [trial] of article.matchAll(/[\w ]{0,8}trial/gi)) {
        expect(trial, path).toBe(`no free trial`)
      }
    }
  })

  it("shows on each legal page the same day its sitemap entry carries", async () => {
    const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" })
    for (
      const [path, updated] of [["/privacy", PRIVACY_HEAD.updated], ["/terms", TERMS_HEAD.updated]]
    ) {
      const { html } = await page(path)

      expect(html, path).toContain(`Last updated ${day.format(new Date(`${updated}T00:00:00Z`))}`)
    }
  })

  it("names the author and the page's day under the hero of /pricing and /features", async () => {
    const updated: Record<string, string> = {
      "/pricing": PRICING_UPDATED,
      "/features": SITE_PAGES.find(({ path }) => path === "/features")!.updated,
    }
    const day = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" })
    for (const path of ["/pricing", "/features"]) {
      const { html } = await page(path)
      const meta = html.match(/<p [^>]*data-e2e="page-hero-meta"[^>]*>([\s\S]*?)<\/p>/)?.[1]

      expect(meta, path).toContain(`By <a`)
      expect(hrefOf(linkNamed(meta ?? "", "Anton Shubin")), path).toBe("https://antonshubin.com")
      expect(meta, path).toContain(
        `Updated <time datetime="${updated[path]}">` +
          `${day.format(new Date(`${updated[path]}T00:00:00Z`))}</time>`,
      )
      expect(html.indexOf("page-hero-meta"), path).toBeGreaterThan(html.indexOf("</h1>"))
    }
  })

  it("dates the home page in its status line under the actions, not in a byline", async () => {
    const { html } = await page("/")
    const status = html.match(/<p [^>]*data-e2e="home-status-line"[^>]*>([\s\S]*?)<\/p>/)?.[1]

    expect(html).not.toContain("page-hero-meta")
    expect(linkText(status ?? "")).toBe(
      `Being rebuilt in public, not ready to use yet. Updated ${
        new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" })
          .format(new Date(`${STATUS_UPDATED}T00:00:00Z`))
      }. Where it stands`,
    )
    expect(hrefOf(linkNamed(status ?? "", "Where it stands"))).toBe("#status")
  })

  it("takes each page's title and description in the page list from the page's own head", async () => {
    for (const { path, title, description } of SITE_PAGES) {
      const { html } = await page(path)

      expect(metaContent(html, "description"), path).toBe(machineText(description))
      const shown = html.match(/<title>([^<]*)<\/title>/)![1].replaceAll("&#39;", "'")
      expect(shown.startsWith(title), `${path}: ${shown}`).toBe(true)
    }
  })

  it("lists every public page in llms.txt with its title, address and description", async () => {
    const response = await handler(new Request(`${site}/llms.txt`), info)
    const text = await response.text()

    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8")
    expect(text).toMatch(
      /^# Financy\n\n> Financy is a free, open-source \(AGPL-3\.0\) finance tracker for a person or a family/,
    )
    for (const { path, title, description } of SITE_PAGES) {
      expect(text, path).toContain(`- [${title}](${site}${path}): ${machineText(description)}\n`)
    }
    expect(text).toContain(`(${REPOSITORY_URL})`)
  })

  it("keeps AGPL-3.0 on one line in every language, and gives machines its plain hyphen", async () => {
    for (const language of SITE_LANGUAGES) {
      const path = localePath(language, "/")
      const { html } = await page(path)
      const [head, body] = html.split("<body")

      expect(headingOne(html), path).toContain("AGPL\u20113.0")
      expect(body, path).not.toContain("AGPL-3.0")
      expect(head, path).not.toContain("\u2011")
    }
    const llms = await (await handler(new Request(`${site}/llms.txt`), info)).text()
    expect(llms).not.toContain("\u2011")
  })

  it("breaks no word of the home page's status card at a hyphen, in any language", async () => {
    for (const language of SITE_LANGUAGES) {
      const path = localePath(language, "/")
      const { html } = await page(path)
      // The card ends with its one paragraph, the plan's line.
      const start = html.indexOf(`data-e2e="home-status"`)
      const card = html.slice(start, html.indexOf("</p>", start))

      expect(start, path).toBeGreaterThan(-1)
      expect(linkText(`<${card}`), path).not.toMatch(/\p{L}-\p{L}/u)
    }
  })

  it("ends the home page's status line with one full stop before its link, in every language", async () => {
    for (const language of SITE_LANGUAGES) {
      const path = localePath(language, "/")
      const { html } = await page(path)
      const status = html.match(/<p [^>]*data-e2e="home-status-line"[^>]*>([\s\S]*?)<\/p>/)?.[1]

      expect(status, path).toBeDefined()
      expect(linkText(status ?? ""), path).not.toMatch(/[.。]\s*[.。]/)
    }
  })

  it("loads the focus script on the home page, naming the newsletter section and its email field", async () => {
    const { html } = await page("/")
    const script = html.match(/<script [^>]*src="\/field-focus\.js"[^>]*>/)?.[0] ?? ""

    expect(script).toContain(`data-hash="newsletter"`)
    expect(script).toContain(`data-field="home-email"`)
    expect(script).toContain(`defer`)
    expect(html).toContain(`id="newsletter"`)
    expect(html).toMatch(/<input [^>]*id="home-email"/)
  })

  it("names the source code's licence in llms.txt as AGPL-3.0, Financy's own", async () => {
    const text = await (await handler(new Request(`${site}/llms.txt`), info)).text()

    expect(text).toContain(
      `(${REPOSITORY_URL}): The code, the README and the docs, under the AGPL-3.0`,
    )
  })

  it("leaves the newsletter page out of llms.txt while subscriptions are off", async () => {
    const text = await (await withoutNewsletter(new Request(`${site}/llms.txt`), info)).text()

    expect(text).not.toContain(`${site}/subscribe)`)
    expect(text).toContain(`${site}/terms)`)
  })

  it("names each AI search bot in robots.txt with the same rules as every other crawler", async () => {
    const text = await (await handler(new Request(`${site}/robots.txt`), info)).text()
    const rules = "Disallow: /subscribe/confirm\nDisallow: /unsubscribe\nAllow: /\n"

    for (const agent of ["*", "OAI-SearchBot", "PerplexityBot", "Claude-SearchBot", "Bingbot"]) {
      expect(text, agent).toContain(`User-agent: ${agent}\n${rules}`)
    }
    expect(text).not.toContain("Google-Extended")
    expect(text).not.toMatch(/Disallow: \/\n/)
    expect(text).not.toContain("video-sitemap")
  })

  it("loads no tracker and no script of its own while analytics is off", async () => {
    for (const path of ["/", "/pricing", "/privacy"]) {
      const { html } = await page(path)
      expect(html, path).not.toContain("script.js")
      expect(html, path).not.toContain("/analytics.js")
    }
  })

  it("loads Umami's tracker, counting only on its own host and honouring Do Not Track, then its own events", async () => {
    const { html } = await page("/", withAnalytics)

    const tracker = html.match(/<script[^>]*src="https:\/\/stats\.example\.com\/script\.js"[^>]*>/)
      ?.[0]
    expect(tracker).toContain(`data-website-id="${UMAMI.websiteId}"`)
    expect(tracker).toContain(`data-domains="www.example.com"`)
    expect(tracker).toContain(`data-do-not-track="true"`)
    expect(tracker).toContain("defer")
    const own = html.match(/<script[^>]*src="\/analytics\.js"[^>]*>/)?.[0]
    expect(own).toContain(`data-spa-origin="${spa}"`)
    expect(own).toContain(`data-repository="${REPOSITORY_URL}"`)
    // Umami runs first: the website's events call the tracker it defines.
    expect(html.indexOf("stats.example.com/script.js")).toBeLessThan(html.indexOf("/analytics.js"))
  })

  it("leaves the tracker out of a page whose address carries a newsletter token", async () => {
    const { html } = await page("/unsubscribe?list=news&token=secret-token", withAnalytics)

    expect(html).not.toContain("script.js")
    expect(html).not.toContain("/analytics.js")
  })

  it("names the notify links of the header and the hero, the hero's GitHub link and the newsletter form for Umami", async () => {
    const { html } = await page("/", withAnalytics)

    const header = html.match(/<a[^>]*data-e2e="site-notify"[^>]*>/)?.[0]
    expect(header).toContain(`data-umami-event="notify"`)
    expect(header).toContain(`data-umami-event-from="header"`)
    const hero = html.match(/<a[^>]*data-e2e="home-notify"[^>]*>/)?.[0]
    expect(hero).toContain(`data-umami-event="notify"`)
    expect(hero).toContain(`data-umami-event-from="hero"`)
    const github = html.match(/<a[^>]*data-e2e="home-github"[^>]*>/)?.[0]
    expect(github).toContain(`data-umami-event="github"`)
    expect(github).toContain(`data-umami-event-from="hero"`)
    expect(html.match(/<form[^>]*data-e2e="home-subscribe"[^>]*>/)?.[0]).toContain(
      `data-analytics-submit="newsletter-subscribe"`,
    )
  })

  it("says on the privacy page that visits are counted in a self-hosted Umami without cookies, and what it records", async () => {
    const { html } = await page("/privacy", withAnalytics)

    expect(html).toContain(`<h2 id="website">This website and its statistics</h2>`)
    expect(html).toContain("counts visits with Umami, which I host myself")
    expect(html).toContain("It sets no cookies")
    expect(html).toContain("If your browser sends Do Not Track, nothing is counted.")
    expect(html).not.toContain("There are no advertising cookies, no analytics")
  })

  it("says on the privacy page that no visits are counted while analytics is off", async () => {
    const { html } = await page("/privacy")

    expect(html).toContain("This website keeps no visitor statistics, and neither does the app.")
    expect(html).not.toContain("Umami")
  })
})
