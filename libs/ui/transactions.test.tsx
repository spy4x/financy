/**
 * The transactions list and the transaction editor in a browser DOM (happy-dom): the filters, the
 * day headings, each empty state, converted and same-currency rows, the deleted view, the
 * categories an expense or an income may take, the missing rate, and what a viewer sees.
 */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render, type VNode } from "preact"
import { act } from "preact/test-utils"
import { CategoryKind } from "@domain/categories"
import { TransactionKind } from "@domain/transactions"
import { TransactionsScreen, type TransactionsScreenProps } from "./transactions-screen.tsx"
import {
  categoryGroups,
  type TransactionEditorErrors,
  TransactionEditorScreen,
  type TransactionEditorScreenProps,
} from "./transaction-editor-screen.tsx"
import {
  byDay,
  filterTransactions,
  NO_FILTERS,
  type TransactionCategory,
  type TransactionRow,
} from "./transaction-parts.tsx"

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

const euros = { id: "a-eur", name: "Wallet", currency: "EUR", archived: false }
const dollars = { id: "a-usd", name: "Card", currency: "USD", archived: false }

const food: TransactionCategory = {
  id: "c-food",
  name: "Food",
  parentId: null,
  kind: CategoryKind.EXPENSE,
  archived: false,
}
const coffee: TransactionCategory = { ...food, id: "c-coffee", name: "Coffee", parentId: food.id }
const travel: TransactionCategory = { ...food, id: "c-travel", name: "Travel" }
const oldHobby: TransactionCategory = { ...food, id: "c-hobby", name: "Hobby", archived: true }
const salary: TransactionCategory = {
  ...food,
  id: "c-salary",
  name: "Salary",
  kind: CategoryKind.INCOME,
}
const categories = [food, coffee, travel, oldHobby, salary]

function row(over: Partial<TransactionRow> & Pick<TransactionRow, "id">): TransactionRow {
  return {
    kind: TransactionKind.EXPENSE,
    amount: -450,
    currency: "EUR",
    accountAmount: -450,
    accountCurrency: "EUR",
    converted: false,
    memo: "",
    date: "2026-11-13",
    accountId: euros.id,
    accountName: euros.name,
    categoryId: coffee.id,
    categoryParentId: food.id,
    categoryName: "Food › Coffee",
    author: "You",
    queued: false,
    createdAt: "2026-11-13T08:00:00.000Z",
    ...over,
  }
}

const latte = row({ id: "t-latte", memo: "Oat latte at the corner" })
const train = row({
  id: "t-train",
  amount: -2000,
  currency: "USD",
  accountAmount: -1850,
  converted: true,
  memo: "Train to the airport",
  date: "2026-11-12",
  categoryId: travel.id,
  categoryParentId: null,
  categoryName: "Travel",
})
const pay = row({
  id: "t-pay",
  kind: TransactionKind.INCOME,
  amount: 300000,
  accountAmount: 300000,
  date: "2026-11-01",
  accountId: dollars.id,
  accountName: dollars.name,
  currency: "USD",
  accountCurrency: "USD",
  categoryId: salary.id,
  categoryParentId: null,
  categoryName: "Salary",
})

const listDefaults: TransactionsScreenProps = {
  group: home,
  rows: [latte, train, pay],
  deleted: null,
  accounts: [euros, dollars],
  categories,
  loading: false,
  loaded: true,
  offline: false,
  listError: null,
  filters: NO_FILTERS,
  today: "2026-11-13",
  newKey: "T",
}

const noErrors: TransactionEditorErrors = {
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
}

const editorDefaults: TransactionEditorScreenProps = {
  group: home,
  loading: false,
  notFound: false,
  transaction: null,
  value: {
    kind: TransactionKind.EXPENSE,
    amount: null,
    currency: "EUR",
    accountAmount: null,
    accountId: euros.id,
    categoryId: coffee.id,
    date: "2026-11-13",
    memo: "",
  },
  errors: noErrors,
  accounts: [euros, dollars],
  categories,
  saving: false,
  dirty: false,
}

describe("filterTransactions", () => {
  it("finds every word of the search in a memo, ignoring case and order", () => {
    const found = filterTransactions([latte, train, pay], { ...NO_FILTERS, q: "  CORNER oat " })
    expect(found.map((r) => r.id)).toEqual([latte.id])
  })

  it("keeps a subcategory's entries under its parent's filter", () => {
    const found = filterTransactions([latte, train, pay], { ...NO_FILTERS, categoryId: food.id })
    expect(found.map((r) => r.id)).toEqual([latte.id])
  })

  it("keeps the entries on both ends of the date range", () => {
    const found = filterTransactions([latte, train, pay], {
      ...NO_FILTERS,
      from: "2026-11-01",
      to: "2026-11-12",
    })
    expect(found.map((r) => r.id)).toEqual([train.id, pay.id])
  })

  it("keeps only the chosen account and kind", () => {
    const rows = [latte, train, pay]
    expect(filterTransactions(rows, { ...NO_FILTERS, accountId: dollars.id }).map((r) => r.id))
      .toEqual([pay.id])
    expect(
      filterTransactions(rows, { ...NO_FILTERS, kind: TransactionKind.INCOME }).map((r) => r.id),
    ).toEqual([pay.id])
  })
})

describe("byDay", () => {
  it("puts each day's entries under one heading, in the list's order", () => {
    const second = row({ id: "t-second" })
    expect(byDay([latte, second, train]).map((day) => [day.date, day.rows.map((r) => r.id)]))
      .toEqual([["2026-11-13", [latte.id, second.id]], ["2026-11-12", [train.id]]])
  })
})

describe("categoryGroups", () => {
  it("offers an expense its live expense categories only, by full name", () => {
    const groups = categoryGroups(TransactionKind.EXPENSE, [...categories].reverse(), null)
    expect(groups.own.map((c) => c.label)).toEqual(["Food", "Food › Coffee", "Travel"])
    expect(groups.refund).toEqual([])
  })

  it("offers an income its income categories, then the expense ones as a refund", () => {
    const groups = categoryGroups(TransactionKind.INCOME, categories, null)
    expect(groups.own.map((c) => c.label)).toEqual(["Salary"])
    expect(groups.refund.map((c) => c.label)).toEqual(["Food", "Food › Coffee", "Travel"])
  })

  it("keeps an archived category the entry already has", () => {
    const groups = categoryGroups(TransactionKind.EXPENSE, categories, oldHobby.id)
    expect(groups.own.map((c) => c.id)).toContain(oldHobby.id)
  })
})

describe("TransactionsScreen", () => {
  it("draws each day under Today, Yesterday or its date, and names each row for a screen reader", async () => {
    await mount(<TransactionsScreen {...listDefaults} />)
    const headings = [...document.querySelectorAll("section h2")].map(text)
    expect(headings[0]).toBe("Today")
    expect(headings[1]).toBe("Yesterday")
    expect(headings).toHaveLength(3)
    const first = document.querySelector("[data-e2e=transaction-t-latte] a")!
    expect(first.getAttribute("aria-label")).toBe("Expense of €4.50 in Food › Coffee, Today")
    expect(first.getAttribute("href")).toBe("/transactions/t-latte")
  })

  it("shows a converted entry's account amount marked converted, and none for the account's own currency", async () => {
    await mount(<TransactionsScreen {...listDefaults} />)
    expect(
      text(
        document.querySelector(
          "[data-e2e=transaction-t-train] [data-e2e=transaction-account-amount]",
        ),
      ),
    )
      .toBe("-€18.50 in Wallet · converted")
    expect(has("[data-e2e=transaction-t-latte] [data-e2e=transaction-account-amount]")).toBe(false)
  })

  it("says a queued converted entry is converted once back online", async () => {
    await mount(
      <TransactionsScreen
        {...listDefaults}
        rows={[{ ...train, queued: true, accountAmount: 0 }]}
      />,
    )
    expect(text(document.querySelector("[data-e2e=transaction-account-amount]")))
      .toBe("Converted when back online")
  })

  it("offers an editor Add transaction and the deleted view, and a viewer neither", async () => {
    await mount(<TransactionsScreen {...listDefaults} />)
    expect(has("[data-e2e=transaction-new]")).toBe(true)
    expect(has("[data-e2e=transactions-show-deleted]")).toBe(true)
    expect(has("[data-e2e=transactions-read-only]")).toBe(false)
    await act(() => render(null, root!))

    await mount(<TransactionsScreen {...listDefaults} group={viewerOfHome} />)
    expect(has("[data-e2e=transaction-new]")).toBe(false)
    expect(has("[data-e2e=transactions-show-deleted]")).toBe(false)
    expect(has("[data-e2e=transactions-read-only]")).toBe(true)
  })

  it("asks an editor with no entries for the first one, naming its key", async () => {
    await mount(<TransactionsScreen {...listDefaults} rows={[]} />)
    expect(text(document.querySelector("[data-e2e=transactions-empty]"))).toContain(
      "Add your first transaction",
    )
    expect(has("[data-e2e=transaction-new-empty]")).toBe(true)
    expect(has("[data-e2e=transactions-filter-bar]")).toBe(false)
  })

  it("tells a viewer with no entries there are none, with nothing to add", async () => {
    await mount(<TransactionsScreen {...listDefaults} rows={[]} group={viewerOfHome} />)
    expect(text(document.querySelector("[data-e2e=transactions-empty]"))).toBe(
      "No transactions yet",
    )
    expect(has("[data-e2e=transaction-new-empty]")).toBe(false)
  })

  it("sends an editor without a live account to add one first", async () => {
    await mount(
      <TransactionsScreen {...listDefaults} rows={[]} accounts={[{ ...euros, archived: true }]} />,
    )
    expect(has("[data-e2e=transactions-no-account]")).toBe(true)
    expect(document.querySelector("[data-e2e=transactions-add-account]")?.getAttribute("href"))
      .toBe("/accounts/new")
  })

  it("names the search that found nothing and clears it on Clear search", async () => {
    const changes: unknown[] = []
    await mount(
      <TransactionsScreen
        {...listDefaults}
        filters={{ ...NO_FILTERS, q: "pizza" }}
        onFiltersChange={(next) => changes.push(next)}
      />,
    )
    expect(text(document.querySelector("[data-e2e=transactions-search-empty]"))).toContain(
      `No transactions match "pizza"`,
    )
    await click(document.querySelector("[data-e2e=transactions-clear-search]")!)
    expect(changes).toEqual([{ q: "" }])
  })

  it("says the filters match nothing and clears them on Clear filters", async () => {
    let cleared = 0
    await mount(
      <TransactionsScreen
        {...listDefaults}
        filters={{ ...NO_FILTERS, from: "2027-01-01" }}
        onClearFilters={() => cleared++}
      />,
    )
    expect(has("[data-e2e=transactions-filtered-empty]")).toBe(true)
    await click(document.querySelector("[data-e2e=transactions-clear-filters]")!)
    expect(cleared).toBe(1)
  })

  it("says the device has no copy yet when it is offline and never read the list", async () => {
    await mount(<TransactionsScreen {...listDefaults} rows={[]} loaded={false} offline />)
    expect(has("[data-e2e=transactions-no-copy]")).toBe(true)
  })

  it("lists deleted entries with Restore, naming each, and restores the one pressed", async () => {
    const restored: string[] = []
    await mount(
      <TransactionsScreen
        {...listDefaults}
        deleted={[{ ...latte, deletedAt: "2026-11-13T09:00:00.000Z" }]}
        onRestore={(id) => restored.push(id)}
      />,
    )
    expect(text(document.querySelector("h1"))).toBe("Deleted transactions")
    expect(text(document.querySelector("[data-e2e=transactions-deleted-hint]"))).toContain(
      "after 30 days",
    )
    const restore = document.querySelector("[data-e2e=transaction-restore]")!
    expect(restore.getAttribute("aria-label")).toBe("Restore €4.50 in Food › Coffee")
    await click(restore)
    expect(restored).toEqual([latte.id])
  })

  it("says there are no deleted entries when the deleted view is empty", async () => {
    await mount(<TransactionsScreen {...listDefaults} deleted={[]} />)
    expect(text(document.querySelector("[data-e2e=transactions-filter-bar]"))).toBe("")
    expect(text(root!)).toContain("No deleted transactions")
  })
})

describe("TransactionEditorScreen", () => {
  it("puts focus on the amount, so typing an amount and pressing Enter adds the entry", async () => {
    await mount(<TransactionEditorScreen {...editorDefaults} />)
    expect(document.activeElement?.closest("[data-e2e=transaction-amount-field]")).not.toBe(null)
    expect(text(document.querySelector("[data-e2e=transaction-save]"))).toBe("Add transaction")
  })

  it("asks for no account amount in the account's own currency", async () => {
    await mount(<TransactionEditorScreen {...editorDefaults} />)
    expect(has("[data-e2e=transaction-account-amount-field]")).toBe(false)
  })

  it("asks for the account amount, required, when the server has no rate for the date", async () => {
    await mount(
      <TransactionEditorScreen
        {...editorDefaults}
        value={{ ...editorDefaults.value, currency: "USD", amount: 2000 }}
        errors={{ ...noErrors, noRate: true }}
      />,
    )
    const field = document.querySelector("[data-e2e=transaction-account-amount-field]")!
    expect(text(field)).toContain(
      "There's no exchange rate for USD on 2026-11-13 yet. Type what Wallet was charged in EUR.",
    )
    expect(field.querySelector("input")?.required).toBe(true)
  })

  it("lists expense categories under Refund on an income", async () => {
    await mount(
      <TransactionEditorScreen
        {...editorDefaults}
        value={{ ...editorDefaults.value, kind: TransactionKind.INCOME }}
      />,
    )
    const group = document.querySelector("[data-e2e=transaction-category] optgroup")!
    expect(group.getAttribute("label")).toBe("Refund to an expense category")
    expect([...group.querySelectorAll("option")].map(text)).toEqual([
      "Food",
      "Food › Coffee",
      "Travel",
    ])
  })

  it("hides Save on a saved entry until something changes", async () => {
    const saved = {
      ...editorDefaults,
      transaction: latte,
      value: { ...editorDefaults.value, amount: 450 },
    }
    await mount(<TransactionEditorScreen {...saved} />)
    expect(has("[data-e2e=transaction-save]")).toBe(false)
    await act(() => render(<TransactionEditorScreen {...saved} dirty />, root!))
    expect(text(document.querySelector("[data-e2e=transaction-save]"))).toBe("Save transaction")
  })

  it("shows a viewer the entry as text, with no field, Save or menu", async () => {
    await mount(
      <TransactionEditorScreen
        {...editorDefaults}
        group={viewerOfHome}
        transaction={train}
        value={{
          ...editorDefaults.value,
          amount: 2000,
          currency: "USD",
          categoryId: travel.id,
          memo: train.memo,
        }}
      />,
    )
    expect(document.querySelectorAll("input, select, textarea")).toHaveLength(0)
    expect(has("[data-e2e=transaction-save]")).toBe(false)
    expect(has("[data-e2e=transaction-editor-menu]")).toBe(false)
    const facts = [...document.querySelectorAll("[data-e2e=transaction-facts] dt")].map(text)
    expect(facts).toEqual([
      "Kind",
      "Amount",
      "Amount in EUR",
      "Account",
      "Category",
      "Date",
      "Memo",
    ])
    const shown = [...document.querySelectorAll("[data-e2e=transaction-facts] dd")].map(text)
    expect(shown[facts.indexOf("Date")]).toBe("13 November 2026")
  })

  it("tells a viewer on the new page that only editors add entries", async () => {
    await mount(<TransactionEditorScreen {...editorDefaults} group={viewerOfHome} />)
    expect(text(document.querySelector("[data-e2e=transaction-read-only]"))).toBe(
      "Only editors can add transactions to Home.",
    )
    expect(has("[data-e2e=transaction-amount-field]")).toBe(false)
  })

  it("says an entry outside the household is not found", async () => {
    await mount(<TransactionEditorScreen {...editorDefaults} notFound />)
    expect(text(document.querySelector("[data-e2e=transaction-not-found]"))).toContain(
      "Transaction not found",
    )
  })
})
