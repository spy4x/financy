import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { GroupRole } from "@domain/groups"
import {
  assertCanReadCategories,
  assertCanWriteCategories,
  assertCategoryRoom,
  assertNoCategoryProblem,
  canCarryLimit,
  CATEGORY_MAX_PER_GROUP,
  CATEGORY_MAX_STORED,
  CATEGORY_NAME_MAX_LENGTH,
  categoryArchivePayloadSchema,
  categoryArchivePlan,
  categoryCreatePayloadSchema,
  CategoryError,
  categoryExportProblems,
  CategoryKind,
  type CategoryNode,
  categoryProblem,
  parentsFirst,
  parseCategoryExportEntry,
  parseCategoryRequest,
} from "./+lib.ts"

const groupId = "019a5b0e-1af5-7f04-8ae4-b1ee5d111002"
const id = "019a5b0e-1af5-7f04-8ae4-b1ee5d113001"
const base = {
  groupId,
  id,
  name: "Groceries",
  kind: CategoryKind.EXPENSE,
  icon: "shopping-cart",
  color: "#16a34a",
  parentId: null,
}

const FOOD = "019a5b0e-1af5-7f04-8ae4-b1ee5d113101"
const GROCERIES = "019a5b0e-1af5-7f04-8ae4-b1ee5d113102"
const SALARY = "019a5b0e-1af5-7f04-8ae4-b1ee5d113103"
const TRAVEL = "019a5b0e-1af5-7f04-8ae4-b1ee5d113104"
const NEW = "019a5b0e-1af5-7f04-8ae4-b1ee5d113199"

/** Food holds Groceries, Salary is income, and Travel is archived with no children. */
const household: CategoryNode[] = [
  { id: FOOD, name: "Food", kind: CategoryKind.EXPENSE, parentId: null, archived: false },
  { id: GROCERIES, name: "Groceries", kind: CategoryKind.EXPENSE, parentId: FOOD, archived: false },
  { id: SALARY, name: "Salary", kind: CategoryKind.INCOME, parentId: null, archived: false },
  { id: TRAVEL, name: "Travel", kind: CategoryKind.EXPENSE, parentId: null, archived: true },
]
const fresh = (fields: Partial<CategoryNode>): CategoryNode => ({
  id: NEW,
  name: "New",
  kind: CategoryKind.EXPENSE,
  parentId: null,
  archived: false,
  ...fields,
})
const codeOf = (write: () => unknown) => {
  try {
    write()
  } catch (error) {
    if (error instanceof CategoryError) return { code: error.code, fields: error.fields }
    throw error
  }
  throw new Error("expected a refusal")
}

describe("parsing a category request", () => {
  it("trims the name and stores the colour in lower case", () => {
    const parsed = parseCategoryRequest(categoryCreatePayloadSchema, {
      ...base,
      name: "  Groceries ",
      color: "#16A34A",
    })

    expect(parsed).toEqual(base)
  })

  it("counts an emoji as one character, up to the longest name", () => {
    const name = "🍞".repeat(CATEGORY_NAME_MAX_LENGTH)

    expect(parseCategoryRequest(categoryCreatePayloadSchema, { ...base, name }).name).toBe(name)
    expect(
      codeOf(() =>
        parseCategoryRequest(categoryCreatePayloadSchema, { ...base, name: name + "🍞" })
      ),
    )
      .toEqual({
        code: "INVALID_REQUEST",
        fields: { name: { code: "maxLength", values: { rule: CATEGORY_NAME_MAX_LENGTH } } },
      })
    expect(codeOf(() => parseCategoryRequest(categoryCreatePayloadSchema, { ...base, name: " " })))
      .toEqual({ code: "INVALID_REQUEST", fields: { name: { code: "required" } } })
  })

  it("refuses a name with a control or an invisible character", () => {
    for (const name of ["a\u0000b", "a\nb", "a​b", "a‮b"]) {
      expect(() => parseCategoryRequest(categoryCreatePayloadSchema, { ...base, name }))
        .toThrow("control or invisible")
    }
  })

  it("takes only a #rrggbb colour", () => {
    for (const color of ["red", "#fff", "#16a34a00", "16a34a", "#16a34g", "url(x)"]) {
      expect(
        codeOf(() => parseCategoryRequest(categoryCreatePayloadSchema, { ...base, color })).code,
      )
        .toBe("INVALID_REQUEST")
    }
  })

  it("takes only an icon of the category set", () => {
    for (const icon of ["shopping-cart", "circle-ellipsis", "tag"]) {
      expect(parseCategoryRequest(categoryCreatePayloadSchema, { ...base, icon }).icon).toBe(icon)
    }
    for (const icon of ["", "x", "<svg>", "Shopping-cart", 1]) {
      expect(() => parseCategoryRequest(categoryCreatePayloadSchema, { ...base, icon })).toThrow()
    }
  })

  it("takes the two kinds, a parent id or null, and refuses anything else", () => {
    for (const kind of [0, 3, 1.5, "1"]) {
      expect(() => parseCategoryRequest(categoryCreatePayloadSchema, { ...base, kind })).toThrow()
    }
    for (const parentId of ["food", "", 1]) {
      expect(() => parseCategoryRequest(categoryCreatePayloadSchema, { ...base, parentId }))
        .toThrow()
    }
    expect(parseCategoryRequest(categoryCreatePayloadSchema, { ...base, parentId: FOOD }).parentId)
      .toBe(FOOD)
  })

  it("refuses a field the payload does not have", () => {
    expect(() => parseCategoryRequest(categoryCreatePayloadSchema, { ...base, limit: 5 }))
      .toThrow()
    expect(() => parseCategoryRequest(categoryArchivePayloadSchema, { groupId, id, version: 1 }))
      .toThrow()
  })
})

describe("only an expense category carries a budget's limit (R12)", () => {
  it("lets an expense category carry a limit and an income one not", () => {
    expect(canCarryLimit(CategoryKind.EXPENSE)).toBe(true)
    expect(canCarryLimit(CategoryKind.INCOME)).toBe(false)
  })
})

describe("the category tree (R13)", () => {
  it("lets a category sit at the top level or under a top-level parent of its kind", () => {
    expect(categoryProblem(household, fresh({}))).toBeNull()
    expect(categoryProblem(household, fresh({ parentId: FOOD }))).toBeNull()
  })

  it("refuses a parent that is itself a child, the category itself, or a moved parent", () => {
    expect(categoryProblem(household, fresh({ parentId: GROCERIES }))).toBe("parentNested")
    expect(categoryProblem(household, { ...household[0], parentId: FOOD })).toBe("ownParent")
    expect(categoryProblem(household, { ...household[0], parentId: SALARY })).toBe("hasChildren")
  })

  it("refuses a parent of the other kind, and a parent's kind change while it has children", () => {
    expect(categoryProblem(household, fresh({ kind: CategoryKind.INCOME, parentId: FOOD })))
      .toBe("kindMismatch")
    expect(categoryProblem(household, { ...household[0], kind: CategoryKind.INCOME }))
      .toBe("kindLocked")
    expect(categoryProblem(household, { ...household[2], kind: CategoryKind.EXPENSE })).toBeNull()
  })

  it("answers another household's or an unknown parent, and an archived one, as not found (R17)", () => {
    expect(categoryProblem(household, fresh({ parentId: NEW.replace("99", "98") })))
      .toBe("parentMissing")
    expect(categoryProblem(household, fresh({ parentId: TRAVEL }))).toBe("parentArchived")
    for (const problem of ["parentMissing", "parentArchived"] as const) {
      expect(codeOf(() => assertNoCategoryProblem(problem))).toEqual({
        code: "CATEGORY_NOT_FOUND",
        fields: { parentId: { code: "notFound" } },
      })
    }
  })

  it("names the field each tree refusal is about", () => {
    expect(codeOf(() => assertNoCategoryProblem("parentNested"))).toEqual({
      code: "CATEGORY_TREE_INVALID",
      fields: { parentId: { code: "parentNested" } },
    })
    expect(codeOf(() => assertNoCategoryProblem("kindLocked"))).toEqual({
      code: "CATEGORY_TREE_INVALID",
      fields: { kind: { code: "hasChildren" } },
    })
    expect(() => assertNoCategoryProblem(null)).not.toThrow()
  })
})

describe("sibling names (D3)", () => {
  it("refuses a sibling's name compared folded, an archived sibling's included", () => {
    expect(categoryProblem(household, fresh({ name: "FOOD" }))).toBe("nameTaken")
    expect(categoryProblem(household, fresh({ name: "gróceries", parentId: FOOD })))
      .toBe("nameTaken")
    expect(categoryProblem(household, fresh({ name: "travel" }))).toBe("nameTaken")
    expect(codeOf(() => assertNoCategoryProblem("nameTaken"))).toEqual({
      code: "CATEGORY_NAME_TAKEN",
      fields: { name: { code: "taken" } },
    })
  })

  it("allows the same name under another parent, at the top level, or in the other kind", () => {
    expect(categoryProblem(household, fresh({ name: "Groceries" }))).toBeNull()
    expect(categoryProblem(household, fresh({ name: "Food", kind: CategoryKind.INCOME })))
      .toBeNull()
  })

  it("lets a category keep its own name when it is edited", () => {
    expect(categoryProblem(household, { ...household[0], name: "food" })).toBeNull()
  })
})

describe("the household's category cap", () => {
  it("counts live categories to the cap and all of them to the stored bound", () => {
    expect(() => assertCategoryRoom(CATEGORY_MAX_PER_GROUP, CATEGORY_MAX_STORED)).not.toThrow()
    expect(() => assertCategoryRoom(CATEGORY_MAX_PER_GROUP + 1, CATEGORY_MAX_PER_GROUP + 1))
      .toThrow(`at most ${CATEGORY_MAX_PER_GROUP} categories`)
    expect(() => assertCategoryRoom(1, CATEGORY_MAX_STORED + 1)).toThrow(CategoryError)
  })
})

describe("archiving a category (D2)", () => {
  it("archives a parent with its live children", () => {
    expect(categoryArchivePlan(household, FOOD, true)).toEqual({ ids: [FOOD, GROCERIES], added: 0 })
    expect(categoryArchivePlan(household, GROCERIES, true)).toEqual({ ids: [GROCERIES], added: 0 })
  })

  it("brings a parent back with its archived children and counts what comes back", () => {
    const archived = household.map((category) =>
      category.id === FOOD || category.id === GROCERIES ? { ...category, archived: true } : category
    )

    expect(categoryArchivePlan(archived, FOOD, false)).toEqual({
      ids: [FOOD, GROCERIES],
      added: 2,
    })
  })

  it("refuses to bring a child back alone while its parent is archived", () => {
    const archived = household.map((category) =>
      category.id === FOOD || category.id === GROCERIES ? { ...category, archived: true } : category
    )

    expect(codeOf(() => categoryArchivePlan(archived, GROCERIES, false)).code)
      .toBe("CATEGORY_PARENT_ARCHIVED")
  })

  it("answers an id not in the household as not found", () => {
    expect(codeOf(() => categoryArchivePlan(household, NEW, true)).code)
      .toBe("CATEGORY_NOT_FOUND")
  })
})

describe("who may use categories (R16)", () => {
  it("lets every member read, an editor write, and hides the household from a stranger", () => {
    expect(() => assertCanReadCategories(GroupRole.VIEWER)).not.toThrow()
    expect(() => assertCanWriteCategories(GroupRole.EDITOR)).not.toThrow()
    expect(() => assertCanWriteCategories(GroupRole.OWNER)).not.toThrow()
    expect(codeOf(() => assertCanWriteCategories(GroupRole.VIEWER)).code)
      .toBe("ROLE_INSUFFICIENT")
    expect(codeOf(() => assertCanReadCategories(null)).code).toBe("GROUP_NOT_FOUND")
    expect(codeOf(() => assertCanWriteCategories(null)).code).toBe("GROUP_NOT_FOUND")
  })
})

describe("a category in an export file", () => {
  const entry = {
    id,
    name: "Groceries",
    kind: CategoryKind.EXPENSE,
    icon: "shopping-cart",
    color: "#16A34A",
    parentId: null,
    archived: false,
    createdAt: "2026-11-01T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
  }
  const row = (fields: Partial<CategoryNode>) => ({
    id: NEW,
    name: "x",
    kind: CategoryKind.EXPENSE,
    parentId: null,
    archived: false,
    ...fields,
  })

  it("reads an entry with the rules of a create, and refuses an unknown field", () => {
    expect(parseCategoryExportEntry(entry).color).toBe("#16a34a")
    expect(() => parseCategoryExportEntry({ ...entry, budget: 5 })).toThrow("does not have")
    expect(() => parseCategoryExportEntry({ ...entry, icon: "x" })).toThrow()
  })

  it("takes a file whose child comes before its parent", () => {
    const file = [row({ id: GROCERIES, parentId: FOOD }), row({ id: FOOD, name: "Food" })]

    expect(categoryExportProblems(file)).toEqual([])
    expect(parentsFirst(file).map((category) => category.id)).toEqual([FOOD, GROCERIES])
  })

  it("names each entry that breaks the tree, and only the second of two siblings with one name", () => {
    const file = [
      row({ id: FOOD, name: "Food" }),
      row({ id: GROCERIES, name: "a", parentId: FOOD }),
      row({ id: SALARY, name: "b", parentId: GROCERIES }),
      row({ id: TRAVEL, name: "c", kind: CategoryKind.INCOME, parentId: FOOD }),
      row({ id: NEW, name: "FOOD" }),
    ]

    expect(categoryExportProblems(file).map(({ index, issue }) => [index, issue.code])).toEqual([
      [1, "categoryParentNested"],
      [2, "categoryParentNested"],
      [3, "categoryKindMismatch"],
      [4, "duplicateCategoryName"],
    ])
  })

  it("names a missing parent and a live child under an archived one", () => {
    const file = [
      row({ id: FOOD, name: "Food", archived: true }),
      row({ id: GROCERIES, parentId: FOOD }),
      row({ id: SALARY, name: "y", parentId: NEW }),
    ]

    expect(categoryExportProblems(file).map(({ issue }) => issue.code)).toEqual([
      "categoryParentArchived",
      "categoryParentMissing",
    ])
  })

  it("refuses more live categories than the cap, and counts archived ones only to the bound", () => {
    const many = (count: number, archived: boolean) =>
      Array.from(
        { length: count },
        (_, index) => row({ name: `${archived ? "a" : "c"}${index}`, archived }),
      )

    expect(categoryExportProblems(many(CATEGORY_MAX_PER_GROUP + 1, false))[0].issue)
      .toEqual({
        code: "tooManyCategories",
        values: { count: CATEGORY_MAX_PER_GROUP + 1, max: CATEGORY_MAX_PER_GROUP },
      })
    expect(categoryExportProblems(many(CATEGORY_MAX_PER_GROUP, false))).toEqual([])
    expect(categoryExportProblems([...many(CATEGORY_MAX_PER_GROUP, false), ...many(5, true)]))
      .toEqual([])
    expect(categoryExportProblems(many(CATEGORY_MAX_STORED + 1, true))[0].issue.code)
      .toBe("tooManyCategories")
  })
})
