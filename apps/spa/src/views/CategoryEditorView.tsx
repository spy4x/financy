import { useEffect } from "preact/hooks"
import { useLocation, useSearch } from "wouter-preact"
import { createOnlineStatus } from "@spy4x/preact-signals/online"
import { UnsavedGuard } from "@spy4x/preact-ui/unsaved-guard"
import { isolate } from "@spy4x/preact-ui/bdi"
import { COLOR_PRESETS } from "@spy4x/preact-ui/color-field"
import { canMutateNotes } from "@domain/groups"
import { CategoryKind, DEFAULT_CATEGORY_ICON } from "@domain/categories"
import { CategoryEditorScreen } from "@ui/category-editor-screen.tsx"
import { CATEGORY_PATHS } from "@ui/progressive.tsx"
import { useAppText } from "@ui/i18n.ts"
import { categoriesStore } from "../state/categories.ts"
import { groupsStore } from "../state/groups.ts"
import { selectionStore } from "../state/selection.ts"
import { toasts } from "../state/toasts.ts"
import { isSpaPath } from "./spa-paths.ts"
import { categoryActions } from "./category-actions.ts"
import { categoryRow } from "./CategoriesView.tsx"

const network = createOnlineStatus()

/** What `/categories/new?kind=income&parent={id}` asks the new category to start as. */
export function draftFromSearch(search: string): { kind?: CategoryKind; parentId?: string } {
  const params = new URLSearchParams(search)
  return {
    ...(params.get("kind") === "income" && { kind: CategoryKind.INCOME }),
    ...(params.get("parent") && { parentId: params.get("parent")! }),
  }
}

/**
 * Wires the category editor to the categories store: `/categories/new` (no `categoryId`) creates a
 * category in the person's selected household, `/categories/:categoryId` edits one of its
 * categories. A created category takes the create page's place in the history. Leaving with
 * unsaved changes asks first.
 */
export function CategoryEditorView({ categoryId = null }: { categoryId?: string | null }) {
  const [, navigate] = useLocation()
  const search = useSearch()
  const t = useAppText()
  const store = categoriesStore
  const groupId = selectionStore.groupId.value
  useEffect(() => network.watch(), [])
  useEffect(() => {
    if (groupId) void store.open(groupId)
  }, [groupId])
  const membership = groupId
    ? groupsStore.groups.value.find((group) => group.id === groupId)
    : undefined
  const canWrite = membership ? canMutateNotes(membership.role) : false
  const category = categoryId === null ? undefined : store.byId.value.get(categoryId)
  const form = store.form.value
  const listLoading = store.loading.value || store.groupId.value !== groupId
  // A new category waits for the list, so its parent and its colour come from what the household
  // holds; a link's `?parent=` names a category the list must know.
  useEffect(() => {
    if (categoryId === null) {
      if (!listLoading) store.startCreate(draftFromSearch(search))
    } else if (category) store.startEdit(category.id)
  }, [categoryId, category, form === null, listLoading])
  const editing = categoryId !== null && form?.id === categoryId ? form : null
  const creating = categoryId === null && form?.id === null ? form : null
  const value = editing ?? creating ?? category ?? {
    name: "",
    kind: CategoryKind.EXPENSE,
    parentId: null,
    icon: DEFAULT_CATEGORY_ICON,
    color: COLOR_PRESETS[0].value,
  }
  const groupLoading = !membership && (groupsStore.loading.value || groupId === null)
  const actions = canWrite ? categoryActions(t, store, toasts) : undefined
  return (
    <>
      <CategoryEditorScreen
        group={membership ? { id: membership.id, name: membership.name, canWrite } : null}
        loading={groupLoading || (categoryId !== null && !category && listLoading)}
        notFound={categoryId !== null && !category && !listLoading && !groupLoading}
        category={category ? categoryRow(category) : null}
        categories={store.categories.value.map(categoryRow)}
        value={{
          name: value.name,
          kind: value.kind,
          parentId: value.parentId,
          icon: value.icon,
          color: value.color,
        }}
        onChange={(next) => store.change(next)}
        errors={{
          ...store.formErrors.value,
          form: store.formErrors.value.form ?? (category ? store.listError.value : null),
          plan: store.formErrors.value.plan ?? (category ? store.listPlan.value : null),
        }}
        saving={store.saving.value}
        dirty={store.unsaved.value}
        onSave={async () => {
          const created = categoryId === null
          const result = await store.save()
          if (!result) return
          // A created category shows itself: the editor turns into its page. A saved edit stays on
          // the same page, so it gets a toast.
          if (created) {
            navigate(CATEGORY_PATHS.category(result.id), { replace: true })
            return
          }
          toasts.success({
            title: t.t(`CategoriesView.savedTitle`),
            body: t.t(`CategoriesView.saved`, { name: isolate(result.name) }),
            dataE2E: "category-saved",
          })
        }}
        onRevert={() => store.revert()}
        pending={store.pendingId.value !== null}
        onArchive={actions && category
          ? (archived) => void actions.onArchive(category.id, archived)
          : undefined}
        offline={!network.online.value}
        navigate={navigate}
      />
      <UnsavedGuard
        when={canWrite && store.unsaved.value}
        owns={(url) => isSpaPath(url.pathname)}
        navigate={navigate}
        labels={{
          title: t.t(`CategoriesView.discardTitle`),
          message: category
            ? t.t(`CategoriesView.discard`, { name: isolate(category.name) })
            : t.t(`CategoriesView.discardNew`),
          leave: t.t(`CategoriesView.discardLeave`),
          stay: t.t(`CategoriesView.discardStay`),
        }}
        onDiscard={() => store.closeForm()}
      />
    </>
  )
}
