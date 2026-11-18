// A comparison exists in every language the site serves: its words are keys of the `site` catalog,
// named in `alternatives-data.ts`.
import type { JSX } from "preact"
import type { Language } from "@domain/identity"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { IconArrowRight } from "@spy4x/preact-icons"
import { Breadcrumbs } from "@spy4x/preact-ui/breadcrumbs"
import { ComparisonTable } from "@spy4x/preact-ui/comparison-table"
import { FaqList } from "@spy4x/preact-ui/faq-list"
import { FeatureCard } from "@spy4x/preact-ui/feature-card"
import { useFormat } from "@spy4x/preact-ui/format"
import { OnThisPage } from "@spy4x/preact-ui/on-this-page"
import { StatusMark } from "@spy4x/preact-ui/status-mark"
import { breadcrumbListJsonLd, faqPageJsonLd } from "@spy4x/platform/universal/seo"
import { Band } from "../../../components/band.tsx"
import { HEADING, LINK, Section } from "../../../components/page-section.tsx"
import {
  type Alternative,
  alternative,
  alternativeIn,
  alternativePath,
  alternativesPath,
} from "../../../alternatives-data.ts"
import { CONTACT_EMAIL } from "../../../brand.ts"
import { featurePage, featurePageIn, featurePath } from "../../../features-data.tsx"
import { localePath, siteTranslator } from "../../../languages.ts"
import {
  demoHref,
  PERSON_JSON_LD,
  sectionLinks,
  SELF_HOST_GUIDE,
  SITE_NAME,
  SiteFrame,
  softwareId,
  softwareJsonLd,
} from "../../../site.tsx"
import { STATUS_UPDATED } from "../../index.tsx"
import { useSite } from "../../../use-site.tsx"
import { define } from "../../../utils.ts"
import { renderNotFound } from "../features/[slug].tsx"

/**
 * One comparison, built from {@link alternative}, in the address's language; an unknown slug,
 * `constructor` too, answers the feature pages' 404.
 */
export const handler = define.handlers({
  GET(ctx) {
    const keys = alternative(ctx.params.slug ?? ``)
    if (!keys) return renderNotFound(ctx)
    const { language } = ctx.state
    const t = siteTranslator(language)
    const page = alternativeIn(t, keys)
    return ctx.render(
      <SiteFrame
        state={ctx.state}
        path={alternativePath(page.slug)}
        head={{
          title: page.title,
          description: page.description,
          og: `features`,
          jsonLd: pageJsonLd(t, ctx.state.webAppOrigin, page, language),
        }}
      >
        <AlternativeBody page={page} demo={demoHref(ctx.state)} />
      </SiteFrame>,
    )
  },
})

/** The page's structured data: the page about the software, its trail and its visible questions. */
function pageJsonLd(
  t: Translator<string>,
  origin: string,
  page: Alternative,
  language: Language,
): unknown[] {
  const url = `${origin}${alternativePath(page.slug, language)}`
  return [
    {
      "@type": `WebPage`,
      "@id": url,
      url,
      name: page.h1,
      description: page.description,
      inLanguage: language,
      dateModified: page.checked,
      about: { "@id": softwareId(origin) },
    },
    softwareJsonLd(origin),
    PERSON_JSON_LD,
    breadcrumbListJsonLd(url, [
      { name: SITE_NAME, href: `${origin}${localePath(language, `/`)}` },
      { name: t.t(`Alternatives.crumb`), href: `${origin}${alternativesPath(language)}` },
      { name: page.competitor },
    ]),
    faqPageJsonLd(
      page.questions.map(({ question, answer }) => ({ question, answerText: answer })),
    ),
  ]
}

/** The page's sections, in order, as `[id, catalog key of its heading]`. */
const SECTIONS = [
  [`glance`, `Alternative.glance`],
  [`better`, `Alternative.better`],
  [`moving`, `Alternative.moving`],
  [`questions`, `FeaturePage.questions`],
] as const

/**
 * The page in its fixed order: trail, heading, checked date, the answer that says first when to
 * stay on the other tool, the table, the other tools, the way over, the questions, then the next
 * steps. From 1280 px "On this page" stands beside the body, as on a feature page.
 */
function AlternativeBody({ page, demo }: { page: Alternative; demo: string }): JSX.Element {
  const { t, href, rich } = useSite()
  const format = useFormat().utc()
  const label = (id: (typeof SECTIONS)[number][0]) =>
    t.t(SECTIONS.find(([section]) => section === id)![1], { name: page.competitor })
  const external = (link: string) => (text: string) => (
    <a href={link} class="font-medium text-primary underline underline-offset-4">{text}</a>
  )
  return (
    <>
      <article
        class="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16 xl:grid xl:max-w-7xl xl:grid-cols-[minmax(0,1fr)_42rem_minmax(0,1fr)] xl:gap-x-12"
        data-e2e="alternative-page"
      >
        <header class="flex min-w-0 flex-col gap-4 xl:col-start-2">
          <Breadcrumbs
            items={[
              { label: SITE_NAME, href: href(`/`) },
              { label: t.t(`Alternatives.crumb`), href: href(`/alternatives`) },
              { label: page.competitor },
            ]}
          />
          <h1 class="text-3xl font-semibold tracking-tight text-balance break-words hyphens-auto lg:text-4xl">
            {page.h1}
          </h1>
          <p class="text-sm text-muted" data-e2e="alternative-checked">
            {rich(`Alternative.checked`, {
              time: (text) => <time datetime={page.checked}>{text}</time>,
            }, { date: format.date(page.checked) })}
          </p>
          <p class="text-lg text-pretty text-foreground" data-e2e="alternative-answer">
            {page.answer}
          </p>
          <p class="flex items-start gap-2 text-sm text-muted">
            <StatusMark status="wip" label="" class="mt-1" />
            <span>
              {rich(`HomeHero.status`, {
                status: (text) => (
                  <a href={`${href(`/`)}#status`} class="text-primary underline">{text}</a>
                ),
              }, { date: format.date(STATUS_UPDATED) })}
            </span>
          </p>
          <p>
            <a href={demo} rel="nofollow" class={LINK} data-e2e="alternative-demo">
              {t.t(`FeaturePage.demo`)} <IconArrowRight class="size-4" aria-hidden="true" />
            </a>
          </p>
        </header>
        <div class="mt-8 xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:mt-0">
          <OnThisPage
            links={sectionLinks(SECTIONS.map(([id]) => ({ label: label(id), href: `#${id}` })))}
            openFrom="xl"
          />
        </div>
        <div class="mt-12 flex min-w-0 flex-col gap-12 xl:col-start-2">
          <Section id="glance" label={label(`glance`)}>
            <ComparisonTable
              caption={t.t(`Alternative.caption`, { name: page.competitor })}
              products={[SITE_NAME, page.competitor]}
              rows={page.rows}
              checkedOn={new Date(page.checked)}
              method={rich(page.method, {
                mail: (text) => (
                  <a href={`mailto:${CONTACT_EMAIL}`} class="text-primary underline">{text}</a>
                ),
              }, { email: CONTACT_EMAIL })}
              fit={page.fit}
            />
          </Section>
          <Section id="better" label={label(`better`)}>
            <p class="text-pretty" data-e2e="alternative-better">
              {rich(
                page.better,
                Object.fromEntries(
                  Object.entries(page.betterLinks).map(([tag, link]) => [tag, external(link)]),
                ),
              )}
            </p>
          </Section>
          <Section id="moving" label={label(`moving`)}>
            <p class="text-pretty">{page.moving}</p>
          </Section>
          <Section id="questions" label={label(`questions`)}>
            <FaqList
              items={page.questions.map(({ id, question, answer }) => ({
                id,
                question,
                answer: <p>{answer}</p>,
              }))}
            />
          </Section>
        </div>
      </article>
      <NextSteps page={page} demo={demo} />
    </>
  )
}

/** The demo and the self-hosting guide, the feature pages the comparison is about, every comparison. */
function NextSteps({ page, demo }: { page: Alternative; demo: string }): JSX.Element {
  const { t, language, href } = useSite()
  const features = page.features.map((slug) => featurePageIn(t, featurePage(slug)!))
  return (
    <Band id="next-steps" labelledBy="next-steps-title">
      <div class="flex flex-col gap-8">
        <h2 id="next-steps-title" class={HEADING}>{t.t(`Alternative.next`)}</h2>
        <p class="flex flex-wrap gap-x-6">
          <a href={demo} rel="nofollow" class={LINK} data-e2e="alternative-band-demo">
            {t.t(`Alternative.demo`)} <IconArrowRight class="size-4" aria-hidden="true" />
          </a>
          <a href={href(SELF_HOST_GUIDE)} class={LINK}>
            {t.t(`Alternative.selfHost`)} <IconArrowRight class="size-4" aria-hidden="true" />
          </a>
        </p>
        <div class="grid gap-6 lg:grid-cols-2">
          {features.map((feature) => (
            <FeatureCard
              key={feature.slug}
              id={`feature-${feature.slug}`}
              title={feature.name}
              href={featurePath(feature.slug, language)}
              linkLabel={t.t(`FeaturePage.readMore`, { name: feature.name })}
              headingLevel={3}
            >
              {feature.summary}
            </FeatureCard>
          ))}
        </div>
        <p>
          <a href={href(`/alternatives`)} class={LINK} data-e2e="alternative-all">
            {t.t(`Alternative.all`)} <IconArrowRight class="size-4" aria-hidden="true" />
          </a>
        </p>
      </div>
    </Band>
  )
}
