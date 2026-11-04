import type { JSX } from "preact"
import { IconGitHub } from "@spy4x/preact-icons"
import { Button } from "@spy4x/preact-ui/button"
import { FaqList } from "@spy4x/preact-ui/faq-list"
import { OnThisPage } from "@spy4x/preact-ui/on-this-page"
import { PageHero } from "@spy4x/preact-ui/page-hero"
import { faqPageJsonLd } from "@spy4x/platform/universal/seo"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { siteEnglishText } from "@ui/site-text.ts"
import { Band } from "../../components/band.tsx"
import {
  FeatureSection,
  type FeatureSectionProps,
  FeatureTier,
} from "../../components/features-section.tsx"
import { SectionIntro } from "../../components/section-intro.tsx"
import { featurePath, pageOfFeature, tiers } from "../../features-data.tsx"
import {
  PERSON_JSON_LD,
  REPOSITORY_URL,
  sectionLinks,
  SITE_AUTHOR,
  siteBreadcrumbsJsonLd,
  SiteFrame,
  type SitePageHead,
  softwareJsonLd,
} from "../../site.tsx"
import { type Site, useSite } from "../../use-site.tsx"
import { define } from "../../utils.ts"

/**
 * The day this page's feature list or wording last changed: the hero's "Updated" line and the
 * sitemap's `lastmod`. Change it with them.
 */
export const FEATURES_UPDATED = `2026-11-04`

/** The page's title and description in the language of `t`. */
export function featuresHead(t: Translator<string>): { title: string; description: string } {
  return { title: t.t(`Features.title`), description: t.t(`Features.description`) }
}

/** The page's head in English, for the page list. */
export const FEATURES_HEAD = featuresHead(siteEnglishText())

/**
 * What a visitor asks that the sections above do not answer, with each answer as plain text for the
 * FAQ's structured data. Each answer's first sentence stands alone, in 40 words or fewer.
 */
const FAQ = [
  {
    id: `faq-serverless`,
    question: `FeaturesFaq.serverlessQuestion`,
    answer: `FeaturesFaq.serverlessAnswer`,
  },
  {
    id: `faq-database`,
    question: `FeaturesFaq.databaseQuestion`,
    answer: `FeaturesFaq.databaseAnswer`,
  },
  { id: `faq-native`, question: `FeaturesFaq.nativeQuestion`, answer: `FeaturesFaq.nativeAnswer` },
] as const

/** The questions in the language of `t`, each answer as plain text for the structured data. */
function faqItems(t: Translator<string>) {
  return FAQ.map(({ id, question, answer }) => ({
    id,
    question: t.t(question),
    answerText: t.t(answer),
  }))
}

/** The page's structured data: the software, its questions, and the page's place. */
function featuresJsonLd(site: Site, origin: string): unknown[] {
  return [
    softwareJsonLd(origin, {
      featureList: tiers(site).flatMap((tier) => tier.features.map((feature) => feature.nav)),
    }),
    PERSON_JSON_LD,
    faqPageJsonLd(faqItems(site.t)),
    siteBreadcrumbsJsonLd(origin, `/features`, site.t.t(`SiteNav.features`), site.language),
  ]
}

/** The feature page a section's text links to, in the page's language, when the feature has one. */
function pageLink({ language }: Site, id: string): FeatureSectionProps["more"] {
  const page = pageOfFeature(id)
  return page && { href: featurePath(page.slug, language) }
}

/** The hero: what works today, a note that the money itself is not built yet, and the code. */
function Hero(): JSX.Element {
  const { t, rich, href } = useSite()
  return (
    <PageHero
      class="site-glow"
      eyebrow={t.t(`SiteNav.features`)}
      title={t.t(`FeaturesHero.title`)}
      lead={t.t(`FeaturesHero.lead`)}
      author={SITE_AUTHOR}
      updated={FEATURES_UPDATED}
      note={rich(`FeaturesHero.note`, {
        status: (text) => <a href={`${href(`/`)}#status`} class="text-primary underline">{text}</a>,
      })}
    >
      <div class="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
        <Button
          href={REPOSITORY_URL}
          size="lg"
          data-umami-event="github"
          data-umami-event-from="hero"
        >
          <IconGitHub class="size-5" aria-hidden="true" /> {t.t(`HomeHero.github`)}
        </Button>
      </div>
    </PageHero>
  )
}

/**
 * `/features`: what works in Financy today, each with what people notice, what a developer gets
 * and a link to the code, then the questions.
 */
export default define.page(function Features({ state }) {
  const site = useSite()
  const { t } = site
  const head: SitePageHead = {
    ...featuresHead(t),
    og: `features`,
    jsonLd: featuresJsonLd(site, state.webAppOrigin),
  }
  const sections = tiers(site)
  const nav = [
    ...sections.flatMap((tier) =>
      tier.features.map((feature) => ({ label: feature.nav, href: `#${feature.id}` }))
    ),
    { label: t.t(`HomeFaq.eyebrow`), href: `#faq` },
  ]
  return (
    <SiteFrame state={state} path="/features" head={head}>
      <Hero />
      <div class="mx-auto grid w-full max-w-6xl gap-12 px-4 py-12 sm:px-6 lg:grid-cols-12 lg:px-8 lg:py-16">
        <div class="lg:col-span-3 xl:col-span-2">
          <OnThisPage links={sectionLinks(nav)} />
        </div>
        <div class="flex min-w-0 flex-col gap-16 lg:col-span-9 xl:col-span-10">
          {sections.map(({ features, ...tier }) => (
            <FeatureTier key={tier.id} {...tier}>
              {features.map(({ nav: _nav, ...feature }, index) => (
                <FeatureSection
                  key={feature.id}
                  {...feature}
                  more={pageLink(site, feature.id)}
                  flip={index % 2 === 1}
                />
              ))}
            </FeatureTier>
          ))}
        </div>
      </div>
      <Band tone="alt" id="faq" labelledBy="faq-title" width="3xl">
        <div class="flex flex-col gap-8">
          <SectionIntro
            id="faq-title"
            eyebrow={t.t(`HomeFaq.eyebrow`)}
            title={t.t(`FeaturesFaq.title`)}
          />
          <FaqList
            items={faqItems(t).map((item) => ({
              id: item.id,
              question: item.question,
              answer: <p>{item.answerText}</p>,
            }))}
          />
        </div>
      </Band>
    </SiteFrame>
  )
})
