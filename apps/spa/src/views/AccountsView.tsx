import { useEffect } from "preact/hooks"
import { useLocation } from "wouter-preact"
import { canMutateNotes } from "@domain/groups"
import { AccountsScreen } from "@ui/accounts-screen.tsx"
import type { AccountRow } from "@ui/account-parts.tsx"
import { useAppText } from "@ui/i18n.ts"
import { type AccountItem, accountsStore } from "../state/accounts.ts"
import { groupsStore } from "../state/groups.ts"
import { householdTotalStore } from "../state/household-total.ts"
import { selectionStore } from "../state/selection.ts"
import { toasts } from "../state/toasts.ts"
import { accountActions } from "./account-actions.ts"

/** What the screens draw of an account as the store holds it. */
export function accountRow(account: AccountItem): AccountRow {
  return {
    id: account.id,
    name: account.name,
    kind: account.kind,
    currency: account.currency,
    startingBalance: account.startingBalance,
    balance: account.balance ?? account.startingBalance,
    isDefault: account.isDefault,
    archived: account.archivedAt !== null,
  }
}

/**
 * Wires the accounts page to the accounts store for `/accounts`: the accounts of the person's
 * selected household. Whoever may write notes may change accounts; a viewer reads them.
 */
export function AccountsView() {
  const [, navigate] = useLocation()
  const t = useAppText()
  const store = accountsStore
  const groupId = selectionStore.groupId.value
  useEffect(() => {
    if (groupId) void Promise.all([store.open(groupId), householdTotalStore.open(groupId)])
  }, [groupId])
  // The trash closes when the page is left, so the list is what a return shows.
  useEffect(() => () => void store.showDeleted(false), [])
  const membership = groupId
    ? groupsStore.groups.value.find((group) => group.id === groupId)
    : undefined
  const canWrite = membership ? canMutateNotes(membership.role) : false
  const total = householdTotalStore.total.value
  return (
    <AccountsScreen
      group={membership ? { id: membership.id, name: membership.name, canWrite } : null}
      accounts={store.accounts.value.map(accountRow)}
      deleted={store.deleted.value?.map(accountRow) ?? null}
      total={total === null && householdTotalStore.failed.value ? undefined : total}
      showArchived={store.showArchived.value}
      onShowArchived={(show) => void (store.showArchived.value = show)}
      onShowDeleted={(show) => void store.showDeleted(show)}
      loading={store.loading.value || groupsStore.loading.value || groupId === null}
      listError={store.listError.value}
      pendingId={store.pendingId.value}
      actions={canWrite ? accountActions(t, store, toasts) : undefined}
      navigate={navigate}
    />
  )
}
