import { useEffect } from "preact/hooks"
import { useLocation } from "wouter-preact"
import { canMutateNotes } from "@domain/groups"
import { CategoriesScreen } from "@ui/categories-screen.tsx"
import type { CategoryRow } from "@ui/category-parts.tsx"
import { useAppText } from "@ui/i18n.ts"
import { categoriesStore, type CategoryItem } from "../state/categories.ts"
import { groupsStore } from "../state/groups.ts"
import { selectionStore } from "../state/selection.ts"
import { toasts } from "../state/toasts.ts"
import { categoryActions } from "./category-actions.ts"

/** What the screens draw of a category as the store holds it. */
export function categoryRow(category: CategoryItem): CategoryRow {
  return {
    id: category.id,
    name: category.name,
    kind: category.kind,
    parentId: category.parentId,
    icon: category.icon,
    color: category.color,
    archived: category.archivedAt !== null,
  }
}

/**
 * Wires the categories page to the categories store for `/categories`: the categories of the
 * person's selected household. Whoever may write notes may change categories; a viewer reads them.
 */
export function CategoriesView() {
  const [, navigate] = useLocation()
  const t = useAppText()
  const store = categoriesStore
  const groupId = selectionStore.groupId.value
  useEffect(() => {
    if (groupId) void store.open(groupId)
  }, [groupId])
  const membership = groupId
    ? groupsStore.groups.value.find((group) => group.id === groupId)
    : undefined
  const canWrite = membership ? canMutateNotes(membership.role) : false
  return (
    <CategoriesScreen
      group={membership ? { id: membership.id, name: membership.name, canWrite } : null}
      categories={store.categories.value.map(categoryRow)}
      showArchived={store.showArchived.value}
      onShowArchived={(show) => void (store.showArchived.value = show)}
      loading={store.loading.value || groupsStore.loading.value || groupId === null}
      listError={store.listError.value}
      listPlan={store.listPlan.value}
      pendingId={store.pendingId.value}
      actions={canWrite ? categoryActions(t, store, toasts) : undefined}
      navigate={navigate}
    />
  )
}
