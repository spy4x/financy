/**
 * Every comparison the website draws (`/alternatives/<slug>`), and the hub that lists them
 * (`/alternatives`). Each comparison names first when the other tool suits a reader better, and
 * every fact about the other tool links the page of its own documentation it was read on. Every
 * word is a key of the `site` catalog (`i18n/site/`), so each page exists in every language the
 * site serves; product names are not keys, since they stay in Latin letters in every language.
 *
 * @module
 */
import type { ComparisonValue } from "@spy4x/preact-ui/comparison-table"
import type { Language } from "@domain/identity"
import type { Translator } from "@spy4x/platform/universal/i18n"
import type { FeatureQuestion } from "./features-data.tsx"
import { DEFAULT_LANGUAGE, localePath } from "./languages.ts"

/** The page a row's facts about the other tool were read on. */
export interface AlternativeSource {
  /** A short name of the page, such as "Firefly III FAQ": the page dates the whole table. */
  label: string
  href: string
}

/** One capability of a comparison: a value per product, Financy first. */
export interface AlternativeRow {
  capability: string
  values: readonly [ComparisonValue, ComparisonValue]
  note?: string
  source: AlternativeSource
}

/**
 * One comparison page. In {@link ALTERNATIVES} every text field is a key of the `site` catalog;
 * {@link alternativeIn} turns them into the words of one language. `competitor` and the `href`s
 * are never translated.
 */
export interface Alternative {
  /** The page's address: `/alternatives/<slug>`. Never renamed. */
  slug: string
  /** The other tool's name, as its makers write it: the table's column and the last crumb. */
  competitor: string
  /** The `<title>`, under 60 characters with " · Financy" after it, in the words people search. */
  title: string
  /** The meta description, under 155 characters. */
  description: string
  h1: string
  /** Two sentences: when to stay on the other tool, then when to choose Financy. */
  answer: string
  rows: readonly AlternativeRow[]
  /** How the table was made: a message with a `<mail>` tag around `{email}`. */
  method: string
  /** What Financy is not, for a reader it does not fit. */
  fit: string
  /** "When another tool fits better": a message whose tags are the keys of `betterLinks`. */
  better: string
  /** The address of each tool `better` names, each the tool's own site or repository. */
  betterLinks: Readonly<Record<string, string>>
  /** "Moving from …": one honest paragraph. */
  moving: string
  /** 3 to 5 questions people type, with answers that stand alone. */
  questions: readonly FeatureQuestion[]
  /**
   * The feature pages the page's closing band shows as cards, by slug. Each of them links back
   * with "Coming from …? Read the comparison", to the first comparison that names it.
   */
  features: readonly string[]
  /**
   * The day every row was last read against the other tool's own pages: the page's "Checked on"
   * line, the table's footer and the sitemap's `lastmod`. Changed only when every row is re-read.
   */
  checked: string
}

/** Firefly III's own documentation, the pages each row and answer was read on. */
const FIREFLY = {
  faq: `https://docs.firefly-iii.org/references/faq/firefly-iii/general/`,
  currencies: `https://docs.firefly-iii.org/how-to/firefly-iii/features/currencies/`,
  rates: `https://docs.firefly-iii.org/explanation/financial-concepts/exchange-rates/`,
  importer: `https://docs.firefly-iii.org/tutorials/firefly-iii/importing-data/`,
  readme: `https://github.com/firefly-iii/firefly-iii`,
} as const

/**
 * The comparisons, in the order the hub lists them. Each Firefly III fact was read in Firefly
 * III's docs and README on 2026-11-18 (financy#107 has each quote); each Financy row in the app
 * that day.
 */
export const ALTERNATIVES: readonly Alternative[] = [
  {
    slug: `firefly-iii`,
    competitor: `Firefly III`,
    title: `AlternativeFirefly.title`,
    description: `AlternativeFirefly.description`,
    h1: `AlternativeFirefly.h1`,
    answer: `AlternativeFirefly.answer`,
    rows: [
      {
        capability: `AlternativeFirefly.rowLogins`,
        values: [`yes`, `no`],
        note: `AlternativeFirefly.rowLoginsNote`,
        source: { label: `AlternativeFirefly.sourceFaq`, href: FIREFLY.faq },
      },
      {
        capability: `AlternativeFirefly.rowCurrencies`,
        values: [`yes`, `yes`],
        source: { label: `AlternativeFirefly.sourceCurrencies`, href: FIREFLY.currencies },
      },
      {
        capability: `AlternativeFirefly.rowTotal`,
        values: [`yes`, `yes`],
        note: `AlternativeFirefly.rowTotalNote`,
        source: { label: `AlternativeFirefly.sourceRates`, href: FIREFLY.rates },
      },
      {
        capability: `AlternativeFirefly.rowNoRate`,
        values: [`yes`, `no`],
        note: `AlternativeFirefly.rowNoRateNote`,
        source: { label: `AlternativeFirefly.sourceRates`, href: FIREFLY.rates },
      },
      {
        capability: `AlternativeFirefly.rowDoubleEntry`,
        values: [`no`, `yes`],
        source: { label: `AlternativeFirefly.sourceReadme`, href: FIREFLY.readme },
      },
      {
        capability: `AlternativeFirefly.rowImport`,
        values: [`no`, `partial`],
        note: `AlternativeFirefly.rowImportNote`,
        source: { label: `AlternativeFirefly.sourceImporter`, href: FIREFLY.importer },
      },
      {
        capability: `AlternativeFirefly.rowSelfHost`,
        values: [`yes`, `yes`],
        source: { label: `AlternativeFirefly.sourceReadme`, href: FIREFLY.readme },
      },
    ],
    method: `AlternativeFirefly.method`,
    fit: `AlternativeFirefly.fit`,
    better: `AlternativeFirefly.better`,
    betterLinks: {
      firefly: FIREFLY.readme,
      gnucash: `https://www.gnucash.org/`,
      beancount: `https://beancount.github.io/`,
      hledger: `https://hledger.org/`,
      sure: `https://github.com/we-promise/sure`,
    },
    moving: `AlternativeFirefly.moving`,
    questions: [
      {
        id: `faq-own-login`,
        question: `AlternativeFirefly.loginQuestion`,
        answer: `AlternativeFirefly.loginAnswer`,
      },
      {
        id: `faq-double-entry`,
        question: `AlternativeFirefly.doubleEntryQuestion`,
        answer: `AlternativeFirefly.doubleEntryAnswer`,
      },
      {
        id: `faq-bring-data`,
        question: `AlternativeFirefly.dataQuestion`,
        answer: `AlternativeFirefly.dataAnswer`,
      },
      {
        id: `faq-cost`,
        question: `AlternativeFirefly.costQuestion`,
        answer: `AlternativeFirefly.costAnswer`,
      },
    ],
    features: [`households`, `multi-currency`],
    checked: `2026-11-18`,
  },
]

/** The hub's address in `language`: `/alternatives`, `/de/alternatives`. */
export function alternativesPath(language: Language = DEFAULT_LANGUAGE): string {
  return localePath(language, `/alternatives`)
}

/** The address of the comparison `slug` in `language`: `/alternatives/<slug>`. */
export function alternativePath(slug: string, language: Language = DEFAULT_LANGUAGE): string {
  return localePath(language, `/alternatives/${slug}`)
}

/** The comparison at `/alternatives/<slug>`, or `undefined` for an address that has none. */
export function alternative(slug: string): Alternative | undefined {
  return ALTERNATIVES.find((page) => page.slug === slug)
}

/**
 * The day the hub last changed: the newest comparison's check, since the hub shows each one's
 * date.
 */
export const ALTERNATIVES_UPDATED: string = ALTERNATIVES.map(({ checked }) => checked).sort()
  .at(-1)!

/**
 * One of {@link ALTERNATIVES} in the language of `t`: every key replaced by its words, except
 * `method` and `better`, which carry links and stay keys for the page's `rich`.
 */
export function alternativeIn(t: Translator<string>, page: Alternative): Alternative {
  return {
    ...page,
    title: t.t(page.title),
    description: t.t(page.description),
    h1: t.t(page.h1),
    answer: t.t(page.answer),
    rows: page.rows.map((row) => ({
      ...row,
      capability: t.t(row.capability),
      note: row.note && t.t(row.note),
      source: { ...row.source, label: t.t(row.source.label) },
    })),
    fit: t.t(page.fit),
    moving: t.t(page.moving),
    questions: page.questions.map(({ id, question, answer }) => ({
      id,
      question: t.t(question),
      answer: t.t(answer),
    })),
  }
}

/** The hub's title and description in the language of `t`. */
export function alternativesHead(t: Translator<string>): { title: string; description: string } {
  return { title: t.t(`Alternatives.title`), description: t.t(`Alternatives.description`) }
}
