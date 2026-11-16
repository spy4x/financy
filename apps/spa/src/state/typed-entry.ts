import { parseAmount } from "@spy4x/platform/universal/money-core"
import { amountDecimals } from "@domain/money"

/** What {@link splitTypedEntry} reads from a text such as `coffee 4.50`. */
export interface TypedEntry {
  /** The text without the amount, trimmed, with runs of spaces made one. */
  memo: string
  /** The amount in the currency's smallest unit, always positive, or `null` for none. */
  amount: number | null
}

/** A word that may be an amount: digits, `.` and `,`, with an optional leading minus. */
const NUMBER = /^-?[\d.,]+$/

/**
 * Splits text typed in the search palette into a new transaction's memo and amount in `currency`:
 * `coffee 4.50` is the memo `coffee` and 450 cents. The last word that is a number is the amount;
 * the other words are the memo. In that word, the last `.` or `,` is the decimal mark, unless
 * exactly three digits follow it and the currency has fewer than three decimals (`1,500` in USD is
 * fifteen hundred); the other mark is the grouping one. A leading minus is dropped: the quick
 * entry's kind says expense or income. When the word is no amount `parseAmount` accepts (more
 * decimals than the currency has, zero, an unknown currency) or `currency` is `null`, the whole
 * text is the memo. Linear in the text's length: one split on spaces and one anchored regex per
 * word, with no nested repetition.
 */
export function splitTypedEntry(text: string, currency: string | null): TypedEntry {
  const words = text.trim().split(/\s+/).filter((word) => word !== "")
  const whole: TypedEntry = { memo: words.join(" "), amount: null }
  const index = words.findLastIndex((word) => NUMBER.test(word) && /\d/.test(word))
  if (index === -1 || currency === null) return whole
  const amount = amountOf(words[index].replace(/^-/, ""), currency)
  if (amount === null) return whole
  return { memo: words.filter((_, at) => at !== index).join(" "), amount }
}

/** `word`'s amount in `currency`, read by the marks rule of {@link splitTypedEntry}, or `null`. */
function amountOf(word: string, currency: string): number | null {
  let decimals: number
  try {
    decimals = amountDecimals(currency)
  } catch {
    return null
  }
  const at = Math.max(word.lastIndexOf(`.`), word.lastIndexOf(`,`))
  const mark = at === -1 ? `.` : word[at] as `.` | `,`
  const other: `.` | `,` = mark === `.` ? `,` : `.`
  const grouping = at !== -1 && word.length - at - 1 === 3 && decimals < 3
  const format = grouping ? { decimal: other, group: mark } : { decimal: mark, group: other }
  const parsed = parseAmount(word, currency, format, { decimals })
  return parsed.ok && parsed.value > 0 ? parsed.value : null
}
