import { useEffect, useState } from "preact/hooks"
import { useLocation, useSearch } from "wouter-preact"
import { UnsavedGuard } from "@spy4x/preact-ui/unsaved-guard"
import { todayInTz } from "@spy4x/time/tz"
import type { PlanRefusal } from "@domain/billing"
import { canMutateNotes, groupTimeZone } from "@domain/groups"
import { TransactionKind } from "@domain/transactions"
import { RecurringEditorScreen } from "@ui/recurring-editor-screen.tsx"
import {
  hasRecurringErrors,
  newRecurringValue,
  NO_RECURRING_ERRORS,
  type RecurringEditorErrors,
  type RecurringEditorValue,
  recurringErrors,
  recurringRequest,
  recurringValueOf,
  repeatFromEntry,
  repeatSentence,
} from "@ui/recurring-parts.tsx"
import { RECURRING_PATHS } from "@ui/progressive.tsx"
import { useAppText } from "@ui/i18n.ts"
import { accountsStore } from "../state/accounts.ts"
import { categoriesStore } from "../state/categories.ts"
import { groupsStore } from "../state/groups.ts"
import { recurringStore } from "../state/recurring.ts"
import { RECURRING_MESSAGES, recurringPlan, recurringRefusal } from "../state/recurring-refusal.ts"
import { selectionStore } from "../state/selection.ts"
import { toasts } from "../state/toasts.ts"
import { prefillEntry, transactionsStore } from "../state/transactions.ts"
import { isSpaPath } from "./spa-paths.ts"
import { transactionAccounts, transactionCategories } from "./transaction-rows.ts"
import { recurringScreenRows } from "./recurring-rows.ts"

/**
 * Wires the repeating entry editor to the stores: `/recurring/new` makes a rule, prefilled from
 * the entry `?from=` names ("Repeat this" on a transaction) or else from the household's default
 * account; `/recurring/:ruleId` changes or deletes one. A save or a delete goes back to the list,
 * where a delete's Undo shows. Leaving with unsaved changes asks first.
 */
export function RecurringEditorView({ ruleId = null }: { ruleId?: string | null }) {
  const [, navigate] = useLocation()
  const t = useAppText()
  const store = recurringStore
  const groupId = selectionStore.groupId.value
  const fromId = new URLSearchParams(useSearch()).get(`from`)
  const [value, setValue] = useState<RecurringEditorValue | null>(null)
  const [initial, setInitial] = useState<RecurringEditorValue | null>(null)
  const [errors, setErrors] = useState<RecurringEditorErrors>(NO_RECURRING_ERRORS)
  const [plan, setPlan] = useState<PlanRefusal | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    if (!groupId) return
    void store.open(groupId)
    void accountsStore.open(groupId)
    void categoriesStore.open(groupId)
    if (fromId) void transactionsStore.open(groupId)
  }, [groupId])
  const membership = groupId
    ? groupsStore.groups.value.find((group) => group.id === groupId)
    : undefined
  const canWrite = membership ? canMutateNotes(membership.role) : false
  const today = todayInTz(groupTimeZone(membership ?? {}))
  const rulesReady = store.groupId.value === groupId && !store.loading.value
  const accountsReady = accountsStore.groupId.value === groupId && !accountsStore.loading.value
  const entriesReady = transactionsStore.groupId.value === groupId &&
    (transactionsStore.loaded.value || !transactionsStore.loading.value)
  const rule = ruleId === null ? undefined : store.rules.value.find((item) => item.id === ruleId)
  const source = fromId ? transactionsStore.byId.value.get(fromId) : undefined

  /** Fills the fields once what they start from is read: the rule, the entry or the accounts. */
  function start(next: RecurringEditorValue) {
    setValue(next)
    setInitial(next)
    setErrors(NO_RECURRING_ERRORS)
  }
  useEffect(() => {
    if (value !== null || !membership) return
    if (ruleId !== null) {
      if (rule) start(recurringValueOf(rule))
      return
    }
    if (!accountsReady || (fromId && !source && !entriesReady)) return
    start(
      source ? repeatFromEntry(source) : newRecurringValue(
        prefillEntry({
          transactions: [],
          accounts: accountsStore.accounts.value,
          userId: null,
          today,
        }),
        today,
      ),
    )
  }, [ruleId, membership?.id, rule, accountsReady, entriesReady, source])

  const accounts = transactionAccounts(accountsStore.accounts.value)
  const categories = transactionCategories(categoriesStore.categories.value)
  const row = rule ? recurringScreenRows([rule], { t, accounts, categories, today }).rules[0] : null
  const dirty = value !== null && JSON.stringify(value) !== JSON.stringify(initial)
  const loading = (!membership && (groupsStore.loading.value || groupId === null)) ||
    (ruleId === null ? value === null : !rule && !rulesReady)

  async function save() {
    if (!value || !groupId) return
    const found = recurringErrors(value)
    setErrors(found)
    setPlan(null)
    if (hasRecurringErrors(found)) return
    setSaving(true)
    try {
      const fields = recurringRequest(value)
      if (rule) {
        await store.update({ ...fields, groupId, id: rule.id, version: rule.version })
      } else {
        await store.create({ ...fields, groupId })
      }
      setInitial(value)
      navigate(RECURRING_PATHS.list, { replace: rule === undefined })
      toasts.success({
        title: rule ? t.t(`RecurringToasts.savedTitle`) : t.t(`RecurringToasts.createdTitle`),
        body: repeatSentence(value, t) ?? ``,
        dataE2E: rule ? `recurring-saved` : `recurring-created`,
      })
    } catch (cause) {
      setPlan(recurringPlan(cause))
      setErrors(recurringRefusal(cause, RECURRING_MESSAGES.save))
      if (rule) void store.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <RecurringEditorScreen
        group={membership ? { id: membership.id, name: membership.name, canWrite } : null}
        loading={loading}
        notFound={ruleId !== null && !rule && rulesReady && !!membership}
        rule={row}
        value={value ?? (rule ? recurringValueOf(rule) : newRecurringValue(EMPTY_ENTRY, today))}
        onChange={(next) => setValue((current) => current && { ...current, ...next })}
        errors={errors}
        plan={plan}
        accounts={accounts}
        categories={categories}
        words={t}
        saving={saving}
        dirty={dirty}
        onSave={() => void save()}
        onDelete={canWrite && rule && groupId
          ? async () => {
            setDeleting(true)
            try {
              await store.delete({ groupId, id: rule.id, version: rule.version })
              setInitial(value)
              navigate(RECURRING_PATHS.list)
            } catch (cause) {
              setErrors(recurringRefusal(cause, RECURRING_MESSAGES.delete))
              void store.refresh()
            } finally {
              setDeleting(false)
            }
          }
          : undefined}
        pending={deleting}
        recentCurrencies={accountsStore.currencies.value}
        navigate={navigate}
      />
      <UnsavedGuard
        when={canWrite && dirty && !saving}
        owns={(url) => isSpaPath(url.pathname)}
        navigate={navigate}
        labels={{
          title: t.t(`AccountsView.discardTitle`),
          message: t.t(`RecurringEditor.discard`),
          leave: t.t(`AccountsView.discardLeave`),
          stay: t.t(`AccountsView.discardStay`),
        }}
        onDiscard={() => setValue(initial)}
      />
    </>
  )
}

/** The fields shown for the one render before the real ones are read. */
const EMPTY_ENTRY = {
  kind: TransactionKind.EXPENSE,
  amount: null,
  currency: null,
  accountId: null,
  categoryId: null,
  memo: ``,
}
