/**
 * The categories list and the category editor in a browser DOM (happy-dom): the order of the
 * tree, the sections by kind, archiving a parent with its subcategories, the locks on the kind and
 * the parent, and what a viewer may not touch.
 */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render, type VNode } from "preact"
import { useState } from "preact/hooks"
import { act } from "preact/test-utils"
import { type CategoryFields, CategoryKind } from "@domain/categories"
import { CategoriesScreen, type CategoriesScreenProps } from "./categories-screen.tsx"
import { CategoryEditorScreen, type CategoryEditorScreenProps } from "./category-editor-screen.tsx"
import { type CategoryRow, placeCategories } from "./category-parts.tsx"

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

/** An element's text without the marks that isolate a name's direction. */
function text(element: Element): string {
  return (element.textContent ?? "").replace(/[\u2068\u2069]/g, "")
}

function count(selector: string): number {
  return document.querySelectorAll(selector).length
}

async function click(element: Element): Promise<void> {
  await act(() => {
    element.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }) as unknown as Event,
    )
  })
}

/** Opens the menu of the row of `id` and returns its items. */
async function openMenu(id: string): Promise<HTMLElement[]> {
  const row = find(`[data-e2e=category-${id}]`)
  await click(row.querySelector("[data-e2e=category-menu]")!)
  return [...row.querySelectorAll<HTMLElement>("[role=menuitem]")]
}

const home = { id: "019a0000-0000-7000-8000-000000000001", name: "Home", canWrite: true }
const viewerOfHome = { ...home, canWrite: false }

function category(over: Partial<CategoryRow> & Pick<CategoryRow, "id" | "name">): CategoryRow {
  return {
    kind: CategoryKind.EXPENSE,
    parentId: null,
    icon: "tag",
    color: "#2563eb",
    archived: false,
    ...over,
  } as CategoryRow
}

const food = category({ id: "c-food", name: "Food", icon: "utensils" as CategoryRow["icon"] })
const groceries = category({ id: "c-groceries", name: "Groceries", parentId: food.id })
const eatingOut = category({ id: "c-eating", name: "Eating out", parentId: food.id })
const rent = category({ id: "c-rent", name: "rent" })
const salary = category({ id: "c-salary", name: "Salary", kind: CategoryKind.INCOME })

const noop = () => Promise.resolve()

const listDefaults: CategoriesScreenProps = {
  group: home,
  categories: [],
  showArchived: false,
  loading: false,
  listError: null,
  actions: { onArchive: noop },
}

describe("placeCategories", () => {
  it("puts each top-level category by folded name, each followed by its subcategories by name", () => {
    const placed = placeCategories([groceries, rent, eatingOut, food], "en")
    expect(placed.map((p) => [p.category.name, p.parent?.name ?? null])).toEqual([
      ["Food", null],
      ["Eating out", "Food"],
      ["Groceries", "Food"],
      ["rent", null],
    ])
  })

  it("draws a subcategory whose parent is hidden at the top level, so it is never lost", () => {
    expect(placeCategories([groceries], "en").map((p) => [p.category.id, p.parent])).toEqual([
      [groceries.id, null],
    ])
  })
})

describe("CategoriesScreen", () => {
  it("splits the list into Expenses then Income, each heading counting its live categories", async () => {
    const old = category({ id: "c-old", name: "Old", archived: true })
    await mount(
      <CategoriesScreen
        {...listDefaults}
        categories={[salary, groceries, food, old]}
        showArchived
      />,
    )
    const headings = [...document.querySelectorAll("section h2")].map((h) => h.textContent)
    expect(headings).toEqual(["Expenses · 2", "Income · 1"])
    const expenseRows = [...find("[data-e2e=category-list-1]").querySelectorAll("li")]
      .map((li) => li.getAttribute("data-category"))
    expect(expenseRows).toEqual([food.id, groceries.id, old.id])
  })

  it("names a subcategory's parent in its link, for a screen reader", async () => {
    await mount(<CategoriesScreen {...listDefaults} categories={[food, groceries]} />)
    const link = find(`[data-e2e=category-${groceries.id}] [data-e2e=category-name]`)
    expect(text(link)).toBe("Groceries, in Food")
    expect(link.getAttribute("href")).toBe(`/categories/${groceries.id}`)
  })

  it("hides archived categories until asked, and says so when every category is archived", async () => {
    const old = category({ id: "c-old", name: "Old", archived: true })
    await mount(<CategoriesScreen {...listDefaults} categories={[old]} />)
    expect(count(`[data-e2e=category-${old.id}]`)).toBe(0)
    expect(document.body.textContent).toContain("Every category is archived.")
  })

  it("offers an empty section its own Add link, for the kind it lacks", async () => {
    await mount(<CategoriesScreen {...listDefaults} categories={[food]} />)
    expect(find("[data-e2e=category-section-add-2]").getAttribute("href"))
      .toBe("/categories/new?kind=income")
  })

  it("offers Add subcategory on a live top-level category only", async () => {
    await mount(<CategoriesScreen {...listDefaults} categories={[food, groceries]} />)
    const top = (await openMenu(food.id)).map((item) => item.getAttribute("data-e2e"))
    expect(top).toContain("category-menu-add-child")
    const child = (await openMenu(groceries.id)).map((item) => item.getAttribute("data-e2e"))
    expect(child).not.toContain("category-menu-add-child")
  })

  it("asks before archiving a parent with subcategories, naming them, and archives on confirm", async () => {
    const archived: [string, boolean][] = []
    await mount(
      <CategoriesScreen
        {...listDefaults}
        categories={[food, groceries, eatingOut]}
        actions={{ onArchive: (id, on) => Promise.resolve(void archived.push([id, on])) }}
      />,
    )
    await openMenu(food.id)
    await click(find(`[data-e2e=category-${food.id}] [data-e2e=category-archive]`))
    const dialog = find("[data-e2e=category-archive-dialog]")
    expect(text(dialog)).toContain("Archive Food and its 2 subcategories?")
    expect(text(dialog)).toContain("Groceries and Eating out are archived too.")
    expect(archived).toEqual([])
    await click(find("[data-e2e=category-archive-confirm]"))
    expect(archived).toEqual([[food.id, true]])
  })

  it("archives a category without subcategories at once, with no question", async () => {
    const archived: string[] = []
    await mount(
      <CategoriesScreen
        {...listDefaults}
        categories={[rent]}
        actions={{ onArchive: (id) => Promise.resolve(void archived.push(id)) }}
      />,
    )
    await openMenu(rent.id)
    await click(find(`[data-e2e=category-${rent.id}] [data-e2e=category-archive]`))
    expect(count("[data-e2e=category-archive-dialog]")).toBe(0)
    expect(archived).toEqual([rent.id])
  })

  it("refuses to bring back a subcategory alone while its parent is archived, and says why", async () => {
    const unarchived: string[] = []
    await mount(
      <CategoriesScreen
        {...listDefaults}
        categories={[{ ...food, archived: true }, { ...groceries, archived: true }]}
        showArchived
        actions={{ onArchive: (id) => Promise.resolve(void unarchived.push(id)) }}
      />,
    )
    await openMenu(groceries.id)
    const item = find<HTMLButtonElement>(
      `[data-e2e=category-${groceries.id}] [data-e2e=category-unarchive]`,
    )
    expect(text(item)).toBe("Unarchive Food to bring this back")
    expect(item.disabled || item.getAttribute("aria-disabled") === "true").toBe(true)
    await click(item)
    expect(unarchived).toEqual([])
  })

  it("gives a viewer no New button and no row menu, and says why", async () => {
    await mount(
      <CategoriesScreen {...listDefaults} group={viewerOfHome} categories={[food, groceries]} />,
    )
    expect(count("[data-e2e=category-new]")).toBe(0)
    expect(count("[data-e2e=category-menu]")).toBe(0)
    expect(count("[data-e2e=categories-read-only]")).toBe(1)
  })

  it("names the category limit when a plan caps categories", async () => {
    const refusal = {
      code: "PLAN_LIMIT_REACHED" as const,
      entitlement: "maxCategories" as const,
      limit: 2,
      canUpgrade: true,
    }
    await mount(<CategoriesScreen {...listDefaults} listPlan={refusal} />)
    const notice = find("[data-e2e=plan-refusal]")
    expect(notice.textContent).toContain("This group has reached its category limit")
    expect(notice.textContent).toContain("Its plan allows up to 2 categories in use.")
  })
})

const NEW_FORM: CategoryFields = {
  name: "",
  kind: CategoryKind.EXPENSE,
  icon: "tag" as CategoryFields["icon"],
  color: "#2563eb",
  parentId: null,
}

/** The editor with its form value held in state, as the app's store holds it. */
function Editor(
  props: Partial<CategoryEditorScreenProps> & { start: CategoryFields; seen: CategoryFields[] },
) {
  const [value, setValue] = useState(props.start)
  return (
    <CategoryEditorScreen
      group={home}
      loading={false}
      notFound={false}
      category={null}
      categories={[food, groceries, rent, salary]}
      errors={{ name: null, parent: null, form: null }}
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

describe("CategoryEditorScreen", () => {
  it("locks the kind of a subcategory and says how to change it", async () => {
    await mount(<Editor start={{ ...NEW_FORM, parentId: food.id }} seen={[]} />)
    const kind = find<HTMLFieldSetElement>("[data-e2e=category-kind]")
    expect(kind.disabled).toBe(true)
    expect(find(`#${kind.getAttribute("aria-describedby")}`).textContent)
      .toBe("A subcategory has its parent's kind. Choose no parent to change it.")
  })

  it("locks the kind and the parent of a category that has subcategories", async () => {
    await mount(
      <Editor
        start={{ ...NEW_FORM, name: food.name }}
        category={food}
        seen={[]}
      />,
    )
    expect(find<HTMLFieldSetElement>("[data-e2e=category-kind]").disabled).toBe(true)
    expect(find<HTMLFieldSetElement>("[data-e2e=category-parent] fieldset").disabled).toBe(true)
    expect(text(find("[data-e2e=category-parent]")))
      .toContain("Food has subcategories, so it cannot sit under another category.")
  })

  it("offers as parents only live top-level categories of the same kind, never itself", async () => {
    const old = category({ id: "c-old", name: "Old", archived: true })
    await mount(
      <Editor
        start={{ ...NEW_FORM, name: rent.name }}
        category={rent}
        categories={[food, groceries, rent, salary, old]}
        seen={[]}
      />,
    )
    const input = find<HTMLInputElement>("[data-e2e=category-parent] input")
    await act(() => {
      input.dispatchEvent(new window.Event("focus") as unknown as Event)
      input.dispatchEvent(new window.MouseEvent("click", { bubbles: true }) as unknown as Event)
      input.dispatchEvent(new window.Event("input", { bubbles: true }) as unknown as Event)
    })
    const options = [...document.querySelectorAll("[role=option]")].map((o) => o.textContent)
    expect(options).toEqual(["Food"])
  })

  it("says there is no parent to choose when no other category of the kind exists", async () => {
    await mount(
      <Editor start={{ ...NEW_FORM, kind: CategoryKind.INCOME }} categories={[]} seen={[]} />,
    )
    expect(find<HTMLFieldSetElement>("[data-e2e=category-parent] fieldset").disabled).toBe(true)
    expect(find("[data-e2e=category-parent]").textContent)
      .toContain("There is no other income category to put it under yet.")
  })

  it("shows a viewer the category as facts, with no form and no Save", async () => {
    await mount(
      <Editor
        start={{ ...NEW_FORM, name: groceries.name, parentId: food.id }}
        category={groceries}
        group={viewerOfHome}
        seen={[]}
      />,
    )
    expect(count("[data-e2e=category-facts]")).toBe(1)
    expect(count("[data-e2e=category-save]")).toBe(0)
    expect(count("[data-e2e=category-name-input]")).toBe(0)
    expect(count("[data-e2e=category-read-only]")).toBe(1)
  })

  it("keeps Save off while offline and says changes wait", async () => {
    await mount(<Editor start={{ ...NEW_FORM, name: "Pets" }} offline seen={[]} />)
    expect(count("[data-e2e=category-offline]")).toBe(1)
    expect(find<HTMLButtonElement>("[data-e2e=category-save]").disabled).toBe(true)
  })
})
