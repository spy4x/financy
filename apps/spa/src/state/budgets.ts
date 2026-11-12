import { signal } from "@preact/signals"
import { describeError, RealtimeRequestError } from "@spy4x/realtime"
import { type BudgetLimit, BudgetLimitSource, type BudgetMonth } from "@domain/budgets"
import { readPlanRefusal } from "@domain/billing"
import type { BudgetFormView as BudgetForm } from "@ui/budgets-screen.tsx"
import type { Message } from "@ui/message.ts"
import { callCommand, callQuery, type LocalReads, localReads, noLocalReads } from "../modules.ts"
import { READ_KEYS } from "./read-keys.ts"

/** What `budget.set` takes: an amount above zero sets a limit from `month` on, `null` removes it. */
export interface BudgetSetInput {
  groupId: string
  categoryId: string
  month: string
  amount: number | null
  currency?: string
  expectedVersion: number | null
}

/** What the budgets store needs from the outside. Injected so tests need no socket. */
export interface BudgetsDependencies {
  /** Reads a household's bars for one month, `YYYY-MM`. */
  month(groupId: string, month: string): Promise<BudgetMonth>
  /** Sets or removes a limit; resolves the month's row version. */
  set(input: BudgetSetInput): Promise<{ budget: { version: number } }>
}

/** What the store says went wrong, as keys of the `app` catalog. */
export const BUDGET_MESSAGES = {
  load: `Budgets.loadError`,
  required: `BudgetDialog.amountRequired`,
  conflict: `BudgetDialog.conflict`,
  gone: `BudgetDialog.gone`,
  save: `BudgetDialog.saveFailed`,
  remove: `BudgetDialog.removeFailed`,
} as const

/** The refusal's code (`VERSION_CONFLICT`, `CATEGORY_ARCHIVED`...) and current version, if any. */
function refusal(error: unknown): { code: string | null; currentVersion: number | null } {
  if (!(error instanceof RealtimeRequestError)) return { code: null, currentVersion: null }
  const details = (error.details ?? {}) as { code?: unknown; currentVersion?: unknown }
  return {
    code: typeof details.code === "string" ? details.code : null,
    currentVersion: typeof details.currentVersion === "number" ? details.currentVersion : null,
  }
}

function sameLimit(a: BudgetLimit | null, b: BudgetLimit | null): boolean {
  return a === b || (a !== null && b !== null && a.amount === b.amount && a.currency === b.currency)
}

/**
 * One household's budgets for one month (offline-readable, ADR 003 level 2: each month has its own
 * copy on the device) and the one limit dialog. Writes go to the server only.
 *
 * The month read carries no row versions, so the store remembers the version of each row its own
 * writes answered with, and sends `null` for a row it has not written. When the server says the
 * row moved on, the month is read again. Only when that read came fresh from the server, and the
 * limit is still the one the dialog opened on, is it saved again at the current version without a
 * word, because nobody's change is lost; a limit someone else changed keeps the dialog open on
 * their value. A read that failed or came from the device's copy cannot tell, so nothing is sent
 * and the dialog says the limit was not saved.
 */
export function createBudgetsStore(
  dependencies: BudgetsDependencies,
  device: LocalReads = noLocalReads,
) {
  const groupId = signal<string | null>(null)
  /** The month on screen, `YYYY-MM`. */
  const month = signal<string | null>(null)
  const budgets = signal<BudgetMonth | null>(null)
  /** When the month shown was saved, in epoch milliseconds, while it is the device's copy. */
  const savedAt = signal<number | null>(null)
  const loading = signal(false)
  const error = signal<Message | null>(null)
  const form = signal<BudgetForm | null>(null)
  const saving = signal(false)
  /** The version of each month's row this page wrote, by `group:category:month`. */
  const versions = new Map<string, number>()
  let reads = 0

  const versionKey = (group: string, categoryId: string, at: string) =>
    `${group}:${categoryId}:${at}`

  /** The category's own limit in the month shown, or `null`. */
  function ownLimit(categoryId: string): BudgetLimit | null {
    const row = budgets.value?.rows.find((candidate) => candidate.categoryId === categoryId)
    return row?.source === BudgetLimitSource.OWN ? row.limit : null
  }

  /**
   * Reads the open month again; an answer for another household or month, or older than a later
   * read, is dropped. Resolves `true` only when the month on screen now is the server's answer to
   * this read: `false` when it failed, came from the device's copy, or was dropped.
   */
  async function reread(): Promise<boolean> {
    const forGroup = groupId.value
    const forMonth = month.value
    if (forGroup === null || forMonth === null) return false
    const read = ++reads
    const current = () => read === reads && groupId.value === forGroup && month.value === forMonth
    loading.value = true
    try {
      const answer = await device.through(
        READ_KEYS.budgets(forGroup, forMonth),
        () => dependencies.month(forGroup, forMonth),
        (copy) => {
          if (!current()) return false
          if (copy && budgets.value !== null) return false
          budgets.value = copy ? copy.value : null
          savedAt.value = copy ? copy.savedAt : null
        },
      )
      if (!current()) return false
      budgets.value = answer.value
      savedAt.value = answer.fresh ? null : answer.savedAt
      error.value = null
      return answer.fresh
    } catch (cause) {
      if (current()) error.value = describeError(cause, BUDGET_MESSAGES.load)
      return false
    } finally {
      if (read === reads) loading.value = false
    }
  }

  /** Reads the open month again, as {@link reread} does, for callers that need no answer. */
  async function refresh(): Promise<void> {
    await reread()
  }

  /** Shows one household's month. The month already open is read again. */
  async function open(nextGroupId: string, nextMonth: string): Promise<void> {
    if (groupId.value !== nextGroupId) {
      reset()
      groupId.value = nextGroupId
    }
    if (month.value !== nextMonth) {
      month.value = nextMonth
      budgets.value = null
      savedAt.value = null
      error.value = null
      form.value = null
    }
    await refresh()
  }

  /** Opens the dialog on a category: its own limit, else empty in the household's base currency. */
  function startEdit(categoryId: string): void {
    const shown = budgets.value
    if (!shown) return
    const own = ownLimit(categoryId)
    form.value = {
      categoryId,
      amount: own?.amount ?? null,
      currency: own?.currency ?? shown.baseCurrency,
      base: own,
      conflict: false,
      amountError: null,
      error: null,
      plan: null,
    }
  }

  function change(amount: number | null): void {
    if (form.value) form.value = { ...form.value, amount, amountError: null, error: null }
  }

  function closeForm(): void {
    form.value = null
  }

  /**
   * Sends the dialog's limit, or its removal. Resolves `true` once the server took it; `false`
   * with the dialog's message set when it was refused or failed.
   */
  async function write(removal: boolean): Promise<boolean> {
    const forGroup = groupId.value
    const forMonth = month.value
    const current = form.value
    if (!forGroup || !forMonth || !current || saving.value) return false
    if (!removal && current.amount === null) {
      form.value = { ...current, amountError: BUDGET_MESSAGES.required }
      return false
    }
    const key = versionKey(forGroup, current.categoryId, forMonth)
    const send = (expectedVersion: number | null) =>
      dependencies.set({
        groupId: forGroup,
        categoryId: current.categoryId,
        month: forMonth,
        amount: removal ? null : current.amount,
        ...(!removal && { currency: current.currency }),
        expectedVersion,
      })
    saving.value = true
    form.value = { ...current, amountError: null, error: null, plan: null }
    try {
      let answer
      try {
        answer = await send(versions.get(key) ?? null)
      } catch (cause) {
        const { code, currentVersion } = refusal(cause)
        if (code !== "VERSION_CONFLICT") throw cause
        // Unread, the partner's limit is unknown: the version stays as it was, so a retry is
        // refused again and reads again instead of overwriting them.
        if (!await reread()) {
          form.value = { ...current, amountError: null, error: BUDGET_MESSAGES.save, plan: null }
          return false
        }
        if (currentVersion !== null) versions.set(key, currentVersion)
        else versions.delete(key)
        const latest = ownLimit(current.categoryId)
        if (!sameLimit(latest, current.base)) {
          form.value = {
            ...current,
            amount: latest?.amount ?? null,
            currency: latest?.currency ?? budgets.value?.baseCurrency ?? current.currency,
            base: latest,
            conflict: true,
            error: null,
          }
          return false
        }
        answer = await send(currentVersion)
      }
      versions.set(key, answer.budget.version)
      form.value = null
      await refresh()
      return true
    } catch (cause) {
      const { code } = refusal(cause)
      const plan = cause instanceof RealtimeRequestError ? readPlanRefusal(cause.details) : null
      const gone = code === "CATEGORY_NOT_FOUND" || code === "CATEGORY_ARCHIVED"
      if (gone) await refresh()
      form.value = {
        ...current,
        plan,
        error: plan ? null : gone ? BUDGET_MESSAGES.gone : describeError(
          cause,
          removal ? BUDGET_MESSAGES.remove : BUDGET_MESSAGES.save,
        ),
      }
      return false
    } finally {
      saving.value = false
    }
  }

  function reset(): void {
    reads++
    groupId.value = null
    month.value = null
    budgets.value = null
    savedAt.value = null
    loading.value = false
    error.value = null
    form.value = null
    saving.value = false
  }

  return {
    groupId,
    month,
    budgets,
    savedAt,
    loading,
    error,
    form,
    saving,
    open,
    refresh,
    startEdit,
    change,
    closeForm,
    save: () => write(false),
    remove: () => write(true),
    reset,
  }
}

/** The budgets as the server serves them, over the socket or `POST /api/call`. */
export const onlineBudgets: BudgetsDependencies = {
  async month(groupId, month) {
    const { budgets } = await callQuery<{ budgets: BudgetMonth }>("budget.month", {
      groupId,
      month,
    })
    return budgets
  },
  set: (input) => callCommand("budget.set", input),
}

/** The page's own store, reading through the device's copy of each month. */
export const budgetsStore = createBudgetsStore(onlineBudgets, localReads)
