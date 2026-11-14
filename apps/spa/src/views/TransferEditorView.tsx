import { useEffect } from "preact/hooks"
import { useLocation } from "wouter-preact"
import { createOnlineStatus } from "@spy4x/preact-signals/online"
import { useFormat } from "@spy4x/preact-ui/format"
import { UnsavedGuard } from "@spy4x/preact-ui/unsaved-guard"
import { todayInTz } from "@spy4x/time/tz"
import { canMutateNotes, groupTimeZone } from "@domain/groups"
import type { TransactionKind } from "@domain/transactions"
import { TransferEditorScreen } from "@ui/transfer-editor-screen.tsx"
import { TRANSACTION_PATHS } from "@ui/progressive.tsx"
import { useAppText } from "@ui/i18n.ts"
import { accountsStore } from "../state/accounts.ts"
import { groupsStore } from "../state/groups.ts"
import { membersStore } from "../state/members.ts"
import { selectionStore } from "../state/selection.ts"
import { sessionState } from "../state/session.ts"
import { toasts } from "../state/toasts.ts"
import { prefillEntry, transactionsStore } from "../state/transactions.ts"
import { entryFromTransfer, prefillTransfer, transfersStore } from "../state/transfers.ts"
import { isSpaPath } from "./spa-paths.ts"
import { personName } from "./note-people.ts"
import { Stamp } from "./TransactionEditorView.tsx"
import { transactionAccounts } from "./transaction-rows.ts"
import { transferRow, transferWhat } from "./transfer-rows.ts"

const network = createOnlineStatus()

const accountCurrency = (id: string) => accountsStore.byId.value.get(id)?.currency

/**
 * Wires the transfer editor to the stores: `/transfers/new` (no `transferId`) adds one, from the
 * default account; `/transfers/:transferId` edits one. A save or a delete goes back to the
 * transactions list and says so in a toast with Undo. Writes need the network: offline, the page
 * shows the transfer and keeps Save off. Leaving with unsaved changes asks first.
 */
export function TransferEditorView({ transferId = null }: { transferId?: string | null }) {
  const [, navigate] = useLocation()
  const t = useAppText()
  const { locale } = useFormat()
  const store = transfersStore
  const groupId = selectionStore.groupId.value
  useEffect(() => network.watch(), [])
  useEffect(() => {
    if (!groupId) return
    void store.open(groupId)
    void accountsStore.open(groupId)
    void membersStore.open(groupId)
  }, [groupId])
  const membership = groupId
    ? groupsStore.groups.value.find((group) => group.id === groupId)
    : undefined
  const canWrite = membership ? canMutateNotes(membership.role) : false
  const youId = sessionState.value.user?.id ?? null
  const transfer = transferId === null ? undefined : store.byId.value.get(transferId)
  const accountsReady = accountsStore.groupId.value === groupId && !accountsStore.loading.value
  const transfersReady = store.groupId.value === groupId &&
    (store.loaded.value || !store.loading.value)
  const form = store.form.value
  const today = todayInTz(groupTimeZone(membership ?? {}))
  // A new transfer opens once the accounts are read; one the kind control carried here is kept.
  useEffect(() => {
    if (transferId !== null || !membership || !accountsReady) return
    if (form?.id === null) return
    store.startCreate(prefillTransfer(accountsStore.accounts.value, today))
  }, [transferId, membership?.id, accountsReady])
  useEffect(() => {
    if (transferId !== null && transfer) store.startEdit(transfer.id)
  }, [transferId, transfer, form === null])

  const accounts = transactionAccounts(accountsStore.accounts.value)
  const members = membersStore.groupId.value === groupId ? membersStore.members.value : null
  const context = { t, accounts, youId, members }
  const row = transfer ? transferRow(transfer, context) : null
  const editing = transferId !== null && form?.id === transferId ? form : null
  const creating = transferId === null && form?.id === null ? form : null
  const value = editing ?? creating
  const loading = !membership && (groupsStore.loading.value || groupId === null) ||
    (transferId === null ? value === null : !transfer && !transfersReady)
  return (
    <>
      <TransferEditorScreen
        group={membership ? { id: membership.id, name: membership.name, canWrite } : null}
        loading={loading}
        notFound={transferId !== null && !transfer && transfersReady && !!membership}
        transfer={row}
        stamp={transfer && membership && (
          <Stamp
            entry={transfer}
            name={transfer.version > 1
              ? personName(t, transfer.updatedByUserId, youId, members)
              : row?.author}
            groupName={membership.name}
            dataE2E="transfer-stamp"
          />
        )}
        value={value ?? {
          fromAccountId: transfer?.fromAccountId ?? null,
          toAccountId: transfer?.toAccountId ?? null,
          sentAmount: transfer?.sentAmount ?? null,
          receivedAmount: null,
          date: transfer?.date ?? today,
          memo: transfer?.memo ?? "",
        }}
        onChange={(next) => store.change(next)}
        errors={{
          ...store.formErrors.value,
          form: store.formErrors.value.form ?? (transfer ? store.listError.value : null),
        }}
        accounts={accounts}
        saving={store.saving.value}
        dirty={store.unsaved.value}
        onSave={async () => {
          const created = transferId === null
          const saved = await store.save()
          if (!saved) return
          const what = transferWhat(t, transferRow(saved, context), locale)
          store.closeForm()
          navigate(TRANSACTION_PATHS.list, { replace: created })
          if (created) {
            toasts.success({
              title: t.t(`TransferToasts.addedTitle`),
              body: t.t(`TransferToasts.added`, { what }),
              dataE2E: "transfer-added",
              action: {
                label: t.t(`UndoToast.undo`),
                dataE2E: "transfer-added-undo",
                onAction: () => void store.remove(saved.id),
              },
            })
          } else {
            toasts.success({
              title: t.t(`TransferToasts.savedTitle`),
              body: t.t(`TransferToasts.saved`, { what }),
              dataE2E: "transfer-saved",
            })
          }
        }}
        onDelete={canWrite && transfer
          ? async () => {
            if (await store.remove(transfer.id)) navigate(TRANSACTION_PATHS.list)
          }
          : undefined}
        pending={store.pendingId.value !== null}
        offline={canWrite && !network.online.value}
        onKind={transferId === null && groupId
          ? (kind: TransactionKind) => {
            const carried = entryFromTransfer(form ?? prefillTransfer([], today), accountCurrency)
            store.closeForm()
            void transactionsStore.open(groupId)
            transactionsStore.startCreate({
              ...prefillEntry({
                transactions: transactionsStore.transactions.value,
                accounts: accountsStore.accounts.value,
                userId: youId,
                today,
              }),
              kind,
              categoryId: null,
            })
            transactionsStore.change(carried)
            navigate(TRANSACTION_PATHS.new, { replace: true })
          }
          : undefined}
        navigate={navigate}
      />
      <UnsavedGuard
        when={canWrite && store.unsaved.value}
        owns={(url) => isSpaPath(url.pathname)}
        navigate={navigate}
        labels={{
          title: t.t(`AccountsView.discardTitle`),
          message: transfer ? t.t(`TransferEditor.discard`) : t.t(`TransferEditor.discardNew`),
          leave: t.t(`AccountsView.discardLeave`),
          stay: t.t(`AccountsView.discardStay`),
        }}
        onDiscard={() => store.closeForm()}
      />
    </>
  )
}
