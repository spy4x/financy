/**
 * The account editor wired to the real stores, in a browser DOM (happy-dom): what a Save shows
 * afterwards. The store's `save` is replaced for each test so no network is read.
 */
import "@preact/signals"
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render } from "preact"
import { act } from "preact/test-utils"
import { AccountKind } from "@domain/accounts"
import { GroupRole } from "@domain/groups"
import { type AccountItem, accountsStore } from "../state/accounts.ts"
import { groupsStore } from "../state/groups.ts"
import { selectionStore } from "../state/selection.ts"
import { toasts } from "../state/toasts.ts"
import { AccountEditorView } from "./AccountEditorView.tsx"

const window = new Window({ url: "http://app.localhost/accounts/new" })
const NAMES = ["document", "location", "history", "getComputedStyle", "FormData"] as const
const own = Object.fromEntries(
  NAMES.map((name) => [name, (globalThis as Record<string, unknown>)[name]]),
)

beforeAll(() => {
  // Preact draws into `document`, the router reads `location` and `history`, a dropdown reads the
  // page's style and the form is read with the DOM's own FormData.
  Object.assign(globalThis, {
    document: window.document,
    location: window.location,
    history: window.history,
    getComputedStyle: window.getComputedStyle.bind(window),
    FormData: window.FormData,
  })
})

afterAll(async () => {
  Object.assign(globalThis, own)
  await window.happyDOM.close()
})

const groupId = "019a0000-0000-7000-8000-0000000000d0"
const wallet: AccountItem = {
  id: "019a0000-0000-7000-8000-0000000000d1",
  groupId,
  name: "Wallet",
  kind: AccountKind.CASH,
  currency: "EUR",
  startingBalance: 0,
  balance: 0,
  archivedAt: null,
  isDefault: false,
  version: 1,
  changeSequence: "1",
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  deletedAt: null,
}

const realSave = accountsStore.save
let root: HTMLElement | null = null

beforeEach(() => {
  groupsStore.groups.value = [{
    id: groupId,
    name: "Home",
    role: GroupRole.OWNER,
    authorizationRevision: "1",
    changeSequence: "1",
    updatedAt: "2026-11-01T00:00:00.000Z",
  }]
  groupsStore.loading.value = false
  selectionStore.groupId.value = groupId
  // The household is open already, so `open` returns at once and reads nothing.
  accountsStore.groupId.value = groupId
  accountsStore.accounts.value = [wallet]
  accountsStore.save = () => Promise.resolve(wallet)
})

afterEach(async () => {
  if (root) await act(() => render(null, root!))
  root?.remove()
  root = null
  accountsStore.save = realSave
  accountsStore.reset()
  groupsStore.reset()
  selectionStore.groupId.value = null
  toasts.clear()
})

async function mount(accountId: string | null): Promise<void> {
  root = window.document.createElement("div") as unknown as HTMLElement
  window.document.body.appendChild(root as never)
  await act(() => render(<AccountEditorView accountId={accountId} />, root!))
}

/** Submits the editor's form the way the Save button does. */
async function save(): Promise<void> {
  const form = root!.querySelector("form")
  if (!form) throw new Error("the page shows no form")
  await act(async () => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }) as never)
    await Promise.resolve()
  })
}

describe("AccountEditorView", () => {
  it("shows no toast after creating an account and opens the new account's page instead", async () => {
    await mount(null)
    await save()

    expect(window.location.pathname).toBe(`/accounts/${wallet.id}`)
    expect(toasts.list.value).toEqual([])
  })

  it("shows a toast after saving an edit, since the page stays the same", async () => {
    await mount(wallet.id)
    // Save sends an edit only once something changed.
    await act(() =>
      accountsStore.change({
        name: "Purse",
        kind: wallet.kind,
        currency: "EUR",
        startingBalance: 0,
      })
    )
    await save()

    expect(toasts.list.value.map((toast) => toast.dataE2E)).toEqual(["account-saved"])
  })
})
