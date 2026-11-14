import type { Translator } from "@spy4x/platform/universal/i18n"
import { isolate } from "@spy4x/preact-ui/bdi"
import type { TransferRow } from "@ui/transaction-parts.tsx"
import { moneyText } from "@ui/transfer-parts.tsx"
import type { TransferItem, TransferUndoOffer } from "../state/transfers.ts"
import { personName } from "./note-people.ts"
import type { RowContext } from "./transaction-rows.ts"
import type { UndoText } from "./use-undo-toast.ts"

/**
 * A transfer as the screens draw it. An account the device does not know (deleted on another
 * device, not read yet) shows as "Unknown", and its currency as the other side's, which hides a
 * second amount that could not be named.
 */
export function transferRow(
  transfer: TransferItem,
  context: Omit<RowContext, "categories">,
): TransferRow {
  const from = context.accounts.find((account) => account.id === transfer.fromAccountId)
  const to = context.accounts.find((account) => account.id === transfer.toAccountId)
  const unknown = context.t.t(`Transactions.unknown`)
  const fromCurrency = from?.currency ?? to?.currency ?? ``
  return {
    id: transfer.id,
    fromAccountId: transfer.fromAccountId,
    fromAccountName: from?.name ?? unknown,
    fromCurrency,
    sentAmount: transfer.sentAmount,
    toAccountId: transfer.toAccountId,
    toAccountName: to?.name ?? unknown,
    toCurrency: to?.currency ?? fromCurrency,
    receivedAmount: transfer.receivedAmount,
    converted: transfer.converted,
    memo: transfer.memo,
    date: transfer.date,
    author: personName(context.t, transfer.createdByUserId, context.youId, context.members),
    createdAt: transfer.createdAt,
  }
}

/** "€200.00 from Card to Cash", for the toasts. */
export function transferWhat(t: Translator<string>, row: TransferRow, locale: string): string {
  return t.t(`TransferRow.what`, {
    amount: isolate(moneyText(row.sentAmount, row.fromCurrency, locale)),
    from: isolate(row.fromAccountName),
    to: isolate(row.toAccountName),
  })
}

/** The Undo toast after a delete: "Transfer deleted · €200.00 from Card to Cash is deleted." */
export function transferUndoText(
  context: Omit<RowContext, "t" | "categories">,
  locale: string,
): UndoText<TransferUndoOffer> {
  return {
    e2e: `transfer`,
    title: (t) => t.t(`TransferToasts.deletedTitle`),
    body: (t, offer) =>
      t.t(`TransferToasts.deleted`, {
        what: transferWhat(t, transferRow(offer.transfer, { ...context, t }), locale),
      }),
  }
}
