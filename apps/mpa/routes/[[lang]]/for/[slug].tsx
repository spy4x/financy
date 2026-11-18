// An audience page exists in every language the site serves: its words are keys of the `site`
// catalog, named in `audience-data.ts`.
import type { JSX } from "preact"
import type { Language } from "@domain/identity"
import { Breadcrumbs } from "@spy4x/preact-ui/breadcrumbs"
import { Button } from "@spy4x/preact-ui/button"
import { FaqList } from "@spy4x/preact-ui/faq-list"
import { FeatureCard } from "@spy4x/preact-ui/feature-card"
import { useFormat } from "@spy4x/preact-ui/format"
import { OnThisPage } from "@spy4x/preact-ui/on-this-page"
import { breadcrumbListJsonLd, faqPageJsonLd } from "@spy4x/platform/universal/seo"
import {
  AUDIENCE_PAGES,
  type AudienceBlock,
  type AudiencePage,
  audiencePage,
  audiencePageIn,
  audiencePath,
} from "../../../audience-data.ts"
import { Band } from "../../../components/band.tsx"
import { LINK, Section } from "../../../components/page-section.tsx"
import { Shot } from "../../../components/shot.tsx"
import { featurePage, featurePageIn, featurePath } from "../../../features-data.tsx"
import { localePath, siteTranslator } from "../../../languages.ts"
import {
  demoHref,
  PERSON_JSON_LD,
  sectionLinks,
  SITE_NAME,
  SiteFrame,
  softwareId,
  softwareJsonLd,
} from "../../../site.tsx"
import { useSite } from "../../../use-site.tsx"
import { define } from "../../../utils.ts"
import { renderNotFound } from "../features/[slug].tsx"

/**
 * One audience page, built from {@link AUDIENCE_PAGES}, in the address's language; an unknown slug,
 * `constructor` too, answers the feature pages' 404, which leads to `/features`.
 */
export const handler = define.handlers({
  GET(ctx) {
    const keys = audiencePage(ctx.params.slug ?? ``)
    if (!keys) return renderNotFound(ctx)
    const { language } = ctx.state
    const t = siteTranslator(language)
    const page = audiencePageIn(t, keys)
    return ctx.render(
      <SiteFrame
        state={ctx.state}
        path={audiencePath(page.slug)}
        head={{
          title: page.title,
          description: page.description,
          og: `features`,
          jsonLd: pageJsonLd(ctx.state.webAppOrigin, page, language),
        }}
      >
        <AudienceBody page={page} demo={demoHref(ctx.state)} />
      </SiteFrame>,
    )
  },
})

/** The page's structured data: the page about the software, its two-level trail, its questions. */
function pageJsonLd(origin: string, page: AudiencePage, language: Language): unknown[] {
  const url = `${origin}${audiencePath(page.slug, language)}`
  return [
    {
      "@type": `WebPage`,
      "@id": url,
      url,
      name: page.h1,
      description: page.description,
      inLanguage: language,
      dateModified: page.updated,
      about: { "@id": softwareId(origin) },
    },
    softwareJsonLd(origin),
    PERSON_JSON_LD,
    breadcrumbListJsonLd(url, [
      { name: SITE_NAME, href: `${origin}${localePath(language, `/`)}` },
      { name: page.name },
    ]),
    faqPageJsonLd(
      page.questions.map(({ question, answer }) => ({ question, answerText: answer })),
    ),
  ]
}

/** The page's one filled button: the public demo, counted with the page it was pressed on. */
function DemoButton({ slug, demo, e2e }: { slug: string; demo: string; e2e: string }) {
  const { t } = useSite()
  // Declared apart: `ButtonLinkProps` passes `data-*` through, but an object literal written in
  // place would fail TypeScript's excess-property check on the hyphenated names.
  const link = {
    href: demo,
    rel: `nofollow`,
    size: `lg` as const,
    class: `w-full sm:w-auto`,
    children: t.t(`AudiencePage.demo`),
    "data-e2e": e2e,
    "data-umami-event": `try-demo`,
    "data-umami-event-from": `for-${slug}`,
  }
  return <Button {...link} />
}

/** The block only this page has, as a paragraph, a list of terms or two columns. */
function Block({ block }: { block: AudienceBlock }): JSX.Element {
  if (block.kind === `text`) return <p class="text-pretty wrap-anywhere">{block.body}</p>
  if (block.kind === `columns`) {
    return (
      <div class="grid gap-6 sm:grid-cols-2">
        {block.columns.map((column) => (
          <div key={column.title} class="flex min-w-0 flex-col gap-2">
            <h3 class="font-semibold text-balance">{column.title}</h3>
            <ul class="list-disc space-y-1 ps-4">
              {column.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        ))}
      </div>
    )
  }
  return (
    <>
      <dl class="flex flex-col gap-3">
        {block.terms.map(({ term, detail }) => (
          <div key={term} class="min-w-0">
            <dt class="font-semibold">{term}</dt>
            <dd class="text-pretty">{detail}</dd>
          </div>
        ))}
      </dl>
      {block.note && <p class="text-pretty">{block.note}</p>}
    </>
  )
}

/**
 * The page in its fixed order: trail, heading, answer, the demo, the date, the screenshot, then How
 * it works, the page's own block, What Financy does not do, Questions and the demo again. From
 * 1280 px "On this page" stands beside the body, as on a feature page.
 */
function AudienceBody({ page, demo }: { page: AudiencePage; demo: string }): JSX.Element {
  const { t, href, rich } = useSite()
  const format = useFormat().utc()
  const sections = [
    { id: `how`, label: t.t(`FeaturePage.how`) },
    { id: page.block.id, label: page.block.title },
    { id: `limits`, label: t.t(`AudiencePage.limits`) },
    { id: `questions`, label: t.t(`FeaturePage.questions`) },
  ]
  return (
    <>
      <article
        class="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16 xl:grid xl:max-w-7xl xl:grid-cols-[minmax(0,1fr)_42rem_minmax(0,1fr)] xl:gap-x-12"
        data-e2e="audience-page"
      >
        <header class="flex min-w-0 flex-col gap-4 xl:col-start-2">
          <Breadcrumbs items={[{ label: SITE_NAME, href: href(`/`) }, { label: page.name }]} />
          <h1 class="text-3xl font-semibold tracking-tight text-balance break-words hyphens-auto lg:text-4xl">
            {page.h1}
          </h1>
          <p class="text-lg text-pretty text-foreground" data-e2e="audience-answer">
            {page.answer}
          </p>
          {page.disclaimer && (
            <p class="font-medium text-pretty" data-e2e="audience-disclaimer">{page.disclaimer}</p>
          )}
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <DemoButton slug={page.slug} demo={demo} e2e="audience-demo" />
            <p class="text-sm text-muted">{t.t(`AudiencePage.demoNote`)}</p>
          </div>
          <p class="text-sm text-muted" data-e2e="audience-updated">
            {rich(`FeaturePage.updated`, {
              time: (text) => <time datetime={page.updated}>{text}</time>,
            }, { date: format.date(page.updated) })}
          </p>
          <figure class="mt-4 flex flex-col gap-3">
            <div
              dir="ltr"
              class="mx-auto w-full max-w-[390px] overflow-hidden rounded-xl border border-subtle"
            >
              <Shot
                name={page.shot.name}
                kind="mobile"
                height={page.shot.height}
                alt={page.shot.alt}
                sizes="(min-width: 430px) 390px, calc(100vw - 2rem)"
                priority
              />
            </div>
            <figcaption class="text-center text-sm text-muted text-pretty">
              {page.shot.caption}
            </figcaption>
          </figure>
        </header>
        <div class="mt-8 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:mt-0">
          <OnThisPage
            links={sectionLinks(sections.map(({ id, label }) => ({ label, href: `#${id}` })))}
            openFrom="xl"
          />
        </div>
        <div class="mt-12 flex min-w-0 flex-col gap-12 xl:col-start-2">
          <Section id="how" label={t.t(`FeaturePage.how`)}>
            {page.how.map((paragraph) => <p key={paragraph} class="text-pretty">{paragraph}</p>)}
          </Section>
          <Section id={page.block.id} label={page.block.title}>
            <Block block={page.block} />
          </Section>
          <Section id="limits" label={t.t(`AudiencePage.limits`)}>
            <ul class="list-disc space-y-1 ps-4" data-e2e="audience-limits">
              {page.limits.map((limit) => <li key={limit}>{limit}</li>)}
            </ul>
          </Section>
          <Section id="questions" label={t.t(`FeaturePage.questions`)}>
            <FaqList
              items={page.questions.map(({ id, question, answer }) => ({
                id,
                question,
                answer: <p>{answer}</p>,
              }))}
            />
          </Section>
          <div>
            <DemoButton slug={page.slug} demo={demo} e2e="audience-demo-end" />
          </div>
        </div>
      </article>
      <NextSteps page={page} />
    </>
  )
}

/** The page's two feature pages as cards, then the other audience pages. */
function NextSteps({ page }: { page: AudiencePage }): JSX.Element {
  const { t, language } = useSite()
  const features = page.features.map((slug) => featurePageIn(t, featurePage(slug)!))
  const others = AUDIENCE_PAGES.filter(({ slug }) => slug !== page.slug)
  return (
    <Band id="next-steps">
      <div class="flex flex-col gap-8">
        <div class="grid gap-6 lg:grid-cols-2">
          {features.map((feature) => (
            <FeatureCard
              key={feature.slug}
              id={`feature-${feature.slug}`}
              title={feature.name}
              href={featurePath(feature.slug, language)}
              linkLabel={t.t(`FeaturePage.readMore`, { name: feature.name })}
              headingLevel={2}
            >
              {feature.summary}
            </FeatureCard>
          ))}
        </div>
        <nav aria-label={t.t(`AudiencePage.also`)} data-e2e="audience-also">
          <p class="font-semibold">{t.t(`AudiencePage.also`)}</p>
          <ul class="flex flex-wrap gap-x-6">
            {others.map((other) => (
              <li key={other.slug}>
                <a href={audiencePath(other.slug, language)} class={LINK}>{t.t(other.name)}</a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </Band>
  )
}
