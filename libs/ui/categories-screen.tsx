import type { ComponentChildren, JSX, Ref } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { Badge } from "@spy4x/preact-ui/badge"
import { Button } from "@spy4x/preact-ui/button"
import { ConfirmDialog } from "@spy4x/preact-ui/confirm-dialog"
import { Dropdown, DropdownItem } from "@spy4x/preact-ui/dropdown"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { Link } from "@spy4x/preact-ui/link"
import { Stack } from "@spy4x/preact-ui/layout"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { PageAction, PageHeader } from "@spy4x/preact-ui/page-header"
import { isolate } from "@spy4x/preact-ui/bdi"
import { IconEllipsisVertical, IconPlus } from "@spy4x/preact-icons"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { CATEGORY_KINDS, CategoryKind } from "@domain/categories"
import type { PlanRefusal } from "@domain/billing"
import {
  ListCard,
  ListEmpty,
  MENU_TRIGGER_CLASSES,
  NoGroup,
  type NotesGroup,
} from "./notes-screen.tsx"
import {
  CategoryChip,
  type CategoryRow,
  liveChildren,
  placeCategories,
  type PlacedCategory,
} from "./category-parts.tsx"
import { useWaited } from "./tag-editor-screen.tsx"
import { CATEGORY_PATHS, type Navigate } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"
import { type Message, messageText } from "./message.ts"
import { PlanRefusalNotice } from "./plan-refusal.tsx"

export type { CategoryRow }

/** The changes a row's menu offers; left out for a viewer. */
export interface CategoryActions {
  /** Archives or brings back a category; a parent's subcategories follow it. */
  onArchive(id: string, archived: boolean): Promise<void>
}

export interface CategoriesScreenProps {
  /** `null` while the group is not known yet (loading), or when the person is not a member. */
  group: NotesGroup | null
  /** Every category of the household, archived ones included. */
  categories: readonly CategoryRow[]
  showArchived: boolean
  onShowArchived?: (show: boolean) => void
  loading: boolean
  /** The error of the list itself, such as a failed read or a refused change. */
  listError: Message | null
  /** The plan's refusal of an unarchive: the household has no paid plan. Shown in its place. */
  listPlan?: PlanRefusal | null
  /** The category whose change is in flight: its menu is disabled meanwhile. */
  pendingId?: string | null
  actions?: CategoryActions
  navigate?: Navigate
}

/**
 * A household's categories at `/categories`: Expenses, then Income, each parent followed by its
 * subcategories, each drawn as its colour and icon beside its name. "New category" and each name
 * lead to the editor; each row's menu archives or brings back. Archiving a parent that has
 * subcategories asks first, since they go with it. Archived categories show only on request.
 */
export function CategoriesScreen(props: CategoriesScreenProps): JSX.Element {
  const { group, categories, navigate } = props
  const t = useAppText()
  const [confirming, setConfirming] = useState<CategoryRow | null>(null)
  const [focusAfter, setFocusAfter] = useState<{ id: string; index: number } | null>(null)
  const page = useRef<HTMLDivElement>(null)
  const shown = categories.filter((category) => props.showArchived || !category.archived)
  // An archived row leaves the list unless archived ones are shown, which would leave focus on the
  // page's body. It goes to the next row's menu, else the previous row's, else "New category".
  useEffect(() => {
    if (!focusAfter) return
    if (props.listError) return setFocusAfter(null)
    if (shown.some((category) => category.id === focusAfter.id)) return
    const root = page.current
    const menus = root?.querySelectorAll<HTMLElement>("[data-e2e=category-menu]")
    const next = menus?.[focusAfter.index] ?? menus?.[focusAfter.index - 1]
    ;(next ?? root?.querySelector<HTMLElement>("[data-e2e=category-new]"))?.focus()
    setFocusAfter(null)
  }, [focusAfter, categories, props.showArchived, props.listError])
  if (!group) {
    return (
      <Page>
        <PageHeader title={t.t(`Categories.title`)} />
        <NoGroup loading={props.loading} navigate={navigate} />
      </Page>
    )
  }
  const canWrite = group.canWrite && props.actions !== undefined
  async function archive(category: CategoryRow, archived: boolean): Promise<void> {
    const rows = [
      ...(page.current?.querySelectorAll<HTMLElement>("[data-e2e=category-menu]") ?? []),
    ]
    const index = rows.findIndex((menu) => menu.closest(`[data-category="${category.id}"]`))
    await props.actions!.onArchive(category.id, archived)
    if (archived && !props.showArchived) setFocusAfter({ id: category.id, index })
  }
  function askArchive(category: CategoryRow): void {
    if (liveChildren(categories, category.id).length > 0) setConfirming(category)
    else void archive(category, true)
  }
  return (
    <Page pageRef={page}>
      <PageHeader
        title={t.t(`Categories.title`)}
        subtitle={group.name}
        subtitleDataE2E="categories-group"
        action={canWrite && (
          <PageAction
            label={t.t(`Categories.add`)}
            Icon={IconPlus}
            href={CATEGORY_PATHS.new}
            navigate={navigate}
            dataE2E="category-new"
          />
        )}
        menuDataE2E="categories-menu"
        menu={
          <DropdownItem
            onClick={() => props.onShowArchived?.(!props.showArchived)}
            dataE2E="categories-toggle-archived"
          >
            {props.showArchived ? t.t(`Categories.hideArchived`) : t.t(`Categories.showArchived`)}
          </DropdownItem>
        }
      />
      <Stack>
        {!group.canWrite && (
          <p class="text-sm text-muted" data-e2e="categories-read-only">
            {t.t(`Categories.readOnly`)}
          </p>
        )}
        {props.listPlan
          ? <PlanRefusalNotice groupId={group.id} refusal={props.listPlan} navigate={navigate} />
          : <ErrorState message={messageText(t, props.listError)} dataE2E="categories-error" />}
        <Live
          {...props}
          shown={shown}
          canWrite={canWrite}
          onArchive={askArchive}
          onUnarchive={(category) => void archive(category, false)}
        />
      </Stack>
      {confirming && (
        <ArchiveCategoryDialog
          category={confirming}
          subcategories={liveChildren(categories, confirming.id)}
          onConfirm={() => {
            const category = confirming
            setConfirming(null)
            void archive(category, true)
          }}
          onCancel={() => setConfirming(null)}
        />
      )}
    </Page>
  )
}

/**
 * The question before a parent with subcategories is archived: they are archived too, and how
 * many categories that makes. Focus starts on Cancel.
 */
export function ArchiveCategoryDialog(
  { category, subcategories, onConfirm, onCancel }: {
    category: CategoryRow
    subcategories: readonly CategoryRow[]
    onConfirm: () => void
    onCancel: () => void
  },
): JSX.Element {
  const t = useAppText()
  const names = new Intl.ListFormat(t.language, { type: "conjunction" })
    .format(subcategories.map((child) => isolate(child.name)))
  return (
    <ConfirmDialog
      title={t.t(`Categories.archiveTitle`, {
        name: isolate(category.name),
        count: subcategories.length,
      })}
      message={t.t(`Categories.archiveMessage`, { names, count: subcategories.length })}
      confirmLabel={t.t(`Categories.archiveConfirm`, { count: subcategories.length + 1 })}
      cancelLabel={t.t(`Categories.cancel`)}
      tone="default"
      onConfirm={onConfirm}
      onCancel={onCancel}
      dataE2E="category-archive-dialog"
      confirmDataE2E="category-archive-confirm"
      cancelDataE2E="category-archive-cancel"
    />
  )
}

type Listed = CategoriesScreenProps & {
  shown: readonly CategoryRow[]
  canWrite: boolean
  onArchive(category: CategoryRow): void
  onUnarchive(category: CategoryRow): void
}

/** The heading of a kind's section: "Expenses" or "Income". */
function sectionName(t: Translator<string>, kind: CategoryKind): string {
  return kind === CategoryKind.INCOME ? t.t(`Categories.income`) : t.t(`Categories.expenses`)
}

/** The two sections, Expenses then Income, or the page's empty and loading states. */
function Live(props: Listed): JSX.Element | null {
  const t = useAppText()
  const { canWrite, navigate, shown, categories } = props
  const waited = useWaited(props.loading && categories.length === 0)
  if (categories.length === 0) {
    if (props.loading) {
      return waited
        ? (
          <div data-e2e="categories-loading">
            <p role="status" class="sr-only">{t.t(`Categories.loading`)}</p>
            <LoadingSkeleton rows={6} />
          </div>
        )
        : null
    }
    return (
      <ListEmpty
        title={canWrite ? t.t(`Categories.empty`) : t.t(`Categories.emptyViewer`)}
        description={canWrite ? t.t(`Categories.emptyHint`) : undefined}
        action={canWrite && (
          <Button
            href={CATEGORY_PATHS.new}
            navigate={navigate}
            variant="secondary"
            data-e2e="category-new-empty"
          >
            {t.t(`Categories.addFirst`)}
          </Button>
        )}
      />
    )
  }
  if (shown.length === 0) return <ListEmpty title={t.t(`Categories.allArchived`)} />
  return (
    <>
      {CATEGORY_KINDS.map((kind) => {
        const rows = placeCategories(shown.filter((c) => c.kind === kind), t.language)
        const live = categories.filter((c) => c.kind === kind && !c.archived).length
        const heading = `categories-kind-${kind}`
        return (
          <section key={kind} aria-labelledby={heading} class="flex flex-col gap-2">
            <h2 id={heading} class="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
              {sectionName(t, kind)} · {live}
            </h2>
            {rows.length === 0
              ? (
                <p class="px-1 text-sm text-muted" data-e2e={`category-section-empty-${kind}`}>
                  {kind === CategoryKind.INCOME
                    ? t.t(`Categories.noIncome`)
                    : t.t(`Categories.noExpenses`)} {canWrite && (
                    <Link
                      href={kind === CategoryKind.INCOME
                        ? CATEGORY_PATHS.newIncome
                        : CATEGORY_PATHS.new}
                      navigate={navigate}
                      data-e2e={`category-section-add-${kind}`}
                    >
                      {t.t(`Categories.addOne`)}
                    </Link>
                  )}
                </p>
              )
              : (
                <ListCard dataE2E={`category-list-${kind}`}>
                  {rows.map((placed) => (
                    <Row key={placed.category.id} placed={placed} {...props}>
                      {canWrite && <RowMenu placed={placed} {...props} />}
                    </Row>
                  ))}
                </ListCard>
              )}
          </section>
        )
      })}
    </>
  )
}

/** A row's menu: edit, add a subcategory under a live top-level one, archive or bring back. */
function RowMenu({ placed, ...props }: Listed & { placed: PlacedCategory }): JSX.Element {
  const t = useAppText()
  const { category, parent } = placed
  const busy = props.pendingId === category.id
  const topLevel = category.parentId === null
  // A subcategory under an archived parent comes back with it, never alone (D2).
  const parentArchived = parent?.archived ??
    (category.parentId !== null &&
      props.categories.find((c) => c.id === category.parentId)?.archived === true)
  const parentName = parent?.name ??
    props.categories.find((c) => c.id === category.parentId)?.name ?? ""
  return (
    <Dropdown
      trigger={<IconEllipsisVertical class="size-5" />}
      triggerLabel={t.t(`Categories.actions`, { name: category.name })}
      triggerClasses={MENU_TRIGGER_CLASSES}
      triggerDataE2E="category-menu"
    >
      <DropdownItem
        href={CATEGORY_PATHS.category(category.id)}
        navigate={props.navigate}
        dataE2E="category-menu-edit"
      >
        {t.t(`Categories.edit`)}
      </DropdownItem>
      {topLevel && !category.archived && (
        <DropdownItem
          href={CATEGORY_PATHS.newChild(category.id)}
          navigate={props.navigate}
          dataE2E="category-menu-add-child"
        >
          {t.t(`Categories.addChild`)}
        </DropdownItem>
      )}
      {!category.archived && (
        <DropdownItem
          onClick={() => props.onArchive(category)}
          disabled={busy}
          dataE2E="category-archive"
        >
          {t.t(`Categories.archive`)}
        </DropdownItem>
      )}
      {category.archived && (
        <DropdownItem
          onClick={() => props.onUnarchive(category)}
          disabled={busy || parentArchived}
          dataE2E="category-unarchive"
        >
          {parentArchived
            ? t.t(`Categories.unarchiveParentFirst`, { parent: isolate(parentName) })
            : t.t(`Categories.unarchive`)}
        </DropdownItem>
      )}
    </Dropdown>
  )
}

/**
 * One category: its chip, its name (a link to its editor) and its menu. A subcategory sits
 * indented, its smaller chip lined up with its parent's name, and its link names the parent.
 */
function Row(
  { placed, navigate, children }: Listed & { placed: PlacedCategory; children?: ComponentChildren },
): JSX.Element {
  const t = useAppText()
  const { category, parent } = placed
  // An archived category reads as set aside by its badge and a muted name, never by fading the
  // row: opacity would drop the text below the house contrast.
  const muted = category.archived ? "text-muted" : ""
  return (
    <li
      class={`flex min-h-11 items-center gap-3 px-4 py-2 sm:min-h-9 sm:px-6 ${
        parent ? "ps-16 sm:ps-16" : ""
      }`}
      data-category={category.id}
      data-e2e={`category-${category.id}`}
    >
      <CategoryChip icon={category.icon} color={category.color} size={parent ? "sm" : "md"} />
      <Link
        href={CATEGORY_PATHS.category(category.id)}
        navigate={navigate}
        class={`min-w-0 flex-1 truncate rounded-sm font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus ${muted}`}
        title={category.name}
        data-e2e="category-name"
      >
        <bdi>{category.name}</bdi>
        {parent && (
          <span class="sr-only">
            {t.t(`Categories.inParent`, { parent: isolate(parent.name) })}
          </span>
        )}
      </Link>
      {category.archived && (
        <Badge text={t.t(`Categories.archivedBadge`)} color="gray" type="outline" />
      )}
      {children && <div class="relative -my-2 -me-2 shrink-0">{children}</div>}
    </li>
  )
}

/** The page's content, in the column the app's frame sets: never a width of its own. */
function Page(
  { children, pageRef }: { children?: ComponentChildren; pageRef?: Ref<HTMLDivElement> },
): JSX.Element {
  return <div ref={pageRef} class="flex flex-col gap-8">{children}</div>
}
