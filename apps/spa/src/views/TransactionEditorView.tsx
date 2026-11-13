import { useEffect } from "preact/hooks"
import { useLocation, useSearch } from "wouter-preact"
import { createOnlineStatus } from "@spy4x/preact-signals/online"
import { useFormat, When } from "@spy4x/preact-ui/format"
import { Rich } from "@spy4x/preact-ui/i18n"
import { UnsavedGuard } from "@spy4x/preact-ui/unsaved-guard"
import { todayInTz } from "@spy4x/time/tz"
import { canMutateNotes, groupTimeZone } from "@domain/groups"
import { TransactionEditorScreen } from "@ui/transaction-editor-screen.tsx"
import { readNext, TRANSACTION_PATHS } from "@ui/progressive.tsx"
import { useAppText } from "@ui/i18n.ts"
import { accountsStore } from "../state/accounts.ts"
import { categoriesStore } from "../state/categories.ts"
import { groupsStore } from "../state/groups.ts"
import { membersStore } from "../state/members.ts"
import { selectionStore } from "../state/selection.ts"
import { sessionState } from "../state/session.ts"
import { toasts } from "../state/toasts.ts"
import { prefillEntry, transactionsStore } from "../state/transactions.ts"
import { isSpaPath } from "./spa-paths.ts"
import { personName } from "./note-people.ts"
import {
  amountInCategory,
  transactionAccounts,
  transactionCategories,
  transactionRow,
} from "./transaction-rows.ts"

const network = createOnlineStatus()

/**
 * Wires the transaction editor to the stores: `/transactions/new` (no `transactionId`) is the
 * quick entry, prefilled from the person's last entry in the selected household;
 * `/transactions/:transactionId` edits one. A save goes back to `?next=`, the page the person came
 * from, or the list, and says so in a toast; an added entry's toast offers Undo, which deletes it.
 * Leaving with unsaved changes asks first.
 */
export function TransactionEditorView(
  { transactionId = null }: { transactionId?: string | null },
) {
  const [, navigate] = useLocation()
  const t = useAppText()
  const { locale } = useFormat()
  const store = transactionsStore
  const groupId = selectionStore.groupId.value
  const search = new URLSearchParams(useSearch())
  const back = readNext(search) ?? TRANSACTION_PATHS.list
  const field = search.get("field")
  useEffect(() => network.watch(), [])
  useEffect(() => {
    if (!groupId) return
    void store.open(groupId)
    void accountsStore.open(groupId)
    void categoriesStore.open(groupId)
    void membersStore.open(groupId)
  }, [groupId])
  const membership = groupId
    ? groupsStore.groups.value.find((group) => group.id === groupId)
    : undefined
  const canWrite = membership ? canMutateNotes(membership.role) : false
  const youId = sessionState.value.user?.id ?? null
  const entry = transactionId === null ? undefined : store.byId.value.get(transactionId)
  const accountsReady = accountsStore.groupId.value === groupId && !accountsStore.loading.value
  const entriesReady = store.groupId.value === groupId &&
    (store.loaded.value || !store.loading.value)
  const form = store.form.value
  // The quick entry is prefilled once the accounts and the device's entries are read, so the last
  // entry's account and category are there to take.
  useEffect(() => {
    if (transactionId !== null || !membership || !accountsReady || !entriesReady) return
    if (form?.id === null) return
    store.startCreate(prefillEntry({
      transactions: store.transactions.value,
      accounts: accountsStore.accounts.value,
      userId: youId,
      today: todayInTz(groupTimeZone(membership)),
    }))
  }, [transactionId, membership?.id, accountsReady, entriesReady])
  useEffect(() => {
    if (transactionId !== null && entry) store.startEdit(entry.id)
  }, [transactionId, entry, form === null])

  const accounts = transactionAccounts(accountsStore.accounts.value)
  const categories = transactionCategories(categoriesStore.categories.value)
  const members = membersStore.groupId.value === groupId ? membersStore.members.value : null
  const context = { t, accounts, categories, youId, members }
  const row = entry ? transactionRow(entry, context) : null
  const editing = transactionId !== null && form?.id === transactionId ? form : null
  const creating = transactionId === null && form?.id === null ? form : null
  const value = editing ?? creating
  const loading = !membership && (groupsStore.loading.value || groupId === null) ||
    (transactionId === null ? value === null : !entry && !entriesReady)
  return (
    <>
      <TransactionEditorScreen
        group={membership ? { id: membership.id, name: membership.name, canWrite } : null}
        loading={loading}
        notFound={transactionId !== null && !entry && entriesReady && !!membership}
        transaction={row}
        stamp={entry && membership && (
          <Stamp
            entry={entry}
            name={entry.version > 1
              ? personName(t, entry.updatedByUserId, youId, members)
              : row?.author}
            groupName={membership.name}
          />
        )}
        value={value ?? {
          kind: entry?.kind ?? 1,
          amount: entry ? Math.abs(entry.amount) : null,
          currency: entry?.currency ?? null,
          accountAmount: null,
          accountId: entry?.accountId ?? null,
          categoryId: entry?.categoryId ?? null,
          date: entry?.date ?? "",
          memo: entry?.memo ?? "",
        }}
        onChange={(next) => store.change(next)}
        errors={{
          ...store.formErrors.value,
          form: store.formErrors.value.form ?? (entry ? store.listError.value : null),
        }}
        accounts={accounts}
        categories={categories}
        saving={store.saving.value}
        dirty={store.unsaved.value}
        onSave={async () => {
          const created = transactionId === null
          const saved = await store.save()
          if (!saved) return
          const what = amountInCategory(t, transactionRow(saved, context), locale)
          store.closeForm()
          navigate(back, { replace: created })
          if (created) {
            toasts.success({
              title: t.t(`TransactionToasts.addedTitle`),
              body: t.t(`TransactionToasts.added`, { what }),
              dataE2E: "transaction-added",
              action: {
                label: t.t(`UndoToast.undo`),
                dataE2E: "transaction-added-undo",
                onAction: () => void store.remove(saved.id),
              },
            })
          } else {
            toasts.success({
              title: t.t(`TransactionToasts.savedTitle`),
              body: t.t(`TransactionToasts.saved`, { what }),
              dataE2E: "transaction-saved",
            })
          }
        }}
        onDelete={canWrite && entry
          ? async () => {
            if (await store.remove(entry.id)) navigate(TRANSACTION_PATHS.list)
          }
          : undefined}
        pending={store.pendingId.value !== null}
        backHref={back}
        focusField={field === "account" || field === "category" ? field : null}
        recentCurrencies={accountsStore.currencies.value}
        offline={canWrite && !network.online.value}
        navigate={navigate}
      />
      <UnsavedGuard
        when={canWrite && store.unsaved.value}
        owns={(url) => isSpaPath(url.pathname)}
        navigate={navigate}
        labels={{
          title: t.t(`AccountsView.discardTitle`),
          message: entry ? t.t(`TransactionEditor.discard`) : t.t(`TransactionEditor.discardNew`),
          leave: t.t(`AccountsView.discardLeave`),
          stay: t.t(`AccountsView.discardStay`),
        }}
        onDiscard={() => store.closeForm()}
      />
    </>
  )
}

/** "Added by Anna, 12 Nov", or "Changed by …" once someone edited it. */
function Stamp(
  { entry, name, groupName }: {
    entry: { createdAt: string; updatedAt: string; version: number }
    name?: string
    groupName: string
  },
) {
  const t = useAppText()
  if (name === undefined) return <>{groupName}</>
  const changed = entry.version > 1
  return (
    <span data-e2e="transaction-stamp">
      <Rich
        parts={t.parts(changed ? `TransactionEditor.changedBy` : `TransactionEditor.addedBy`, {
          name,
          date: ``,
        })}
        tags={{ date: () => <When at={changed ? entry.updatedAt : entry.createdAt} /> }}
      />
    </span>
  )
}
