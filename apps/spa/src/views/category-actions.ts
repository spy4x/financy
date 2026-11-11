import type { Translator } from "@spy4x/platform/universal/i18n"
import { isolate } from "@spy4x/preact-ui/bdi"
import type { CategoryActions } from "@ui/categories-screen.tsx"
import type { categoriesStore } from "../state/categories.ts"
import type { toasts } from "../state/toasts.ts"

/** How long an archive's toast offers Undo. */
export const CATEGORY_UNDO_MS = 8_000

/**
 * The menu changes of the list and the editor. An archive's toast offers Undo for
 * {@link CATEGORY_UNDO_MS}, which brings the category back with the subcategories that followed
 * it, in one step. Repeated archives share one toast, so they never stack over the list.
 */
export function categoryActions(
  t: Translator<string>,
  store: typeof categoriesStore,
  toastList: typeof toasts,
): CategoryActions {
  const actions: CategoryActions = {
    async onArchive(id, archived) {
      const result = await store.archive(id, archived)
      if (!result) return
      const name = isolate(result.category.name)
      const count = result.children.length
      const body = archived
        ? count > 0
          ? t.t(`CategoriesView.archivedWithChildren`, { name, count })
          : t.t(`CategoriesView.archived`, { name })
        : count > 0
        ? t.t(`CategoriesView.unarchivedWithChildren`, { name, count })
        : t.t(`CategoriesView.unarchived`, { name })
      toastList.success({
        id: `category-archived`,
        title: archived
          ? t.t(`CategoriesView.archivedTitle`)
          : t.t(`CategoriesView.unarchivedTitle`),
        body,
        dataE2E: "category-archived",
        ...(archived && {
          duration: CATEGORY_UNDO_MS,
          action: {
            label: t.t(`CategoriesView.undo`),
            dataE2E: "category-undo",
            onAction: () => void actions.onArchive(id, false),
          },
        }),
      })
    },
  }
  return actions
}
