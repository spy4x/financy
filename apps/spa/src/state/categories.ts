import { computed, signal } from "@preact/signals"
import { describeError, RealtimeRequestError } from "@spy4x/realtime"
import { ReadRefused } from "@spy4x/realtime/read-cache"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { COLOR_PRESETS } from "@spy4x/preact-ui/color-field"
import {
  CATEGORY_MAX_PER_GROUP,
  CATEGORY_NAME_MAX_LENGTH,
  type CategoryFields,
  type CategoryIcon,
  CategoryKind,
  DEFAULT_CATEGORY_ICON,
} from "@domain/categories"
import { type PlanRefusal, readPlanRefusal } from "@domain/billing"
import type { Message } from "@ui/message.ts"
import { apiAsUser } from "./realtime-call.ts"
import { READ_KEYS } from "./read-keys.ts"
import { refusedField } from "../i18n.ts"
import { callCommand, type LocalReads, localReads, noLocalReads } from "../modules.ts"

/** A category as the API sends it: dates are ISO strings, the sequence a decimal string. */
export interface CategoryItem {
  id: string
  groupId: string
  parentId: string | null
  name: string
  kind: CategoryKind
  icon: CategoryIcon
  color: string
  archivedAt: string | null
  version: number
  changeSequence: string
  createdAt: string
  updatedAt: string
}

interface Versioned {
  groupId: string
  id: string
  version: number
}

/** What an archive answers: the category and the children that followed it. */
export interface CategoryArchived {
  category: CategoryItem
  children: CategoryItem[]
}

/** What the categories store needs from the outside. Injected so tests need no network. */
export interface CategoriesDependencies {
  /** Reads every category of a household, archived ones included, over REST. */
  fetchList(groupId: string): Promise<CategoryItem[]>
  create(
    input: { groupId: string; id: string } & CategoryFields,
  ): Promise<{ category: CategoryItem }>
  update(input: Versioned & CategoryFields): Promise<{ category: CategoryItem }>
  archive(input: Versioned & { archived: boolean }): Promise<CategoryArchived>
  newId(): string
}

/** What the store says went wrong, as keys of the `app` catalog. */
export const CATEGORY_MESSAGES = {
  nameRequired: `CategoryMessages.nameRequired`,
  conflict: `CategoryMessages.conflict`,
  gone: `CategoryMessages.gone`,
  parentGone: `CategoryMessages.parentGone`,
  treeChanged: `CategoryMessages.treeChanged`,
  parentArchived: `CategoryMessages.parentArchived`,
  load: `CategoryMessages.load`,
  create: `CategoryMessages.create`,
  save: `CategoryMessages.save`,
  change: `CategoryMessages.change`,
} as const

const LIMIT: Message = { key: `CategoryMessages.limit`, values: { max: CATEGORY_MAX_PER_GROUP } }

/** The editor: the category being created (`id: null`) or edited, and what it was when opened. */
export interface CategoryForm extends CategoryFields {
  id: string | null
  version: number
  base: CategoryFields
}

export interface CategoryFormErrors {
  name: Message | null
  parent: Message | null
  form: Message | null
  /** The household's plan refused the new category: it has no paid plan. */
  plan: PlanRefusal | null
}

const NO_ERRORS: CategoryFormErrors = { name: null, parent: null, form: null, plan: null }

/** What a new category starts from: the kind and the parent the link that opened it named. */
export interface CategoryDraft {
  kind?: CategoryKind
  parentId?: string | null
}

function planRefusal(error: unknown): PlanRefusal | null {
  return error instanceof RealtimeRequestError ? readPlanRefusal(error.details) : null
}

/** The category code of a refused call (`CATEGORY_NOT_FOUND`, `VERSION_CONFLICT`...), or `null`. */
function categoryCode(error: unknown): string | null {
  if (!(error instanceof RealtimeRequestError)) return null
  const code = (error.details as { code?: unknown } | undefined)?.code
  return typeof code === "string" ? code : null
}

/** Whether the refusal names `field` (the parent a tree refusal is about). */
function namesField(error: unknown, field: string): boolean {
  const fields = error instanceof Error ? (error as { fields?: object }).fields : undefined
  return fields !== undefined && Object.hasOwn(fields, field)
}

function fieldsOf(category: CategoryItem): CategoryFields {
  return {
    name: category.name,
    kind: category.kind,
    parentId: category.parentId,
    icon: category.icon,
    color: category.color,
  }
}

function toForm(category: CategoryItem): CategoryForm {
  const base = fieldsOf(category)
  return { id: category.id, ...base, version: category.version, base }
}

function sameFields(a: CategoryFields, b: CategoryFields): boolean {
  return a.name === b.name && a.kind === b.kind && a.parentId === b.parentId &&
    a.icon === b.icon && a.color === b.color
}

/**
 * The categories of one household: the list (offline-readable, ADR 003 level 2, through the
 * device's copy) and the one editor the category pages open. Writes go to the server only, which
 * checks the tree; an archive answers with the children that followed it.
 */
export function createCategoriesStore(
  dependencies: CategoriesDependencies,
  device: LocalReads = noLocalReads,
) {
  const groupId = signal<string | null>(null)
  const categories = signal<readonly CategoryItem[]>([])
  const showArchived = signal(false)
  const loading = signal(false)
  const listError = signal<Message | null>(null)
  /** The plan's refusal of an unarchive: the household has no paid plan. */
  const listPlan = signal<PlanRefusal | null>(null)
  const form = signal<CategoryForm | null>(null)
  const formErrors = signal<CategoryFormErrors>(NO_ERRORS)
  const saving = signal(false)
  /** The category whose archive is in flight. */
  const pendingId = signal<string | null>(null)
  const byId = computed(() => new Map(categories.value.map((category) => [category.id, category])))
  const unsaved = computed(() => {
    const current = form.value
    return current !== null && !sameFields(current, current.base)
  })
  let reads = 0
  /** The id of the new category in the editor: every Save of that draft sends it. */
  let draftId = ""

  /** Reads the open household's categories again; a read answered for another group is dropped. */
  async function refresh(): Promise<void> {
    const id = groupId.value
    if (id === null) return
    const read = ++reads
    loading.value = true
    try {
      const { value } = await device.through(
        READ_KEYS.categories(id),
        () => dependencies.fetchList(id),
        (copy) => {
          if (read !== reads || groupId.value !== id) return false
          if (copy && categories.value.length > 0) return false
          categories.value = copy ? copy.value : []
        },
      )
      if (read !== reads || groupId.value !== id) return
      categories.value = value
      listError.value = null
    } catch (cause) {
      if (read !== reads || groupId.value !== id) return
      listError.value = describeError(cause, CATEGORY_MESSAGES.load)
    } finally {
      if (read === reads) loading.value = false
    }
  }

  /** Shows a household's categories. Opening the household already open reads it again. */
  function open(nextGroupId: string): Promise<void> {
    if (groupId.value !== nextGroupId) {
      reset()
      groupId.value = nextGroupId
    }
    return refresh()
  }

  /**
   * The colour a new category starts with: its parent's, or else the first preset no live
   * category of that kind uses at the top level, so siblings start apart.
   */
  function defaultColor(kind: CategoryKind, parentId: string | null): string {
    const parent = parentId === null ? undefined : byId.value.get(parentId)
    if (parent) return parent.color
    const used = new Set(
      categories.value
        .filter((c) => c.kind === kind && c.parentId === null && c.archivedAt === null)
        .map((c) => c.color),
    )
    return (COLOR_PRESETS.find((preset) => !used.has(preset.value)) ?? COLOR_PRESETS[0]).value
  }

  /** Opens the editor on a new category, of the draft's kind and under its parent. */
  function startCreate(draft: CategoryDraft = {}): void {
    if (form.value?.id === null) return
    const parent = draft.parentId ? byId.value.get(draft.parentId) : undefined
    const usable = parent && parent.parentId === null && parent.archivedAt === null
    const kind = usable ? parent.kind : draft.kind ?? CategoryKind.EXPENSE
    const parentId = usable ? parent.id : null
    const value: CategoryFields = {
      name: "",
      kind,
      parentId,
      icon: DEFAULT_CATEGORY_ICON,
      color: defaultColor(kind, parentId),
    }
    draftId = dependencies.newId()
    form.value = { id: null, ...value, version: 0, base: value }
    formErrors.value = NO_ERRORS
  }

  /** Opens the editor of a category; a form with unsaved changes on it is kept. */
  function startEdit(id: string): void {
    const category = byId.value.get(id)
    if (!category) return
    if (form.value?.id === id && unsaved.value) return
    const same = form.value?.id === id
    form.value = toForm(category)
    if (!same) formErrors.value = NO_ERRORS
  }

  /** Changes the editor's fields. A change of kind clears a parent of the other kind (R13). */
  function change(next: CategoryFields): void {
    if (!form.value) return
    const parent = next.parentId === null ? undefined : byId.value.get(next.parentId)
    const parentId = parent && parent.kind !== next.kind ? null : next.parentId
    form.value = { ...form.value, ...next, parentId }
    if (formErrors.value.parent && parentId !== form.value.base.parentId) {
      formErrors.value = { ...formErrors.value, parent: null }
    }
  }

  function revert(): void {
    if (!form.value) return
    form.value = { ...form.value, ...form.value.base }
    formErrors.value = NO_ERRORS
  }

  function closeForm(): void {
    form.value = null
    formErrors.value = NO_ERRORS
  }

  /** Puts `changed` in the list in place of their old copies. */
  function keep(...changed: CategoryItem[]): void {
    const ids = new Set(changed.map((category) => category.id))
    categories.value = [...changed, ...categories.value.filter((other) => !ids.has(other.id))]
  }

  /** The name refusal of a sibling clash, said with the parent's name or the kind. */
  function nameTaken(current: CategoryFields, name: string): Message {
    const parent = current.parentId === null ? undefined : byId.value.get(current.parentId)
    if (parent) {
      return { key: `CategoryMessages.nameTakenChild`, values: { parent: parent.name, name } }
    }
    return {
      key: current.kind === CategoryKind.INCOME
        ? `CategoryMessages.nameTakenIncome`
        : `CategoryMessages.nameTakenExpense`,
      values: { name },
    }
  }

  /**
   * Saves the editor: creates or updates. Resolves the category as saved; `null` when it was
   * refused or failed. A category that moved on is read again and shown as it is now.
   */
  async function save(): Promise<CategoryItem | null> {
    const forGroup = groupId.value
    const current = form.value
    if (!forGroup || !current || saving.value) return null
    const name = current.name.trim()
    if (!name) {
      formErrors.value = { ...NO_ERRORS, name: CATEGORY_MESSAGES.nameRequired }
      return null
    }
    const fields: CategoryFields = {
      name: Array.from(name).slice(0, CATEGORY_NAME_MAX_LENGTH).join(""),
      kind: current.kind,
      parentId: current.parentId,
      icon: current.icon,
      color: current.color,
    }
    saving.value = true
    formErrors.value = NO_ERRORS
    try {
      const { category } = current.id === null
        ? await dependencies.create({ groupId: forGroup, id: draftId, ...fields })
        : await dependencies.update({
          groupId: forGroup,
          id: current.id,
          version: current.version,
          ...fields,
        })
      keep(category)
      form.value = toForm(category)
      return category
    } catch (cause) {
      const code = categoryCode(cause)
      if (code === "CATEGORY_NOT_FOUND" && namesField(cause, "parentId")) {
        await refresh()
        formErrors.value = { ...NO_ERRORS, parent: CATEGORY_MESSAGES.parentGone }
      } else if (code === "VERSION_CONFLICT" || code === "CATEGORY_NOT_FOUND") {
        await refresh()
        const latest = current.id === null ? undefined : byId.value.get(current.id)
        form.value = latest ? toForm(latest) : null
        formErrors.value = {
          ...NO_ERRORS,
          form: latest && code === "VERSION_CONFLICT"
            ? CATEGORY_MESSAGES.conflict
            : CATEGORY_MESSAGES.gone,
        }
      } else if (code === "CATEGORY_NAME_TAKEN") {
        formErrors.value = { ...NO_ERRORS, name: nameTaken(fields, fields.name) }
      } else if (code === "CATEGORY_TREE_INVALID") {
        // Another member changed the tree since the form was opened: show it as it is now.
        await refresh()
        formErrors.value = { ...NO_ERRORS, form: CATEGORY_MESSAGES.treeChanged }
      } else if (code === "CATEGORY_LIMIT_REACHED") {
        formErrors.value = { ...NO_ERRORS, form: LIMIT }
      } else if (planRefusal(cause)) {
        formErrors.value = { ...NO_ERRORS, plan: planRefusal(cause) }
      } else {
        const nameError = refusedField(cause, "name")
        formErrors.value = {
          ...NO_ERRORS,
          name: nameError,
          form: nameError ? null : describeError(
            cause,
            current.id === null ? CATEGORY_MESSAGES.create : CATEGORY_MESSAGES.save,
          ),
        }
      }
      return null
    } finally {
      saving.value = false
    }
  }

  /**
   * Archives a category with its live children, or brings it back with them (D2). Resolves what
   * changed, or `null` with the list's error set; a plan refusal of an unarchive is `listPlan`.
   */
  async function archive(id: string, archived: boolean): Promise<CategoryArchived | null> {
    const forGroup = groupId.value
    const category = byId.value.get(id)
    if (!forGroup || !category || pendingId.value) return null
    pendingId.value = id
    listError.value = null
    listPlan.value = null
    try {
      const result = await dependencies.archive({
        groupId: forGroup,
        id,
        version: category.version,
        archived,
      })
      keep(result.category, ...result.children)
      if (form.value && form.value.id !== null) {
        const changed = byId.value.get(form.value.id)
        if (changed && [result.category, ...result.children].some((c) => c.id === changed.id)) {
          form.value = unsaved.value ? { ...form.value, version: changed.version } : toForm(changed)
        }
      }
      return result
    } catch (cause) {
      const code = categoryCode(cause)
      const plan = planRefusal(cause)
      listError.value = code === "VERSION_CONFLICT"
        ? CATEGORY_MESSAGES.conflict
        : code === "CATEGORY_NOT_FOUND"
        ? CATEGORY_MESSAGES.gone
        : code === "CATEGORY_PARENT_ARCHIVED"
        ? CATEGORY_MESSAGES.parentArchived
        : code === "CATEGORY_LIMIT_REACHED"
        ? LIMIT
        : plan
        ? null
        : describeError(cause, CATEGORY_MESSAGES.change)
      listPlan.value = plan
      if (code === "VERSION_CONFLICT" || code === "CATEGORY_NOT_FOUND") await refresh()
      return null
    } finally {
      pendingId.value = null
    }
  }

  function reset(): void {
    reads++
    groupId.value = null
    categories.value = []
    loading.value = false
    listError.value = null
    listPlan.value = null
    // A new category belongs to no household yet; an edited one belongs to the old household.
    if (form.value?.id !== null) form.value = null
    formErrors.value = NO_ERRORS
    saving.value = false
    pendingId.value = null
  }

  return {
    groupId,
    categories,
    showArchived,
    byId,
    loading,
    listError,
    listPlan,
    form,
    formErrors,
    saving,
    pendingId,
    unsaved,
    open,
    refresh,
    startCreate,
    startEdit,
    change,
    revert,
    closeForm,
    save,
    archive,
    reset,
  }
}

/** The categories as the server serves them: reads over REST, writes through the calls port. */
export const onlineCategories: CategoriesDependencies = {
  async fetchList(groupId) {
    const result = await apiAsUser<{ categories: CategoryItem[] }>(
      `/api/groups/${groupId}/categories`,
    )
    if (!result.ok) throw new ReadRefused(result.error.message, result.status, result.error.reason)
    return result.data.categories
  },
  create: (input) => callCommand("category.create", input),
  update: (input) => callCommand("category.update", input),
  archive: (input) => callCommand("category.archive", input),
  newId: () => uuidV7(),
}

/** The page's own store, reading through the device's copy of the list. */
export const categoriesStore = createCategoriesStore(onlineCategories, localReads)
