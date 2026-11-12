import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { RealtimeRequestError } from "@spy4x/realtime"
import { COLOR_PRESETS } from "@spy4x/preact-ui/color-field"
import { CATEGORY_MAX_PER_GROUP, type CategoryIcon, CategoryKind } from "@domain/categories"
import {
  type CategoriesDependencies,
  CATEGORY_MESSAGES,
  type CategoryItem,
  createCategoriesStore,
} from "./categories.ts"

const groupId = "g-1"

function item(id: string, over: Partial<CategoryItem> = {}): CategoryItem {
  return {
    id,
    groupId,
    parentId: null,
    name: id,
    kind: CategoryKind.EXPENSE,
    icon: "tag",
    color: COLOR_PRESETS[0].value,
    archivedAt: null,
    version: 1,
    changeSequence: "1",
    createdAt: "2026-11-12T00:00:00.000Z",
    updatedAt: "2026-11-12T00:00:00.000Z",
    ...over,
  }
}

function refused(code: string, fields?: Record<string, string>) {
  const error = new RealtimeRequestError("conflict", "Refused", { code })
  return Object.assign(error, fields && { fields })
}

const FOOD = item("food", { name: "Food", color: COLOR_PRESETS[3].value })
const GROCERIES = item("groceries", { name: "Groceries", parentId: "food", color: FOOD.color })
const SALARY = item("salary", { name: "Salary", kind: CategoryKind.INCOME })

/** A store over fake calls that records each one; `server` is what the server holds. */
function harness(overrides: Partial<CategoriesDependencies> = {}) {
  const calls: { name: string; input: unknown }[] = []
  let server: CategoryItem[] = [FOOD, GROCERIES, SALARY]
  const store = createCategoriesStore({
    fetchList: () => Promise.resolve(server),
    create(input) {
      calls.push({ name: "create", input })
      return Promise.resolve({ category: item(input.id, input) })
    },
    update(input) {
      calls.push({ name: "update", input })
      return Promise.resolve({ category: item(input.id, { ...input, version: input.version + 1 }) })
    },
    archive(input) {
      calls.push({ name: "archive", input })
      const at = input.archived ? "2026-11-12T01:00:00.000Z" : null
      const changed = server.filter((c) => c.id === input.id || c.parentId === input.id)
        .map((c) => ({ ...c, archivedAt: at, version: c.version + 1 }))
      server = server.map((c) => changed.find((next) => next.id === c.id) ?? c)
      const [category, ...children] = changed
      return Promise.resolve({ category, children })
    },
    newId: () => "new-1",
    ...overrides,
  })
  return {
    store,
    calls,
    setServer(next: CategoryItem[]) {
      server = next
    },
  }
}

describe("categories store", () => {
  it("starts a new top-level category in the first colour no live sibling of its kind uses", async () => {
    const { store } = harness()
    await store.open(groupId)
    store.startCreate()
    // Food uses preset 3, so the first free expense colour is preset 0.
    expect(store.form.value?.color).toBe(COLOR_PRESETS[0].value)
    store.closeForm()
    const { store: busy } = harness()
    await busy.open(groupId)
    busy.categories.value = [item("a", { color: COLOR_PRESETS[0].value }), FOOD]
    busy.startCreate()
    expect(busy.form.value?.color).toBe(COLOR_PRESETS[1].value)
  })

  it("starts a new subcategory under its parent, with the parent's kind and colour", async () => {
    const { store } = harness()
    await store.open(groupId)
    store.startCreate({ parentId: "food", kind: CategoryKind.INCOME })
    expect(store.form.value).toMatchObject({
      id: null,
      parentId: "food",
      kind: CategoryKind.EXPENSE,
      color: FOOD.color,
      icon: "tag",
    })
  })

  it("ignores a parent that is a subcategory itself and starts at the top level", async () => {
    const { store } = harness()
    await store.open(groupId)
    store.startCreate({ parentId: "groceries" })
    expect(store.form.value?.parentId).toBe(null)
  })

  it("clears the parent when the kind changes to the other kind", async () => {
    const { store } = harness()
    await store.open(groupId)
    store.startCreate({ parentId: "food" })
    store.change({ ...store.form.value!, kind: CategoryKind.INCOME })
    expect(store.form.value).toMatchObject({ kind: CategoryKind.INCOME, parentId: null })
  })

  it("sends every retry of one new category with the same id", async () => {
    let fail = true
    const { store, calls } = harness({
      create(input) {
        calls.push({ name: "create", input })
        if (fail) return Promise.reject(new Error("offline"))
        return Promise.resolve({ category: item(input.id, input) })
      },
    })
    await store.open(groupId)
    store.startCreate()
    store.change({ ...store.form.value!, name: "  Rent  " })
    expect(await store.save()).toBe(null)
    fail = false
    const saved = await store.save()
    expect(saved?.name).toBe("Rent")
    expect(calls.map((call) => (call.input as { id: string }).id)).toEqual(["new-1", "new-1"])
    expect(store.categories.value.some((c) => c.id === "new-1")).toBe(true)
  })

  it("refuses an empty name without calling the server", async () => {
    const { store, calls } = harness()
    await store.open(groupId)
    store.startCreate()
    expect(await store.save()).toBe(null)
    expect(store.formErrors.value.name).toBe(CATEGORY_MESSAGES.nameRequired)
    expect(calls).toEqual([])
  })

  it("says a sibling's name clash with the parent's name, or with the kind at the top level", async () => {
    const { store } = harness({ create: () => Promise.reject(refused("CATEGORY_NAME_TAKEN")) })
    await store.open(groupId)
    store.startCreate({ parentId: "food" })
    store.change({ ...store.form.value!, name: "groceries" })
    await store.save()
    expect(store.formErrors.value.name).toEqual({
      key: `CategoryMessages.nameTakenChild`,
      values: { parent: "Food", name: "groceries" },
    })
    store.closeForm()
    store.startCreate({ kind: CategoryKind.INCOME })
    store.change({ ...store.form.value!, name: "Salary" })
    await store.save()
    expect(store.formErrors.value.name).toEqual({
      key: `CategoryMessages.nameTakenIncome`,
      values: { name: "Salary" },
    })
  })

  it("puts a vanished parent's refusal under the parent field and reads the list again", async () => {
    const { store, setServer } = harness({
      create: () => Promise.reject(refused("CATEGORY_NOT_FOUND", { parentId: "notFound" })),
    })
    await store.open(groupId)
    store.startCreate({ parentId: "food" })
    store.change({ ...store.form.value!, name: "Snacks" })
    setServer([SALARY])
    await store.save()
    expect(store.formErrors.value).toMatchObject({
      parent: CATEGORY_MESSAGES.parentGone,
      form: null,
    })
    expect(store.form.value?.name).toBe("Snacks")
    expect(store.categories.value.map((c) => c.id)).toEqual(["salary"])
  })

  it("shows a category another member changed as it is now, with the conflict said", async () => {
    const { store, setServer } = harness({
      update: () => Promise.reject(refused("VERSION_CONFLICT")),
    })
    await store.open(groupId)
    store.startEdit("food")
    store.change({ ...store.form.value!, name: "Meals" })
    setServer([{ ...FOOD, name: "Dining", version: 2 }, GROCERIES, SALARY])
    await store.save()
    expect(store.form.value).toMatchObject({ name: "Dining", version: 2 })
    expect(store.formErrors.value.form).toBe(CATEGORY_MESSAGES.conflict)
  })

  it("says the household's cap when the server refuses a new category for it", async () => {
    const { store } = harness({ create: () => Promise.reject(refused("CATEGORY_LIMIT_REACHED")) })
    await store.open(groupId)
    store.startCreate()
    store.change({ ...store.form.value!, name: "Rent" })
    await store.save()
    expect(store.formErrors.value.form).toEqual({
      key: `CategoryMessages.limit`,
      values: { max: CATEGORY_MAX_PER_GROUP },
    })
  })

  it("keeps a plan refusal apart, for the plan notice", async () => {
    const plan = {
      code: "PLAN_LIMIT_REACHED",
      entitlement: "maxCategories",
      limit: 0,
      canUpgrade: true,
    }
    const { store } = harness({
      create: () => Promise.reject(new RealtimeRequestError("forbidden", "No plan", plan)),
    })
    await store.open(groupId)
    store.startCreate()
    store.change({ ...store.form.value!, name: "Rent" })
    await store.save()
    expect(store.formErrors.value.plan?.entitlement).toBe("maxCategories")
    expect(store.formErrors.value.form).toBe(null)
  })

  it("archives a parent with its subcategories and brings them back together", async () => {
    const { store, calls } = harness()
    await store.open(groupId)
    const archived = await store.archive("food", true)
    expect(archived?.children.map((c) => c.id)).toEqual(["groceries"])
    expect(store.categories.value.filter((c) => c.archivedAt !== null).map((c) => c.id).sort())
      .toEqual(["food", "groceries"])
    await store.archive("food", false)
    expect(store.categories.value.every((c) => c.archivedAt === null)).toBe(true)
    expect(calls.map((call) => call.input)).toEqual([
      { groupId, id: "food", version: 1, archived: true },
      { groupId, id: "food", version: 2, archived: false },
    ])
  })

  it("says why a subcategory under an archived parent cannot come back alone", async () => {
    const { store } = harness({
      archive: () => Promise.reject(refused("CATEGORY_PARENT_ARCHIVED")),
    })
    await store.open(groupId)
    expect(await store.archive("groceries", false)).toBe(null)
    expect(store.listError.value).toBe(CATEGORY_MESSAGES.parentArchived)
  })

  it("keeps the unsaved fields of an open editor when its category is archived", async () => {
    const { store } = harness()
    await store.open(groupId)
    store.startEdit("groceries")
    store.change({ ...store.form.value!, icon: "coffee" as CategoryIcon })
    await store.archive("food", true)
    expect(store.form.value).toMatchObject({ icon: "coffee", version: 2 })
  })

  it("drops a list read that was answered after another household opened", async () => {
    let answer: (list: CategoryItem[]) => void = () => {}
    let first = true
    const { store } = harness({
      fetchList(id) {
        if (!first) return Promise.resolve([item("other", { groupId: id })])
        first = false
        return new Promise((resolve) => answer = resolve)
      },
    })
    const slow = store.open(groupId)
    await store.open("g-2")
    answer([FOOD])
    await slow
    expect(store.categories.value.map((c) => c.id)).toEqual(["other"])
  })
})
