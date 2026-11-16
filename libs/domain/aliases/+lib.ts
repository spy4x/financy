import { fold, hasUnsafeTextCharacters } from "@spy4x/platform/universal/text"
import type { FieldErrors } from "@spy4x/validation"

/**
 * Aliases: a record's other words for itself ("Lidl" for "Groceries", "card" for an account),
 * which search matches as well as the name. One set of rules for every aggregate that has them, so
 * categories and accounts clean and refuse aliases the same way.
 * @module
 */

/** One aggregate's alias limits and its own error. */
export interface AliasRules {
  /** The record's English name, `category` or `account`, for the refusal's message. */
  noun: string
  /** The most aliases one record carries. */
  max: number
  /** The longest alias, in characters, after trimming. */
  maxLength: number
  /** Builds the aggregate's own refusal, naming the `aliases` field in `fields`. */
  refuse: (message: string, fields: FieldErrors) => Error
}

/**
 * Refuses more than `rules.max` aliases by the list's length alone, before any alias is looked at,
 * so a payload of thousands costs one length read. `value` is the raw payload; anything that is not
 * a list is left for the schema to refuse.
 */
export function assertAliasCount(value: unknown, rules: AliasRules): void {
  const aliases = (value as { aliases?: unknown } | null)?.aliases
  if (Array.isArray(aliases) && aliases.length > rules.max) {
    const article = /^[aeiou]/i.test(rules.noun) ? `An` : `A`
    throw rules.refuse(
      `${article} ${rules.noun} can have at most ${rules.max} aliases`,
      { aliases: { code: "maxItems", values: { rule: rules.max } } },
    )
  }
}

/**
 * Cleans aliases the way a name is cleaned: each trimmed, blanks dropped, and each kept once,
 * compared folded, so "Lidl" and " lidl " are one alias and the first spelling stays. Throws
 * `rules.refuse(...)` naming the `aliases` field for an alias longer than `rules.maxLength`
 * characters or one with a control or an invisible character. The caller counts them first
 * ({@link assertAliasCount}).
 */
export function parseAliases(aliases: readonly string[], rules: AliasRules): string[] {
  const kept: string[] = []
  const seen = new Set<string>()
  for (const raw of aliases) {
    const alias = raw.trim()
    if (alias === "") continue
    if (Array.from(alias).length > rules.maxLength) {
      throw rules.refuse(
        `Each ${rules.noun} alias must contain at most ${rules.maxLength} characters`,
        { aliases: { code: "maxLength", values: { rule: rules.maxLength } } },
      )
    }
    if (hasUnsafeTextCharacters(alias)) {
      throw rules.refuse(
        `${rules.noun[0].toUpperCase()}${
          rules.noun.slice(1)
        } aliases must not contain control or invisible characters`,
        { aliases: { code: "unsafeCharacters" } },
      )
    }
    const key = fold(alias)
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(alias)
  }
  return kept
}
