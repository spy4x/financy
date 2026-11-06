import type { Translator } from "@spy4x/platform/universal/i18n"
import { isolate } from "@spy4x/preact-ui/bdi"
import type { AccountActions } from "@ui/accounts-screen.tsx"
import type { accountsStore } from "../state/accounts.ts"
import type { toasts } from "../state/toasts.ts"

/** How long a deleted account's toast offers Undo. */
export const ACCOUNT_UNDO_MS = 8_000

/**
 * The menu changes of the list and the editor, each followed by a toast that says what happened.
 * A delete's toast offers Undo for {@link ACCOUNT_UNDO_MS}, which restores the account.
 */
export function accountActions(
  t: Translator<string>,
  store: typeof accountsStore,
  toastList: typeof toasts,
): AccountActions {
  const actions: AccountActions = {
    async onArchive(id, archived) {
      const account = await store.archive(id, archived)
      if (!account) return
      const name = isolate(account.name)
      toastList.success({
        title: t.t(`AccountsView.archivedTitle`),
        body: archived
          ? t.t(`AccountsView.archived`, { name })
          : t.t(`AccountsView.unarchived`, { name }),
        dataE2E: "account-archived",
      })
    },
    async onSetDefault(id, isDefault) {
      const account = await store.setDefault(id, isDefault)
      if (!account) return
      const name = isolate(account.name)
      toastList.success({
        title: t.t(`AccountsView.defaultTitle`),
        body: isDefault
          ? t.t(`AccountsView.defaultSet`, { name })
          : t.t(`AccountsView.defaultCleared`, { name }),
        dataE2E: "account-default-set",
      })
    },
    async onDelete(id) {
      const account = await store.remove(id)
      if (!account) return
      toastList.info({
        id: `account-undo-${id}`,
        title: t.t(`AccountsView.deletedTitle`),
        body: t.t(`AccountsView.deleted`, { name: isolate(account.name) }),
        duration: ACCOUNT_UNDO_MS,
        dataE2E: "account-undo-toast",
        action: {
          label: t.t(`AccountsView.undo`),
          dataE2E: "account-undo",
          onAction: () => void actions.onRestore(id),
        },
      })
    },
    async onRestore(id) {
      const account = await store.restore(id)
      if (!account) return
      toastList.success({
        title: t.t(`AccountsView.restoredTitle`),
        body: t.t(`AccountsView.restored`, { name: isolate(account.name) }),
        dataE2E: "account-restored",
      })
    },
  }
  return actions
}
