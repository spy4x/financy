import type { JSX } from "preact"
import { ICONS } from "@spy4x/preact-icons/registry"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { type CategoryIcon, CategoryKind, DEFAULT_CATEGORY_ICON } from "@domain/categories"
import { colorStyle } from "./tag-parts.tsx"

/** A category as the screens draw it. */
export interface CategoryRow {
  id: string
  name: string
  kind: CategoryKind
  parentId: string | null
  icon: CategoryIcon
  color: string
  archived: boolean
}

/** A row of the list in the order it is drawn: a parent, then its subcategories. */
export interface PlacedCategory {
  category: CategoryRow
  /** The parent's row, for a subcategory drawn under it. */
  parent: CategoryRow | null
}

const CHIP = {
  md: { box: "size-8 rounded-md", icon: "size-5" },
  sm: { box: "size-6 rounded", icon: "size-4" },
} as const

/**
 * A category's mark: its icon on its colour, the icon black or white, whichever reads better.
 * Decorative: the name beside it carries the meaning. `md` for a top-level category, `sm` for a
 * subcategory and for tight rows.
 */
export function CategoryChip(
  { icon, color, size = "md" }: Pick<CategoryRow, "icon" | "color"> & { size?: "md" | "sm" },
): JSX.Element {
  const Icon = (ICONS[icon] ?? ICONS[DEFAULT_CATEGORY_ICON]).Icon
  return (
    <span
      class={`flex shrink-0 items-center justify-center border ${CHIP[size].box}`}
      style={colorStyle(color)}
      aria-hidden="true"
      data-e2e="category-chip"
    >
      <Icon class={CHIP[size].icon} />
    </span>
  )
}

/** "Expense" or "Income": one category's kind. */
export function categoryKindName(t: Translator<string>, kind: CategoryKind): string {
  return kind === CategoryKind.INCOME ? t.t(`CategoryParts.income`) : t.t(`CategoryParts.expense`)
}

/**
 * The categories in the order the list draws them: each top-level category by name, folded, in
 * the person's language, each followed by its subcategories by name. A subcategory whose parent
 * is not among `rows` (it is hidden) is drawn at the top level, so it is never lost.
 */
export function placeCategories(
  rows: readonly CategoryRow[],
  language: string,
): PlacedCategory[] {
  const collator = new Intl.Collator(language, { sensitivity: "base", numeric: true })
  const byName = (a: CategoryRow, b: CategoryRow) =>
    collator.compare(a.name, b.name) || (a.id < b.id ? -1 : 1)
  const ids = new Set(rows.map((row) => row.id))
  const top = rows.filter((row) => row.parentId === null || !ids.has(row.parentId)).sort(byName)
  return top.flatMap((parent) => [
    { category: parent, parent: null },
    ...rows.filter((row) => row.parentId === parent.id).sort(byName)
      .map((category) => ({ category, parent })),
  ])
}

/** The live subcategories of `id`: the ones an archive of it takes along. */
export function liveChildren(rows: readonly CategoryRow[], id: string): CategoryRow[] {
  return rows.filter((row) => row.parentId === id && !row.archived)
}
