import { IconGitHub } from "@spy4x/preact-icons"
import { Button } from "@spy4x/preact-ui/button"
import { FaqList } from "@spy4x/preact-ui/faq-list"
import { faqPageJsonLd } from "@spy4x/platform/universal/seo"
import { PageHero } from "@spy4x/preact-ui/page-hero"
import { Band } from "../../components/band.tsx"
import { PricingWays } from "../../components/pricing-ways.tsx"
import { SectionIntro } from "../../components/section-intro.tsx"
import {
  PERSON_JSON_LD,
  REPOSITORY_URL,
  SITE_AUTHOR,
  siteBreadcrumbsJsonLd,
  SiteFrame,
  type SitePageHead,
  softwareJsonLd,
} from "../../site.tsx"
import { useSite } from "../../use-site.tsx"
import { define } from "../../utils.ts"
import type { Language } from "@domain/identity"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { siteEnglishText } from "@ui/site-text.ts"

/**
 * The day this page's prices or wording last changed: the hero's "Updated" line and the sitemap's
 * `lastmod`. Change it with them.
 */
export const PRICING_UPDATED = `2026-11-04`

/** The page's title and description in the language of `t`. */
export function pricingHead(t: Translator<string>): { title: string; description: string } {
  return { title: t.t(`Pricing.title`), description: t.t(`Pricing.description`) }
}

/** The page's head in English, for the page list. */
export const PRICING_HEAD = pricingHead(siteEnglishText())

/** The questions by their catalog keys, each written out so the catalog test finds it. */
const FAQ = [
  { id: `faq-paid`, question: `PricingFaq.paidQuestion`, answer: `PricingFaq.paidAnswer` },
  { id: `faq-server`, question: `PricingFaq.serverQuestion`, answer: `PricingFaq.serverAnswer` },
  { id: `faq-owe`, question: `PricingFaq.oweQuestion`, answer: `PricingFaq.oweAnswer` },
] as const

/** The questions in the language of `t`, each answer as plain text for the structured data. */
function faqItems(t: Translator<string>) {
  return FAQ.map(({ id, question, answer }) => ({
    id,
    question: t.t(question),
    answerText: t.t(answer),
  }))
}

/** The page's structured data: the software, its author, the questions and the trail. */
function pricingJsonLd(t: Translator<string>, origin: string, language: Language): unknown[] {
  return [
    softwareJsonLd(origin),
    PERSON_JSON_LD,
    faqPageJsonLd(faqItems(t)),
    siteBreadcrumbsJsonLd(origin, `/pricing`, t.t(`Pricing.crumb`), language),
  ]
}

/**
 * The pricing page: self-hosting is free and running it costs one server. Left out of the nav, the
 * footer and the sitemap until #87 adds the paid cloud and its prices.
 */
export default define.page(function Pricing({ state }) {
  const { t, language } = useSite()
  const head: SitePageHead = {
    ...pricingHead(t),
    og: `pricing`,
    jsonLd: pricingJsonLd(t, state.webAppOrigin, language),
  }
  return (
    <SiteFrame state={state} path="/pricing" head={head}>
      <PageHero
        class="site-glow"
        eyebrow={t.t(`PricingHero.eyebrow`)}
        title={t.t(`PricingHero.title`)}
        lead={t.t(`PricingHero.lead`)}
        author={SITE_AUTHOR}
        updated={PRICING_UPDATED}
      >
        <div class="flex w-full flex-col gap-4 pt-2 sm:w-auto sm:flex-row">
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
      <PricingWays />
      <Band id="faq" labelledBy="faq-title" width="3xl">
        <div class="flex flex-col gap-8">
          <SectionIntro
            id="faq-title"
            eyebrow={t.t(`HomeFaq.eyebrow`)}
            title={t.t(`PricingFaq.title`)}
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
