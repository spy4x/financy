import type { JSX } from "preact"
import type { PublicContactLink } from "@domain/contact-links"
import { DEFAULT_SUBSCRIBER_LIST } from "@domain/subscribers"
import {
  IconArrowRight,
  IconCheck,
  IconCloudArrowUp,
  IconGitHub,
  IconMinus,
  IconServer,
} from "@spy4x/preact-icons"
import { Button } from "@spy4x/preact-ui/button"
import { Card } from "@spy4x/preact-ui/card"
import { FaqList } from "@spy4x/preact-ui/faq-list"
import { useFormat } from "@spy4x/preact-ui/format"
import { Input } from "@spy4x/preact-ui/input"
import { StatusMark } from "@spy4x/preact-ui/status-mark"
import { faqPageJsonLd } from "@spy4x/platform/universal/seo"
import { FORM_ACTIONS } from "@ui/progressive.tsx"
import { Band } from "../components/band.tsx"
import { ProofStrip } from "../components/proof-strip.tsx"
import { TEST_FILE_COUNT } from "../repo-facts.ts"
import { SectionIntro } from "../components/section-intro.tsx"
import { organizationId, organizationJsonLd } from "../contact-links.ts"
import {
  PERSON_JSON_LD,
  REPOSITORY_URL,
  SITE_NAME,
  SiteFrame,
  type SitePageHead,
  softwareId,
  softwareJsonLd,
} from "../site.tsx"
import { SITE_LANGUAGES } from "../languages.ts"
import { useSite } from "../use-site.tsx"
import { define } from "../utils.ts"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { siteEnglishText } from "@ui/site-text.ts"

/** The home page's title and description in the language of `t`. */
export function homeHead(t: Translator<string>): { title: string; description: string } {
  return { title: t.t(`Home.title`), description: t.t(`Home.description`) }
}

/** The day the home page's content last changed: the sitemap's `lastmod`. Change it with it. */
export const HOME_UPDATED = `2026-11-04`

/**
 * The day the rebuild's status (the hero's line and the "Where the rebuild stands" card) was last
 * checked against the issues. Change it whenever an item moves.
 */
export const STATUS_UPDATED = `2026-11-04`

/** The home page's head in English, for the page list and `llms.txt`. */
export const HOME_HEAD = homeHead(siteEnglishText())

/**
 * Facts a visitor can check in the repository. A number is counted when the site is built
 * (`repo-facts.ts`), never typed here, and is left out when nothing counted it.
 */
const PROOF = [
  ...(TEST_FILE_COUNT === undefined
    ? []
    : [{ value: `${TEST_FILE_COUNT}`, label: `HomeProof.tests` }]),
  { value: `AGPL-3.0`, label: `HomeProof.licence` },
  { value: `${SITE_LANGUAGES.length}`, label: `HomeProof.languages` },
] as const

/** What works today, by catalog key. */
const WORKS_TODAY = [
  `HomeStatus.signIn`,
  `HomeStatus.groups`,
  `HomeStatus.realtime`,
  `HomeStatus.export`,
  `HomeStatus.languages`,
  `HomeStatus.selfHost`,
] as const

/** What is being built now, each with the issue that tracks it. */
const BUILDING_NOW = [
  { key: `HomeStatus.accounts`, issue: 94 },
  { key: `HomeStatus.transactions`, issue: 96 },
  { key: `HomeStatus.transfers`, issue: 97 },
  { key: `HomeStatus.month`, issue: 99 },
] as const

/** Who Financy is for, by catalog key. */
const WHO = [
  { id: `who-keeper`, title: `HomeWho.keeperTitle`, text: `HomeWho.keeperText` },
  { id: `who-partner`, title: `HomeWho.partnerTitle`, text: `HomeWho.partnerText` },
  { id: `who-self-host`, title: `HomeWho.selfHostTitle`, text: `HomeWho.selfHostText` },
] as const

/** The questions by their catalog keys, each written out so the catalog test finds it. */
const FAQ = [
  { id: `faq-use`, question: `HomeFaq.useQuestion`, answer: `HomeFaq.useAnswer` },
  { id: `faq-free`, question: `HomeFaq.freeQuestion`, answer: `HomeFaq.freeAnswer` },
  { id: `faq-currencies`, question: `HomeFaq.currencyQuestion`, answer: `HomeFaq.currencyAnswer` },
  { id: `faq-bank`, question: `HomeFaq.bankQuestion`, answer: `HomeFaq.bankAnswer` },
  { id: `faq-stops`, question: `HomeFaq.stopsQuestion`, answer: `HomeFaq.stopsAnswer` },
] as const

/** The questions in the language of `t`, each answer as plain text for the structured data. */
function faqItems(t: Translator<string>) {
  return FAQ.map(({ id, question, answer }) => ({
    id,
    question: t.t(question),
    answerText: t.t(answer),
  }))
}

/**
 * The page's structured data: the site, the software and its author, the questions, and the
 * organization with its contact links once there are any.
 */
function homeJsonLd(
  t: Translator<string>,
  origin: string,
  contactLinks: readonly PublicContactLink[],
): unknown[] {
  const organization = organizationJsonLd(origin, contactLinks)
  return [
    {
      "@type": `WebSite`,
      "@id": `${origin}/#website`,
      name: SITE_NAME,
      url: `${origin}/`,
      inLanguage: SITE_LANGUAGES,
      // Whoever runs the site: the organization with the contact links once there is one.
      publisher: { "@id": organization ? organizationId(origin) : PERSON_JSON_LD["@id"] },
      about: { "@id": softwareId(origin) },
    },
    softwareJsonLd(origin, { description: t.t(`HomeHero.title`) }),
    PERSON_JSON_LD,
    faqPageJsonLd(faqItems(t)),
    ...(organization ? [organization] : []),
  ]
}

/** A link styled as text in the brand colour, for links inside running text. */
const TEXT_LINK = `font-medium text-primary underline`

/**
 * The page's one action: "Get notified" to the form below while the newsletter is on, else
 * "Follow the build on GitHub" (#91 makes self-hosting the primary action once its guide ships).
 */
function HeroActions({ newsletter }: { newsletter: boolean }): JSX.Element {
  const { t } = useSite()
  return (
    <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap">
      {newsletter && (
        <Button
          href="#newsletter"
          size="lg"
          data-e2e="home-notify"
          data-umami-event="notify"
          data-umami-event-from="hero"
        >
          {t.t(`HomeHero.notify`)}
        </Button>
      )}
      <Button
        href={REPOSITORY_URL}
        variant={newsletter ? `outline` : `primary`}
        size="lg"
        data-e2e="home-github"
        data-umami-event="github"
        data-umami-event-from="hero"
      >
        <IconGitHub class="size-5" /> {t.t(`HomeHero.github`)}
      </Button>
    </div>
  )
}

/** "Where the rebuild stands": what works, what is being built with its issue, and the plan. */
function StatusCard(): JSX.Element {
  const { t, rich } = useSite()
  return (
    <Card
      id="status"
      role="region"
      aria-labelledby="status-title"
      class="scroll-mt-16 rounded-card bg-canvas p-6"
      data-e2e="home-status"
    >
      <h2 id="status-title" class="text-lg font-semibold">{t.t(`HomeStatus.title`)}</h2>
      <h3 class="mt-4 text-sm font-semibold">
        <StatusMark status="ready" label={t.t(`HomeStatus.works`)} />
      </h3>
      <ul class="mt-3 flex flex-col gap-2 text-sm">
        {WORKS_TODAY.map((item) => (
          <li key={item} class="flex items-start gap-2">
            <IconCheck class="mt-1 size-4 shrink-0 text-primary" />
            <span class="text-pretty">{t.t(item)}</span>
          </li>
        ))}
      </ul>
      <h3 class="mt-4 text-sm font-semibold">
        <StatusMark status="wip" label={t.t(`HomeStatus.building`)} />
      </h3>
      <ul class="mt-3 flex flex-col gap-2 text-sm">
        {BUILDING_NOW.map(({ key, issue }) => (
          <li key={key} class="flex items-start gap-2">
            <IconMinus class="mt-1 size-4 shrink-0 text-muted" />
            <span class="flex flex-wrap gap-x-2 text-pretty">
              {t.t(key)}
              <a href={`${REPOSITORY_URL}/issues/${issue}`} class="text-primary underline">
                {t.t(`FeatureSection.issue`, { number: issue })}
              </a>
            </span>
          </li>
        ))}
      </ul>
      <p class="mt-4 text-sm text-muted">
        {rich(`HomeStatus.later`, {
          plan: (text) => <a href={`${REPOSITORY_URL}/milestones`} class={TEXT_LINK}>{text}</a>,
        })}
      </p>
    </Card>
  )
}

function Hero({ newsletter }: { newsletter: boolean }): JSX.Element {
  const { t, rich } = useSite()
  const format = useFormat().utc()
  return (
    <section id="hero" aria-labelledby="hero-title" class="relative overflow-hidden">
      <div aria-hidden="true" class="site-grid pointer-events-none absolute inset-0" />
      <div class="site-glow relative">
        <div class="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-12 pt-12 sm:px-6 lg:grid-cols-12 lg:items-start lg:px-8 lg:pb-16 lg:pt-16">
          <div class="flex flex-col items-start gap-6 lg:col-span-7">
            <h1
              id="hero-title"
              class="text-3xl font-semibold tracking-tight text-balance sm:text-4xl lg:text-5xl"
            >
              {t.t(`HomeHero.title`)}
            </h1>
            <HeroActions newsletter={newsletter} />
            <p
              class="flex items-start gap-2 text-sm text-muted text-pretty"
              data-e2e="home-status-line"
            >
              <StatusMark status="wip" label="" class="mt-1" />
              <span>
                {rich(`HomeHero.status`, {
                  status: (text) => <a href="#status" class={TEXT_LINK}>{text}</a>,
                }, { date: format.date(STATUS_UPDATED) })}
              </span>
            </p>
          </div>
          <div class="lg:col-span-5">
            <StatusCard />
          </div>
        </div>
      </div>
    </section>
  )
}

function Who(): JSX.Element {
  const { t } = useSite()
  return (
    <Band id="who" labelledBy="who-title">
      <div class="flex flex-col gap-8">
        <SectionIntro
          id="who-title"
          eyebrow={t.t(`HomeWho.eyebrow`)}
          title={t.t(`HomeWho.title`)}
        />
        <div class="grid gap-8 md:grid-cols-3">
          {WHO.map(({ id, title, text }) => (
            <div key={id} class="flex flex-col gap-2">
              <h3 id={id} class="text-lg font-semibold">{t.t(title)}</h3>
              <p class="text-muted text-pretty">{t.t(text)}</p>
            </div>
          ))}
        </div>
      </div>
    </Band>
  )
}

/** Self-host it today, or wait for the paid cloud: two cards with a text link each. */
function Ways({ newsletter }: { newsletter: boolean }): JSX.Element {
  const { t } = useSite()
  return (
    <Band tone="alt" id="ways" labelledBy="ways-title">
      <div class="flex flex-col gap-8">
        <SectionIntro id="ways-title" title={t.t(`HomeWays.title`)} />
        <div class="grid gap-6 md:grid-cols-2">
          <Card class="flex flex-col gap-3 rounded-card bg-canvas p-6">
            <h3 class="flex items-center gap-2 text-lg font-semibold">
              <IconServer class="size-5 text-primary" /> {t.t(`HomeWays.selfHostTitle`)}
            </h3>
            <p class="text-muted text-pretty">{t.t(`HomeWays.selfHostText`)}</p>
            <a
              href={REPOSITORY_URL}
              class="mt-auto inline-flex items-center gap-1 self-start font-medium text-primary hover:underline"
              data-umami-event="github"
              data-umami-event-from="self-host"
            >
              {t.t(`HomeWays.selfHostLink`)} <IconArrowRight class="size-4" />
            </a>
          </Card>
          <Card class="flex flex-col gap-3 rounded-card bg-canvas p-6">
            <h3 class="flex items-center gap-2 text-lg font-semibold">
              <IconCloudArrowUp class="size-5 text-primary" /> {t.t(`HomeWays.cloudTitle`)}
            </h3>
            <p class="text-muted text-pretty">{t.t(`HomeWays.cloudText`)}</p>
            <a
              href={newsletter ? `#newsletter` : REPOSITORY_URL}
              class="mt-auto inline-flex items-center gap-1 self-start font-medium text-primary hover:underline"
              data-umami-event={newsletter ? `notify` : `github`}
              data-umami-event-from="cloud"
            >
              {t.t(newsletter ? `HomeHero.notify` : `HomeHero.github`)}{" "}
              <IconArrowRight class="size-4" />
            </a>
          </Card>
        </div>
      </div>
    </Band>
  )
}

function Newsletter(): JSX.Element {
  const { t, href } = useSite()
  return (
    <Band tone="alt" id="newsletter" labelledBy="newsletter-title" width="3xl">
      <div class="flex flex-col gap-6">
        <SectionIntro
          id="newsletter-title"
          title={t.t(`HomeNewsletter.title`, { site: SITE_NAME })}
          lead={t.t(`HomeNewsletter.lead`)}
        />
        <form
          method="post"
          action={href(FORM_ACTIONS.subscribe)}
          class="flex flex-col gap-2"
          data-e2e="home-subscribe"
          data-analytics-submit="newsletter-subscribe"
        >
          <input type="hidden" name="list" value={DEFAULT_SUBSCRIBER_LIST} />
          <label for="home-email" class="text-sm font-medium">{t.t(`NewsletterForm.email`)}</label>
          <div class="flex flex-col gap-2 sm:flex-row">
            <Input
              id="home-email"
              name="email"
              type="email"
              autocomplete="email"
              placeholder={t.t(`NewsletterForm.placeholder`)}
              required
              aria-describedby="home-email-hint"
              data-e2e="home-subscribe-email"
            />
            <Button type="submit" data-e2e="home-subscribe-submit">
              {t.t(`HomeHero.notify`)}
            </Button>
          </div>
          <p id="home-email-hint" class="text-sm text-muted">{t.t(`HomeNewsletter.hint`)}</p>
        </form>
      </div>
    </Band>
  )
}

function Questions(): JSX.Element {
  const { t } = useSite()
  return (
    <Band id="faq" labelledBy="faq-title" width="3xl">
      <div class="flex flex-col gap-8">
        <SectionIntro
          id="faq-title"
          eyebrow={t.t(`HomeFaq.eyebrow`)}
          title={t.t(`HomeFaq.title`)}
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
  )
}

/**
 * The home page: what Financy is, the one action a visitor can finish today (get notified, or
 * follow the build when the newsletter is off), and an honest, dated account of where the rebuild
 * stands; then who it is for, how to run it, the questions and the newsletter. `/` in the default
 * language and `/<language>` in every other (`routes/[lang]/index.tsx`).
 */
export default define.page(function Home({ state }) {
  const { t } = useSite()
  const newsletter = Boolean(state.newsletter)
  const head: SitePageHead = {
    ...homeHead(t),
    og: `home`,
    jsonLd: homeJsonLd(t, state.webAppOrigin, state.contactLinks ?? []),
  }
  return (
    <SiteFrame state={state} path="/" head={head} footerNewsletter={false}>
      <Hero newsletter={newsletter} />
      <ProofStrip facts={PROOF.map((fact) => ({ value: fact.value, label: t.t(fact.label) }))} />
      <Who />
      <Ways newsletter={newsletter} />
      <Questions />
      {newsletter && <Newsletter />}
    </SiteFrame>
  )
})
