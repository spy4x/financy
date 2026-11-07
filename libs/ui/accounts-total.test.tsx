/**
 * The household total card on the accounts list, in a browser DOM (happy-dom): "about" and the
 * rate date only when a rate was used, a negative total in the plain colour, the currencies left
 * out, and when the card shows at all.
 */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render, type VNode } from "preact"
import { act } from "preact/test-utils"
import { FormatContext } from "@spy4x/preact-ui/format"
import { createFormatters } from "@spy4x/time/format"
import { AccountKind, type HouseholdTotal } from "@domain/accounts"
import { AccountsScreen, type AccountsScreenProps } from "./accounts-screen.tsx"

const window = new Window({ url: "http://app.localhost/" })
const own = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle }

beforeAll(() => {
  Object.assign(globalThis, {
    document: window.document,
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

/** Draws `node` in a British format, so a date reads `6 Nov 2026` whatever the machine's. */
async function mount(node: VNode): Promise<void> {
  root = document.createElement("div")
  document.body.append(root)
  await act(() =>
    render(
      <FormatContext.Provider
        value={createFormatters({ locale: "en-GB", timeZone: "UTC", hourCycle: null })}
      >
        {node}
      </FormatContext.Provider>,
      root!,
    )
  )
}

function text(selector: string): string | null {
  return document.querySelector(selector)?.textContent ?? null
}

const wallet = {
  id: "019a0000-0000-7000-8000-0000000000b1",
  name: "Wallet",
  kind: AccountKind.CASH,
  currency: "JPY",
  startingBalance: 500,
  balance: 500,
  isDefault: false,
  archived: false,
}
const screen: AccountsScreenProps = {
  group: { id: "019a0000-0000-7000-8000-000000000001", name: "Home", canWrite: true },
  accounts: [wallet],
  deleted: null,
  showArchived: false,
  loading: false,
  listError: null,
}
const exact: HouseholdTotal = {
  amount: 1_234_567,
  currency: "EUR",
  rateDate: null,
  leftOut: [],
  tooLarge: false,
}

describe("the household total card", () => {
  it("reads 'about' the total, as one text, with the oldest rate date when a rate was used", async () => {
    await mount(<AccountsScreen {...screen} total={{ ...exact, rateDate: "2026-11-06" }} />)

    const amount = document.querySelector("[data-e2e=accounts-total-amount]")!
    expect(amount.textContent).toBe("about €12,345.67")
    expect(amount.childNodes.length).toBe(1)
    expect(text("[data-e2e=accounts-total-rates]")).toBe("At the exchange rates of 6 Nov 2026")
    expect(text("[data-e2e=accounts-total] h2")).toBe("Total")
  })

  it("shows an exact total, with no 'about' and no rate date, when no rate was used", async () => {
    await mount(<AccountsScreen {...screen} total={exact} />)

    expect(text("[data-e2e=accounts-total-amount]")).toBe("€12,345.67")
    expect(document.querySelector("[data-e2e=accounts-total-rates]")).toBeNull()
  })

  it("shows a negative total with its minus sign and not in the danger colour", async () => {
    await mount(<AccountsScreen {...screen} total={{ ...exact, amount: -50_000 }} />)

    const amount = document.querySelector("[data-e2e=accounts-total-amount]")!
    expect(amount.textContent).toBe("-€500.00")
    expect(document.querySelector("[data-e2e=accounts-total] .text-danger")).toBeNull()
  })

  it("names the accounts left out for lack of a rate, and shows no number when none converted", async () => {
    await mount(
      <AccountsScreen
        {...screen}
        total={{ ...exact, amount: 5_000, leftOut: [{ currency: "GEL", accounts: 1 }] }}
      />,
    )
    expect(text("[data-e2e=accounts-total-left-out]")).toBe(
      "Leaves out 1 account: no exchange rate for GEL yet.",
    )
    await act(() => render(null, root!))

    await mount(
      <AccountsScreen
        {...screen}
        total={{
          ...exact,
          amount: null,
          leftOut: [{ currency: "AMD", accounts: 1 }, { currency: "GEL", accounts: 2 }],
        }}
      />,
    )

    expect(text("[data-e2e=accounts-total-left-out]")).toBe(
      "Leaves out 3 accounts: no exchange rate for AMD and GEL yet.",
    )
    expect(document.querySelector("[data-e2e=accounts-total-amount]")).toBeNull()
  })

  it("says a total too large to hold exactly is not shown", async () => {
    await mount(<AccountsScreen {...screen} total={{ ...exact, amount: null, tooLarge: true }} />)

    expect(text("[data-e2e=accounts-total-too-large]")).toBe("The total is too large to show.")
    expect(document.querySelector("[data-e2e=accounts-total-amount]")).toBeNull()
  })

  it("holds the card's place with a bar while the total loads", async () => {
    await mount(<AccountsScreen {...screen} total={null} />)

    expect(document.querySelector("[data-e2e=accounts-total] [aria-hidden=true]")).not.toBeNull()
    expect(document.querySelector("[data-e2e=accounts-total-amount]")).toBeNull()
  })

  it("shows no card for a household with no accounts, in the trash, or when the total failed", async () => {
    await mount(<AccountsScreen {...screen} accounts={[]} total={exact} />)
    expect(document.querySelector("[data-e2e=accounts-total]")).toBeNull()
    await act(() => render(null, root!))

    await mount(<AccountsScreen {...screen} deleted={[]} total={exact} />)
    expect(document.querySelector("[data-e2e=accounts-total]")).toBeNull()
    await act(() => render(null, root!))

    await mount(<AccountsScreen {...screen} total={undefined} />)
    expect(document.querySelector("[data-e2e=accounts-total]")).toBeNull()
  })
})
