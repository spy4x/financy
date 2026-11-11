import type { ComponentChildren, JSX } from "preact"
import { useEffect, useRef } from "preact/hooks"
import { Badge } from "@spy4x/preact-ui/badge"
import { Button } from "@spy4x/preact-ui/button"
import { ColorField } from "@spy4x/preact-ui/color-field"
import { Combobox } from "@spy4x/preact-ui/combobox"
import { DropdownItem } from "@spy4x/preact-ui/dropdown"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { FactList } from "@spy4x/preact-ui/fact-list"
import { Field } from "@spy4x/preact-ui/field"
import { IconPicker } from "@spy4x/preact-ui/icon-picker"
import { Input } from "@spy4x/preact-ui/input"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { Stack } from "@spy4x/preact-ui/layout"
import { Notice } from "@spy4x/preact-ui/notice"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { SegmentedControl } from "@spy4x/preact-ui/segmented-control"
import { isolate } from "@spy4x/preact-ui/bdi"
import { CATEGORY_ICONS, ICONS } from "@spy4x/preact-icons/registry"
import { isApplePlatform, matchesHotkey, parseHotkey } from "@spy4x/platform/browser/hotkeys"
import {
  CATEGORY_NAME_MAX_LENGTH,
  type CategoryFields,
  type CategoryIcon,
  CategoryKind,
} from "@domain/categories"
import type { PlanRefusal } from "@domain/billing"
import { ListEmpty, NoGroup, type NotesGroup } from "./notes-screen.tsx"
import { CategoryChip, categoryKindName, type CategoryRow } from "./category-parts.tsx"
import { colorName } from "./tag-parts.tsx"
import { FORM_WIDTH, useWaited } from "./tag-editor-screen.tsx"
import { CATEGORY_PATHS, type Navigate, ScreenForm } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"
import { type Message, messageText } from "./message.ts"
import { PlanRefusalNotice } from "./plan-refusal.tsx"

/** The errors of the category editor: per field, and for the form as a whole. */
export interface CategoryFormErrors {
  name: Message | null
  parent: Message | null
  form: Message | null
  /** The household's plan refused the new category; shown with a way to the plan. */
  plan?: PlanRefusal | null
}

export interface CategoryEditorScreenProps {
  /** `null` while the group is not known yet (loading), or when the person is not a member. */
  group: NotesGroup | null
  /** The group, or the edited category, is still being read. */
  loading: boolean
  /** The category is not in this household: gone, never there, or another household's. */
  notFound: boolean
  /** The category being edited, as saved, or `null` on the create page. */
  category: CategoryRow | null
  /** Every category of the household: the parents to offer, and what locks a field. */
  categories: readonly CategoryRow[]
  value: CategoryFields
  onChange?: (value: CategoryFields) => void
  errors: CategoryFormErrors
  saving: boolean
  /** The fields differ from the saved category; an existing one shows Save only then. */
  dirty: boolean
  onSave?: () => void
  onRevert?: () => void
  /** A change from the page's menu is in flight. */
  pending?: boolean
  onArchive?: (archived: boolean) => void
  /** The device has no network: changes wait until it is back, which the page says. */
  offline?: boolean
  navigate?: Navigate
}

/**
 * One category on a page of its own, at `/categories/new` and `/categories/:id`: name, kind,
 * parent, icon and colour. The header previews the chip as the list will draw it. The tree rules
 * show as locked fields with their reason under them: a subcategory takes its parent's kind, and a
 * parent with subcategories keeps its kind and stays at the top level. A viewer sees the fields as
 * facts.
 */
export function CategoryEditorScreen(props: CategoryEditorScreenProps): JSX.Element {
  const { group, navigate } = props
  const t = useAppText()
  const back = { href: CATEGORY_PATHS.list, label: t.t(`CategoryEditor.back`) }
  const waited = useWaited(props.loading)
  if (!group || props.notFound || (props.loading && !props.category)) {
    return (
      <Page>
        <PageHeader
          back={back}
          navigate={navigate}
          title={t.t(`CategoryEditor.title`)}
          subtitle={group?.name}
        />
        {!group && !props.loading && <NoGroup loading={false} navigate={navigate} />}
        {group && props.notFound && (
          <div data-e2e="category-not-found">
            <ListEmpty
              title={t.t(`CategoryEditor.notFound`)}
              description={messageText(t, props.errors.form) ?? t.t(`CategoryEditor.notFoundHint`)}
              action={
                <Button href={CATEGORY_PATHS.list} navigate={navigate} variant="outline">
                  {t.t(`CategoryEditor.back`)}
                </Button>
              }
            />
          </div>
        )}
        {props.loading && waited && (
          <div data-e2e="category-loading">
            <p role="status" class="sr-only">{t.t(`CategoryEditor.loading`)}</p>
            <LoadingSkeleton rows={3} class={FORM_WIDTH} />
          </div>
        )}
      </Page>
    )
  }
  return <Editor {...props} group={group} />
}

/** Why a field is locked, or `null` when it is free. */
interface Locks {
  kind: string | null
  parent: string | null
}

/** The tree rules (R13) as locks on the kind and the parent, each with its reason. */
function locksOf(
  t: ReturnType<typeof useAppText>,
  props: CategoryEditorScreenProps,
  parents: readonly CategoryRow[],
): Locks {
  const { category, categories, value } = props
  const name = category ? isolate(category.name) : ""
  const hasChildren = category !== null &&
    categories.some((other) => other.parentId === category.id)
  const kind = value.parentId !== null
    ? t.t(`CategoryEditor.kindLockedChild`)
    : hasChildren
    ? t.t(`CategoryEditor.kindLockedParent`, { name })
    : null
  const parent = hasChildren
    ? t.t(`CategoryEditor.parentLockedParent`, { name })
    : parents.length === 0
    ? value.kind === CategoryKind.INCOME
      ? t.t(`CategoryEditor.noParentIncome`)
      : t.t(`CategoryEditor.noParentExpense`)
    : null
  return { kind, parent }
}

function Editor(props: CategoryEditorScreenProps & { group: NotesGroup }): JSX.Element {
  const { group, category, categories, value, onChange, errors, saving, navigate } = props
  const t = useAppText()
  const canWrite = group.canWrite
  const name = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (errors.name) name.current?.focus()
  }, [errors.name])
  // The parents a category may sit under: live top-level categories of its kind, never itself.
  const parents = categories.filter((other) =>
    other.parentId === null && !other.archived && other.kind === value.kind &&
    other.id !== category?.id
  )
  const parent = value.parentId === null
    ? null
    : categories.find((other) => other.id === value.parentId) ?? null
  const locks = locksOf(t, props, parents)
  const shownName = value.name.trim() ||
    (category ? category.name : t.t(`CategoryEditor.new`))
  const parentArchived = category?.archived === true && parent?.archived === true
  const menu = canWrite && category && props.onArchive && (
    <>
      {category.parentId === null && !category.archived && (
        <DropdownItem
          href={CATEGORY_PATHS.newChild(category.id)}
          navigate={navigate}
          dataE2E="category-editor-add-child"
        >
          {t.t(`Categories.addChild`)}
        </DropdownItem>
      )}
      <DropdownItem
        onClick={() => props.onArchive!(!category.archived)}
        disabled={props.pending || parentArchived}
        dataE2E="category-editor-archive"
      >
        {!category.archived
          ? t.t(`Categories.archive`)
          : parentArchived
          ? t.t(`Categories.unarchiveParentFirst`, { parent: isolate(parent!.name) })
          : t.t(`Categories.unarchive`)}
      </DropdownItem>
    </>
  )
  const showFooter = canWrite && (category === null || props.dirty)
  return (
    <Page>
      <PageHeader
        back={{ href: CATEGORY_PATHS.list, label: t.t(`CategoryEditor.back`) }}
        navigate={navigate}
        title={shownName}
        heading={
          <span class="flex min-w-0 items-center gap-3">
            <CategoryChip icon={value.icon} color={value.color} />
            <span dir="auto" class="min-w-0 break-words text-balance [text-align:match-parent]">
              {shownName}
            </span>
          </span>
        }
        titleDataE2E="category-title"
        subtitle={
          <span class="inline-flex flex-wrap items-center gap-2">
            <span>
              {parent
                ? t.t(`CategoryEditor.summaryChild`, {
                  kind: categoryKindName(t, value.kind),
                  parent: isolate(parent.name),
                })
                : t.t(`CategoryEditor.summaryTop`, { kind: categoryKindName(t, value.kind) })}
            </span>
            {category?.archived && (
              <Badge text={t.t(`Categories.archivedBadge`)} color="gray" type="outline" />
            )}
          </span>
        }
        subtitleDataE2E="category-summary"
        menuDataE2E="category-editor-menu"
        menu={menu}
      />
      {canWrite && props.offline && (
        <div data-e2e="category-offline">
          <Notice title={t.t(`CategoryEditor.offlineTitle`)}>
            {t.t(`CategoryEditor.offline`)}
          </Notice>
        </div>
      )}
      {!canWrite
        ? (
          <Stack class={FORM_WIDTH}>
            <p class="text-sm text-muted" data-e2e="category-read-only">
              {t.t(`Categories.readOnly`)}
            </p>
            <Facts value={value} parent={parent} />
          </Stack>
        )
        : (
          <div
            onKeyDown={(event) => {
              if (!matchesHotkey(parseHotkey("mod+enter"), event, isApplePlatform())) return
              event.preventDefault()
              if (!saving && !props.offline && (category === null || props.dirty)) props.onSave?.()
            }}
          >
            <ScreenForm
              pending={saving}
              onSubmit={() => {
                if (!props.offline && (category === null || props.dirty)) props.onSave?.()
              }}
            >
              <Stack class={FORM_WIDTH}>
                <Field
                  id="category-name"
                  label={t.t(`CategoryEditor.name`)}
                  error={messageText(t, errors.name)}
                  required
                >
                  <Input
                    ref={name}
                    data-e2e="category-name-input"
                    name="name"
                    autocomplete="off"
                    maxLength={CATEGORY_NAME_MAX_LENGTH}
                    placeholder={t.t(`CategoryEditor.namePlaceholder`)}
                    value={value.name}
                    onInput={(e) => onChange?.({ ...value, name: e.currentTarget.value })}
                    required
                  />
                </Field>
                <fieldset
                  disabled={locks.kind !== null}
                  aria-describedby={locks.kind ? "category-kind-hint" : undefined}
                  class="flex flex-col gap-1.5"
                  data-e2e="category-kind"
                >
                  <legend class="mb-1.5 text-sm font-medium">{t.t(`CategoryEditor.kind`)}</legend>
                  <SegmentedControl
                    ariaLabel={t.t(`CategoryEditor.kind`)}
                    value={String(value.kind)}
                    onChange={(kind) =>
                      onChange?.({ ...value, kind: Number(kind) as CategoryKind })}
                    options={[
                      { value: String(CategoryKind.EXPENSE), label: t.t(`CategoryParts.expense`) },
                      { value: String(CategoryKind.INCOME), label: t.t(`CategoryParts.income`) },
                    ]}
                  />
                  {locks.kind && (
                    <p id="category-kind-hint" class="text-sm text-muted">{locks.kind}</p>
                  )}
                </fieldset>
                <div data-e2e="category-parent">
                  <Field
                    id="category-parent"
                    label={t.t(`CategoryEditor.parent`)}
                    hint={locks.parent ?? undefined}
                    error={messageText(t, errors.parent)}
                  >
                    {(wiring) => (
                      <fieldset disabled={locks.parent !== null} class="contents">
                        <Combobox<CategoryRow>
                          id={wiring.id}
                          aria-describedby={wiring["aria-describedby"]}
                          aria-invalid={errors.parent !== null}
                          ariaLabel={t.t(`CategoryEditor.parent`)}
                          items={parents}
                          value={parent}
                          onChange={(next) =>
                            onChange?.({
                              ...value,
                              parentId: next?.id ?? null,
                              color: category === null && next ? next.color : value.color,
                            })}
                          getLabel={(item) => item.name}
                          renderOption={(item) => (
                            <span class="flex min-w-0 items-center gap-2">
                              <CategoryChip icon={item.icon} color={item.color} size="sm" />
                              <bdi class="truncate">{item.name}</bdi>
                            </span>
                          )}
                          placeholder={t.t(`CategoryEditor.noParent`)}
                          emptyMessage={t.t(`CategoryEditor.noParentMatch`)}
                          showClearButton
                          clearLabel={t.t(`CategoryEditor.clearParent`)}
                        />
                      </fieldset>
                    )}
                  </Field>
                </div>
                <div data-e2e="category-icon">
                  <IconPicker
                    name="icon"
                    value={value.icon}
                    onChange={(icon) => {
                      if (icon) onChange?.({ ...value, icon: icon as CategoryIcon })
                    }}
                    icons={CATEGORY_ICONS}
                    legend={t.t(`CategoryEditor.icon`)}
                    labels={{
                      search: t.t(`CategoryEditor.iconSearch`),
                      empty: (query) => t.t(`CategoryEditor.iconEmpty`, { query: isolate(query) }),
                      clearSearch: t.t(`CategoryEditor.iconClear`),
                      count: (count) => t.t(`CategoryEditor.iconCount`, { count }),
                    }}
                  />
                </div>
                <div data-e2e="category-color">
                  <ColorField
                    name="color"
                    legend={t.t(`CategoryEditor.color`)}
                    value={value.color}
                    onChange={(color) => {
                      if (color) onChange?.({ ...value, color })
                    }}
                    preview={() => (
                      <span class="flex items-center gap-2">
                        <CategoryChip icon={value.icon} color={value.color} />
                        <bdi class="truncate font-medium">{shownName}</bdi>
                      </span>
                    )}
                  />
                </div>
                {errors.plan
                  ? (
                    <PlanRefusalNotice
                      groupId={group.id}
                      refusal={errors.plan}
                      navigate={navigate}
                    />
                  )
                  : <ErrorState message={messageText(t, errors.form)} dataE2E="category-error" />}
                {showFooter && <Footer {...props} />}
              </Stack>
            </ScreenForm>
          </div>
        )}
    </Page>
  )
}

/** Discard (or Cancel on the create page) and Save (or Create category). */
function Footer(props: CategoryEditorScreenProps): JSX.Element {
  const t = useAppText()
  const { category, saving, navigate } = props
  const size = "min-h-11 w-full sm:min-h-9 sm:w-auto"
  return (
    <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      {category
        ? (
          <Button
            type="button"
            variant="ghost"
            class={size}
            data-e2e="category-cancel"
            onClick={props.onRevert}
          >
            {t.t(`CategoryEditor.discard`)}
          </Button>
        )
        : (
          <Button
            href={CATEGORY_PATHS.list}
            navigate={navigate}
            variant="ghost"
            class={size}
            data-e2e="category-cancel"
          >
            {t.t(`CategoryEditor.cancel`)}
          </Button>
        )}
      <Button
        type="submit"
        class={size}
        data-e2e="category-save"
        disabled={props.offline}
        busy={saving}
        busyLabel={category ? t.t(`CategoryEditor.saving`) : t.t(`CategoryEditor.creating`)}
      >
        {category ? t.t(`CategoryEditor.save`) : t.t(`CategoryEditor.create`)}
      </Button>
    </div>
  )
}

/** What a viewer sees in place of the form: each field as a fact. */
function Facts(
  { value, parent }: { value: CategoryFields; parent: CategoryRow | null },
): JSX.Element | null {
  const t = useAppText()
  const icon = ICONS[value.icon]
  return (
    <div data-e2e="category-facts">
      <FactList
        facts={[
          { label: t.t(`CategoryEditor.name`), value: <bdi>{value.name}</bdi> },
          { label: t.t(`CategoryEditor.kind`), value: categoryKindName(t, value.kind) },
          {
            label: t.t(`CategoryEditor.parent`),
            value: parent ? <bdi>{parent.name}</bdi> : t.t(`CategoryEditor.topLevel`),
          },
          {
            label: t.t(`CategoryEditor.icon`),
            value: (
              <span class="inline-flex items-center gap-2">
                <CategoryChip icon={value.icon} color={value.color} size="sm" />
                {icon?.name}
              </span>
            ),
          },
          { label: t.t(`CategoryEditor.color`), value: colorName(value.color) },
        ]}
      />
    </div>
  )
}

/** The page's content, in the column the app's frame sets: never a width of its own. */
function Page({ children }: { children?: ComponentChildren }): JSX.Element {
  return <Stack gap="xl">{children}</Stack>
}
