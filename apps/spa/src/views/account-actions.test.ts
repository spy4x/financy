/**
 * The toasts that follow an account change: none for a change the screen already shows, one shared
 * toast for archives, and Undo on a delete. The store is a stand-in that answers each change with
 * the account, so no network is read.
 */
import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { createToastStore } from "@spy4x/preact-signals/toast"
import { AccountKind } from "@domain/accounts"
import type { AccountItem, accountsStore } from "../state/accounts.ts"
import { ACCOUNT_ARCHIVED_TOAST_ID, accountActions } from "./account-actions.ts"

const wallet: AccountItem = {
  id: "019a0000-0000-7000-8000-0000000000c1",
  groupId: "019a0000-0000-7000-8000-0000000000c0",
  name: "Wallet",
  kind: AccountKind.CASH,
  currency: "EUR",
  startingBalance: 0,
  archivedAt: null,
  isDefault: false,
  version: 1,
  changeSequence: "1",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  deletedAt: null,
}
const cash: AccountItem = { ...wallet, id: "019a0000-0000-7000-8000-0000000000c2", name: "Cash" }

/** A store whose every change succeeds and answers with the account it changed. */
function fakeStore(): typeof accountsStore {
  const answer = (id: string) => Promise.resolve([wallet, cash].find((a) => a.id === id) ?? null)
  return {
    archive: answer,
    setDefault: answer,
    remove: answer,
    restore: answer,
  } as unknown as typeof accountsStore
}

const t = { t: (key: string) => key } as unknown as Translator<string>

function setup() {
  const toasts = createToastStore()
  return { toasts, actions: accountActions(t, fakeStore(), toasts) }
}

describe("accountActions", () => {
  it("shows no toast after setting or clearing the default, since the badge shows it", async () => {
    const { toasts, actions } = setup()
    await actions.onSetDefault(wallet.id, true)
    await actions.onSetDefault(wallet.id, false)
    expect(toasts.list.value).toEqual([])
  })

  it("shows no toast after a restore, since the account is back in the list", async () => {
    const { toasts, actions } = setup()
    await actions.onRestore(wallet.id)
    expect(toasts.list.value).toEqual([])
  })

  it("shows one archive toast for several archives in a row instead of stacking them over the list", async () => {
    const { toasts, actions } = setup()
    await actions.onArchive(wallet.id, true)
    await actions.onArchive(cash.id, true)

    expect(toasts.list.value.map((toast) => toast.id)).toEqual([ACCOUNT_ARCHIVED_TOAST_ID])
    expect(toasts.list.value[0].dataE2E).toBe("account-archived")
  })

  it("still offers Undo after a delete", async () => {
    const { toasts, actions } = setup()
    await actions.onDelete(wallet.id)
    expect(toasts.list.value.map((toast) => toast.dataE2E)).toEqual(["account-undo-toast"])
  })
})
