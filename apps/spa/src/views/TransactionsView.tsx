import { useEffect } from "preact/hooks"
import { useSignal } from "@preact/signals"
import { useLocation, useSearchParams } from "wouter-preact"
import { createOnlineStatus } from "@spy4x/preact-signals/online"
import { useUrlFilters } from "@spy4x/preact-signals/use-url-filters"
import { useFormat } from "@spy4x/preact-ui/format"
import { todayInTz } from "@spy4x/time/tz"
import { canMutateNotes, groupTimeZone } from "@domain/groups"
import { TransactionKind } from "@domain/transactions"
import { TransactionsScreen } from "@ui/transactions-screen.tsx"
import type { TransactionFilters } from "@ui/transaction-parts.tsx"
import { useAppText } from "@ui/i18n.ts"
import { accountsStore } from "../state/accounts.ts"
import { categoriesStore } from "../state/categories.ts"
import { groupsStore } from "../state/groups.ts"
import { membersStore } from "../state/members.ts"
import { selectionStore } from "../state/selection.ts"
import { sessionState } from "../state/session.ts"
import { toasts } from "../state/toasts.ts"
import { transactionsStore } from "../state/transactions.ts"
import { OfflineStatus } from "../offline/OfflineStatus.tsx"
import {
  amountInCategory,
  transactionAccounts,
  transactionCategories,
  transactionRow,
  transactionUndoText,
} from "./transaction-rows.ts"
import { useUndoToast } from "./use-undo-toast.ts"

const network = createOnlineStatus()

const text = (value: string | number | null) => String(value ?? "")
/** A `YYYY-MM-DD` value from the address, or nothing for anything else. */
const isDate = (value: string | null) =>
  value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""

/**
 * Wires the transactions page to the stores for `/transactions`: the selected household's entries
 * from the device's copy, the accounts and categories that name them, and the members who added
 * them. The search and filters live in the address (`?q=`, `?account=`, `?category=`, `?kind=1|2`,
 * `?from=` and `?to=`), and `?deleted=1` shows the deleted entries.
 */
export function TransactionsView() {
  const [, navigate] = useLocation()
  const t = useAppText()
  const { locale } = useFormat()
  const store = transactionsStore
  const groupId = selectionStore.groupId.value
  useEffect(() => network.watch(), [])
  useEffect(() => {
    if (!groupId) return
    void store.open(groupId)
    void accountsStore.open(groupId)
    void categoriesStore.open(groupId)
    void membersStore.open(groupId)
  }, [groupId])

  const q = useSignal<string | number | null>("")
  const account = useSignal<string | number | null>("")
  const category = useSignal<string | number | null>("")
  const kind = useSignal<string | number | null>("")
  const from = useSignal<string | number | null>("")
  const to = useSignal<string | number | null>("")
  useUrlFilters({
    q: { signal: q, urlParam: "q", initialValue: "" },
    account: { signal: account, urlParam: "account", initialValue: "" },
    category: { signal: category, urlParam: "category", initialValue: "" },
    kind: {
      signal: kind,
      urlParam: "kind",
      initialValue: "",
      parser: (value) => value === "1" || value === "2" ? value : "",
    },
    from: { signal: from, urlParam: "from", initialValue: "", parser: isDate },
    to: { signal: to, urlParam: "to", initialValue: "", parser: isDate },
  })
  const filters: TransactionFilters = {
    q: text(q.value),
    accountId: text(account.value) || null,
    categoryId: text(category.value) || null,
    kind: kind.value === "1" || kind.value === "2" ? Number(kind.value) as TransactionKind : null,
    from: text(from.value),
    to: text(to.value),
  }
  const [params, setParams] = useSearchParams()
  const showDeleted = params.get("deleted") === "1"
  useEffect(() => {
    void store.showDeleted(showDeleted)
  }, [showDeleted, groupId])

  const membership = groupId
    ? groupsStore.groups.value.find((group) => group.id === groupId)
    : undefined
  const canWrite = membership ? canMutateNotes(membership.role) : false
  const accounts = transactionAccounts(accountsStore.accounts.value)
  const categories = transactionCategories(categoriesStore.categories.value)
  const context = {
    accounts,
    categories,
    youId: sessionState.value.user?.id ?? null,
    members: membersStore.groupId.value === groupId ? membersStore.members.value : null,
  }
  const rowContext = { ...context, t }
  useUndoToast(store, transactionUndoText(context, locale))
  const today = todayInTz(groupTimeZone(membership ?? {}))
  return (
    <TransactionsScreen
      group={membership ? { id: membership.id, name: membership.name, canWrite } : null}
      intro={groupId && (
        <OfflineStatus
          groupId={groupId}
          onResolved={() => void store.refresh().catch(() => {})}
          underHeader
        />
      )}
      rows={store.transactions.value.map((entry) => transactionRow(entry, rowContext))}
      deleted={showDeleted && canWrite
        ? (store.deleted.value ?? []).map((entry) => transactionRow(entry, rowContext))
        : null}
      accounts={accounts}
      categories={categories}
      loading={store.loading.value || groupsStore.loading.value || groupId === null}
      loaded={store.loaded.value}
      offline={!network.online.value}
      listError={store.listError.value}
      listPlan={store.listPlan.value}
      filters={filters}
      onFiltersChange={(next) => {
        if (next.q !== undefined) q.value = next.q
        if (next.accountId !== undefined) account.value = next.accountId ?? ""
        if (next.categoryId !== undefined) category.value = next.categoryId ?? ""
        if (next.kind !== undefined) kind.value = next.kind === null ? "" : String(next.kind)
        if (next.from !== undefined) from.value = next.from
        if (next.to !== undefined) to.value = next.to
      }}
      onClearFilters={() => {
        q.value = ""
        account.value = ""
        category.value = ""
        kind.value = ""
        from.value = ""
        to.value = ""
      }}
      today={today}
      newKey="T"
      onShowDeleted={(show) =>
        setParams((previous) => {
          const next = new URLSearchParams(previous)
          if (show) next.set("deleted", "1")
          else next.delete("deleted")
          return next
        })}
      onRestore={canWrite
        ? async (id) => {
          const restored = await store.restore(id)
          if (!restored) return
          toasts.success({
            title: t.t(`TransactionToasts.restoredTitle`),
            body: t.t(`TransactionToasts.restored`, {
              what: amountInCategory(t, transactionRow(restored, rowContext), locale),
            }),
            dataE2E: "transaction-restored",
          })
        }
        : undefined}
      pendingId={store.pendingId.value}
      navigate={navigate}
    />
  )
}
