// The hub of the comparisons: one entry per page of `alternatives-data.ts`, in every language.
import type { JSX } from "preact"
import { Breadcrumbs } from "@spy4x/preact-ui/breadcrumbs"
import { useFormat } from "@spy4x/preact-ui/format"
import { breadcrumbListJsonLd, itemListJsonLd } from "@spy4x/platform/universal/seo"
import {
  alternativeIn,
  alternativePath,
  ALTERNATIVES,
  ALTERNATIVES_UPDATED,
  alternativesHead,
  alternativesPath,
} from "../../../alternatives-data.ts"
import { siteEnglishText } from "@ui/site-text.ts"
import { localePath, siteTranslator } from "../../../languages.ts"
import { PERSON_JSON_LD, SITE_NAME, SiteFrame } from "../../../site.tsx"
import { useSite } from "../../../use-site.tsx"
import { define } from "../../../utils.ts"

/** The hub's head in English, for the page list. */
export const ALTERNATIVES_HEAD = alternativesHead(siteEnglishText())

/** The hub: a trail, a heading, a lead, then one row per comparison. */
export const handler = define.handlers({
  GET(ctx) {
    const { language, webAppOrigin: origin } = ctx.state
    const t = siteTranslator(language)
    const head = alternativesHead(t)
    const url = `${origin}${alternativesPath(language)}`
    const list = itemListJsonLd(
      url,
      ALTERNATIVES.map(({ slug }) => `${origin}${alternativePath(slug, language)}`),
    )
    return ctx.render(
      <SiteFrame
        state={ctx.state}
        path={alternativesPath()}
        head={{
          ...head,
          og: `features`,
          jsonLd: [
            {
              "@type": `CollectionPage`,
              "@id": url,
              url,
              name: t.t(`Alternatives.h1`),
              description: head.description,
              inLanguage: language,
              dateModified: ALTERNATIVES_UPDATED,
              mainEntity: { "@id": list["@id"] },
            },
            list,
            PERSON_JSON_LD,
            breadcrumbListJsonLd(url, [
              { name: SITE_NAME, href: `${origin}${localePath(language, `/`)}` },
              { name: t.t(`Alternatives.crumb`) },
            ]),
          ],
        }}
      >
        <AlternativesBody />
      </SiteFrame>,
    )
  },
})

/** One `max-w-2xl` column: per comparison its title as a link, its answer and its checked date. */
function AlternativesBody(): JSX.Element {
  const { t, href, rich } = useSite()
  const format = useFormat().utc()
  return (
    <div
      class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-12 sm:px-6 lg:py-16"
      data-e2e="alternatives-hub"
    >
      <header class="flex flex-col gap-4">
        <Breadcrumbs
          items={[{ label: SITE_NAME, href: href(`/`) }, { label: t.t(`Alternatives.crumb`) }]}
        />
        <h1 class="text-3xl font-semibold tracking-tight text-balance break-words hyphens-auto lg:text-5xl">
          {t.t(`Alternatives.h1`)}
        </h1>
        <p class="text-lg text-muted text-pretty">{t.t(`Alternatives.lead`)}</p>
      </header>
      <ul class="border-t border-subtle" data-e2e="alternatives-list">
        {ALTERNATIVES.map((keys) => alternativeIn(t, keys)).map((page) => (
          <li key={page.slug} class="flex flex-col gap-1 border-b border-subtle py-6">
            <h2 class="text-lg font-semibold text-balance break-words hyphens-auto sm:text-xl">
              <a
                href={href(`/alternatives/${page.slug}`)}
                class="inline-flex min-h-11 items-center text-foreground underline-offset-4 hover:text-primary hover:underline sm:min-h-9"
              >
                {page.title}
              </a>
            </h2>
            <p class="text-base text-muted text-pretty">{page.answer}</p>
            <p class="text-sm text-muted tabular-nums">
              {rich(`Alternative.checked`, {
                time: (text) => <time datetime={page.checked}>{text}</time>,
              }, { date: format.date(page.checked) })}
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}
