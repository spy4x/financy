import { useEffect } from "preact/hooks"
import { useLocation } from "wouter-preact"
import { createOnlineStatus } from "@spy4x/preact-signals/online"
import { UnsavedGuard } from "@spy4x/preact-ui/unsaved-guard"
import { isolate } from "@spy4x/preact-ui/bdi"
import { canMutateNotes } from "@domain/groups"
import { AccountKind } from "@domain/accounts"
import { AccountEditorScreen } from "@ui/account-editor-screen.tsx"
import { ACCOUNT_PATHS } from "@ui/progressive.tsx"
import { useAppText } from "@ui/i18n.ts"
import { accountsStore } from "../state/accounts.ts"
import { groupsStore } from "../state/groups.ts"
import { selectionStore } from "../state/selection.ts"
import { toasts } from "../state/toasts.ts"
import { isSpaPath } from "./spa-paths.ts"
import { accountActions } from "./account-actions.ts"
import { accountRow } from "./AccountsView.tsx"

const network = createOnlineStatus()

/**
 * Wires the account editor to the accounts store: `/accounts/new` (no `accountId`) creates an
 * account in the person's selected household, `/accounts/:accountId` edits one of its accounts. A
 * created account takes the create page's place in the history. Leaving with unsaved changes asks
 * first.
 */
export function AccountEditorView({ accountId = null }: { accountId?: string | null }) {
  const [, navigate] = useLocation()
  const t = useAppText()
  const store = accountsStore
  const groupId = selectionStore.groupId.value
  useEffect(() => network.watch(), [])
  useEffect(() => {
    if (groupId) void store.open(groupId)
  }, [groupId])
  const membership = groupId
    ? groupsStore.groups.value.find((group) => group.id === groupId)
    : undefined
  const canWrite = membership ? canMutateNotes(membership.role) : false
  const account = accountId === null ? undefined : store.byId.value.get(accountId)
  const form = store.form.value
  useEffect(() => {
    if (accountId === null) store.startCreate()
    else if (account) store.startEdit(account.id)
  }, [accountId, account, form === null])
  const editing = accountId !== null && form?.id === accountId ? form : null
  const creating = accountId === null && form?.id === null ? form : null
  const value = editing ?? creating ??
    (account
      ? { ...account }
      : { name: "", kind: AccountKind.BANK, currency: null, startingBalance: 0 })
  const listLoading = store.loading.value || store.groupId.value !== groupId
  const groupLoading = !membership && (groupsStore.loading.value || groupId === null)
  const actions = canWrite ? accountActions(t, store, toasts) : undefined
  return (
    <>
      <AccountEditorScreen
        group={membership ? { id: membership.id, name: membership.name, canWrite } : null}
        loading={groupLoading || (accountId !== null && !account && listLoading)}
        notFound={accountId !== null && !account && !listLoading && !groupLoading}
        account={account ? accountRow(account) : null}
        value={{
          name: value.name,
          kind: value.kind,
          currency: value.currency,
          startingBalance: value.startingBalance,
        }}
        onChange={(next) => store.change(next)}
        errors={{
          ...store.formErrors.value,
          form: store.formErrors.value.form ?? (account ? store.listError.value : null),
        }}
        saving={store.saving.value}
        dirty={store.unsaved.value}
        onSave={async () => {
          const created = accountId === null
          const result = await store.save()
          if (!result) return
          const name = isolate(result.name)
          toasts.success({
            title: created ? t.t(`AccountsView.createdTitle`) : t.t(`AccountsView.savedTitle`),
            body: created
              ? t.t(`AccountsView.created`, { name })
              : t.t(`AccountsView.saved`, { name }),
            dataE2E: created ? "account-created" : "account-saved",
          })
          if (created) navigate(ACCOUNT_PATHS.account(result.id), { replace: true })
        }}
        onRevert={() => store.revert()}
        recentCurrencies={store.currencies.value}
        pending={store.pendingId.value !== null}
        onArchive={actions && account
          ? (archived) => actions.onArchive(account.id, archived)
          : undefined}
        onSetDefault={actions && account
          ? (isDefault) => actions.onSetDefault(account.id, isDefault)
          : undefined}
        onDelete={actions && account
          ? async () => {
            await actions.onDelete(account.id)
            if (!store.byId.value.has(account.id)) navigate(ACCOUNT_PATHS.list)
          }
          : undefined}
        offline={!network.online.value}
        navigate={navigate}
      />
      <UnsavedGuard
        when={canWrite && store.unsaved.value}
        owns={(url) => isSpaPath(url.pathname)}
        navigate={navigate}
        labels={{
          title: t.t(`AccountsView.discardTitle`),
          message: account
            ? t.t(`AccountsView.discard`, { name: isolate(account.name) })
            : t.t(`AccountsView.discardNew`),
          leave: t.t(`AccountsView.discardLeave`),
          stay: t.t(`AccountsView.discardStay`),
        }}
        onDiscard={() => store.closeForm()}
      />
    </>
  )
}
