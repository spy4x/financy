import { API_DOCS_HEAD, API_DOCS_PATH } from "./api-docs.ts"
import { FEATURES_HEAD, FEATURES_UPDATED } from "./routes/[[lang]]/features.tsx"
import { HOME_HEAD, HOME_UPDATED } from "./routes/index.tsx"
import { PRIVACY_HEAD } from "./routes/[[lang]]/privacy.tsx"
import { TERMS_HEAD } from "./routes/[[lang]]/terms.tsx"
import { SUBSCRIBE_HEAD, SUBSCRIBE_UPDATED } from "./subscribers.tsx"
import { CHANGELOG, CHANGELOG_PATH } from "./changelog.ts"
import { DOC_SLUGS, DOCS_PATH, readDoc } from "./docs-site.ts"
import { CHANGELOG_HEAD } from "./routes/[[lang]]/changelog.tsx"
import { DOCS_HEAD } from "./routes/[[lang]]/docs/index.tsx"
import { docTitle } from "./routes/[[lang]]/docs/[slug].tsx"
import { AUDIENCE_PAGES, audiencePageIn, audiencePath } from "./audience-data.ts"
import { FEATURE_PAGES, featurePageIn, featurePath } from "./features-data.tsx"
import {
  alternativeIn,
  alternativePath,
  ALTERNATIVES,
  ALTERNATIVES_UPDATED,
} from "./alternatives-data.ts"
import { ALTERNATIVES_HEAD } from "./routes/[[lang]]/alternatives/index.tsx"
import { siteEnglishText } from "@ui/site-text.ts"

/** One public page, as `sitemap.xml` and `llms.txt` describe it. */
export interface SitePage {
  path: string
  /** The page's `<title>`, taken from its head. */
  title: string
  /** The page's meta description, taken from its head. */
  description: string
  /**
   * The day the page's content last changed, `YYYY-MM-DD`: the sitemap's `lastmod`. Set by hand
   * when the content changes, never the build date: a date that changes on every deploy tells a
   * crawler nothing.
   */
  updated: string
  /**
   * The page is English at every language's address, such as a legal page, so only its English
   * address is listed. Every other page is listed once per language.
   */
  oneLanguage?: boolean
}

/** A page entry from its head, so the title and description are written once, on the page. */
function sitePage(
  path: string,
  head: { title: string; description: string },
  updated: string,
  oneLanguage?: boolean,
): SitePage {
  return { path, title: head.title, description: head.description, updated, oneLanguage }
}

/**
 * The day the changelog and the docs were first published: their date when the build had no
 * history to read (`deno task changelog` did not run), so the sitemap still dates them.
 */
export const DOCS_PUBLISHED = `2026-11-01`

/** The day `iso` falls on, `YYYY-MM-DD`, or {@link DOCS_PUBLISHED} without one. */
function day(iso: string | undefined): string {
  return iso?.slice(0, 10) ?? DOCS_PUBLISHED
}

/** Every published guide, each English at every language's address. */
const DOC_PAGES: readonly SitePage[] = DOC_SLUGS.map((slug) => {
  const doc = readDoc(slug, (path) => path)!
  return sitePage(
    `${DOCS_PATH}/${slug}`,
    { title: docTitle(doc.title), description: doc.description },
    day(doc.updated),
    true,
  )
})

/** Every feature page (`/features/<slug>`), with its English head and the day its words changed. */
const FEATURE_SITE_PAGES: readonly SitePage[] = FEATURE_PAGES.map((keys) => {
  const page = featurePageIn(siteEnglishText(), keys)
  return sitePage(featurePath(page.slug), page, page.updated)
})

/** Every audience page (`/for/<slug>`), with its English head and the day its words changed. */
const AUDIENCE_SITE_PAGES: readonly SitePage[] = AUDIENCE_PAGES.map((keys) => {
  const page = audiencePageIn(siteEnglishText(), keys)
  return sitePage(audiencePath(page.slug), page, page.updated)
})

/**
 * The comparisons' hub, dated by its newest comparison, then every comparison
 * (`/alternatives/<slug>`), each dated by the day its rows were checked.
 */
const ALTERNATIVE_SITE_PAGES: readonly SitePage[] = [
  sitePage(
    `/alternatives`,
    ALTERNATIVES_HEAD,
    ALTERNATIVES_UPDATED,
  ),
  ...ALTERNATIVES.map((keys) => {
    const page = alternativeIn(siteEnglishText(), keys)
    return sitePage(alternativePath(page.slug), page, page.checked)
  }),
]

/**
 * The website's public pages, in the order a visitor meets them. It lives apart from `site.tsx`
 * because it reads every page's head, and every page imports `site.tsx`. `/pricing` is left out
 * while it still describes Seed: #87 rewrites it for Financy and lists it again.
 */
export const SITE_PAGES: readonly SitePage[] = [
  sitePage(`/`, HOME_HEAD, HOME_UPDATED),
  sitePage(`/features`, FEATURES_HEAD, FEATURES_UPDATED),
  ...FEATURE_SITE_PAGES,
  ...AUDIENCE_SITE_PAGES,
  ...ALTERNATIVE_SITE_PAGES,
  sitePage(API_DOCS_PATH, API_DOCS_HEAD, API_DOCS_HEAD.updated, true),
  sitePage(DOCS_PATH, DOCS_HEAD, day(DOC_PAGES.map(({ updated }) => updated).sort().at(-1)), true),
  ...DOC_PAGES,
  sitePage(CHANGELOG_PATH, CHANGELOG_HEAD, day(CHANGELOG.entries[0]?.date), true),
  sitePage(`/subscribe`, SUBSCRIBE_HEAD, SUBSCRIBE_UPDATED),
  sitePage(`/privacy`, PRIVACY_HEAD, PRIVACY_HEAD.updated, true),
  sitePage(`/terms`, TERMS_HEAD, TERMS_HEAD.updated, true),
]
