// Seed's own site: see docs/start-a-product.md
/**
 * Every feature the website describes, in one place: `/features` draws all of them, and each
 * feature page (`/features/<slug>`) draws one, with the facts and "Not built yet" items from the
 * same object. Every word of both is a key of the `site` catalog (`i18n/site/`), so each page
 * exists in every language the site serves: `/de/features/<slug>` is the German one. A product
 * built on Seed rewrites this file and those keys to describe its own features.
 *
 * @module
 */
import type { FeatureSectionProps, FeatureTierProps } from "./components/features-section.tsx"
import type { PhoneShot } from "./components/shot.tsx"
import { DeployVisual } from "./components/features-visuals.tsx"
import type { Translator } from "@spy4x/platform/universal/i18n"
import type { Language } from "@domain/identity"
import { DOCS_PATH } from "./docs-site.ts"
import { DEFAULT_LANGUAGE, languageList, localePath } from "./languages.ts"
import { REPOSITORY_URL, SELF_HOST_GUIDE } from "./site.tsx"
import type { Site } from "./use-site.tsx"

/** A file or folder of the repository on GitHub, for the "where in the code" links. */
export function source(path: string): string {
  const kind = path.endsWith(`/`) ? `tree` : `blob`
  return `${REPOSITORY_URL}/${kind}/main/${path.replace(/\/$/, ``)}`
}

/** The repository's issue `number` on GitHub, for a "Not built yet" item. */
function issue(number: number): string {
  return `${REPOSITORY_URL}/issues/${number}`
}

/** A feature as the page lists it, without the side its picture goes on: the tier decides that. */
export type Feature = Omit<FeatureSectionProps, "flip"> & {
  nav: string
}

/** One group of features with its heading, status line and features, in page order. */
export interface Tier extends Omit<FeatureTierProps, "children"> {
  features: readonly Feature[]
}

/**
 * What works in Financy today, one tier, each claim checked against the code on 2026-11-16, the
 * currencies, households, live sync and self-hosting sections on 2026-11-18, and the transfers,
 * budgets and Telegram bot sections on 2026-11-19; the "where in the code" link of each section
 * points at it.
 */
export function tiers({ t, language }: Site): readonly Tier[] {
  return [
    {
      id: `settled`,
      eyebrow: t.t(`FeatureTierSettled.eyebrow`),
      title: t.t(`FeatureTierSettled.title`),
      lead: t.t(`FeatureTierSettled.lead`),
      status: t.t(`FeatureTierSettled.status`),
      features: [
        {
          id: `accounts`,
          nav: t.t(`FeatureAccounts.nav`),
          title: t.t(`FeatureAccounts.title`),
          lead: t.t(`FeatureAccounts.lead`),
          facts: [
            t.t(`FeatureAccounts.fact1`),
            t.t(`FeatureAccounts.fact2`),
            t.t(`FeatureAccounts.fact3`),
          ],
          code: { label: t.t(`FeatureAccounts.code`), href: source(`libs/domain/accounts/`) },
        },
        {
          id: `categories`,
          nav: t.t(`FeatureCategories.nav`),
          title: t.t(`FeatureCategories.title`),
          lead: t.t(`FeatureCategories.lead`),
          facts: [
            t.t(`FeatureCategories.fact1`),
            t.t(`FeatureCategories.fact2`),
            t.t(`FeatureCategories.fact3`),
          ],
          code: {
            label: t.t(`FeatureCategories.code`),
            href: source(`libs/domain/categories/`),
          },
        },
        {
          id: `transactions`,
          nav: t.t(`FeatureTransactions.nav`),
          title: t.t(`FeatureTransactions.title`),
          lead: t.t(`FeatureTransactions.lead`),
          facts: [
            t.t(`FeatureTransactions.fact1`),
            t.t(`FeatureTransactions.fact2`),
            t.t(`FeatureTransactions.fact3`),
            t.t(`FeatureTransactions.fact4`),
          ],
          code: {
            label: t.t(`FeatureTransactions.code`),
            href: source(`libs/domain/transactions/`),
          },
        },
        {
          id: `transfers`,
          nav: t.t(`FeatureTransfers.nav`),
          title: t.t(`FeatureTransfers.title`),
          lead: t.t(`FeatureTransfers.lead`),
          facts: [
            t.t(`FeatureTransfers.fact1`),
            t.t(`FeatureTransfers.fact2`),
            t.t(`FeatureTransfers.fact3`),
            t.t(`FeatureTransfers.fact4`),
          ],
          notYet: [
            { label: t.t(`FeatureTransfers.notYetStatement`), issue: issue(300) },
            { label: t.t(`FeatureTransfers.notYetRepeating`) },
          ],
          code: { label: t.t(`FeatureTransfers.code`), href: source(`libs/domain/transfers/`) },
        },
        {
          id: `budgets`,
          nav: t.t(`FeatureBudgets.nav`),
          title: t.t(`FeatureBudgets.title`),
          lead: t.t(`FeatureBudgets.lead`),
          facts: [
            t.t(`FeatureBudgets.fact1`),
            t.t(`FeatureBudgets.fact2`),
            t.t(`FeatureBudgets.fact3`),
          ],
          notYet: [
            { label: t.t(`FeatureBudgets.notYetEnvelopes`), issue: issue(208) },
            { label: t.t(`FeatureMultiCurrency.notYetBudgets`), issue: issue(317) },
          ],
          code: { label: t.t(`FeatureBudgets.code`), href: source(`libs/domain/budgets/`) },
        },
        {
          id: `recurring`,
          nav: t.t(`FeatureRecurring.nav`),
          title: t.t(`FeatureRecurring.title`),
          lead: t.t(`FeatureRecurring.lead`),
          facts: [
            t.t(`FeatureRecurring.fact1`),
            t.t(`FeatureRecurring.fact2`),
            t.t(`FeatureRecurring.fact3`),
          ],
          code: { label: t.t(`FeatureRecurring.code`), href: source(`libs/domain/recurring/`) },
        },
        {
          id: `multi-currency`,
          nav: t.t(`FeatureMultiCurrency.nav`),
          title: t.t(`FeatureMultiCurrency.title`),
          lead: t.t(`FeatureMultiCurrency.lead`),
          facts: [
            t.t(`FeatureMultiCurrency.fact1`),
            t.t(`FeatureMultiCurrency.fact2`),
            t.t(`FeatureMultiCurrency.fact3`),
          ],
          notYet: [
            { label: t.t(`FeatureMultiCurrency.notYetBudgets`), issue: issue(317) },
            { label: t.t(`FeatureMultiCurrency.notYetOffline`), issue: issue(226) },
          ],
          code: { label: t.t(`FeatureMultiCurrency.code`), href: source(`libs/domain/money/`) },
        },
        {
          id: `sign-in`,
          nav: t.t(`FeatureSignIn.nav`),
          title: t.t(`FeatureSignIn.title`),
          lead: t.t(`FeatureSignIn.lead`),
          facts: [
            t.t(`FeatureSignIn.fact1`),
            t.t(`FeatureSignIn.fact2`),
            t.t(`FeatureSignIn.fact3`),
          ],
          code: { label: t.t(`FeatureSignIn.code`), href: source(`apps/api/services/sign-in.ts`) },
        },
        {
          id: `teams`,
          nav: t.t(`FeatureTeams.nav`),
          title: t.t(`FeatureTeams.title`),
          lead: t.t(`FeatureTeams.lead`),
          facts: [
            t.t(`FeatureTeams.fact1`),
            t.t(`FeatureTeams.fact2`),
            t.t(`FeatureTeams.fact3`),
          ],
          notYet: [
            {
              label: t.t(`FeatureTeams.notYetClosedSignUp`),
              issue: `https://github.com/spy4x/seed/issues/913`,
            },
            { label: t.t(`FeatureTeams.notYetGroupWord`), issue: issue(169) },
          ],
          code: { label: t.t(`FeatureTeams.code`), href: source(`libs/domain/groups/`) },
        },
        {
          id: `live-sync`,
          nav: t.t(`FeatureLiveSync.nav`),
          title: t.t(`FeatureLiveSync.title`),
          lead: t.t(`FeatureLiveSync.lead`),
          facts: [
            t.t(`FeatureLiveSync.fact1`),
            t.t(`FeatureLiveSync.fact2`),
            t.t(`FeatureLiveSync.fact3`),
          ],
          notYet: [
            { label: t.t(`FeatureLiveSync.notYetSetup`) },
            { label: t.t(`FeatureLiveSync.notYetRates`), issue: issue(226) },
            { label: t.t(`FeatureLiveSync.notYetStores`), issue: issue(112) },
          ],
          code: {
            label: t.t(`FeatureLiveSync.code`),
            href: source(`docs/decisions/002-realtime-transport-and-sync.md`),
          },
        },
        {
          id: `telegram-bot`,
          nav: t.t(`FeatureTelegramBot.nav`),
          title: t.t(`FeatureTelegramBot.title`),
          lead: t.t(`FeatureTelegramBot.lead`),
          facts: [
            t.t(`FeatureTelegramBot.fact1`),
            t.t(`FeatureTelegramBot.fact2`),
            t.t(`FeatureTelegramBot.fact3`),
            t.t(`FeatureTelegramBot.fact4`),
          ],
          notYet: [
            { label: t.t(`FeatureTelegramBot.notYetTransfer`), issue: issue(347) },
            { label: t.t(`FeatureTelegramBot.notYetVoice`), issue: issue(295) },
            { label: t.t(`FeatureTelegramBot.notYetSentences`) },
          ],
          code: { label: t.t(`FeatureTelegramBot.code`), href: source(`apps/api/telegram/`) },
        },
        {
          id: `export`,
          nav: t.t(`FeatureExport.nav`),
          title: t.t(`FeatureExport.title`),
          lead: t.t(`FeatureExport.lead`),
          facts: [
            t.t(`FeatureExport.fact1`),
            t.t(`FeatureExport.fact2`),
            t.t(`FeatureExport.fileAccounts`),
            t.t(`FeatureExport.fileCategories`),
            t.t(`FeatureExport.fileBudgets`),
            t.t(`FeatureExport.fileTransactions`),
            t.t(`FeatureExport.fileTransfers`),
          ],
          code: {
            label: t.t(`FeatureExport.code`),
            href: source(`libs/server/groups/portable.ts`),
          },
        },
        {
          id: `languages`,
          nav: t.t(`FeatureLanguages.nav`),
          title: t.t(`FeatureLanguages.title`),
          lead: t.t(`FeatureLanguages.lead`, { languages: languageList(language) }),
          facts: [
            t.t(`FeatureLanguages.fact1`),
            t.t(`FeatureLanguages.fact2`),
            t.t(`FeatureLanguages.fact3`),
          ],
          code: { label: t.t(`FeatureLanguages.code`), href: source(`i18n/TRANSLATING.md`) },
        },
        {
          id: `deploy`,
          nav: t.t(`FeatureDeploy.nav`),
          title: t.t(`FeatureDeploy.title`),
          lead: t.t(`FeatureDeploy.lead`),
          facts: [
            t.t(`FeatureDeploy.fact1`),
            t.t(`FeatureDeploy.fact2`),
            t.t(`FeatureDeploy.fact3`),
            t.t(`FeatureDeploy.fact4`),
          ],
          notYet: [{ label: t.t(`FeatureDeploy.notYetRehearsed`), issue: issue(310) }],
          code: { label: t.t(`FeatureDeploy.code`), href: source(`infra/compose/`) },
          visual: <DeployVisual />,
        },
      ],
    },
  ]
}

/** A question on a feature page, its answer starting with "Yes.", "No." or "Not yet.". */
export interface FeatureQuestion {
  /** The answer's anchor in the FAQ list. */
  id: string
  question: string
  answer: string
}

/**
 * One feature page. Its facts, "Not built yet" items, picture and code link come from the feature
 * of the same id in {@link tiers}, so `/features` and the page never disagree. In
 * {@link FEATURE_PAGES} every text field (`name` to `how`, and each question and answer) is a key
 * of the `site` catalog; {@link featurePageIn} turns them into the words of one language.
 */
export interface FeaturePage {
  /** The page's address: `/features/<slug>`. Never renamed. */
  slug: string
  /** The feature's id in {@link tiers}, when it is not the slug. */
  feature?: string
  /** The page's last crumb and its card's title under "Other features". */
  name: string
  /**
   * The `<title>`, under 60 characters with " · Financy" after it: what the feature does for a
   * household, in the words people search with.
   */
  title: string
  /**
   * The meta description, under 155 characters: what a household gets, in plain words. It never
   * puts "free" next to the cloud's price, since only self-hosting costs nothing.
   */
  description: string
  /** The searcher's question, as a statement. */
  h1: string
  /** Two or three sentences: "Yes." and how, quotable on their own. */
  answer: string
  /** One sentence for this page's card on the other feature pages. */
  summary: string
  /** "How it works", one or two short paragraphs. Empty, the section is not drawn. */
  how: readonly string[]
  /** The written guide: a page of the site's docs, or a file on GitHub. */
  guide?: string
  /** The code "Read the code" opens, when the feature's own code link is a guide. */
  code?: string
  /** 3 to 5 questions people type. Empty, the section is not drawn. */
  questions: readonly FeatureQuestion[]
  /** The real screen the page describes; its `alt` and `caption` are catalog keys too. */
  shot: PhoneShot
  /** The day this page's words last changed: its "Last updated" line and the sitemap's `lastmod`. */
  updated: string
}

/**
 * The feature pages, in the order "Other features" lists them, with their words as catalog keys.
 * Every claim was checked against the code and docs on `main` on 2026-11-18, and those of the
 * transfers, budgets and Telegram bot pages on 2026-11-19; the pull request that added each page
 * lists its claims with the file behind them.
 */
export const FEATURE_PAGES: readonly FeaturePage[] = [
  {
    slug: `multi-currency`,
    name: `FeaturePageMultiCurrency.name`,
    title: `FeaturePageMultiCurrency.title`,
    description: `FeaturePageMultiCurrency.description`,
    h1: `FeaturePageMultiCurrency.h1`,
    answer: `FeaturePageMultiCurrency.answer`,
    summary: `FeaturePageMultiCurrency.summary`,
    how: [`FeaturePageMultiCurrency.how1`, `FeaturePageMultiCurrency.how2`],
    guide: `${DOCS_PATH}/exchange-rates`,
    questions: [
      {
        id: `faq-history`,
        question: `FeaturePageMultiCurrency.historyQuestion`,
        answer: `FeaturePageMultiCurrency.historyAnswer`,
      },
      {
        id: `faq-main-currency`,
        question: `FeaturePageMultiCurrency.mainCurrencyQuestion`,
        answer: `FeaturePageMultiCurrency.mainCurrencyAnswer`,
      },
      {
        id: `faq-own-rate`,
        question: `FeaturePageMultiCurrency.ownRateQuestion`,
        answer: `FeaturePageMultiCurrency.ownRateAnswer`,
      },
      {
        id: `faq-every-currency`,
        question: `FeaturePageMultiCurrency.everyCurrencyQuestion`,
        answer: `FeaturePageMultiCurrency.everyCurrencyAnswer`,
      },
    ],
    shot: {
      name: `for-expats`,
      height: 1268,
      alt: `FeaturePageMultiCurrency.alt`,
      caption: `FeaturePageMultiCurrency.caption`,
    },
    updated: `2026-11-18`,
  },
  {
    slug: `households`,
    feature: `teams`,
    name: `FeaturePageHouseholds.name`,
    title: `FeaturePageHouseholds.title`,
    description: `FeaturePageHouseholds.description`,
    h1: `FeaturePageHouseholds.h1`,
    answer: `FeaturePageHouseholds.answer`,
    summary: `FeaturePageHouseholds.summary`,
    how: [`FeaturePageHouseholds.how1`, `FeaturePageHouseholds.how2`],
    questions: [
      {
        id: `faq-private-accounts`,
        question: `FeaturePageHouseholds.privateQuestion`,
        answer: `FeaturePageHouseholds.privateAnswer`,
      },
      {
        id: `faq-viewer`,
        question: `FeaturePageHouseholds.viewerQuestion`,
        answer: `FeaturePageHouseholds.viewerAnswer`,
      },
      {
        id: `faq-hand-over`,
        question: `FeaturePageHouseholds.handOverQuestion`,
        answer: `FeaturePageHouseholds.handOverAnswer`,
      },
      {
        id: `faq-restore`,
        question: `FeaturePageHouseholds.restoreQuestion`,
        answer: `FeaturePageHouseholds.restoreAnswer`,
      },
    ],
    shot: {
      name: `for-families`,
      height: 880,
      alt: `FeaturePageHouseholds.alt`,
      caption: `FeaturePageHouseholds.caption`,
    },
    updated: `2026-11-18`,
  },
  {
    slug: `live-sync`,
    name: `FeaturePageLiveSync.name`,
    title: `FeaturePageLiveSync.title`,
    description: `FeaturePageLiveSync.description`,
    h1: `FeaturePageLiveSync.h1`,
    answer: `FeaturePageLiveSync.answer`,
    summary: `FeaturePageLiveSync.summary`,
    how: [`FeaturePageLiveSync.how1`, `FeaturePageLiveSync.how2`],
    questions: [
      {
        id: `faq-offline-entries`,
        question: `FeaturePageLiveSync.offlineEntriesQuestion`,
        answer: `FeaturePageLiveSync.offlineEntriesAnswer`,
      },
      {
        id: `faq-offline-setup`,
        question: `FeaturePageLiveSync.offlineSetupQuestion`,
        answer: `FeaturePageLiveSync.offlineSetupAnswer`,
      },
      {
        id: `faq-overwrite`,
        question: `FeaturePageLiveSync.overwriteQuestion`,
        answer: `FeaturePageLiveSync.overwriteAnswer`,
      },
      {
        id: `faq-stores`,
        question: `FeaturePageLiveSync.storesQuestion`,
        answer: `FeaturePageLiveSync.storesAnswer`,
      },
    ],
    shot: {
      name: `feature-live-sync`,
      height: 1096,
      alt: `FeaturePageLiveSync.alt`,
      caption: `FeaturePageLiveSync.caption`,
    },
    updated: `2026-11-18`,
  },
  {
    slug: `self-hosting`,
    feature: `deploy`,
    name: `FeaturePageSelfHosting.name`,
    title: `FeaturePageSelfHosting.title`,
    description: `FeaturePageSelfHosting.description`,
    h1: `FeaturePageSelfHosting.h1`,
    answer: `FeaturePageSelfHosting.answer`,
    summary: `FeaturePageSelfHosting.summary`,
    how: [`FeaturePageSelfHosting.how1`, `FeaturePageSelfHosting.how2`],
    guide: SELF_HOST_GUIDE,
    questions: [
      {
        id: `faq-same-features`,
        question: `FeaturePageSelfHosting.sameFeaturesQuestion`,
        answer: `FeaturePageSelfHosting.sameFeaturesAnswer`,
      },
      {
        id: `faq-mail`,
        question: `FeaturePageSelfHosting.mailQuestion`,
        answer: `FeaturePageSelfHosting.mailAnswer`,
      },
      {
        id: `faq-move`,
        question: `FeaturePageSelfHosting.moveQuestion`,
        answer: `FeaturePageSelfHosting.moveAnswer`,
      },
      {
        id: `faq-backup`,
        question: `FeaturePageSelfHosting.backupQuestion`,
        answer: `FeaturePageSelfHosting.backupAnswer`,
      },
      {
        id: `faq-installer`,
        question: `FeaturePageSelfHosting.installerQuestion`,
        answer: `FeaturePageSelfHosting.installerAnswer`,
      },
    ],
    shot: {
      name: `feature-self-hosting`,
      height: 1408,
      alt: `FeaturePageSelfHosting.alt`,
      caption: `FeaturePageSelfHosting.caption`,
    },
    updated: `2026-11-18`,
  },
  {
    slug: `transfers`,
    name: `FeaturePageTransfers.name`,
    title: `FeaturePageTransfers.title`,
    description: `FeaturePageTransfers.description`,
    h1: `FeaturePageTransfers.h1`,
    answer: `FeaturePageTransfers.answer`,
    summary: `FeaturePageTransfers.summary`,
    how: [`FeaturePageTransfers.how1`, `FeaturePageTransfers.how2`],
    questions: [
      {
        id: `faq-spending`,
        question: `FeaturePageTransfers.spendingQuestion`,
        answer: `FeaturePageTransfers.spendingAnswer`,
      },
      {
        id: `faq-own-amount`,
        question: `FeaturePageTransfers.ownAmountQuestion`,
        answer: `FeaturePageTransfers.ownAmountAnswer`,
      },
      {
        id: `faq-fee`,
        question: `FeaturePageTransfers.feeQuestion`,
        answer: `FeaturePageTransfers.feeAnswer`,
      },
      {
        id: `faq-repeat`,
        question: `FeaturePageTransfers.repeatQuestion`,
        answer: `FeaturePageTransfers.repeatAnswer`,
      },
      {
        id: `faq-statement`,
        question: `FeaturePageTransfers.statementQuestion`,
        answer: `FeaturePageTransfers.statementAnswer`,
      },
    ],
    shot: {
      name: `feature-transfers`,
      height: 1504,
      alt: `FeaturePageTransfers.alt`,
      caption: `FeaturePageTransfers.caption`,
    },
    updated: `2026-11-19`,
  },
  {
    slug: `budgets`,
    name: `FeaturePageBudgets.name`,
    title: `FeaturePageBudgets.title`,
    description: `FeaturePageBudgets.description`,
    h1: `FeaturePageBudgets.h1`,
    answer: `FeaturePageBudgets.answer`,
    summary: `FeaturePageBudgets.summary`,
    how: [`FeaturePageBudgets.how1`, `FeaturePageBudgets.how2`],
    questions: [
      {
        id: `faq-roll-over`,
        question: `FeaturePageBudgets.rollOverQuestion`,
        answer: `FeaturePageBudgets.rollOverAnswer`,
      },
      {
        id: `faq-currencies`,
        question: `FeaturePageBudgets.currenciesQuestion`,
        answer: `FeaturePageBudgets.currenciesAnswer`,
      },
      {
        id: `faq-warning`,
        question: `FeaturePageBudgets.warningQuestion`,
        answer: `FeaturePageBudgets.warningAnswer`,
      },
      {
        id: `faq-envelopes`,
        question: `FeaturePageBudgets.envelopesQuestion`,
        answer: `FeaturePageBudgets.envelopesAnswer`,
      },
      {
        id: `faq-plan`,
        question: `FeaturePageBudgets.planQuestion`,
        answer: `FeaturePageBudgets.planAnswer`,
      },
    ],
    shot: {
      name: `feature-budgets`,
      height: 880,
      alt: `FeaturePageBudgets.alt`,
      caption: `FeaturePageBudgets.caption`,
    },
    updated: `2026-11-19`,
  },
  {
    slug: `telegram-bot`,
    name: `FeaturePageTelegramBot.name`,
    title: `FeaturePageTelegramBot.title`,
    description: `FeaturePageTelegramBot.description`,
    h1: `FeaturePageTelegramBot.h1`,
    answer: `FeaturePageTelegramBot.answer`,
    summary: `FeaturePageTelegramBot.summary`,
    how: [`FeaturePageTelegramBot.how1`, `FeaturePageTelegramBot.how2`],
    questions: [
      {
        id: `faq-self-host`,
        question: `FeaturePageTelegramBot.selfHostQuestion`,
        answer: `FeaturePageTelegramBot.selfHostAnswer`,
      },
      {
        id: `faq-group-chat`,
        question: `FeaturePageTelegramBot.groupQuestion`,
        answer: `FeaturePageTelegramBot.groupAnswer`,
      },
      {
        id: `faq-transfer`,
        question: `FeaturePageTelegramBot.transferQuestion`,
        answer: `FeaturePageTelegramBot.transferAnswer`,
      },
      {
        id: `faq-voice`,
        question: `FeaturePageTelegramBot.voiceQuestion`,
        answer: `FeaturePageTelegramBot.voiceAnswer`,
      },
      {
        id: `faq-cost`,
        question: `FeaturePageTelegramBot.costQuestion`,
        answer: `FeaturePageTelegramBot.costAnswer`,
      },
    ],
    shot: {
      name: `feature-telegram-bot`,
      height: 802,
      alt: `FeaturePageTelegramBot.alt`,
      caption: `FeaturePageTelegramBot.caption`,
    },
    updated: `2026-11-19`,
  },
]

/** One of {@link FEATURE_PAGES} in the language of `t`: every key replaced by its words. */
export function featurePageIn(t: Translator<string>, page: FeaturePage): FeaturePage {
  return {
    ...page,
    name: t.t(page.name),
    title: t.t(page.title),
    description: t.t(page.description),
    h1: t.t(page.h1),
    answer: t.t(page.answer),
    summary: t.t(page.summary),
    how: page.how.map((key) => t.t(key)),
    questions: page.questions.map(({ id, question, answer }) => ({
      id,
      question: t.t(question),
      answer: t.t(answer),
    })),
    shot: { ...page.shot, alt: t.t(page.shot.alt), caption: t.t(page.shot.caption) },
  }
}

/** The address of the feature page `slug` in `language`: `/features/<slug>`, `/de/features/<slug>`. */
export function featurePath(slug: string, language: Language = DEFAULT_LANGUAGE): string {
  return localePath(language, `/features/${slug}`)
}

/** The feature page at `/features/<slug>`, or `undefined` for an address that has none. */
export function featurePage(slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find((page) => page.slug === slug)
}

/** A section of a feature page, in its fixed order. */
export interface FeaturePageSection {
  id: `what` | `how` | `limits` | `questions`
  label: string
}

/**
 * The sections a feature page draws, in order, labelled in the language of `t`: a section with
 * nothing to say is left out, and so is its "On this page" entry, because both read this list.
 */
export function featurePageSections(
  t: Translator<string>,
  page: FeaturePage,
  feature: Feature,
): FeaturePageSection[] {
  const sections: (FeaturePageSection | false)[] = [
    feature.facts.length > 0 && { id: `what`, label: t.t(`FeaturePage.what`) },
    (page.how.length > 0 || Boolean(feature.visual)) &&
    { id: `how`, label: t.t(`FeaturePage.how`) },
    (feature.notYet?.length ?? 0) > 0 && { id: `limits`, label: t.t(`FeaturePage.limits`) },
    page.questions.length > 0 && { id: `questions`, label: t.t(`FeaturePage.questions`) },
  ]
  return sections.filter((section): section is FeaturePageSection => section !== false)
}
