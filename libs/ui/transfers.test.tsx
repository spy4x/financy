/**
 * Transfers in a browser DOM (happy-dom): their rows in the transactions list, the Transfers
 * filter and its empty state, the ways in for an editor, and the transfer editor's fields, rate
 * line, missing rate, offline and read-only states, and its kind control.
 */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render, type VNode } from "preact"
import { act } from "preact/test-utils"
import { TransactionKind } from "@domain/transactions"
import { createTranslator } from "@spy4x/platform/universal/i18n"
import app from "@i18n/app/en.ts"
import { TransactionsScreen, type TransactionsScreenProps } from "./transactions-screen.tsx"
import {
  TransactionEditorScreen,
  type TransactionEditorScreenProps,
} from "./transaction-editor-screen.tsx"
import {
  filterTransactions,
  NO_FILTERS,
  type TransactionRow,
  type TransferRow,
  TRANSFERS_KIND,
} from "./transaction-parts.tsx"
import {
  rateLine,
  type TransferEditorErrors,
  TransferEditorScreen,
  type TransferEditorScreenProps,
} from "./transfer-editor-screen.tsx"

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
  if (root) await act(() => render(null, root!))
  root = document.createElement("div")
  document.body.append(root)
  await act(() => render(node, root!))
}

/** An element's text without the marks that isolate a name's direction. */
function text(element: Element | null): string {
  return (element?.textContent ?? "").replace(/[⁨⁩]/g, "")
}

const has = (selector: string) => document.querySelector(selector) !== null

async function click(element: Element): Promise<void> {
  await act(() => {
    element.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }) as unknown as Event,
    )
  })
}

const home = { id: "019a0000-0000-7000-8000-000000000001", name: "Home", canWrite: true }
const viewerOfHome = { ...home, canWrite: false }

const wallet = { id: "a-eur", name: "Wallet", currency: "EUR", archived: false }
const card = { id: "a-usd", name: "Card", currency: "USD", archived: false }
const cash = { id: "a-cash", name: "Cash", currency: "EUR", archived: false }
const oldJar = { id: "a-jar", name: "Jar", currency: "EUR", archived: true }

/** $200.00 from Card to Wallet, which received €185.00 at the server's rate. */
const atm: TransferRow = {
  id: "tr-atm",
  fromAccountId: card.id,
  fromAccountName: card.name,
  fromCurrency: "USD",
  sentAmount: 20000,
  toAccountId: wallet.id,
  toAccountName: wallet.name,
  toCurrency: "EUR",
  receivedAmount: 18500,
  converted: true,
  memo: "ATM at the station",
  date: "2026-11-13",
  author: "You",
  createdAt: "2026-11-13T09:00:00.000Z",
}
/** €50.00 from Wallet to Cash, the same currency. */
const topUp: TransferRow = {
  ...atm,
  id: "tr-top-up",
  fromAccountId: wallet.id,
  fromAccountName: wallet.name,
  fromCurrency: "EUR",
  sentAmount: 5000,
  toAccountId: cash.id,
  toAccountName: cash.name,
  toCurrency: "EUR",
  receivedAmount: 5000,
  converted: false,
  memo: "",
  date: "2026-11-12",
}
const latte: TransactionRow = {
  id: "t-latte",
  kind: TransactionKind.EXPENSE,
  amount: -450,
  currency: "EUR",
  accountAmount: -450,
  accountCurrency: "EUR",
  converted: false,
  memo: "Oat latte",
  date: "2026-11-13",
  accountId: wallet.id,
  accountName: wallet.name,
  categoryId: "c-food",
  categoryParentId: null,
  categoryName: "Food",
  author: "You",
  queued: false,
  createdAt: "2026-11-13T08:00:00.000Z",
}

const listDefaults: TransactionsScreenProps = {
  group: home,
  rows: [atm, latte, topUp],
  deleted: null,
  accounts: [wallet, card, cash],
  categories: [],
  loading: false,
  loaded: true,
  offline: false,
  listError: null,
  filters: NO_FILTERS,
  today: "2026-11-13",
  newKey: "T",
}

const noErrors: TransferEditorErrors = {
  from: null,
  to: null,
  sentAmount: null,
  receivedAmount: null,
  date: null,
  memo: null,
  form: null,
  noRate: false,
  plan: null,
}

const editorDefaults: TransferEditorScreenProps = {
  group: home,
  loading: false,
  notFound: false,
  transfer: null,
  value: {
    fromAccountId: card.id,
    toAccountId: wallet.id,
    sentAmount: null,
    receivedAmount: null,
    date: "2026-11-13",
    memo: "",
  },
  errors: noErrors,
  accounts: [wallet, card, cash],
  saving: false,
  dirty: false,
}

const savedAtm = {
  fromAccountId: atm.fromAccountId,
  toAccountId: atm.toAccountId,
  sentAmount: atm.sentAmount,
  receivedAmount: null,
  date: atm.date,
  memo: atm.memo,
}

/** The row of transfer `id` in the list. */
const rowOf = (id: string) => document.querySelector(`[data-e2e=transfer-${id}]`)

describe("filterTransactions with transfers", () => {
  const ids = (filters: Partial<typeof NO_FILTERS>) =>
    filterTransactions(listDefaults.rows, { ...NO_FILTERS, ...filters }).map((row) => row.id)

  it("shows only transfers under the Transfers kind", () => {
    expect(ids({ kind: TRANSFERS_KIND })).toEqual([atm.id, topUp.id])
  })

  it("hides transfers under Expense, Income or any category", () => {
    expect(ids({ kind: TransactionKind.EXPENSE })).toEqual([latte.id])
    expect(ids({ kind: TransactionKind.INCOME })).toEqual([])
    expect(ids({ categoryId: "c-food" })).toEqual([latte.id])
  })

  it("keeps a transfer under the account it left and the account it reached", () => {
    expect(ids({ accountId: card.id })).toEqual([atm.id])
    expect(ids({ accountId: wallet.id })).toEqual([atm.id, latte.id, topUp.id])
    expect(ids({ accountId: cash.id })).toEqual([topUp.id])
  })

  it("finds a transfer by the words of its memo", () => {
    expect(ids({ q: "station atm" })).toEqual([atm.id])
  })
})

describe("TransactionsScreen with transfers", () => {
  it("names both accounts, links to the transfer and reads its amounts aloud", async () => {
    await mount(<TransactionsScreen {...listDefaults} />)
    const link = rowOf(atm.id)!.querySelector("a")!
    expect(link.getAttribute("href")).toBe("/transfers/tr-atm")
    expect(link.getAttribute("aria-label"))
      .toBe("Transfer of US$200.00 from Card to Wallet, €185.00 received, Today")
    expect(rowOf(topUp.id)!.querySelector("a")!.getAttribute("aria-label"))
      .toBe("Transfer of €50.00 from Wallet to Cash, Yesterday")
    const names = [...rowOf(atm.id)!.querySelectorAll("[data-e2e=transfer-accounts] bdi")]
    expect(names.map(text)).toEqual(["Card", "Wallet"])
  })

  it("shows the sent amount without a sign, and the received one marked converted", async () => {
    await mount(<TransactionsScreen {...listDefaults} />)
    expect(text(rowOf(atm.id)!.querySelector("[data-e2e=transfer-amount]"))).toBe("US$200.00")
    expect(text(rowOf(atm.id)!.querySelector("[data-e2e=transfer-other-amount]")))
      .toBe("≈ €185.00 received")
    expect(rowOf(topUp.id)!.querySelector("[data-e2e=transfer-other-amount]")).toBe(null)
  })

  it("shows the amount from the filtered account's side: leaving with a minus, arriving without", async () => {
    await mount(
      <TransactionsScreen {...listDefaults} filters={{ ...NO_FILTERS, accountId: card.id }} />,
    )
    expect(text(rowOf(atm.id)!.querySelector("[data-e2e=transfer-amount]"))).toBe("-US$200.00")
    // Money leaving one of the household's own accounts is not spending: never red, never green.
    expect(rowOf(atm.id)!.querySelector(".text-danger, .text-success")).toBe(null)

    await mount(
      <TransactionsScreen {...listDefaults} filters={{ ...NO_FILTERS, accountId: wallet.id }} />,
    )
    expect(text(rowOf(atm.id)!.querySelector("[data-e2e=transfer-amount]"))).toBe("≈ €185.00")
    expect(text(rowOf(atm.id)!.querySelector("[data-e2e=transfer-other-amount]")))
      .toBe("US$200.00 sent")
    expect(text(rowOf(topUp.id)!.querySelector("[data-e2e=transfer-amount]"))).toBe("-€50.00")
  })

  it("offers an editor New transfer in the list's menu, and a viewer no menu", async () => {
    await mount(<TransactionsScreen {...listDefaults} />)
    await click(document.querySelector("[data-e2e=transactions-menu]")!)
    const item = document.querySelector("[data-e2e=transfer-new]")!
    expect(text(item)).toBe("New transfer")
    expect(item.getAttribute("href")).toBe("/transfers/new")

    await mount(<TransactionsScreen {...listDefaults} group={viewerOfHome} />)
    expect(has("[data-e2e=transactions-menu]")).toBe(false)
  })

  it("says no transfer is in the dates under the Transfers filter, offering one to an editor only", async () => {
    const filters = { ...NO_FILTERS, kind: TRANSFERS_KIND }
    await mount(<TransactionsScreen {...listDefaults} rows={[latte]} filters={filters} />)
    expect(
      text(document.querySelector("[data-e2e=transfers-empty] h2, [data-e2e=transfers-empty] h3")),
    )
      .toBe("No transfers in these dates")
    expect(document.querySelector("[data-e2e=transfer-new-empty]")?.getAttribute("href"))
      .toBe("/transfers/new")

    await mount(
      <TransactionsScreen
        {...listDefaults}
        group={viewerOfHome}
        rows={[latte]}
        filters={filters}
      />,
    )
    expect(has("[data-e2e=transfers-empty]")).toBe(true)
    expect(has("[data-e2e=transfer-new-empty]")).toBe(false)
  })
})

describe("TransferEditorScreen", () => {
  it("asks an editor for a second account before a transfer, and shows a viewer no such ask", async () => {
    await mount(<TransferEditorScreen {...editorDefaults} accounts={[wallet, oldJar]} />)
    expect(text(document.querySelector("[data-e2e=transfer-needs-accounts]")))
      .toContain("A transfer needs two accounts")
    expect(has("#transfer-from")).toBe(false)

    await mount(
      <TransferEditorScreen {...editorDefaults} group={viewerOfHome} accounts={[wallet]} />,
    )
    expect(has("[data-e2e=transfer-needs-accounts]")).toBe(false)
  })

  it("leaves the From account out of the To list, and archived accounts out of both", async () => {
    await mount(
      <TransferEditorScreen {...editorDefaults} accounts={[wallet, card, cash, oldJar]} />,
    )
    const options = (id: string) =>
      [...document.querySelectorAll(`#${id} option`)].map((option) => text(option)).filter(Boolean)
    expect(options("transfer-to")).not.toContain("Card · USD")
    expect(options("transfer-to")).toContain("Wallet · EUR")
    expect(options("transfer-from")).not.toContain("Jar · EUR")
  })

  it("puts focus on the first empty field: To when only From is chosen", async () => {
    await mount(
      <TransferEditorScreen
        {...editorDefaults}
        value={{ ...editorDefaults.value, toAccountId: null }}
      />,
    )
    expect(document.activeElement?.id).toBe("transfer-to")
  })

  it("asks for no received amount between accounts of one currency", async () => {
    await mount(
      <TransferEditorScreen
        {...editorDefaults}
        value={{ ...editorDefaults.value, fromAccountId: wallet.id, toAccountId: cash.id }}
      />,
    )
    expect(has("[data-e2e=transfer-received-field]")).toBe(false)
    expect(has("[data-e2e=transfer-rate]")).toBe(false)
    expect(text(document.querySelector("label[for=transfer-sent]"))).toContain("EUR")
  })

  it("asks for the received amount across currencies, optional until the server has no rate", async () => {
    await mount(<TransferEditorScreen {...editorDefaults} />)
    const field = () => document.querySelector("[data-e2e=transfer-received-field]")!
    expect(text(field())).toContain("Amount received, in EUR")
    expect(field().querySelector("input")?.required).toBe(false)

    await mount(
      <TransferEditorScreen
        {...editorDefaults}
        value={{ ...editorDefaults.value, sentAmount: 20000 }}
        errors={{ ...noErrors, noRate: true }}
      />,
    )
    expect(field().querySelector("input")?.required).toBe(true)
    expect(text(field())).toContain("USD")
    expect(document.activeElement?.id).toBe("transfer-sent")
  })

  it("stops promising a conversion once the server has no rate, until both amounts are typed", async () => {
    const noRate = { ...noErrors, noRate: true }
    const value = { ...editorDefaults.value, sentAmount: 20000 }
    await mount(<TransferEditorScreen {...editorDefaults} value={value} errors={noRate} />)
    const field = document.querySelector("[data-e2e=transfer-received-field]")!
    expect(text(field)).not.toContain("Leave it empty")
    expect(has("[data-e2e=transfer-rate]")).toBe(false)

    await mount(
      <TransferEditorScreen
        {...editorDefaults}
        value={{ ...value, receivedAmount: 18500 }}
        errors={noRate}
      />,
    )
    expect(text(document.querySelector("[data-e2e=transfer-rate]")))
      .toBe("Your own rate: 1 USD = 0.925 EUR.")
  })

  it("says offline that a transfer can only be read, with Save off and no Delete", async () => {
    await mount(
      <TransferEditorScreen
        {...editorDefaults}
        transfer={atm}
        value={{ ...savedAtm, memo: "Changed" }}
        dirty
        offline
        onDelete={() => {}}
      />,
    )
    expect(has("[data-e2e=transfer-offline]")).toBe(true)
    expect((document.querySelector("[data-e2e=transfer-save]") as HTMLButtonElement).disabled)
      .toBe(true)
    expect(has("[data-e2e=transfer-editor-menu]")).toBe(false)
  })

  it("offers Delete transfer in a saved transfer's menu, and calls it", async () => {
    let deleted = 0
    await mount(
      <TransferEditorScreen
        {...editorDefaults}
        transfer={atm}
        value={savedAtm}
        onDelete={() => deleted++}
      />,
    )
    expect(has("[data-e2e=transfer-save]")).toBe(false)
    await click(document.querySelector("[data-e2e=transfer-editor-menu]")!)
    const item = document.querySelector("[data-e2e=transfer-delete]")!
    expect(text(item)).toBe("Delete transfer")
    await click(item)
    expect(deleted).toBe(1)
  })

  it("shows a viewer the transfer as text, with no field, Save or menu", async () => {
    await mount(
      <TransferEditorScreen
        {...editorDefaults}
        group={viewerOfHome}
        transfer={atm}
        value={savedAtm}
        onDelete={() => {}}
      />,
    )
    expect(has("[data-e2e=transfer-read-only]")).toBe(true)
    const facts = text(document.querySelector("[data-e2e=transfer-facts]"))
    expect(facts).toContain("Card")
    expect(facts).toContain("Wallet")
    expect(has("input, select")).toBe(false)
    expect(has("[data-e2e=transfer-save]")).toBe(false)
    expect(has("[data-e2e=transfer-editor-menu]")).toBe(false)
  })

  it("moves to the transaction editor when Expense is chosen on the new page", async () => {
    const chosen: TransactionKind[] = []
    await mount(<TransferEditorScreen {...editorDefaults} onKind={(kind) => chosen.push(kind)} />)
    const radios = [...document.querySelectorAll("[data-e2e=transfer-kind] [role=radio]")]
    expect(radios.map(text)).toEqual(["Expense", "Income", "Transfer"])
    expect(radios[2].getAttribute("aria-checked")).toBe("true")
    await click(radios[0])
    expect(chosen).toEqual([TransactionKind.EXPENSE])

    await mount(<TransferEditorScreen {...editorDefaults} transfer={atm} value={savedAtm} />)
    expect(has("[data-e2e=transfer-kind]")).toBe(false)
  })
})

describe("rateLine", () => {
  const t = createTranslator({ language: `en`, catalogs: [{ source: app }] })
  const base = { transfer: null, from: card, to: wallet, locale: "en" }

  it("names the rate the two typed amounts imply", () => {
    const value = { ...editorDefaults.value, sentAmount: 20000, receivedAmount: 18500 }
    expect(rateLine(t, { ...base, value })).toBe("Your own rate: 1 USD = 0.925 EUR.")
  })

  it("says the server converts on save when the received amount is empty", () => {
    expect(rateLine(t, { ...base, value: { ...editorDefaults.value, sentAmount: 20000 } }))
      .toContain("when you save")
  })

  it("names the rate a saved converted transfer used, until its sent amount changes", () => {
    expect(rateLine(t, { ...base, transfer: atm, value: savedAtm }))
      .toContain("1 USD = 0.925 EUR")
    expect(rateLine(t, { ...base, transfer: atm, value: { ...savedAtm, sentAmount: 100 } }))
      .toContain("when you save")
  })
})

describe("TransactionEditorScreen's Transfer kind", () => {
  const props: TransactionEditorScreenProps = {
    group: home,
    loading: false,
    notFound: false,
    transaction: null,
    value: {
      kind: TransactionKind.EXPENSE,
      amount: null,
      currency: "EUR",
      accountAmount: null,
      accountId: wallet.id,
      categoryId: null,
      date: "2026-11-13",
      memo: "",
    },
    errors: {
      amount: null,
      currency: null,
      accountAmount: null,
      account: null,
      category: null,
      date: null,
      memo: null,
      form: null,
      noRate: false,
      plan: null,
    },
    accounts: [wallet, card],
    categories: [],
    saving: false,
    dirty: false,
  }
  const radios = () => [...document.querySelectorAll("[data-e2e=transaction-kind] [role=radio]")]

  it("offers Transfer on the new page and moves to the transfer editor on it", async () => {
    let moved = 0
    await mount(<TransactionEditorScreen {...props} onTransfer={() => moved++} />)
    expect(radios().map(text)).toEqual(["Expense", "Income", "Transfer"])
    await click(radios()[2])
    expect(moved).toBe(1)
  })

  it("offers no Transfer without the way to move there", async () => {
    await mount(<TransactionEditorScreen {...props} />)
    expect(radios().map(text)).toEqual(["Expense", "Income"])
  })
})
