import type { JSX } from "preact"
import { findPlan, type Plan, PRO_PLAN_ID, yearlySavingOf } from "@domain/billing"
import type { Language } from "@domain/identity"
import {
  IconArrowRight,
  IconDownload,
  IconGitHub,
  IconServer,
  IconShieldCheck,
  IconUsers,
} from "@spy4x/preact-icons"
import { PlanCard } from "@spy4x/preact-ui/billing"
import { FaqList } from "@spy4x/preact-ui/faq-list"
import { PageHero } from "@spy4x/preact-ui/page-hero"
import { currencyDecimals } from "@spy4x/platform/universal/money"
import { faqPageJsonLd } from "@spy4x/platform/universal/seo"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { siteEnglishText } from "@ui/site-text.ts"
import { CONTACT_EMAIL } from "../../brand.ts"
import { Band } from "../../components/band.tsx"
import { SectionIntro } from "../../components/section-intro.tsx"
import {
  machineText,
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

/**
 * The day this page's prices or wording last changed: the hero's "Updated" line and the sitemap's
 * `lastmod`. Change it with them.
 */
export const PRICING_UPDATED = `2026-11-08`

/** The plan this page sells, from the catalog, so the page and the checkout never disagree. */
const HOUSEHOLD: Plan = findPlan(PRO_PLAN_ID)!

/**
 * A price of the catalog in `language`, with no `.00` on a whole amount: `400` is `$4` in English
 * and `4 US$` in Spanish.
 */
export function planPrice(amount: number, currency: string, language: string): string {
  return new Intl.NumberFormat(language, {
    style: `currency`,
    currency,
    trailingZeroDisplay: `stripIfInteger`,
  }).format(amount / 10 ** currencyDecimals(currency))
}

/** The numbers the page's words name, all from the Household plan, written for `language`. */
export function householdValues(language: string) {
  const money = (amount: number) => planPrice(amount, HOUSEHOLD.currency, language)
  return {
    monthly: money(HOUSEHOLD.amount),
    yearly: money(HOUSEHOLD.yearlyAmount!),
    members: HOUSEHOLD.entitlements.limits.maxMembers!,
    days: HOUSEHOLD.refundDays!,
    // How many monthly payments the yearly price saves: `count`, so the words can be plural.
    count: Math.round(yearlySavingOf(HOUSEHOLD) / HOUSEHOLD.amount),
    email: CONTACT_EMAIL,
  }
}

/** The page's title and description in the language of `t`. */
export function pricingHead(t: Translator<string>): { title: string; description: string } {
  const values = householdValues(t.language)
  return {
    title: t.t(`Pricing.title`, values),
    description: t.t(`Pricing.description`, values),
  }
}

/** The page's head in English, for the page list. */
export const PRICING_HEAD = pricingHead(siteEnglishText())

/** The questions by their catalog keys, each written out so the catalog test finds it. */
const FAQ = [
  { id: `faq-trial`, question: `PricingFaq.trialQuestion`, answer: `PricingFaq.trialAnswer` },
  { id: `faq-partner`, question: `PricingFaq.partnerQuestion`, answer: `PricingFaq.partnerAnswer` },
  { id: `faq-stop`, question: `PricingFaq.stopQuestion`, answer: `PricingFaq.stopAnswer` },
  { id: `faq-move`, question: `PricingFaq.moveQuestion`, answer: `PricingFaq.moveAnswer` },
  { id: `faq-self`, question: `PricingFaq.selfQuestion`, answer: `PricingFaq.selfAnswer` },
  { id: `faq-cancel`, question: `PricingFaq.cancelQuestion`, answer: `PricingFaq.cancelAnswer` },
  { id: `faq-tax`, question: `PricingFaq.taxQuestion`, answer: `PricingFaq.taxAnswer` },
] as const

/** The questions in the language of `t`, each answer as plain text for the structured data. */
function faqItems(t: Translator<string>) {
  const values = householdValues(t.language)
  return FAQ.map(({ id, question, answer }) => ({
    id,
    question: t.t(question, values),
    answerText: t.t(answer, values),
  }))
}

/** The page's structured data: the software with its offers, its author, the questions and the trail. */
function pricingJsonLd(t: Translator<string>, origin: string, language: Language): unknown[] {
  const faq = faqItems(t).map((item) => ({ ...item, answerText: machineText(item.answerText) }))
  return [
    softwareJsonLd(origin),
    PERSON_JSON_LD,
    faqPageJsonLd(faq),
    siteBreadcrumbsJsonLd(origin, `/pricing`, t.t(`Pricing.crumb`), language),
  ]
}

/** The four promises under the cards, each an icon, a short title and one line. */
const PROMISES = [
  { Icon: IconUsers, title: `PricingPromise.membersTitle`, text: `PricingPromise.membersText` },
  { Icon: IconShieldCheck, title: `PricingPromise.refundTitle`, text: `PricingPromise.refundText` },
  { Icon: IconDownload, title: `PricingPromise.keepTitle`, text: `PricingPromise.keepText` },
  { Icon: IconServer, title: `PricingPromise.moveTitle`, text: `PricingPromise.moveText` },
] as const

const NOTE_LINK = `underline underline-offset-2 hover:text-foreground`

/** The two ways to have Financy, side by side: the Household cloud plan and self-hosting. */
function PricingPlans({ spaOrigin }: { spaOrigin: string }): JSX.Element {
  const { t, href, language } = useSite()
  const values = householdValues(language)
  // Declared apart: `ButtonLinkProps` passes `data-*` through, but an object literal written in
  // place would fail TypeScript's excess-property check on the hyphenated names.
  const signUp = {
    href: `${spaOrigin}/sign-up`,
    children: t.t(`PricingHousehold.action`),
    "data-e2e": `pricing-signup`,
    "data-umami-event": `signup`,
    "data-umami-event-from": `pricing`,
  }
  const github = {
    href: REPOSITORY_URL,
    children: (
      <>
        <IconGitHub class="size-5" aria-hidden="true" /> {t.t(`PricingSelfHost.github`)}
      </>
    ),
    "data-e2e": `pricing-github`,
    "data-umami-event": `github`,
    "data-umami-event-from": `pricing`,
  }
  return (
    <Band id="plans">
      <div class="flex max-w-5xl flex-col gap-12">
        <div class="grid gap-6 md:grid-cols-[3fr_2fr]">
          <PlanCard
            planName={HOUSEHOLD.name}
            description={t.t(`PricingHousehold.description`)}
            price={t.t(`PricingHousehold.price`, values)}
            priceNote={t.t(`PricingHousehold.yearly`, values)}
            features={[
              t.t(`PricingHousehold.members`, values),
              t.t(`PricingHousehold.partner`),
              t.t(`PricingHousehold.devices`),
              t.t(`PricingHousehold.export`),
              t.t(`PricingHousehold.noServer`),
            ]}
            highlighted
            subgrid
            locale={language}
            action={signUp}
            notes={
              <>
                <p>{t.t(`PricingHousehold.payment`, values)}</p>
                <p>{t.t(`PricingHousehold.currency`)}</p>
                <p class="flex gap-4">
                  <a class={NOTE_LINK} href={href(`/terms`)}>{t.t(`SiteFooter.terms`)}</a>
                  <a class={NOTE_LINK} href={href(`/privacy`)}>{t.t(`SiteFooter.privacy`)}</a>
                </p>
              </>
            }
          />
          <PlanCard
            planName={t.t(`PricingSelfHost.name`)}
            description={t.t(`PricingSelfHost.description`)}
            price={t.t(`PricingSelfHost.price`)}
            features={[
              t.t(`PricingSelfHost.sameCode`),
              t.t(`PricingSelfHost.noLimit`, values),
              t.t(`PricingSelfHost.server`),
              t.t(`PricingSelfHost.data`),
            ]}
            subgrid
            locale={language}
            action={github}
            notes={
              <p>
                <a
                  class={`inline-flex items-center gap-1 ${NOTE_LINK}`}
                  href={href(`/docs/deploy`)}
                >
                  {t.t(`PricingSelfHost.deploy`)}
                  <IconArrowRight class="size-4 rtl:-scale-x-100" aria-hidden="true" />
                </a>
              </p>
            }
          />
        </div>
        <ul
          role="list"
          class="grid gap-6 border-t border-subtle pt-8 sm:grid-cols-2 lg:grid-cols-4"
        >
          {PROMISES.map(({ Icon, title, text }) => (
            <li key={title} class="flex items-start gap-3">
              <span class="flex h-6 shrink-0 items-center">
                <Icon class="size-5 text-primary" aria-hidden="true" />
              </span>
              <p class="flex flex-col gap-1">
                <strong class="font-semibold">{t.t(title, values)}</strong>
                <span class="text-sm text-muted text-pretty">{t.t(text, values)}</span>
              </p>
            </li>
          ))}
        </ul>
      </div>
    </Band>
  )
}

/**
 * The pricing page: the Household cloud plan and free self-hosting, then what a buyer is promised
 * and the questions about the price. Left out of the nav, the footer and the sitemap until the
 * first deploy opens the cloud.
 */
export default define.page(function Pricing({ state }) {
  const { t, language } = useSite()
  const values = householdValues(language)
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
        title={t.t(`PricingHero.title`, values)}
        lead={t.t(`PricingHero.lead`, values)}
        author={SITE_AUTHOR}
        updated={PRICING_UPDATED}
      />
      <PricingPlans spaOrigin={state.spaOrigin} />
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
