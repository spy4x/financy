import type { Translator } from "@spy4x/platform/universal/i18n"
import { isolate } from "@spy4x/preact-ui/bdi"
import type { AccountActions } from "@ui/accounts-screen.tsx"
import type { accountsStore } from "../state/accounts.ts"
import type { toasts } from "../state/toasts.ts"

/** How long a deleted account's toast offers Undo. */
export const ACCOUNT_UNDO_MS = 8_000

/** The id of the archive toast: a second archive replaces the first instead of stacking on it. */
export const ACCOUNT_ARCHIVED_TOAST_ID = `account-archived`

/**
 * The menu changes of the list and the editor. A change the screen already shows (setting or
 * clearing the default, a restore) shows no toast. An archive does, because the account leaves
 * the list unless archived accounts are shown; repeated archives share one toast
 * ({@link ACCOUNT_ARCHIVED_TOAST_ID}) so they never stack over the list. A delete's toast offers
 * Undo for {@link ACCOUNT_UNDO_MS}, which restores the account.
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
        id: ACCOUNT_ARCHIVED_TOAST_ID,
        title: t.t(`AccountsView.archivedTitle`),
        body: archived
          ? t.t(`AccountsView.archived`, { name })
          : t.t(`AccountsView.unarchived`, { name }),
        dataE2E: "account-archived",
      })
    },
    async onSetDefault(id, isDefault) {
      await store.setDefault(id, isDefault)
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
      await store.restore(id)
    },
  }
  return actions
}
