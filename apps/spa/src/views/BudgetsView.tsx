import { useEffect, useState } from "preact/hooks"
import { useLocation } from "wouter-preact"
import { entitlementsOf } from "@domain/billing"
import { canMutateNotes, groupTimeZone } from "@domain/groups"
import { amountDecimals } from "@domain/money"
import { isolate } from "@spy4x/preact-ui/bdi"
import { useFormat } from "@spy4x/preact-ui/format"
import { formatMoney } from "@spy4x/platform/universal/money"
import { currentPeriod, periodLabel, periodOf, PeriodUnit } from "@spy4x/time/period"
import { type BudgetActions, BudgetsScreen } from "@ui/budgets-screen.tsx"
import { useAppText } from "@ui/i18n.ts"
import { billingStore } from "../state/billing.ts"
import { budgetsStore } from "../state/budgets.ts"
import { categoriesStore } from "../state/categories.ts"
import { groupsStore } from "../state/groups.ts"
import { selectionStore } from "../state/selection.ts"
import { toasts } from "../state/toasts.ts"
import { categoryRow } from "./CategoriesView.tsx"

/**
 * Wires the budgets page to its store for `/budgets`: one month of the selected household's
 * expense categories, the current month in the household's time zone first. Whoever may write
 * notes may change limits; a viewer reads them. The plan is read once per household, and while it
 * is unknown setting stays offered: the server refuses it if the plan does not allow it.
 */
export function BudgetsView() {
  const [, navigate] = useLocation()
  const t = useAppText()
  const format = useFormat()
  const store = budgetsStore
  const groupId = selectionStore.groupId.value
  const membership = groupId
    ? groupsStore.groups.value.find((group) => group.id === groupId)
    : undefined
  const timeZone = groupTimeZone(membership ?? {})
  const [now] = useState(() => new Date())
  const thisMonth = currentPeriod(PeriodUnit.Month, { now, timeZone }).from.slice(0, 7)
  const month = store.groupId.value === groupId && store.month.value
    ? store.month.value
    : thisMonth
  useEffect(() => {
    if (!groupId) return
    void store.open(groupId, month)
    void categoriesStore.open(groupId)
    if (billingStore.current.value?.groupId !== groupId) void billingStore.load(groupId)
  }, [groupId, month])
  const canWrite = membership ? canMutateNotes(membership.role) : false
  const current = billingStore.current.value
  const billing = current?.groupId === groupId ? current.billing : null
  const monthName = (at: string) => periodLabel(periodOf(PeriodUnit.Month, `${at}-01`), t.language)
  const nameOf = (categoryId: string) =>
    isolate(categoriesStore.categories.value.find((item) => item.id === categoryId)?.name ?? "")

  const actions: BudgetActions = {
    onEdit: store.startEdit,
    onChange: store.change,
    onCancel: store.closeForm,
    async onSave() {
      const form = store.form.value
      const at = store.month.value
      if (!form || !at || form.amount === null) return await store.save()
      const amount = formatMoney(form.amount, form.currency, format.locale, {
        decimals: amountDecimals(form.currency),
      })
      const saved = await store.save()
      if (saved) {
        toasts.success({
          id: `budget-saved`,
          title: t.t(`BudgetsView.savedTitle`),
          body: t.t(`BudgetsView.saved`, {
            name: nameOf(form.categoryId),
            amount,
            month: monthName(at),
          }),
          dataE2E: "budget-saved",
        })
      }
      return saved
    },
    async onRemove() {
      const form = store.form.value
      const at = store.month.value
      const removed = await store.remove()
      if (removed && form && at) {
        toasts.success({
          id: `budget-removed`,
          title: t.t(`BudgetsView.removedTitle`),
          body: t.t(`BudgetsView.removed`, { name: nameOf(form.categoryId), month: monthName(at) }),
          dataE2E: "budget-removed",
        })
      }
      return removed
    },
  }

  return (
    <BudgetsScreen
      group={membership ? { id: membership.id, name: membership.name, canWrite } : null}
      month={month}
      now={now}
      timeZone={timeZone}
      onMonth={(next) => groupId && void store.open(groupId, next)}
      budgets={store.groupId.value === groupId ? store.budgets.value : null}
      categories={categoriesStore.categories.value.map(categoryRow)}
      loading={store.loading.value || groupsStore.loading.value || groupId === null}
      error={store.error.value}
      onRetry={() => void store.refresh()}
      savedAt={store.savedAt.value}
      plan={{
        allows: billing ? entitlementsOf(billing.planId, billing.enabled).features.budgets : true,
        canManage: billing?.canManage ?? false,
      }}
      form={store.form.value}
      saving={store.saving.value}
      actions={canWrite ? actions : undefined}
      navigate={navigate}
    />
  )
}
