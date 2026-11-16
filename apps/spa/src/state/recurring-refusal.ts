import { ConnectionLostError, describeError, RealtimeRequestError } from "@spy4x/realtime"
import { type PlanRefusal, readPlanRefusal } from "@domain/billing"
import { NO_RECURRING_ERRORS, type RecurringEditorErrors } from "@ui/recurring-parts.tsx"
import { refusedField } from "../i18n.ts"
import { TRANSACTION_MESSAGES } from "./transactions.ts"

/** The words a refused rule write shows, by what went wrong. */
export const RECURRING_MESSAGES = {
  conflict: `RecurringMessages.conflict`,
  gone: `RecurringMessages.gone`,
  offline: `RecurringMessages.offline`,
  load: `RecurringMessages.load`,
  save: `RecurringMessages.save`,
  delete: `RecurringMessages.delete`,
  skip: `RecurringMessages.skip`,
  restore: `RecurringMessages.restore`,
} as const

/** The code of a refused call (`VERSION_CONFLICT`, `ACCOUNT_NOT_FOUND`...), or `null`. */
export function refusalCode(cause: unknown): string | null {
  if (!(cause instanceof RealtimeRequestError)) return null
  const code = (cause.details as { code?: unknown } | undefined)?.code
  return typeof code === `string` ? code : null
}

/** The plan limit a refused write hit, or `null`. */
export function recurringPlan(cause: unknown): PlanRefusal | null {
  return cause instanceof RealtimeRequestError ? readPlanRefusal(cause.details) : null
}

/** The request's fields, by the editor's error each one shows under. */
const FIELDS: [keyof RecurringEditorErrors, string][] = [
  [`amount`, `amount`],
  [`currency`, `currency`],
  [`accountAmount`, `accountAmount`],
  [`account`, `accountId`],
  [`category`, `categoryId`],
  [`memo`, `memo`],
  [`interval`, `rrule`],
  [`startDate`, `startDate`],
  [`endDate`, `endDate`],
  [`count`, `count`],
]

/**
 * What the editor shows for a save, a delete or a restore the server refused or could not be
 * reached for: each refused field under itself, an archived or gone account or category under its
 * select, and anything else above the buttons in words the person can act on. A plan refusal
 * names nothing here: {@link recurringPlan} reads it for the plan's notice.
 */
export function recurringRefusal(cause: unknown, fallback: string): RecurringEditorErrors {
  const errors = { ...NO_RECURRING_ERRORS }
  if (cause instanceof ConnectionLostError) return { ...errors, form: RECURRING_MESSAGES.offline }
  // The plan's notice says it, with the way to a bigger plan.
  if (recurringPlan(cause)) return errors
  switch (refusalCode(cause)) {
    case `VERSION_CONFLICT`:
      return { ...errors, form: RECURRING_MESSAGES.conflict }
    case `RECURRING_RULE_NOT_FOUND`:
      return { ...errors, form: RECURRING_MESSAGES.gone }
    case `ACCOUNT_NOT_FOUND`:
      return { ...errors, account: TRANSACTION_MESSAGES.accountGone }
    case `CATEGORY_NOT_FOUND`:
      return { ...errors, category: TRANSACTION_MESSAGES.categoryGone }
    case `CATEGORY_KIND_MISMATCH`:
      return { ...errors, category: TRANSACTION_MESSAGES.categoryKind }
  }
  let named = false
  for (const [error, field] of FIELDS) {
    const text = refusedField(cause, field)
    if (text) {
      errors[error] = text
      named = true
    }
  }
  return named ? errors : { ...errors, form: describeError(cause, fallback) }
}
