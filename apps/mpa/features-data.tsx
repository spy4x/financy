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
import { DeployVisual } from "./components/features-visuals.tsx"
import type { Translator } from "@spy4x/platform/universal/i18n"
import type { Language } from "@domain/identity"
import { DEFAULT_LANGUAGE, languageList, localePath } from "./languages.ts"
import { REPOSITORY_URL } from "./site.tsx"
import type { Site } from "./use-site.tsx"

/** A file or folder of the repository on GitHub, for the "where in the code" links. */
export function source(path: string): string {
  const kind = path.endsWith(`/`) ? `tree` : `blob`
  return `${REPOSITORY_URL}/${kind}/main/${path.replace(/\/$/, ``)}`
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
 * What works in Financy today, one tier, each claim checked against the code on 2026-11-06; the
 * "where in the code" link of each section points at it. Accounts are built; transactions and
 * budgets are not yet, so they have no section: #105 rewrites this page as they land.
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
          code: { label: t.t(`FeatureTeams.code`), href: source(`libs/domain/groups/`) },
        },
        {
          id: `realtime`,
          nav: t.t(`FeatureRealtime.nav`),
          title: t.t(`FeatureRealtime.title`),
          lead: t.t(`FeatureRealtime.lead`),
          facts: [t.t(`FeatureRealtime.fact1`), t.t(`FeatureRealtime.fact2`)],
          code: {
            label: t.t(`FeatureRealtime.code`),
            href: source(`docs/decisions/002-realtime-transport-and-sync.md`),
          },
        },
        {
          id: `offline`,
          nav: t.t(`FeatureOffline.nav`),
          title: t.t(`FeatureOffline.title`),
          lead: t.t(`FeatureOffline.lead`),
          facts: [t.t(`FeatureOffline.fact1`), t.t(`FeatureOffline.fact2`)],
          code: { label: t.t(`FeatureOffline.code`), href: source(`docs/offline.md`) },
        },
        {
          id: `export`,
          nav: t.t(`FeatureExport.nav`),
          title: t.t(`FeatureExport.title`),
          lead: t.t(`FeatureExport.lead`),
          facts: [t.t(`FeatureExport.fact1`), t.t(`FeatureExport.fact2`)],
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
  /** The `<title>`, under 60 characters: "{Feature} for your SaaS, without {the usual cost}". */
  title: string
  /** The meta description, under 155 characters, ending "Free and MIT-licensed." */
  description: string
  /** The searcher's phrase, as a statement. */
  h1: string
  /** Two or three sentences: yes and how, then what it takes to adopt. */
  answer: string
  /** One sentence for this page's card on the other feature pages. */
  summary: string
  /** "How it works", one or two short paragraphs. Empty, the section is not drawn. */
  how: readonly string[]
  /** The written guide on GitHub, until the site has the docs. */
  guide?: string
  /** The code "Read the code" opens, when the feature's own code link is a guide. */
  code?: string
  /** 3 to 5 questions people type. Empty, the section is not drawn. */
  questions: readonly FeatureQuestion[]
  /** The day this page's words last changed: its "Last updated" line and the sitemap's `lastmod`. */
  updated: string
}

/** The runtime question, the same on every page that asks it. */
const RUNTIME_QUESTION: Omit<FeatureQuestion, "id"> = {
  question: `FeaturePage.runtimeQuestion`,
  answer: `FeaturePage.runtimeAnswer`,
}

/**
 * The feature pages, in the order "Other features" lists them, with their words as catalog keys.
 * Every claim was checked against the code and docs on `main` on 2026-11-01, the realtime and
 * shortcuts pages on 2026-11-02.
 */
export const FEATURE_PAGES: readonly FeaturePage[] = [
  {
    slug: `sign-in`,
    name: `FeaturePageSignIn.name`,
    title: `FeaturePageSignIn.title`,
    description: `FeaturePageSignIn.description`,
    h1: `FeaturePageSignIn.h1`,
    answer: `FeaturePageSignIn.answer`,
    summary: `FeaturePageSignIn.summary`,
    how: [`FeaturePageSignIn.how1`, `FeaturePageSignIn.how2`],
    guide: source(`docs/sign-in-providers.md`),
    questions: [
      {
        id: `faq-auth-service`,
        question: `FeaturePageSignIn.authServiceQuestion`,
        answer: `FeaturePageSignIn.authServiceAnswer`,
      },
      {
        id: `faq-passkeys`,
        question: `FeaturePageSignIn.passkeysQuestion`,
        answer: `FeaturePageSignIn.passkeysAnswer`,
      },
      {
        id: `faq-two-factor`,
        question: `FeaturePageSignIn.twoFactorQuestion`,
        answer: `FeaturePageSignIn.twoFactorAnswer`,
      },
      {
        id: `faq-providers-off`,
        question: `FeaturePageSignIn.providersOffQuestion`,
        answer: `FeaturePageSignIn.providersOffAnswer`,
      },
      { id: `faq-runtime`, ...RUNTIME_QUESTION },
    ],
    updated: `2026-11-02`,
  },
  {
    slug: `groups`,
    feature: `teams`,
    name: `FeaturePageGroups.name`,
    title: `FeaturePageGroups.title`,
    description: `FeaturePageGroups.description`,
    h1: `FeaturePageGroups.h1`,
    answer: `FeaturePageGroups.answer`,
    summary: `FeaturePageGroups.summary`,
    how: [`FeaturePageGroups.how1`, `FeaturePageGroups.how2`],
    guide: source(`docs/aggregates.md`),
    questions: [
      {
        id: `faq-personal-group`,
        question: `FeaturePageGroups.personalGroupQuestion`,
        answer: `FeaturePageGroups.personalGroupAnswer`,
      },
      {
        id: `faq-viewer`,
        question: `FeaturePageGroups.viewerQuestion`,
        answer: `FeaturePageGroups.viewerAnswer`,
      },
      {
        id: `faq-restore`,
        question: `FeaturePageGroups.restoreQuestion`,
        answer: `FeaturePageGroups.restoreAnswer`,
      },
      {
        id: `faq-second-model`,
        question: `FeaturePageGroups.secondModelQuestion`,
        answer: `FeaturePageGroups.secondModelAnswer`,
      },
    ],
    updated: `2026-11-01`,
  },
  {
    slug: `realtime`,
    name: `FeaturePageRealtime.name`,
    title: `FeaturePageRealtime.title`,
    description: `FeaturePageRealtime.description`,
    h1: `FeaturePageRealtime.h1`,
    answer: `FeaturePageRealtime.answer`,
    summary: `FeaturePageRealtime.summary`,
    how: [`FeaturePageRealtime.how1`, `FeaturePageRealtime.how2`],
    guide: source(`docs/decisions/002-realtime-transport-and-sync.md`),
    code: source(`apps/spa/src/realtime/`),
    questions: [
      {
        id: `faq-realtime`,
        question: `FeaturePageRealtime.realtimeQuestion`,
        answer: `FeaturePageRealtime.realtimeAnswer`,
      },
      {
        id: `faq-realtime-service`,
        question: `FeaturePageRealtime.realtimeServiceQuestion`,
        answer: `FeaturePageRealtime.realtimeServiceAnswer`,
      },
      {
        id: `faq-realtime-sleep`,
        question: `FeaturePageRealtime.realtimeSleepQuestion`,
        answer: `FeaturePageRealtime.realtimeSleepAnswer`,
      },
      {
        id: `faq-realtime-off`,
        question: `FeaturePageRealtime.realtimeOffQuestion`,
        answer: `FeaturePageRealtime.realtimeOffAnswer`,
      },
    ],
    updated: `2026-11-02`,
  },
  {
    slug: `offline`,
    name: `FeaturePageOffline.name`,
    title: `FeaturePageOffline.title`,
    description: `FeaturePageOffline.description`,
    h1: `FeaturePageOffline.h1`,
    answer: `FeaturePageOffline.answer`,
    summary: `FeaturePageOffline.summary`,
    how: [`FeaturePageOffline.how1`, `FeaturePageOffline.how2`],
    guide: source(`docs/offline.md`),
    code: source(`apps/spa/src/offline/`),
    questions: [
      {
        id: `faq-offline`,
        question: `FeaturePageOffline.offlineQuestion`,
        answer: `FeaturePageOffline.offlineAnswer`,
      },
      {
        id: `faq-offline-edits`,
        question: `FeaturePageOffline.offlineEditsQuestion`,
        answer: `FeaturePageOffline.offlineEditsAnswer`,
      },
      {
        id: `faq-conflict`,
        question: `FeaturePageOffline.conflictQuestion`,
        answer: `FeaturePageOffline.conflictAnswer`,
      },
      {
        id: `faq-remove-offline`,
        question: `FeaturePageOffline.removeOfflineQuestion`,
        answer: `FeaturePageOffline.removeOfflineAnswer`,
      },
    ],
    updated: `2026-11-01`,
  },
  {
    slug: `deploy`,
    name: `FeaturePageDeploy.name`,
    title: `FeaturePageDeploy.title`,
    description: `FeaturePageDeploy.description`,
    h1: `FeaturePageDeploy.h1`,
    answer: `FeaturePageDeploy.answer`,
    summary: `FeaturePageDeploy.summary`,
    how: [`FeaturePageDeploy.how1`, `FeaturePageDeploy.how2`],
    guide: source(`docs/deploy.md`),
    questions: [
      {
        id: `faq-kubernetes`,
        question: `FeaturePageDeploy.kubernetesQuestion`,
        answer: `FeaturePageDeploy.kubernetesAnswer`,
      },
      {
        id: `faq-several`,
        question: `FeaturePageDeploy.severalQuestion`,
        answer: `FeaturePageDeploy.severalAnswer`,
      },
      {
        id: `faq-backup`,
        question: `FeaturePageDeploy.backupQuestion`,
        answer: `FeaturePageDeploy.backupAnswer`,
      },
      { id: `faq-runtime`, ...RUNTIME_QUESTION },
    ],
    updated: `2026-11-02`,
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
