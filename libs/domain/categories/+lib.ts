import { type Type, type } from "arktype"
import type { Command, Query } from "@spy4x/platform/cqrs"
import type { Actor } from "@domain/identity"
import {
  canMutateNotes,
  canRead,
  type GroupImportIssue,
  type GroupRole,
  plainEntryProblem,
} from "@domain/groups"
import { hexColor } from "@spy4x/platform/universal/color"
import { fold, hasUnsafeTextCharacters } from "@spy4x/platform/universal/text"
import { UUID_PATTERN } from "@spy4x/platform/universal/uuid"
import { CATEGORY_ICONS, type IconName } from "@spy4x/preact-icons/registry"
import { type FieldErrors, fieldErrors } from "@spy4x/validation"

/**
 * Categories: why money moved, for expenses or for income, each with an icon and a colour. A
 * category belongs to one household (a group) and may sit under one parent of the same kind, one
 * level deep: "Food" holds "Groceries" and "Eating out". A category is archived, never deleted, so
 * every past entry keeps it. Every member reads a household's categories and an editor or above
 * writes them. Copied from the accounts aggregate; `docs/aggregates.md` walks through the files.
 */

/** The longest category name, in characters, after trimming. */
export const CATEGORY_NAME_MAX_LENGTH = 60

/**
 * The most live categories one household holds. Archived ones are not counted: a category is never
 * deleted, so counting them would leave a full household no way out.
 */
export const CATEGORY_MAX_PER_GROUP = 100

/**
 * The most categories one household stores, archived ones included. The list is read as one page,
 * so this bounds that read for every member however many times a category is created and archived.
 */
export const CATEGORY_MAX_STORED = 1000

/** Whether a category sorts expenses or income. The numbers are stored, so they never change. */
export enum CategoryKind {
  EXPENSE = 1,
  INCOME = 2,
}

/** Every kind, in the order the list shows them: expenses first. */
export const CATEGORY_KINDS: readonly CategoryKind[] = [CategoryKind.EXPENSE, CategoryKind.INCOME]

/** R12: only an expense category can carry a budget's limit (#98 relies on it). */
export function canCarryLimit(kind: CategoryKind): boolean {
  return kind === CategoryKind.EXPENSE
}

/** An icon a category may show: an id of the icon registry's category set. */
export type CategoryIcon = IconName

/** The icon a new category has until the person picks one. */
export const DEFAULT_CATEGORY_ICON: CategoryIcon = "tag"

/** The outbox event kinds a category change is recorded under, on the group's change log. */
export const CATEGORY_EVENTS = {
  created: "category.created",
  updated: "category.updated",
  archived: "category.archived",
  unarchived: "category.unarchived",
} as const

export type CategoryErrorCode =
  | "CATEGORY_LIMIT_REACHED"
  | "CATEGORY_NAME_TAKEN"
  | "CATEGORY_NOT_FOUND"
  | "CATEGORY_PARENT_ARCHIVED"
  | "CATEGORY_TREE_INVALID"
  | "GROUP_NOT_FOUND"
  | "ID_ALREADY_EXISTS"
  | "INVALID_REQUEST"
  | "ROLE_INSUFFICIENT"
  | "VERSION_CONFLICT"

export class CategoryError extends Error {
  constructor(
    public readonly code: CategoryErrorCode,
    message: string,
    /** Each failed field's code and rule, when a schema or a tree rule refused the request. */
    public readonly fields?: FieldErrors,
  ) {
    super(message)
    this.name = "CategoryError"
  }
}

/**
 * A write named a version the category has moved past. It carries the version the category is at
 * now, so the client can reread it instead of overwriting a change it never saw.
 */
export class CategoryVersionConflictError extends CategoryError {
  constructor(public readonly currentVersion: number) {
    super("VERSION_CONFLICT", "The category was changed by someone else")
    this.name = "CategoryVersionConflictError"
  }
}

/** One category as the API returns it. */
export interface Category {
  id: string
  groupId: string
  name: string
  kind: CategoryKind
  icon: CategoryIcon
  /** A lower-case `#rrggbb`. */
  color: string
  /** The parent's id, `null` for a top-level category. */
  parentId: string | null
  /** `null` while the category is in use; set once it is archived. */
  archivedAt: Date | null
  /** Starts at 1 and grows by one with every change; a change must name it. */
  version: number
  /** The group's change sequence this category was last written at, as a decimal string. */
  changeSequence: string
  createdByUserId: number | null
  updatedByUserId: number | null
  createdAt: Date
  updatedAt: Date
}

// #region Request schemas
const versionField = { version: "number.integer >= 1" } as const
/** A `#rrggbb` in either case, stored in lower case so the same colour is always the same text. */
const colorField = hexColor.pipe((color) => color.toLowerCase())
const iconField = type.enumerated(...CATEGORY_ICONS)
const parentField = type(UUID_PATTERN).or("null")
const categoryFields = {
  name: "string",
  kind: `1 <= number.integer <= ${CATEGORY_KINDS.length}`,
  icon: iconField,
  color: colorField,
  parentId: parentField,
} as const
const groupIdField = { groupId: UUID_PATTERN } as const
const categoryIdField = { id: UUID_PATTERN } as const

/** The `category.create` payload: a client-made id, so a retry cannot create a second category. */
export const categoryCreatePayloadSchema = type({
  ...groupIdField,
  ...categoryIdField,
  ...categoryFields,
  "+": "reject",
})
/** The `category.update` payload: the new fields, and the version edited. */
export const categoryUpdatePayloadSchema = type({
  ...groupIdField,
  ...categoryIdField,
  ...categoryFields,
  ...versionField,
  "+": "reject",
})
/**
 * The `category.archive` payload. `archived: false` brings an archived category back into use;
 * a parent's children follow it either way.
 */
export const categoryArchivePayloadSchema = type({
  ...groupIdField,
  ...categoryIdField,
  ...versionField,
  archived: "boolean",
  "+": "reject",
})
/** The `category.get` payload. */
export const categoryGetPayloadSchema = type({
  ...groupIdField,
  ...categoryIdField,
  "+": "reject",
})
/** The `category.list` payload: one page, no cursor, archived categories included. */
export const categoryListPayloadSchema = type({ ...groupIdField, "+": "reject" })

/**
 * Validates `value` against `schema`, then trims the name and checks its length in characters, so
 * an emoji counts as one. A name with a control or an invisible character is refused, as an
 * account's. Throws `CategoryError("INVALID_REQUEST")`.
 */
export function parseCategoryRequest<S extends Type<object>>(
  schema: S,
  value: unknown,
): S["infer"] {
  const result = schema(value)
  if (result instanceof type.errors) {
    throw new CategoryError("INVALID_REQUEST", result.summary, fieldErrors(result))
  }
  const parsed = result as S["infer"] & { name?: string }
  if (parsed.name === undefined) return parsed
  const name = parsed.name.trim()
  const length = Array.from(name).length
  if (length < 1 || length > CATEGORY_NAME_MAX_LENGTH) {
    throw new CategoryError(
      "INVALID_REQUEST",
      `Category name must contain 1 to ${CATEGORY_NAME_MAX_LENGTH} characters`,
      {
        name: length < 1
          ? { code: "required" }
          : { code: "maxLength", values: { rule: CATEGORY_NAME_MAX_LENGTH } },
      },
    )
  }
  if (hasUnsafeTextCharacters(name)) {
    throw new CategoryError(
      "INVALID_REQUEST",
      "Category name must not contain control or invisible characters",
      { name: { code: "unsafeCharacters" } },
    )
  }
  return { ...parsed, name }
}
// #endregion Request schemas

// #region Authorization
/**
 * Throws unless `role` may read the household's categories. `null` means the actor is not a
 * member, which answers "group not found" so a stranger cannot tell a household exists.
 */
export function assertCanReadCategories(role: GroupRole | null): void {
  if (role === null || !canRead(role)) {
    throw new CategoryError("GROUP_NOT_FOUND", "Group not found")
  }
}

/** Throws unless `role` may create, change or archive categories. */
export function assertCanWriteCategories(role: GroupRole | null): void {
  assertCanReadCategories(role)
  if (!canMutateNotes(role!)) {
    throw new CategoryError("ROLE_INSUFFICIENT", "Only an editor can change categories")
  }
}
// #endregion Authorization

// #region Tree rules
/** A category as the tree rules read it: where it sits and whether it is in use. */
export interface CategoryNode {
  id: string
  name: string
  kind: CategoryKind
  parentId: string | null
  archived: boolean
}

/**
 * Why a category cannot sit where a write puts it:
 *
 * - `parentMissing`: the parent is not one of the household's categories (another household's id
 *   included, R17).
 * - `parentArchived`: a category in use cannot sit under an archived one.
 * - `ownParent`, `parentNested`, `hasChildren`: the tree would be more than one level deep (R13).
 * - `kindMismatch`: a child's kind differs from its parent's (R13).
 * - `kindLocked`: a parent's kind changed while it has children (R13).
 * - `nameTaken`: a sibling has the same name, compared folded (D3).
 */
export type CategoryProblem =
  | "parentMissing"
  | "parentArchived"
  | "ownParent"
  | "parentNested"
  | "hasChildren"
  | "kindMismatch"
  | "kindLocked"
  | "nameTaken"

/**
 * What is wrong with `next` among `household`, the household's categories before the write (the
 * edited category's old copy included); `null` when it may be written. Children archived with
 * their parent count as children, so the tree never grows a second level under an archived one.
 */
export function categoryProblem(
  household: readonly CategoryNode[],
  next: CategoryNode,
): CategoryProblem | null {
  const byId = new Map(household.map((category) => [category.id, category]))
  const previous = byId.get(next.id)
  const hasChildren = household.some((category) => category.parentId === next.id)
  if (next.parentId !== null) {
    if (next.parentId === next.id) return "ownParent"
    const parent = byId.get(next.parentId)
    if (!parent) return "parentMissing"
    if (parent.parentId !== null) return "parentNested"
    if (hasChildren) return "hasChildren"
    if (parent.kind !== next.kind) return "kindMismatch"
    if (parent.archived && !next.archived) return "parentArchived"
  }
  if (previous && previous.kind !== next.kind && hasChildren) return "kindLocked"
  return siblingNameTaken(household, next) ? "nameTaken" : null
}

/**
 * Whether another category beside `next` has its name (D3): under the same parent, or at the top
 * level with the same kind. Names are compared folded, so "Café" and "cafe" are one name, and
 * archived siblings count, so bringing one back never makes two.
 */
function siblingNameTaken(household: readonly CategoryNode[], next: CategoryNode): boolean {
  const name = fold(next.name)
  return household.some((category) =>
    category.id !== next.id && category.parentId === next.parentId &&
    (next.parentId !== null || category.kind === next.kind) && fold(category.name) === name
  )
}

/**
 * Throws the refusal of `problem`, if any. A missing or archived parent answers
 * `CATEGORY_NOT_FOUND`, the same as an id that does not exist; the tree rules answer
 * `CATEGORY_TREE_INVALID`; a sibling's name, `CATEGORY_NAME_TAKEN`. Each names its field.
 */
export function assertNoCategoryProblem(problem: CategoryProblem | null): void {
  if (problem === null) return
  if (problem === "parentMissing" || problem === "parentArchived") {
    throw new CategoryError("CATEGORY_NOT_FOUND", "Parent category not found", {
      parentId: { code: "notFound" },
    })
  }
  if (problem === "nameTaken") {
    throw new CategoryError("CATEGORY_NAME_TAKEN", "A sibling category has this name", {
      name: { code: "taken" },
    })
  }
  if (problem === "kindLocked") {
    throw new CategoryError("CATEGORY_TREE_INVALID", "A parent's kind cannot change", {
      kind: { code: "hasChildren" },
    })
  }
  throw new CategoryError("CATEGORY_TREE_INVALID", "Categories nest one level deep", {
    parentId: { code: problem },
  })
}

/**
 * Throws `CATEGORY_LIMIT_REACHED` when a household holds more than {@link CATEGORY_MAX_PER_GROUP}
 * live categories or {@link CATEGORY_MAX_STORED} in all, counted after the write in its
 * transaction.
 */
export function assertCategoryRoom(live: number, stored: number): void {
  if (live > CATEGORY_MAX_PER_GROUP || stored > CATEGORY_MAX_STORED) {
    throw new CategoryError(
      "CATEGORY_LIMIT_REACHED",
      `A household can hold at most ${CATEGORY_MAX_PER_GROUP} categories`,
    )
  }
}

/** What an archive or unarchive changes: the category first, then the children that follow it. */
export interface CategoryArchivePlan {
  ids: string[]
  /** How many categories come back into use: what an unarchive adds to the live count. */
  added: number
}

/**
 * The categories an archive changes. Archiving a parent archives its live children too; bringing
 * one back brings back its archived children (D2). A child whose parent is archived cannot come
 * back alone: `CATEGORY_PARENT_ARCHIVED`. Throws `CATEGORY_NOT_FOUND` for an id not in
 * `household`.
 */
export function categoryArchivePlan(
  household: readonly CategoryNode[],
  id: string,
  archived: boolean,
): CategoryArchivePlan {
  const category = household.find((other) => other.id === id)
  if (!category) throw new CategoryError("CATEGORY_NOT_FOUND", "Category not found")
  if (!archived && category.parentId !== null) {
    const parent = household.find((other) => other.id === category.parentId)
    if (parent?.archived) {
      throw new CategoryError("CATEGORY_PARENT_ARCHIVED", "Unarchive the parent first")
    }
  }
  const children = household.filter((other) => other.parentId === id && other.archived !== archived)
  const changed = [category, ...children]
  return {
    ids: changed.map((other) => other.id),
    added: archived ? 0 : changed.filter((other) => other.archived).length,
  }
}
// #endregion Tree rules

// #region Commands and queries
/** What every command carries besides its own fields. */
interface CategoryCommandBase {
  actor: Actor
  groupId: string
  id: string
  /** The request this came from, kept on the audit event. */
  requestId?: string
  /** Makes a retry of this command safe; see the idempotency middleware on the command bus. */
  idempotencyKey?: string
}

/** The fields a person sets in the editor. */
export interface CategoryFields {
  name: string
  kind: CategoryKind
  icon: CategoryIcon
  color: string
  parentId: string | null
}

export interface CategoryCreatePayload extends CategoryCommandBase, CategoryFields {}

export interface CategoryWriteResult {
  category: Category
  /** `false` when the same category was already created by an earlier try of the same request. */
  created: boolean
}

export class CategoryCreateCommand implements Command<CategoryCreatePayload, CategoryWriteResult> {
  __resultType?: CategoryWriteResult
  /** The household's plan cap on categories (`maxCategories`), set by the entitlement gate. */
  allowance?: number | null
  constructor(public data: CategoryCreatePayload) {}
}

export interface CategoryUpdatePayload extends CategoryCommandBase, CategoryFields {
  /** The version the person edited; a category at any other version is not changed. */
  version: number
}

export class CategoryUpdateCommand
  implements Command<CategoryUpdatePayload, { category: Category }> {
  __resultType?: { category: Category }
  constructor(public data: CategoryUpdatePayload) {}
}

export interface CategoryArchivePayload extends CategoryCommandBase {
  version: number
  archived: boolean
}

/** What an archive answers: the category, and the children that followed it. */
export interface CategoryArchiveResult {
  category: Category
  children: Category[]
}

/**
 * Archives a category with its children, or brings them back. An unarchive adds to the live count,
 * so it is capped like a create (D1).
 */
export class CategoryArchiveCommand
  implements Command<CategoryArchivePayload, CategoryArchiveResult> {
  __resultType?: CategoryArchiveResult
  /** The household's plan cap on categories (`maxCategories`), set by the entitlement gate. */
  allowance?: number | null
  constructor(public data: CategoryArchivePayload) {}
}

export interface CategoryListPayload {
  actor: Actor
  groupId: string
}

export class CategoryListQuery implements Query<CategoryListPayload, { categories: Category[] }> {
  __resultType?: { categories: Category[] }
  constructor(public data: CategoryListPayload) {}
}

export interface CategoryGetPayload {
  actor: Actor
  groupId: string
  id: string
}

export class CategoryGetQuery implements Query<CategoryGetPayload, { category: Category }> {
  __resultType?: { category: Category }
  constructor(public data: CategoryGetPayload) {}
}
// #endregion Commands and queries

// #region Ports
interface CategoryInputBase {
  groupId: string
  id: string
  requestId?: string
}

/**
 * The household's plan cap on categories, as the entitlement gate read it; `null` is no cap. The
 * write counts again under the household's lock, so two requests cannot both take the last slot.
 */
interface CategoryAllowance {
  allowance: number | null
}

export interface CategoryCreateInput extends CategoryInputBase, CategoryFields, CategoryAllowance {}

export interface CategoryUpdateInput extends CategoryInputBase, CategoryFields {
  expectedVersion: number
}

export interface CategoryArchiveInput extends CategoryInputBase, CategoryAllowance {
  expectedVersion: number
  archived: boolean
}

/**
 * Where categories are kept. Every write checks the actor's role again on the locked membership
 * row (`lockActorRole`), reads the household's categories under that lock, checks the tree rules
 * and the caps, and records one change on the group in its own transaction (the group's sequence,
 * an outbox row and an audit event). Every id is looked up inside its group, so another
 * household's category is `CATEGORY_NOT_FOUND`, the same as one that does not exist. Nothing here
 * deletes a category.
 */
export interface CategoryRepository {
  /** The household's categories, archived ones included, by name. */
  list(groupId: string): Promise<Category[]>
  /** A category of the group; `null` for another group's or an unknown id. */
  get(groupId: string, id: string): Promise<Category | null>
  /**
   * Throws `ID_ALREADY_EXISTS`, a tree refusal ({@link assertNoCategoryProblem}),
   * `CATEGORY_LIMIT_REACHED`, or a `PlanError` when the plan's `allowance` is used up. A retry of
   * a create that landed is answered with its category.
   */
  create(input: CategoryCreateInput, actorId: number): Promise<CategoryWriteResult>
  /** Throws `CATEGORY_NOT_FOUND`, {@link CategoryVersionConflictError} or a tree refusal. */
  update(input: CategoryUpdateInput, actorId: number): Promise<Category>
  /**
   * Throws `CATEGORY_NOT_FOUND`, {@link CategoryVersionConflictError},
   * `CATEGORY_PARENT_ARCHIVED`, and for an unarchive `CATEGORY_LIMIT_REACHED` or a `PlanError`.
   */
  archive(input: CategoryArchiveInput, actorId: number): Promise<CategoryArchiveResult>
}
// #endregion Ports

// #region Export file
/**
 * One category in a household's export file: what a person set, where it sits and whether it was
 * archived. Never a person or a version.
 */
export const categoryExportEntrySchema = type({
  id: UUID_PATTERN,
  ...categoryFields,
  archived: "boolean",
  createdAt: "string.date.iso.parse",
  updatedAt: "string.date.iso.parse",
  "+": "reject",
})
export type CategoryExportEntry = typeof categoryExportEntrySchema.infer

/** What a refusal calls each field of a category in a file. */
const CATEGORY_EXPORT_LABELS = {
  id: "id",
  name: "name",
  kind: "kind",
  icon: "icon",
  color: "colour",
  parentId: "parent",
  archived: "archived flag",
  createdAt: "creation date",
  updatedAt: "last change date",
}

/** Checks one category of a file with the rules of a create. Throws `CategoryError`. */
export function parseCategoryExportEntry(entry: unknown): CategoryExportEntry {
  const shape = categoryExportEntrySchema(entry)
  if (shape instanceof type.errors) {
    throw new CategoryError(
      "INVALID_REQUEST",
      plainEntryProblem(shape, "category", CATEGORY_EXPORT_LABELS),
      fieldErrors(shape),
    )
  }
  return parseCategoryRequest(categoryExportEntrySchema, entry) as CategoryExportEntry
}

/** What a file's refusal says of each tree problem, and its issue code for the screen. */
const FILE_PROBLEMS: Record<CategoryProblem, { problem: string; code: string }> = {
  parentMissing: { problem: `its parent is not in the file`, code: `categoryParentMissing` },
  parentArchived: {
    problem: `it is in use, but its parent is archived`,
    code: `categoryParentArchived`,
  },
  ownParent: { problem: `it is its own parent`, code: `categoryOwnParent` },
  parentNested: { problem: `its parent has a parent`, code: `categoryParentNested` },
  hasChildren: { problem: `its parent has a parent`, code: `categoryParentNested` },
  kindMismatch: {
    problem: `its kind differs from its parent's`,
    code: `categoryKindMismatch`,
  },
  kindLocked: { problem: `its kind differs from its parent's`, code: `categoryKindMismatch` },
  nameTaken: {
    problem: `another category beside it has the same name`,
    code: `duplicateCategoryName`,
  },
}

/**
 * What is wrong across a file's categories: more than a household holds (index `null`), and each
 * entry that breaks the tree rules or shares a sibling's name, by index. The rules are the ones a
 * write checks ({@link categoryProblem}), with the whole file as the household.
 */
export function categoryExportProblems(
  categories: readonly Pick<
    CategoryExportEntry,
    "id" | "name" | "kind" | "parentId" | "archived"
  >[],
): { index: number | null; problem: string; issue: GroupImportIssue }[] {
  const problems: { index: number | null; problem: string; issue: GroupImportIssue }[] = []
  const live = categories.filter((category) => !category.archived).length
  if (live > CATEGORY_MAX_PER_GROUP || categories.length > CATEGORY_MAX_STORED) {
    const max = live > CATEGORY_MAX_PER_GROUP ? CATEGORY_MAX_PER_GROUP : CATEGORY_MAX_STORED
    const count = live > CATEGORY_MAX_PER_GROUP ? live : categories.length
    problems.push({
      index: null,
      problem: `the file holds ${count} categories, and a household holds at most ${max}`,
      issue: { code: "tooManyCategories", values: { count, max } },
    })
    return problems
  }
  // The tree rules see the whole file, so a parent may come after its children. Of two siblings
  // with one name only the second is named, so a name is checked against earlier entries only.
  const nodes = categories.map(node)
  nodes.forEach((category, index) => {
    const problem = categoryProblem(nodes, category)
    if (problem === null) return
    if (problem === "nameTaken" && !siblingNameTaken(nodes.slice(0, index), category)) return
    const { problem: text, code } = FILE_PROBLEMS[problem]
    problems.push({ index, problem: text, issue: { code } })
  })
  return problems
}

/** A file's entry, or a stored category, as the tree rules read it. */
function node(
  category: Pick<CategoryExportEntry, "id" | "name" | "kind" | "parentId" | "archived">,
): CategoryNode {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind as CategoryKind,
    parentId: category.parentId,
    archived: category.archived,
  }
}

/**
 * The file's categories with every parent before its children, so an import writes a parent's new
 * id before a child names it. The order among parents, and among children, is the file's.
 */
export function parentsFirst<C extends { parentId: string | null }>(categories: readonly C[]): C[] {
  return [
    ...categories.filter((category) => category.parentId === null),
    ...categories.filter((category) => category.parentId !== null),
  ]
}
// #endregion Export file

// #region Admin
/** How many households the operator's categories page lists, the ones with the most categories. */
export const ADMIN_CATEGORIES_HOUSEHOLD_LIMIT = 20

/**
 * What the operator's categories page shows: counts only. Never a category's name, colour or icon:
 * a name like "Therapy" says something personal about a household.
 */
export interface AdminCategoriesOverview {
  /** Categories in use. */
  categories: number
  archived: number
  /** Categories in use that sit under a parent. */
  subcategories: number
  /** Households with at least one category, archived ones included. */
  households: number
  /** One row per kind, in {@link CATEGORY_KINDS} order, categories in use. */
  byKind: { kind: CategoryKind; categories: number }[]
  /** The households with the most categories in use, at most the limit above. */
  topHouseholds: { groupId: string; groupName: string; categories: number }[]
}
// #endregion Admin
