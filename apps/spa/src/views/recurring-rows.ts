import type { Translator } from "@spy4x/platform/universal/i18n"
import { isolate } from "@spy4x/preact-ui/bdi"
import { categoryLabel } from "@ui/transaction-parts.tsx"
import type { TransactionAccount, TransactionCategory } from "@ui/transaction-parts.tsx"
import { recurringRows, type RuleFacts } from "@ui/recurring-parts.tsx"
import type { RecurringUndoOffer } from "../state/recurring.ts"
import type { UndoText } from "./use-undo-toast.ts"

/** What the screens need to name a rule's account and category. */
export interface RecurringContext {
  t: Translator<string>
  accounts: readonly TransactionAccount[]
  categories: readonly TransactionCategory[]
  today: string
}

/** The list's rows and the upcoming dates for the rules the store holds, in the page's language. */
export function recurringScreenRows(rules: readonly RuleFacts[], context: RecurringContext) {
  return recurringRows(rules, {
    words: context.t,
    today: context.today,
    accountName: (id) => context.accounts.find((account) => account.id === id)?.name ?? ``,
    categoryLabel: (id) => {
      const category = context.categories.find((candidate) => candidate.id === id)
      return category ? categoryLabel(category, context.categories) : ``
    },
  })
}

/** A deleted rule's toast: "Repeating entry deleted" and what it made. */
export function recurringUndoText(
  context: Omit<RecurringContext, `t`>,
): UndoText<RecurringUndoOffer> {
  return {
    e2e: `recurring`,
    title: (t) => t.t(`RecurringToasts.deletedTitle`),
    body: (t, offer) =>
      t.t(`RecurringToasts.deleted`, {
        title: isolate(recurringScreenRows([offer.rule], { ...context, t }).rules[0].title),
      }),
  }
}
