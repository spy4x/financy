/** The admin Categories screen in a browser DOM (happy-dom): its counts, its states and its links. */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render, type VNode } from "preact"
import { act } from "preact/test-utils"
import { type AdminCategoriesOverview, CategoryKind } from "@domain/categories"
import { AdminCategoriesScreen } from "./admin-categories-screen.tsx"

const window = new Window({ url: "http://admin.localhost/categories" })
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
const overview: AdminCategoriesOverview = {
  categories: 7,
  archived: 2,
  subcategories: 3,
  households: 1,
  byKind: [
    { kind: CategoryKind.EXPENSE, categories: 5 },
    { kind: CategoryKind.INCOME, categories: 2 },
  ],
  topHouseholds: [{ groupId, groupName: "Home", categories: 7 }],
}

describe("AdminCategoriesScreen", () => {
  it("shows the counts by kind and links each household to its page", async () => {
    await mount(<AdminCategoriesScreen overview={overview} error={null} onRetry={() => {}} />)

    const stats = text("[data-e2e=admin-categories-stats]")
    expect(stats).toContain("Categories7")
    expect(stats).toContain("Archived2")
    expect(stats).toContain("Subcategories3")
    expect(text("[data-e2e=admin-categories-kinds]")).toContain("Expense5")
    expect(text("[data-e2e=admin-categories-kinds]")).toContain("Income2")
    const link = document.querySelector("[data-e2e=admin-categories-households] a")
    expect(link?.getAttribute("href")).toBe(`/groups/${groupId}`)
    expect(text("[data-e2e=admin-categories-households]")).toContain("7 categories")
  })

  it("says the page shows counts only, in a wrapping paragraph under the title", async () => {
    await mount(<AdminCategoriesScreen overview={overview} error={null} onRetry={() => {}} />)

    const intro = document.querySelector("[data-e2e=admin-categories-intro]")
    expect(intro?.tagName).toBe("P")
    expect(intro?.textContent).toContain("Counts only: no category names.")
  })

  it("says it is loading until the counts arrive, and offers a retry when they fail", async () => {
    await mount(<AdminCategoriesScreen overview={null} error={null} onRetry={() => {}} />)
    expect(document.querySelector("[data-e2e=admin-categories-loading]")).not.toBe(null)

    let retried = 0
    await mount(
      <AdminCategoriesScreen overview={null} error="Server error" onRetry={() => retried++} />,
    )
    expect(text("[data-e2e=admin-categories-error]")).toContain("Server error")
    await act(() => {
      ;[...document.querySelectorAll("button")].at(-1)!.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }) as unknown as Event,
      )
    })
    expect(retried).toBe(1)
  })
})
