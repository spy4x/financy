/**
 * The pages for people in one money situation (`/for/<slug>`): each opens with the visitor's
 * situation, shows one real screen, offers the demo and says plainly what Financy does not do.
 * Every word is a key of the `site` catalog (`i18n/site/`), so each page exists in every language
 * the site serves. They stay apart from `FEATURE_PAGES`, so `/features/expats` stays a 404.
 *
 * @module
 */
import type { Language } from "@domain/identity"
import type { Translator } from "@spy4x/platform/universal/i18n"
import type { FeatureQuestion } from "./features-data.tsx"
import { DEFAULT_LANGUAGE, localePath } from "./languages.ts"
import { householdValues } from "./routes/[[lang]]/pricing.tsx"

/**
 * The currencies the European Central Bank publishes a daily rate for, and the euro they are
 * quoted in. Read from https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml on 2026-11-18
 * (the rates of 2026-11-17).
 */
export const ECB_CURRENCIES = [
  `AUD`,
  `BRL`,
  `CAD`,
  `CHF`,
  `CNY`,
  `CZK`,
  `DKK`,
  `EUR`,
  `GBP`,
  `HKD`,
  `HUF`,
  `IDR`,
  `ILS`,
  `INR`,
  `ISK`,
  `JPY`,
  `KRW`,
  `MXN`,
  `MYR`,
  `NOK`,
  `NZD`,
  `PHP`,
  `PLN`,
  `RON`,
  `SEK`,
  `SGD`,
  `THB`,
  `TRY`,
  `USD`,
  `ZAR`,
] as const

/** A word and what it means, in a page's own block. */
export interface AudienceTerm {
  term: string
  detail: string
}

/** One side of "Where Financy fits": a heading and what belongs under it. */
export interface AudienceColumn {
  title: string
  items: readonly string[]
}

/**
 * The block only this page has: a paragraph, a list of terms with an optional closing paragraph,
 * or two columns. `id` is the section's anchor.
 */
export type AudienceBlock =
  & { id: string; title: string }
  & (
    | { kind: `text`; body: string }
    | { kind: `terms`; terms: readonly AudienceTerm[]; note?: string }
    | { kind: `columns`; columns: readonly AudienceColumn[] }
  )

/** The page's one screenshot, a phone-sized crop in `static/shots/`. */
export interface AudienceShot {
  /** The screenshot's name in `static/shots/`. */
  name: string
  /** The height at the 780 px file: twice the crop's height in `screenshots/capture.ts`. */
  height: number
  alt: string
  caption: string
}

/**
 * One audience page. In {@link AUDIENCE_PAGES} every text field is a key of the `site` catalog;
 * {@link audiencePageIn} turns them into the words of one language.
 */
export interface AudiencePage {
  /** The page's address: `/for/<slug>`. Never renamed. */
  slug: string
  /** The last crumb, and the page's name in links. */
  name: string
  /** The `<title>`, in the words people search with. */
  title: string
  /** The meta description, under 155 characters. */
  description: string
  h1: string
  /** The answer: its first sentence names the visitor's situation. */
  answer: string
  /** What the page must say before anything else: a paragraph right after the answer. */
  disclaimer?: string
  how: readonly string[]
  block: AudienceBlock
  /** "What Financy does not do": limits of the product, not planned work. */
  limits: readonly string[]
  questions: readonly FeatureQuestion[]
  shot: AudienceShot
  /** The two feature pages the page closes with, by slug. */
  features: readonly [string, string]
  /** The day this page's words last changed: its "Last updated" line and the sitemap's `lastmod`. */
  updated: string
}

/** The day the pages' words last changed. */
export const AUDIENCE_UPDATED = `2026-11-18`

/**
 * The audience pages, in the order the links list them, with their words as catalog keys. The pull
 * request that added them lists each claim with the file behind it.
 */
export const AUDIENCE_PAGES: readonly AudiencePage[] = [
  {
    slug: `expats`,
    name: `AudienceExpats.name`,
    title: `AudienceExpats.title`,
    description: `AudienceExpats.description`,
    h1: `AudienceExpats.h1`,
    answer: `AudienceExpats.answer`,
    how: [`AudienceExpats.how1`, `AudienceExpats.how2`, `AudienceExpats.how3`],
    block: {
      id: `currencies`,
      title: `AudienceExpats.blockTitle`,
      kind: `text`,
      body: `AudienceExpats.blockBody`,
    },
    limits: [`AudienceExpats.limit1`, `AudienceExpats.limit2`, `AudienceExpats.limit3`],
    questions: [
      { id: `bank-rate`, question: `AudienceExpats.q1`, answer: `AudienceExpats.a1` },
      { id: `past-transactions`, question: `AudienceExpats.q2`, answer: `AudienceExpats.a2` },
      { id: `every-currency`, question: `AudienceExpats.q3`, answer: `AudienceExpats.a3` },
      { id: `statements`, question: `AudienceExpats.q4`, answer: `AudienceExpats.a4` },
    ],
    shot: {
      name: `for-expats`,
      height: 1268,
      alt: `AudienceExpats.alt`,
      caption: `AudienceExpats.caption`,
    },
    features: [`multi-currency`, `live-sync`],
    updated: AUDIENCE_UPDATED,
  },
  {
    slug: `couples`,
    name: `AudienceCouples.name`,
    title: `AudienceCouples.title`,
    description: `AudienceCouples.description`,
    h1: `AudienceCouples.h1`,
    answer: `AudienceCouples.answer`,
    how: [`AudienceCouples.how1`, `AudienceCouples.how2`],
    block: {
      id: `ours-mine-yours`,
      title: `AudienceCouples.blockTitle`,
      kind: `terms`,
      terms: [
        { term: `AudienceCouples.oursTerm`, detail: `AudienceCouples.oursDetail` },
        { term: `AudienceCouples.mineTerm`, detail: `AudienceCouples.mineDetail` },
        { term: `AudienceCouples.yoursTerm`, detail: `AudienceCouples.yoursDetail` },
      ],
      note: `AudienceCouples.blockNote`,
    },
    limits: [`AudienceCouples.limit1`, `AudienceCouples.limit2`, `AudienceCouples.limit3`],
    questions: [
      { id: `hide-account`, question: `AudienceCouples.q1`, answer: `AudienceCouples.a1` },
      { id: `second-household`, question: `AudienceCouples.q2`, answer: `AudienceCouples.a2` },
      { id: `second-plan`, question: `AudienceCouples.q3`, answer: `AudienceCouples.a3` },
      { id: `split-bills`, question: `AudienceCouples.q4`, answer: `AudienceCouples.a4` },
    ],
    shot: {
      name: `for-couples`,
      height: 1268,
      alt: `AudienceCouples.alt`,
      caption: `AudienceCouples.caption`,
    },
    features: [`households`, `live-sync`],
    updated: AUDIENCE_UPDATED,
  },
  {
    slug: `families`,
    name: `AudienceFamilies.name`,
    title: `AudienceFamilies.title`,
    description: `AudienceFamilies.description`,
    h1: `AudienceFamilies.h1`,
    answer: `AudienceFamilies.answer`,
    how: [`AudienceFamilies.how1`, `AudienceFamilies.how2`],
    block: {
      id: `roles`,
      title: `AudienceFamilies.blockTitle`,
      kind: `terms`,
      terms: [
        { term: `AudienceFamilies.editorTerm`, detail: `AudienceFamilies.editorDetail` },
        { term: `AudienceFamilies.adminTerm`, detail: `AudienceFamilies.adminDetail` },
        { term: `AudienceFamilies.ownerTerm`, detail: `AudienceFamilies.ownerDetail` },
      ],
    },
    limits: [`AudienceFamilies.limit1`, `AudienceFamilies.limit2`, `AudienceFamilies.limit3`],
    questions: [
      {
        id: `self-hosted-features`,
        question: `AudienceFamilies.q1`,
        answer: `AudienceFamilies.a1`,
      },
      { id: `children`, question: `AudienceFamilies.q2`, answer: `AudienceFamilies.a2` },
      { id: `member-limit`, question: `AudienceFamilies.q3`, answer: `AudienceFamilies.a3` },
      { id: `move-from-cloud`, question: `AudienceFamilies.q4`, answer: `AudienceFamilies.a4` },
    ],
    shot: {
      name: `for-families`,
      height: 880,
      alt: `AudienceFamilies.alt`,
      caption: `AudienceFamilies.caption`,
    },
    features: [`self-hosting`, `households`],
    updated: AUDIENCE_UPDATED,
  },
  {
    slug: `small-business`,
    name: `AudienceSmallBusiness.name`,
    title: `AudienceSmallBusiness.title`,
    description: `AudienceSmallBusiness.description`,
    h1: `AudienceSmallBusiness.h1`,
    answer: `AudienceSmallBusiness.answer`,
    disclaimer: `AudienceSmallBusiness.notAccounting`,
    how: [
      `AudienceSmallBusiness.how1`,
      `AudienceSmallBusiness.how2`,
      `AudienceSmallBusiness.how3`,
    ],
    block: {
      id: `where-it-fits`,
      title: `AudienceSmallBusiness.blockTitle`,
      kind: `columns`,
      columns: [
        {
          title: `AudienceSmallBusiness.useTitle`,
          items: [`AudienceSmallBusiness.use1`, `AudienceSmallBusiness.use2`],
        },
        {
          title: `AudienceSmallBusiness.keepTitle`,
          items: [
            `AudienceSmallBusiness.keep1`,
            `AudienceSmallBusiness.keep2`,
            `AudienceSmallBusiness.keep3`,
          ],
        },
      ],
    },
    limits: [
      `AudienceSmallBusiness.limit1`,
      `AudienceSmallBusiness.limit2`,
      `AudienceSmallBusiness.limit3`,
      `AudienceSmallBusiness.limit4`,
    ],
    questions: [
      {
        id: `replace-accounting`,
        question: `AudienceSmallBusiness.q1`,
        answer: `AudienceSmallBusiness.a1`,
      },
      { id: `read-only`, question: `AudienceSmallBusiness.q2`, answer: `AudienceSmallBusiness.a2` },
      {
        id: `business-personal`,
        question: `AudienceSmallBusiness.q3`,
        answer: `AudienceSmallBusiness.a3`,
      },
      { id: `bank-sync`, question: `AudienceSmallBusiness.q4`, answer: `AudienceSmallBusiness.a4` },
    ],
    shot: {
      name: `for-small-business`,
      height: 1096,
      alt: `AudienceSmallBusiness.alt`,
      caption: `AudienceSmallBusiness.caption`,
    },
    features: [`multi-currency`, `households`],
    updated: AUDIENCE_UPDATED,
  },
]

/** The audience page at `/for/<slug>`, or `undefined` for an address that has none. */
export function audiencePage(slug: string): AudiencePage | undefined {
  return AUDIENCE_PAGES.find((page) => page.slug === slug)
}

/** The address of the audience page `slug` in `language`. */
export function audiencePath(slug: string, language: Language = DEFAULT_LANGUAGE): string {
  return localePath(language, `/for/${slug}`)
}

/** The block of a page in the language of `t`, with the values its messages name. */
function blockIn(t: Translator<string>, block: AudienceBlock): AudienceBlock {
  const values = {
    ...householdValues(t.language),
    codes: new Intl.ListFormat(t.language, { style: `long` }).format(ECB_CURRENCIES),
  }
  const title = t.t(block.title)
  if (block.kind === `text`) return { ...block, title, body: t.t(block.body, values) }
  if (block.kind === `columns`) {
    const columns = block.columns.map((column) => ({
      title: t.t(column.title),
      items: column.items.map((item) => t.t(item)),
    }))
    return { ...block, title, columns }
  }
  return {
    ...block,
    title,
    terms: block.terms.map(({ term, detail }) => ({ term: t.t(term), detail: t.t(detail) })),
    note: block.note && t.t(block.note, values),
  }
}

/** The page `keys` in the language of `t`. */
export function audiencePageIn(t: Translator<string>, keys: AudiencePage): AudiencePage {
  const values = householdValues(t.language)
  return {
    ...keys,
    name: t.t(keys.name),
    title: t.t(keys.title),
    description: t.t(keys.description),
    h1: t.t(keys.h1),
    answer: t.t(keys.answer),
    disclaimer: keys.disclaimer && t.t(keys.disclaimer),
    how: keys.how.map((key) => t.t(key)),
    block: blockIn(t, keys.block),
    limits: keys.limits.map((key) => t.t(key)),
    questions: keys.questions.map(({ id, question, answer }) => ({
      id,
      question: t.t(question),
      answer: t.t(answer, values),
    })),
    shot: { ...keys.shot, alt: t.t(keys.shot.alt), caption: t.t(keys.shot.caption) },
  }
}
