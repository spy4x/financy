import type { ComponentChildren, JSX, Ref } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"
import { Button } from "@spy4x/preact-ui/button"
import { ConfirmDialog } from "@spy4x/preact-ui/confirm-dialog"
import { DialogActions } from "@spy4x/preact-ui/dialog-actions"
import { ErrorState } from "@spy4x/preact-ui/error-state"
import { Field } from "@spy4x/preact-ui/field"
import { useFormat } from "@spy4x/preact-ui/format"
import { Stack } from "@spy4x/preact-ui/layout"
import { LoadingSkeleton } from "@spy4x/preact-ui/loading-skeleton"
import { Modal } from "@spy4x/preact-ui/modal"
import { MoneyInput } from "@spy4x/preact-ui/money-input"
import { Notice } from "@spy4x/preact-ui/notice"
import { PageHeader } from "@spy4x/preact-ui/page-header"
import { PeriodStepper } from "@spy4x/preact-ui/period-stepper"
import { UsageMeter, type UsageMeterLabels } from "@spy4x/preact-ui/usage-meter"
import { isolate } from "@spy4x/preact-ui/bdi"
import { SavedCopyNotice } from "@spy4x/preact-system/saved-copy-notice"
import { IconPencilSquare } from "@spy4x/preact-icons"
import { formatMoney } from "@spy4x/platform/universal/money"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { currentPeriod, periodLabel, periodOf, PeriodUnit } from "@spy4x/time/period"
import {
  BUDGET_AMOUNT_MAX,
  type BudgetLimit,
  BudgetLimitSource,
  type BudgetMonth,
  type BudgetRow,
} from "@domain/budgets"
import type { PlanRefusal } from "@domain/billing"
import { amountDecimals } from "@domain/money"
import { ListCard, ListEmpty, NoGroup, type NotesGroup } from "./notes-screen.tsx"
import { CategoryChip, type CategoryRow, placeCategories } from "./category-parts.tsx"
import { useWaited } from "./tag-editor-screen.tsx"
import { CATEGORY_PATHS, GROUP_PATHS, type Navigate, ScreenForm } from "./progressive.tsx"
import { useAppText } from "./i18n.ts"
import { type Message, messageText } from "./message.ts"
import { PlanRefusalNotice } from "./plan-refusal.tsx"

/** The limit dialog as the screen draws it: one category's limit from the month on screen. */
export interface BudgetFormView {
  categoryId: string
  /** In the smallest unit of `currency`; `null` while the field is empty. */
  amount: number | null
  currency: string
  /** The category's own limit when the dialog opened, or as last read after a conflict. */
  base: BudgetLimit | null
  /** Someone else changed the limit while the dialog was open: it now shows their change. */
  conflict: boolean
  /** What is wrong with the amount, shown under its field. */
  amountError: Message | null
  /** A failure no field owns, such as a save that did not go through. */
  error: Message | null
  /** The household's plan refused the limit. */
  plan: PlanRefusal | null
}

/** The changes the page offers; left out for a viewer. */
export interface BudgetActions {
  /** Opens the dialog on a category. */
  onEdit(categoryId: string): void
  onChange(amount: number | null): void
  /** Saves the dialog's limit; resolves `true` once the server took it. */
  onSave(): Promise<boolean>
  /** Removes the category's own limit from the month on; resolves `true` once it is gone. */
  onRemove(): Promise<boolean>
  onCancel(): void
}

export interface BudgetsScreenProps {
  /** `null` while the group is not known yet (loading), or when the person is not a member. */
  group: NotesGroup | null
  /** The month on screen, `YYYY-MM`. */
  month: string
  /** The current instant and the household's zone: they decide which month is this month. */
  now: Date
  timeZone: string
  onMonth(month: string): void
  /** The month's bars; `null` until the first read answers. */
  budgets: BudgetMonth | null
  /** The household's categories, for each bar's name, icon and colour. */
  categories: readonly CategoryRow[]
  loading: boolean
  error: Message | null
  onRetry(): void
  /** When the month shown was saved on the device, while it is that copy; else `null`. */
  savedAt: number | null
  /** Whether the household's plan sets limits, and whether this person may change the plan. */
  plan: { allows: boolean; canManage: boolean }
  form: BudgetFormView | null
  saving: boolean
  actions?: BudgetActions
  navigate?: Navigate
}

/**
 * The percent from which a bar says "close to the limit": the server's yellow band starts there,
 * so the meter and `budgetBand` agree on every bar.
 */
export const BUDGET_WARN_AT = 80

/** `YYYY-MM` of a period. */
const monthOf = (from: string) => from.slice(0, 7)

/** The meter's words, with "over the limit" in place of the library's plain "over". */
function meterLabels(t: Translator<string>): Partial<UsageMeterLabels> {
  return {
    over: (over) => t.t(`Budgets.meterOver`, { over }),
    valueTextOver: (used, limit, over) => t.t(`Budgets.meterValueTextOver`, { used, limit, over }),
  }
}

/**
 * A household's budgets at `/budgets`: one month of every expense category, parents first with
 * their subcategories under them, in the order of the categories page and never re-sorted. A row
 * with a limit is a meter; a row without one says what was spent. A limit is set, changed or
 * removed in a dialog, from the month on screen on. A past month, a viewer, the device's copy and
 * a household without the plan get no way to set one; without the plan an own limit can still be
 * removed.
 */
export function BudgetsScreen(props: BudgetsScreenProps): JSX.Element {
  const { group, budgets, navigate, form } = props
  const t = useAppText()
  const page = useRef<HTMLDivElement>(null)
  const [confirming, setConfirming] = useState(false)
  /** The row whose button opened the dialog: focus goes back to it when the dialog closes. */
  const [returnTo, setReturnTo] = useState<string | null>(null)
  const open = form !== null || confirming
  useEffect(() => {
    if (open || returnTo === null) return
    page.current?.querySelector<HTMLElement>(`[data-budget-action="${returnTo}"]`)?.focus()
    setReturnTo(null)
  }, [open, returnTo, budgets])
  const period = periodOf(PeriodUnit.Month, `${props.month}-01`)
  const monthName = periodLabel(period, t.language)
  const stepper = (
    <PeriodStepper
      period={period}
      onChange={(next) => props.onMonth(monthOf(next.from))}
      now={props.now}
      timeZone={props.timeZone}
    />
  )
  if (!group) {
    return (
      <Page pageRef={page}>
        <PageHeader title={t.t(`Budgets.title`)} />
        <NoGroup loading={props.loading} navigate={navigate} />
      </Page>
    )
  }
  const thisMonth = monthOf(
    currentPeriod(PeriodUnit.Month, { now: props.now, timeZone: props.timeZone }).from,
  )
  const past = props.month < thisMonth
  const editable = group.canWrite && props.actions !== undefined && !past &&
    props.savedAt === null && budgets !== null
  const canSet = editable && props.plan.allows
  const rows = budgets?.rows ?? []
  const byCategory = new Map(props.categories.map((category) => [category.id, category]))
  const named = new Map(
    rows.flatMap((row) => {
      const category = byCategory.get(row.categoryId)
      return category ? [[row.categoryId, category] as const] : []
    }),
  )
  const formName = form ? named.get(form.categoryId)?.name ?? "" : ""
  const leftOut = [...new Set(rows.flatMap((row) => row.leftOut))].sort()

  function edit(categoryId: string, remove: boolean): void {
    setReturnTo(categoryId)
    props.actions!.onEdit(categoryId)
    if (remove) setConfirming(true)
  }

  return (
    <Page pageRef={page}>
      <PageHeader
        title={t.t(`Budgets.title`)}
        subtitle={group.name}
        subtitleDataE2E="budgets-group"
        action={<div class="hidden sm:block" data-e2e="budgets-stepper-wide">{stepper}</div>}
      />
      <div class="-mt-4 sm:hidden" data-e2e="budgets-stepper-narrow">{stepper}</div>
      <Stack>
        {leftOut.length > 0 && (
          <Notice tone="warning" data-e2e="budgets-left-out">
            {t.t(past || props.month > thisMonth ? `Budgets.leftOutMonth` : `Budgets.leftOut`, {
              month: monthName,
              currencies: new Intl.ListFormat(t.language, { type: "conjunction" }).format(leftOut),
            })}
          </Notice>
        )}
        {past && (
          <p class="text-sm text-muted" data-e2e="budgets-past">
            {t.t(`Budgets.past`, { month: monthName })}
          </p>
        )}
        {props.month > thisMonth && (
          <p class="text-sm text-muted" data-e2e="budgets-future">
            {t.t(`Budgets.future`, { month: monthName })}
          </p>
        )}
        {group.canWrite && !props.plan.allows && (
          <Notice
            tone="warning"
            title={t.t(`Budgets.planTitle`)}
            action={props.plan.canManage && (
              <Button href={GROUP_PATHS.billing(group.id)} navigate={navigate} size="sm">
                {t.t(`PlanRefusalNotice.openBilling`)}
              </Button>
            )}
            data-e2e="budgets-plan"
          >
            {props.plan.canManage
              ? t.t(`Budgets.planText`)
              : `${t.t(`Budgets.planText`)} ${t.t(`Budgets.planAskOwner`)}`}
          </Notice>
        )}
        {!group.canWrite && (
          <p class="text-sm text-muted" data-e2e="budgets-read-only">
            {t.t(`Budgets.readOnly`)}
          </p>
        )}
        <SavedCopyNotice
          savedAt={props.savedAt}
          labels={{
            title: t.t(`Budgets.savedTitle`, { month: monthName }),
            body: (time) => t.t(`Budgets.savedBody`, { time }),
          }}
          data-e2e="budgets-saved-copy"
        />
        <List
          {...props}
          named={named}
          editable={editable}
          canSet={canSet}
          onEdit={edit}
        />
      </Stack>
      {form && !confirming && (
        <BudgetDialog
          form={form}
          name={formName}
          month={monthName}
          saving={props.saving}
          canRemove={form.base !== null}
          groupId={group.id}
          actions={props.actions!}
          onRemove={() => setConfirming(true)}
          navigate={navigate}
        />
      )}
      {form && confirming && (
        <ConfirmDialog
          title={t.t(`BudgetRemove.title`, { name: isolate(formName) })}
          confirmLabel={t.t(`BudgetRemove.confirm`)}
          cancelLabel={t.t(`BudgetDialog.cancel`)}
          tone="danger"
          busy={props.saving}
          onConfirm={() =>
            void props.actions!.onRemove().then((removed) => {
              if (removed) setConfirming(false)
            })}
          onCancel={() => {
            setConfirming(false)
            props.actions!.onCancel()
          }}
          dataE2E="budget-remove-dialog"
          confirmDataE2E="budget-remove-confirm"
        >
          <Stack>
            <p class="text-sm text-muted">
              {t.t(`BudgetRemove.message`, { name: isolate(formName), month: monthName })}
            </p>
            <ErrorState message={messageText(t, form.error)} focusOnAppear />
          </Stack>
        </ConfirmDialog>
      )}
    </Page>
  )
}

type Listed = BudgetsScreenProps & {
  named: ReadonlyMap<string, CategoryRow>
  editable: boolean
  canSet: boolean
  onEdit(categoryId: string, remove: boolean): void
}

/** The month's rows, or the page's loading, error and empty states. */
function List(props: Listed): JSX.Element | null {
  const t = useAppText()
  const { budgets, named, group, navigate } = props
  const waited = useWaited(props.loading && budgets === null)
  if (budgets === null) {
    if (props.error) {
      return (
        <div class="flex flex-col items-center gap-3" data-e2e="budgets-error">
          <ErrorState message={messageText(t, props.error)} />
          <Button
            type="button"
            variant="secondary"
            class="min-h-11 sm:min-h-9"
            busy={props.loading}
            busyLabel={t.t(`Budgets.loading`)}
            onClick={props.onRetry}
            data-e2e="budgets-retry"
          >
            {t.t(`Budgets.retry`)}
          </Button>
        </div>
      )
    }
    return waited
      ? (
        <div data-e2e="budgets-loading">
          <p role="status" class="sr-only">{t.t(`Budgets.loading`)}</p>
          <LoadingSkeleton rows={6} />
        </div>
      )
      : null
  }
  const placed = placeCategories([...named.values()], t.language)
  if (budgets.rows.length === 0) {
    const canWrite = group?.canWrite === true
    return (
      <ListEmpty
        title={canWrite ? t.t(`Budgets.emptyTitle`) : t.t(`Budgets.emptyViewer`)}
        description={canWrite ? t.t(`Budgets.emptyText`) : undefined}
        action={canWrite && (
          <Button
            href={CATEGORY_PATHS.new}
            navigate={navigate}
            variant="secondary"
            data-e2e="budgets-add-category"
          >
            {t.t(`Budgets.emptyAction`)}
          </Button>
        )}
      />
    )
  }
  const rowOf = new Map(budgets.rows.map((row) => [row.categoryId, row]))
  const noLimits = budgets.rows.every((row) => row.limit === null)
  return (
    <>
      {noLimits && (props.canSet || !group?.canWrite) && (
        <p class="text-sm text-muted" data-e2e="budgets-no-limits">
          {props.canSet ? t.t(`Budgets.noLimits`) : t.t(`Budgets.noLimitsViewer`)}
        </p>
      )}
      <ListCard dataE2E="budgets-list">
        {placed.map(({ category, parent }) => (
          <Row
            key={category.id}
            category={category}
            child={parent !== null}
            row={rowOf.get(category.id)!}
            {...props}
          />
        ))}
      </ListCard>
    </>
  )
}

/**
 * One category's month: its chip, then its meter, or its name with what was spent. The button at
 * the end sets or changes the limit; without the plan it removes an own limit.
 */
function Row(
  { category, child, row, editable, canSet, onEdit }: Listed & {
    category: CategoryRow
    child: boolean
    row: BudgetRow
  },
): JSX.Element {
  const t = useAppText()
  const format = useFormat()
  const money = (amount: number) =>
    formatMoney(amount, row.currency, format.locale, { decimals: amountDecimals(row.currency) })
  const name = isolate(category.name)
  const own = row.source === BudgetLimitSource.OWN
  const button = !editable ? null : canSet && own
    ? (
      <Button
        type="button"
        variant="ghost"
        size="none"
        class="size-11 shrink-0 sm:size-9"
        aria-label={t.t(`Budgets.changeLimitOn`, { name })}
        onClick={() => onEdit(category.id, false)}
        data-budget-action={category.id}
        data-e2e="budget-change"
      >
        <IconPencilSquare class="size-5" aria-hidden="true" />
      </Button>
    )
    : canSet
    ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="min-h-11 shrink-0 sm:min-h-9"
        aria-label={t.t(`Budgets.setLimitOn`, { name })}
        onClick={() => onEdit(category.id, false)}
        data-budget-action={category.id}
        data-e2e="budget-set"
      >
        {t.t(`Budgets.setLimit`)}
      </Button>
    )
    : own
    ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="min-h-11 shrink-0 text-danger sm:min-h-9"
        aria-label={t.t(`Budgets.removeLimitOn`, { name })}
        onClick={() => onEdit(category.id, true)}
        data-budget-action={category.id}
        data-e2e="budget-remove"
      >
        {t.t(`BudgetDialog.remove`)}
      </Button>
    )
    : null
  return (
    <li
      class={`flex items-center gap-3 px-4 py-3 sm:px-6 ${child ? "ps-16 sm:ps-16" : ""}`}
      data-e2e={`budget-${category.id}`}
    >
      <CategoryChip icon={category.icon} color={category.color} size={child ? "sm" : "md"} />
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        {row.spending === null
          ? (
            <>
              <span class="min-w-0 truncate text-sm font-medium">
                <bdi>{category.name}</bdi>
              </span>
              <span class="text-xs text-muted" data-e2e="budget-too-large">
                {t.t(`Budgets.tooLarge`)}
              </span>
            </>
          )
          : row.limit
          ? (
            <UsageMeter
              used={row.spending}
              limit={row.limit.amount}
              format={money}
              label={category.name}
              warnAt={BUDGET_WARN_AT}
              labels={meterLabels(t)}
              locale={format.locale}
            />
          )
          : (
            <div class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3">
              <span class="min-w-0 truncate text-sm font-medium">
                <bdi>{category.name}</bdi>
              </span>
              <span class="pc-num text-xs text-muted" data-e2e="budget-spent">
                {t.t(`Budgets.spent`, { amount: money(row.spending) })}
              </span>
            </div>
          )}
        {row.source === BudgetLimitSource.CHILDREN && (
          <div class="flex flex-wrap items-center justify-between gap-x-3">
            <span class="text-xs text-muted" data-e2e="budget-children-sum">
              {t.t(`Budgets.childrenSum`)}
            </span>
            {button && <span class="-me-3 ms-auto">{button}</span>}
          </div>
        )}
      </div>
      {/* A sum's button sits under its bar, and this keeps the bar as long as the others. */}
      {row.source === BudgetLimitSource.CHILDREN
        ? button && <span class="size-11 shrink-0 sm:size-9" aria-hidden="true" />
        : button}
    </li>
  )
}

/**
 * The limit dialog: the amount in the limit's own currency or the household's base currency, the
 * months it applies to, and Save. "Remove limit" sits at the footer's start while the category has
 * a limit of its own, and asks first. Enter saves; Escape and Cancel close it.
 */
function BudgetDialog(
  { form, name, month, saving, canRemove, groupId, actions, onRemove, navigate }: {
    form: BudgetFormView
    name: string
    month: string
    saving: boolean
    canRemove: boolean
    groupId: string
    actions: BudgetActions
    onRemove(): void
    navigate?: Navigate
  },
): JSX.Element {
  const t = useAppText()
  const format = useFormat()
  const decimals = amountDecimals(form.currency)
  const amountError = messageText(t, form.amountError)
  const amountRow = useRef<HTMLDivElement>(null)
  // A refused amount sends focus back to its field, where the message now sits.
  useEffect(() => {
    if (form.amountError) amountRow.current?.querySelector(`input`)?.focus()
  }, [form])
  return (
    <Modal
      open
      onClose={actions.onCancel}
      title={t.t(`BudgetDialog.title`, { name: isolate(name) })}
      cancelLabel={t.t(`BudgetDialog.close`)}
      dataE2E="budget-dialog"
    >
      <ScreenForm pending={saving} onSubmit={() => void actions.onSave()}>
        <Stack>
          {form.conflict && (
            <Notice tone="info" data-e2e="budget-conflict">{t.t(`BudgetDialog.conflict`)}</Notice>
          )}
          <div ref={amountRow} data-e2e="budget-amount">
            <Field
              id="budget-amount"
              label={t.t(`BudgetDialog.amount`)}
              hint={t.t(`BudgetDialog.hint`, { month })}
              error={amountError}
            >
              {(wiring) => (
                <MoneyInput
                  id={wiring.id}
                  aria-describedby={wiring["aria-describedby"]}
                  aria-invalid={amountError ? true : undefined}
                  value={form.amount}
                  onChange={actions.onChange}
                  currency={form.currency}
                  decimals={decimals}
                  locale={format.locale}
                  min={1}
                  max={BUDGET_AMOUNT_MAX}
                  placeholder="0"
                  invalidMessage={t.t(`AccountEditor.amountInvalid`)}
                  rangeMessage={() => t.t(`BudgetDialog.amountRange`)}
                  decimalsMessage={(count) =>
                    count === 0
                      ? t.t(`AccountEditor.amountNoDecimals`, { currency: form.currency })
                      : t.t(`AccountEditor.amountDecimals`, { count, currency: form.currency })}
                />
              )}
            </Field>
          </div>
          {form.plan
            ? <PlanRefusalNotice groupId={groupId} refusal={form.plan} navigate={navigate} />
            : <ErrorState message={messageText(t, form.error)} focusOnAppear />}
          <DialogActions>
            {canRemove && (
              <Button
                type="button"
                variant="ghost"
                class="text-danger sm:me-auto"
                onClick={onRemove}
                disabled={saving}
                data-e2e="budget-dialog-remove"
              >
                {t.t(`BudgetDialog.remove`)}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={actions.onCancel}>
              {t.t(`BudgetDialog.cancel`)}
            </Button>
            <Button
              type="submit"
              busy={saving}
              busyLabel={t.t(`BudgetDialog.saving`)}
              data-e2e="budget-save"
            >
              {t.t(`BudgetDialog.save`)}
            </Button>
          </DialogActions>
        </Stack>
      </ScreenForm>
    </Modal>
  )
}

/** The page's content, in the column the app's frame sets: never a width of its own. */
function Page(
  { children, pageRef }: { children?: ComponentChildren; pageRef?: Ref<HTMLDivElement> },
): JSX.Element {
  return <div ref={pageRef} class="flex flex-col gap-8">{children}</div>
}
