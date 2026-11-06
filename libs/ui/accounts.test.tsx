/**
 * The accounts list and the account editor in a browser DOM (happy-dom): the starting balance in a
 * currency's own smallest unit, the grouping by kind, archived and deleted accounts, and what a
 * viewer may not touch.
 */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render, type VNode } from "preact"
import { useState } from "preact/hooks"
import { act } from "preact/test-utils"
import { AccountKind } from "@domain/accounts"
import {
  AccountEditorScreen,
  type AccountEditorScreenProps,
  type AccountFormValue,
} from "./account-editor-screen.tsx"
import { type AccountRow, AccountsScreen, type AccountsScreenProps } from "./accounts-screen.tsx"

const window = new Window({ url: "http://app.localhost/" })
const own = {
  document: globalThis.document,
  FormData: globalThis.FormData,
  location: globalThis.location,
  getComputedStyle: globalThis.getComputedStyle,
}

beforeAll(() => {
  // Preact draws into `document`; a form is read with the DOM's own FormData, a link is routed
  // only on the page's own origin, and a dropdown reads styles.
  Object.assign(globalThis, {
    document: window.document,
    FormData: window.FormData,
    location: window.location,
    getComputedStyle: window.getComputedStyle.bind(window),
  })
})

afterAll(async () => {
  Object.assign(globalThis, own)
  await window.happyDOM.close()
})

let root: HTMLElement | null = null

afterEach(async () => {
  if (root) await act(() => render(null, root!))
  document.body.innerHTML = ""
  root = null
})

async function mount(node: VNode): Promise<void> {
  root = document.createElement("div")
  document.body.append(root)
  await act(() => render(node, root!))
}

function find<T extends Element = HTMLElement>(selector: string): T {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`nothing matches ${selector}`)
  return element as unknown as T
}

function count(selector: string): number {
  return document.querySelectorAll(selector).length
}

/** Types `value` into a field the way a person does: the value changes, then `input` fires. */
async function type(selector: string, value: string): Promise<void> {
  const field = find<HTMLInputElement>(selector)
  field.value = value
  await act(() => {
    field.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event)
  })
}

const home = { id: "019a0000-0000-7000-8000-000000000001", name: "Home", canWrite: true }
const viewerOfHome = { ...home, canWrite: false }

function account(over: Partial<AccountRow> & Pick<AccountRow, "id" | "name">): AccountRow {
  return {
    kind: AccountKind.BANK,
    currency: "USD",
    startingBalance: 0,
    balance: 0,
    isDefault: false,
    archived: false,
    ...over,
  }
}

const noop = () => Promise.resolve()
const actions = { onArchive: noop, onSetDefault: noop, onDelete: noop, onRestore: noop }

const listDefaults: AccountsScreenProps = {
  group: home,
  accounts: [],
  deleted: null,
  showArchived: false,
  loading: false,
  listError: null,
  actions,
}

const NEW_FORM: AccountFormValue = {
  name: "",
  kind: AccountKind.CASH,
  currency: null,
  startingBalance: null,
}

/** The editor with its form value held in state, as the app's store holds it. */
function Editor(
  props: Partial<AccountEditorScreenProps> & { start: AccountFormValue; seen: AccountFormValue[] },
) {
  const [value, setValue] = useState(props.start)
  return (
    <AccountEditorScreen
      group={home}
      loading={false}
      notFound={false}
      account={null}
      errors={{ name: null, currency: null, form: null }}
      saving={false}
      dirty={false}
      {...props}
      value={value}
      onChange={(next) => {
        props.seen.push(next)
        setValue(next)
      }}
    />
  )
}

const BALANCE = "[data-e2e=account-starting-balance] input[type=text]"
const BALANCE_STATUS = "[data-e2e=account-starting-balance] [role=status]"

describe("AccountEditorScreen", () => {
  for (
    const [currency, typed, stored] of [
      ["JPY", "500", 500],
      ["USD", "12.34", 1234],
      ["BHD", "1.234", 1234],
    ] as const
  ) {
    it(`stores ${typed} ${currency} as ${stored} in the currency's smallest unit`, async () => {
      const seen: AccountFormValue[] = []
      await mount(<Editor start={{ ...NEW_FORM, currency }} seen={seen} />)

      await type(BALANCE, typed)

      expect(seen.at(-1)?.startingBalance).toBe(stored)
      expect(find(BALANCE_STATUS).textContent).toBe("")
    })
  }

  it("refuses a fraction of a yen, says why, and keeps the last good amount", async () => {
    const seen: AccountFormValue[] = []
    await mount(<Editor start={{ ...NEW_FORM, currency: "JPY" }} seen={seen} />)
    await type(BALANCE, "5")

    await type(BALANCE, "5.5")

    expect(seen.map((value) => value.startingBalance)).toEqual([5])
    expect(find(BALANCE_STATUS).textContent).toBe("JPY has no cents: type a whole amount.")
  })

  it("refuses a third decimal in dollars", async () => {
    const seen: AccountFormValue[] = []
    await mount(<Editor start={{ ...NEW_FORM, currency: "USD" }} seen={seen} />)

    await type(BALANCE, "1.234")

    expect(seen).toEqual([])
    expect(find(BALANCE_STATUS).textContent).not.toBe("")
  })

  it("keeps the starting balance empty and disabled until a currency is chosen, even when it holds 0", async () => {
    await mount(<Editor start={{ ...NEW_FORM, startingBalance: 0 }} seen={[]} />)

    expect(find<HTMLInputElement>(BALANCE).disabled).toBe(true)
    expect(find<HTMLInputElement>(BALANCE).value).toBe("")
    expect(document.body.textContent).toContain("Choose a currency first")
  })

  it("shows a viewer the account read-only, with no Save and no menu", async () => {
    const saved = account({
      id: "019a0000-0000-7000-8000-0000000000a1",
      name: "Wallet",
      currency: "EUR",
      startingBalance: 1000,
      balance: 1000,
    })
    await mount(
      <Editor
        group={viewerOfHome}
        account={saved}
        dirty
        start={{ name: "Wallet", kind: AccountKind.BANK, currency: "EUR", startingBalance: 1000 }}
        seen={[]}
      />,
    )

    expect(find("[data-e2e=account-name-input]").closest("fieldset")?.hasAttribute("disabled"))
      .toBe(true)
    expect(count("[data-e2e=account-save]")).toBe(0)
    expect(count("[data-e2e=account-editor-menu]")).toBe(0)
    expect(count("[data-e2e=account-read-only]")).toBe(1)
  })
})

describe("AccountsScreen", () => {
  const wallet = account({
    id: "019a0000-0000-7000-8000-0000000000b1",
    name: "Wallet",
    kind: AccountKind.CASH,
    currency: "JPY",
    balance: 500,
  })
  const checking = account({
    id: "019a0000-0000-7000-8000-0000000000b2",
    name: "Checking",
    kind: AccountKind.BANK,
    currency: "USD",
    balance: 1234,
    isDefault: true,
  })
  const dinars = account({
    id: "019a0000-0000-7000-8000-0000000000b3",
    name: "Dinars",
    kind: AccountKind.BANK,
    currency: "BHD",
    balance: 1234,
  })
  const loan = account({
    id: "019a0000-0000-7000-8000-0000000000b4",
    name: "Loan",
    kind: AccountKind.LIABILITY,
    currency: "EUR",
    balance: -50000,
  })
  const old = account({
    id: "019a0000-0000-7000-8000-0000000000b5",
    name: "Old card",
    kind: AccountKind.CARD,
    currency: "USD",
    archived: true,
  })

  it("shows 500 yen, 12.34 dollars and 1.234 dinars back exactly from their smallest units", async () => {
    await mount(<AccountsScreen {...listDefaults} accounts={[wallet, checking, dinars]} />)

    const balance = (id: string) =>
      find(`[data-e2e=account-${id}] [data-e2e=account-balance]`).textContent
    expect(balance(wallet.id)).toContain("500")
    expect(balance(wallet.id)).not.toContain("500.")
    expect(balance(checking.id)).toContain("12.34")
    expect(balance(dinars.id)).toContain("1.234")
  })

  it("groups accounts by kind in a fixed order, cash first and liabilities last, and marks the default", async () => {
    await mount(<AccountsScreen {...listDefaults} accounts={[loan, dinars, wallet, checking]} />)

    const lists = [...document.querySelectorAll("[data-e2e^=account-list-]")]
      .map((list) => list.getAttribute("data-e2e"))
    expect(lists).toEqual([
      `account-list-${AccountKind.CASH}`,
      `account-list-${AccountKind.BANK}`,
      `account-list-${AccountKind.LIABILITY}`,
    ])
    expect(find(`[data-e2e=account-${checking.id}]`).textContent).toContain("Default")
    expect(find(`[data-e2e=account-${dinars.id}]`).textContent).not.toContain("Default")
  })

  it("hides archived accounts until asked, and says so when every account is archived", async () => {
    await mount(<AccountsScreen {...listDefaults} accounts={[old]} />)
    expect(count(`[data-e2e=account-${old.id}]`)).toBe(0)
    expect(document.body.textContent).toContain("Every account is archived.")

    await act(() =>
      render(<AccountsScreen {...listDefaults} accounts={[old]} showArchived />, root!)
    )
    expect(find(`[data-e2e=account-${old.id}]`).textContent).toContain("Archived")
  })

  it("gives a viewer no New button, no row menu and no links to the editor", async () => {
    await mount(
      <AccountsScreen {...listDefaults} group={viewerOfHome} accounts={[wallet, checking]} />,
    )

    expect(count("[data-e2e=account-new]")).toBe(0)
    expect(count("[data-e2e=account-menu]")).toBe(0)
    expect(count("a[data-e2e=account-name]")).toBe(0)
    expect(count("[data-e2e=accounts-read-only]")).toBe(1)
  })

  it("gives an editor a menu on every row and a link to each account's page", async () => {
    await mount(<AccountsScreen {...listDefaults} accounts={[wallet, checking]} />)

    expect(count("[data-e2e=account-menu]")).toBe(2)
    expect(find<HTMLAnchorElement>(`[data-e2e=account-${wallet.id}] a`).getAttribute("href"))
      .toBe(`/accounts/${wallet.id}`)
  })

  it("lists deleted accounts in the trash with Restore, and hands the restore to the app", async () => {
    const restored: string[] = []
    await mount(
      <AccountsScreen
        {...listDefaults}
        accounts={[wallet]}
        deleted={[loan]}
        actions={{ ...actions, onRestore: (id) => Promise.resolve(void restored.push(id)) }}
      />,
    )

    expect(count(`[data-e2e=account-trash] [data-e2e=account-${loan.id}]`)).toBe(1)
    expect(count(`[data-e2e=account-${wallet.id}]`)).toBe(0)
    await act(() => {
      find("[data-e2e=account-restore]").dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }) as unknown as Event,
      )
    })
    expect(restored).toEqual([loan.id])
  })
})
