import { useEffect, useState } from "preact/hooks"
import { useLocation } from "wouter-preact"
import { todayInTz } from "@spy4x/time/tz"
import { canMutateNotes, groupTimeZone } from "@domain/groups"
import { RecurringScreen } from "@ui/recurring-screen.tsx"
import { useAppText } from "@ui/i18n.ts"
import type { Message } from "@ui/message.ts"
import { accountsStore } from "../state/accounts.ts"
import { categoriesStore } from "../state/categories.ts"
import { groupsStore } from "../state/groups.ts"
import { recurringStore } from "../state/recurring.ts"
import { RECURRING_MESSAGES, recurringPlan, recurringRefusal } from "../state/recurring-refusal.ts"
import { selectionStore } from "../state/selection.ts"
import { toasts } from "../state/toasts.ts"
import { transactionAccounts, transactionCategories } from "./transaction-rows.ts"
import { recurringScreenRows, recurringUndoText } from "./recurring-rows.ts"
import { useUndoToast } from "./use-undo-toast.ts"

/**
 * Wires the repeating entries page to the stores for `/recurring`: the rules of the person's
 * selected household and the dates they make next. Whoever may write notes may skip a date and
 * open a rule's editor; a viewer reads both lists. The Undo of a rule deleted in its editor shows
 * here, where the editor sends the person.
 */
export function RecurringView() {
  const [, navigate] = useLocation()
  const t = useAppText()
  const store = recurringStore
  const groupId = selectionStore.groupId.value
  const [skipping, setSkipping] = useState<string | null>(null)
  const [skipError, setSkipError] = useState<Message | null>(null)
  useEffect(() => {
    if (!groupId) return
    void store.open(groupId)
    void accountsStore.open(groupId)
    void categoriesStore.open(groupId)
  }, [groupId])
  const membership = groupId
    ? groupsStore.groups.value.find((group) => group.id === groupId)
    : undefined
  const canWrite = membership ? canMutateNotes(membership.role) : false
  const context = {
    accounts: transactionAccounts(accountsStore.accounts.value),
    categories: transactionCategories(categoriesStore.categories.value),
    today: todayInTz(groupTimeZone(membership ?? {})),
  }
  useUndoToast(store, recurringUndoText(context))
  const shown = store.groupId.value === groupId ? store.rules.value : []
  const { rules, upcoming } = recurringScreenRows(shown, { ...context, t })
  const undoError = store.undoError.value
  const listError = skipError ??
    (undoError ? recurringRefusal(undoError, RECURRING_MESSAGES.restore).form : null) ??
    (store.error.value ? recurringRefusal(store.error.value, RECURRING_MESSAGES.load).form : null)
  return (
    <RecurringScreen
      group={membership ? { id: membership.id, name: membership.name, canWrite } : null}
      rules={rules}
      upcoming={upcoming}
      today={context.today}
      loading={(store.loading.value && shown.length === 0) || groupsStore.loading.value ||
        groupId === null}
      listError={listError}
      listPlan={undoError ? recurringPlan(undoError) : null}
      skipping={skipping}
      onSkip={canWrite && groupId
        ? async (id, date) => {
          setSkipping(`${id}:${date}`)
          setSkipError(null)
          try {
            await store.skip({ groupId, id, date })
            toasts.success({
              title: t.t(`RecurringToasts.skippedTitle`),
              body: t.t(`RecurringToasts.skipped`),
              dataE2E: `recurring-skipped`,
            })
          } catch (cause) {
            setSkipError(recurringRefusal(cause, RECURRING_MESSAGES.skip).form)
            void store.refresh()
          } finally {
            setSkipping(null)
          }
        }
        : undefined}
      navigate={navigate}
    />
  )
}
