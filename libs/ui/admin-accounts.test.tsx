/** The admin Accounts screen in a browser DOM (happy-dom): its counts, its states and its links. */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render, type VNode } from "preact"
import { act } from "preact/test-utils"
import { AccountKind, type AdminAccountsOverview } from "@domain/accounts"
import { AdminAccountsScreen } from "./admin-accounts-screen.tsx"

const window = new Window({ url: "http://admin.localhost/accounts" })
const own = { document: globalThis.document, location: globalThis.location }

beforeAll(() => {
  Object.assign(globalThis, { document: window.document, location: window.location })
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

function text(selector: string): string {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`nothing matches ${selector}`)
  return element.textContent ?? ""
}

const groupId = "019a0000-0000-7000-8000-000000000001"
const overview: AdminAccountsOverview = {
  accounts: 3,
  households: 1,
  byKind: [{ kind: AccountKind.CASH, accounts: 1 }, { kind: AccountKind.BANK, accounts: 2 }],
  byCurrency: [{ currency: "EUR", accounts: 2 }, { currency: "VND", accounts: 1 }],
  topHouseholds: [{ groupId, groupName: "Home", accounts: 3, currencies: ["EUR", "VND"] }],
}

describe("AdminAccountsScreen", () => {
  it("shows the counts by kind and by currency, and links each household to its page", async () => {
    await mount(<AdminAccountsScreen overview={overview} error={null} onRetry={() => {}} />)

    expect(text("[data-e2e=admin-accounts-stats]")).toContain("3")
    expect(text("[data-e2e=admin-accounts-kinds]")).toContain("Cash1")
    expect(text("[data-e2e=admin-accounts-kinds]")).toContain("Bank2")
    expect(text("[data-e2e=admin-accounts-currencies]")).toContain("EUR2")
    const link = document.querySelector("[data-e2e=admin-accounts-households] a")
    expect(link?.getAttribute("href")).toBe(`/groups/${groupId}`)
    expect(text("[data-e2e=admin-accounts-households]")).toContain("3 accounts")
  })

  it("shows what the page leaves out as a wrapping paragraph under the title, not a one-line subtitle that truncates", async () => {
    await mount(<AdminAccountsScreen overview={overview} error={null} onRetry={() => {}} />)

    const intro = document.querySelector("[data-e2e=admin-accounts-intro]")
    expect(intro?.tagName).toBe("P")
    expect(intro?.textContent).toContain("Counts only: no account names or amounts.")
    expect(intro?.className).not.toMatch(/\btruncate\b/)
    expect(text("[data-e2e=page-header]")).not.toContain("Counts only")
  })

  it("says it is loading until the counts arrive, and offers a retry when they fail", async () => {
    await mount(<AdminAccountsScreen overview={null} error={null} onRetry={() => {}} />)
    expect(document.querySelector("[data-e2e=admin-accounts-loading]")).not.toBe(null)

    let retried = 0
    await mount(
      <AdminAccountsScreen overview={null} error="Server error" onRetry={() => retried++} />,
    )
    expect(text("[data-e2e=admin-accounts-error]")).toContain("Server error")
    await act(() => {
      ;[...document.querySelectorAll("button")].at(-1)!.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }) as unknown as Event,
      )
    })
    expect(retried).toBe(1)
  })
})
