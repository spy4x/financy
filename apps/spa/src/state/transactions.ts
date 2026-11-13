import { computed, signal } from "@preact/signals"
import { ConnectionLostError, describeError, RealtimeRequestError } from "@spy4x/realtime"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { hasUnsafeTextCharacters } from "@spy4x/platform/universal/text"
import { type PlanRefusal, readPlanRefusal } from "@domain/billing"
import type { CategoryKind } from "@domain/categories"
import {
  categoryFitsKind,
  TRANSACTION_MEMO_MAX_LENGTH,
  TransactionKind,
} from "@domain/transactions"
import type { Message } from "@ui/message.ts"
import { refusedField } from "../i18n.ts"
import { byDate } from "./transaction-order.ts"
import { accountsStore } from "./accounts.ts"
import { categoriesStore } from "./categories.ts"
import { callCommand, callQuery, canCall, currentLayer, offlineTransactions } from "../modules.ts"

/** An entry as the API sends it: dates are ISO strings, the sequence a decimal string. */
export interface TransactionItem {
  id: string
  groupId: string
  accountId: string
  categoryId: string
  kind: TransactionKind
  /** What moved in the account, in its currency: negative for an expense. */
  accountAmount: number
  /** What was paid, in `currency`, with the sign of `accountAmount`. */
  amount: number
  currency: string
  /** The server filled `accountAmount` from the date's rate. */
  converted: boolean
  memo: string
  date: string
  version: number
  changeSequence: string
  createdByUserId: number | null
  updatedByUserId: number | null
  createdAt: string
  updatedAt: string
  /** Set on an entry in the deleted list; a live entry has none. */
  deletedAt?: string | null
}

/** What the person types into the editor. Amounts are positive, in smallest units. */
export interface TransactionFormValue {
  kind: TransactionKind
  amount: number | null
  currency: string | null
  /** What the account was charged, when the person states it; only when the currencies differ. */
  accountAmount: number | null
  accountId: string | null
  categoryId: string | null
  date: string
  memo: string
}

/** The fields a write sends, as the server reads them. */
export interface TransactionFields {
  accountId: string
  categoryId: string
  kind: TransactionKind
  amount: number
  currency: string
  accountAmount?: number
  memo: string
  date: string
}

interface Versioned {
  groupId: string
  id: string
  version: number
}

/** What the transactions store needs from the outside. Injected so tests need no network. */
export interface TransactionsDependencies {
  /** A household's live entries, the latest date first. */
  fetchList(groupId: string): Promise<TransactionItem[]>
  /** A household's deleted entries, the latest deleted first. Online only. */
  fetchDeleted(groupId: string): Promise<TransactionItem[]>
  create(
    input: { groupId: string; id: string } & TransactionFields & { accountCurrency: string },
  ): Promise<{ transaction: TransactionItem }>
  update(
    input: Versioned & TransactionFields & { accountCurrency: string },
  ): Promise<{ transaction: TransactionItem }>
  delete(input: Versioned): Promise<void>
  restore(input: { groupId: string; id: string }): Promise<{ transaction: TransactionItem }>
  newId(): string
}

/** What the store says went wrong, as keys of the `app` catalog. */
export const TRANSACTION_MESSAGES = {
  amountRequired: `TransactionMessages.amountRequired`,
  accountRequired: `TransactionMessages.accountRequired`,
  categoryRequired: `TransactionMessages.categoryRequired`,
  currencyRequired: `TransactionMessages.currencyRequired`,
  memoUnsafe: `TransactionMessages.memoUnsafe`,
  accountGone: `TransactionMessages.accountGone`,
  categoryGone: `TransactionMessages.categoryGone`,
  categoryKind: `TransactionMessages.categoryKind`,
  role: `TransactionMessages.role`,
  conflict: `TransactionMessages.conflict`,
  gone: `TransactionMessages.gone`,
  load: `TransactionMessages.load`,
  create: `TransactionMessages.create`,
  save: `TransactionMessages.save`,
  delete: `TransactionMessages.delete`,
  restore: `TransactionMessages.restore`,
  restoreOffline: `TransactionMessages.restoreOffline`,
  restoreGone: `TransactionMessages.restoreGone`,
} as const

/** The editor's errors, each under its field. */
export interface TransactionFormErrors {
  amount: Message | null
  currency: Message | null
  accountAmount: Message | null
  account: Message | null
  category: Message | null
  date: Message | null
  memo: Message | null
  form: Message | null
  /** The server has no rate for the date: the account amount is now required. */
  noRate: boolean
  plan: PlanRefusal | null
}

const NO_ERRORS: TransactionFormErrors = {
  amount: null,
  currency: null,
  accountAmount: null,
  account: null,
  category: null,
  date: null,
  memo: null,
  form: null,
  noRate: false,
  plan: null,
}

/** The editor: the entry being created (`id: null`) or edited, and what it was when opened. */
export interface TransactionForm extends TransactionFormValue {
  id: string | null
  version: number
  base: TransactionFormValue
}

/** The entry a person just deleted and may still take back. */
export interface TransactionUndoOffer {
  id: string
  /** The deleted entry, for the toast's words. */
  transaction: TransactionItem
  /** When the offer ends, in milliseconds since the epoch. */
  until: number
}

/** How long Undo is offered after a delete, in milliseconds. */
export const UNDO_MS = 8_000

/** What {@link prefillEntry} reads: the accounts the person may pick, and the device's entries. */
export interface PrefillSource {
  transactions: readonly TransactionItem[]
  accounts: readonly {
    id: string
    currency: string
    isDefault: boolean
    archivedAt: string | null
  }[]
  /** The signed-in person: only their own last entry is followed. */
  userId: number | null
  /** Today in the household's time zone, `YYYY-MM-DD`. */
  today: string
}

/**
 * The new entry's fields (R19): the person's last entry in this household on the device's copy
 * gives the kind, account, currency, category and date. With none, or with its account gone or
 * archived, the default account (else the first one) and its currency, today, Expense and no
 * category. The amount and the memo are always empty.
 */
export function prefillEntry(source: PrefillSource): TransactionFormValue {
  const open = source.accounts.filter((account) => account.archivedAt === null)
  const mine = source.transactions
    .filter((entry) => entry.createdByUserId === source.userId)
    .reduce<TransactionItem | null>(
      (latest, entry) => !latest || entry.createdAt > latest.createdAt ? entry : latest,
      null,
    )
  if (mine && open.some((account) => account.id === mine.accountId)) {
    return {
      kind: mine.kind,
      amount: null,
      currency: mine.currency,
      accountAmount: null,
      accountId: mine.accountId,
      categoryId: mine.categoryId,
      date: mine.date,
      memo: "",
    }
  }
  const account = open.find((candidate) => candidate.isDefault) ?? open[0] ?? null
  return {
    kind: TransactionKind.EXPENSE,
    amount: null,
    currency: account?.currency ?? null,
    accountAmount: null,
    accountId: account?.id ?? null,
    categoryId: null,
    date: source.today,
    memo: "",
  }
}

/** The plan's refusal of a call, or `null` when the plan did not refuse it. */
function planRefusal(error: unknown): PlanRefusal | null {
  return error instanceof RealtimeRequestError ? readPlanRefusal(error.details) : null
}

/** The code of a refused call (`TRANSACTION_NOT_FOUND`, `NO_RATE`...), or `null`. */
function transactionCode(error: unknown): string | null {
  if (!(error instanceof RealtimeRequestError)) return null
  const code = (error.details as { code?: unknown } | undefined)?.code
  return typeof code === "string" ? code : null
}

function fieldsOf(entry: TransactionItem, references: TransactionReferences): TransactionFormValue {
  const sameCurrency = entry.currency === references.accountCurrency(entry.accountId)
  return {
    kind: entry.kind,
    amount: Math.abs(entry.amount),
    currency: entry.currency,
    // A converted amount is the server's: the field stays empty, so an unchanged save keeps it. A
    // stated one is the person's own rate and shows.
    accountAmount: entry.converted || sameCurrency ? null : Math.abs(entry.accountAmount),
    accountId: entry.accountId,
    categoryId: entry.categoryId,
    date: entry.date,
    memo: entry.memo,
  }
}

function formOf(entry: TransactionItem, references: TransactionReferences): TransactionForm {
  const base = fieldsOf(entry, references)
  return { id: entry.id, ...base, version: entry.version, base }
}

function sameFields(a: TransactionFormValue, b: TransactionFormValue): boolean {
  return a.kind === b.kind && a.amount === b.amount && a.currency === b.currency &&
    a.accountAmount === b.accountAmount && a.accountId === b.accountId &&
    a.categoryId === b.categoryId && a.date === b.date && a.memo === b.memo
}

/** What the store reads of the household's accounts and categories, which other stores keep. */
export interface TransactionReferences {
  accountCurrency(accountId: string): string | undefined
  categoryKind(categoryId: string): CategoryKind | undefined
}

/**
 * The entries of one household: the list (offline-writable, ADR 003 level 3, from the device's
 * copy with the queued writes applied), the deleted list while it is shown, the one editor the
 * transaction pages open, and the Undo a delete offers.
 */
export function createTransactionsStore(
  dependencies: TransactionsDependencies,
  references: TransactionReferences,
) {
  const groupId = signal<string | null>(null)
  const transactions = signal<readonly TransactionItem[]>([])
  /** Whether the list has been read for the open household at least once. */
  const loaded = signal(false)
  /** The deleted entries while that view is shown, else `null`. */
  const deleted = signal<readonly TransactionItem[] | null>(null)
  const loading = signal(false)
  const listError = signal<Message | null>(null)
  /** The plan's refusal of the last restore, shown in place of `listError`. */
  const listPlan = signal<PlanRefusal | null>(null)
  const form = signal<TransactionForm | null>(null)
  const formErrors = signal<TransactionFormErrors>(NO_ERRORS)
  const saving = signal(false)
  /** The entry whose delete or restore is in flight. */
  const pendingId = signal<string | null>(null)
  const undo = signal<TransactionUndoOffer | null>(null)
  const byId = computed(() => new Map(transactions.value.map((entry) => [entry.id, entry])))
  const unsaved = computed(() => {
    const current = form.value
    return current !== null && !sameFields(current, current.base)
  })
  let reads = 0
  /** The id of the new entry in the editor: every Save of that draft sends it, so a retry is the same create. */
  let draftId = ""
  const toForm = (entry: TransactionItem) => formOf(entry, references)

  /** Reads the open household's entries again; a read answered for another group is dropped. */
  async function refresh(): Promise<void> {
    const id = groupId.value
    if (id === null) return
    const read = ++reads
    loading.value = true
    try {
      const rows = await dependencies.fetchList(id)
      if (read !== reads || groupId.value !== id) return
      transactions.value = rows
      loaded.value = true
      listError.value = null
      if (deleted.value !== null) await readDeleted(id)
    } catch (cause) {
      if (read !== reads || groupId.value !== id) return
      listError.value = describeError(cause, TRANSACTION_MESSAGES.load)
    } finally {
      if (read === reads) loading.value = false
    }
  }

  /** Shows a household's entries. Opening the household already open reads it again. */
  function open(nextGroupId: string): Promise<void> {
    if (groupId.value !== nextGroupId) {
      reset()
      groupId.value = nextGroupId
    }
    return refresh()
  }

  async function readDeleted(id: string): Promise<void> {
    const rows = await dependencies.fetchDeleted(id)
    if (groupId.value === id && deleted.value !== null) deleted.value = rows
  }

  /** Shows or hides the deleted entries; showing them reads them from the server. */
  async function showDeleted(show: boolean): Promise<void> {
    const id = groupId.value
    if (!show || id === null) return void (deleted.value = null)
    if (deleted.value === null) deleted.value = []
    listError.value = null
    try {
      await readDeleted(id)
    } catch (cause) {
      if (groupId.value === id) listError.value = describeError(cause, TRANSACTION_MESSAGES.load)
    }
  }

  /** Opens the editor for a new entry with `value` prefilled ({@link prefillEntry}). */
  function startCreate(value: TransactionFormValue): void {
    draftId = dependencies.newId()
    form.value = { id: null, ...value, version: 0, base: value }
    formErrors.value = NO_ERRORS
  }

  /** Opens the editor of an entry; a form with unsaved changes on it is kept. */
  function startEdit(id: string): void {
    const entry = byId.value.get(id)
    if (!entry) return
    if (form.value?.id === id && unsaved.value) return
    const same = form.value?.id === id
    form.value = toForm(entry)
    if (!same) formErrors.value = NO_ERRORS
  }

  /**
   * Takes what the person changed. A kind that the chosen category no longer fits clears the
   * category. A new account brings its currency, unless the person had picked a currency other
   * than the old account's. A new account drops the stated account amount, which was in the old
   * account's currency, and so does a currency equal to the account's. A new account, currency or
   * date drops the rate prompt.
   */
  function change(next: Partial<TransactionFormValue>): void {
    const current = form.value
    if (!current) return
    const merged = { ...current, ...next }
    const categoryKind = merged.categoryId === null
      ? undefined
      : references.categoryKind(merged.categoryId)
    if (
      next.kind !== undefined && categoryKind !== undefined &&
      !categoryFitsKind(merged.kind, categoryKind)
    ) merged.categoryId = null
    if (
      next.accountId !== undefined && next.accountId !== current.accountId &&
      next.currency === undefined
    ) {
      const before = current.accountId === null
        ? undefined
        : references.accountCurrency(current.accountId)
      const after = next.accountId === null ? undefined : references.accountCurrency(next.accountId)
      if (after !== undefined && (current.currency === null || current.currency === before)) {
        merged.currency = after
      }
    }
    const accountCurrency = merged.accountId === null
      ? undefined
      : references.accountCurrency(merged.accountId)
    if (
      merged.currency === null || merged.currency === accountCurrency ||
      merged.accountId !== current.accountId
    ) merged.accountAmount = null
    form.value = merged
    if (
      (next.accountId !== undefined && next.accountId !== current.accountId) ||
      (next.currency !== undefined && next.currency !== current.currency) ||
      (next.date !== undefined && next.date !== current.date)
    ) formErrors.value = { ...formErrors.value, noRate: false, accountAmount: null }
  }

  function closeForm(): void {
    form.value = null
    formErrors.value = NO_ERRORS
  }

  function keep(entry: TransactionItem): TransactionItem {
    transactions.value = [entry, ...transactions.value.filter((other) => other.id !== entry.id)]
      .sort(byDate)
    return entry
  }

  /** Checks the editor before a write; `null` with the errors set when it cannot be sent. */
  function validated(
    current: TransactionForm,
  ): (TransactionFields & { accountCurrency: string }) | null {
    const memo = current.memo.trim()
    const accountCurrency = current.accountId === null
      ? undefined
      : references.accountCurrency(current.accountId)
    const errors: TransactionFormErrors = {
      ...NO_ERRORS,
      noRate: formErrors.value.noRate,
      amount: current.amount === null || current.amount <= 0
        ? TRANSACTION_MESSAGES.amountRequired
        : null,
      currency: current.currency === null ? TRANSACTION_MESSAGES.currencyRequired : null,
      account: accountCurrency === undefined ? TRANSACTION_MESSAGES.accountRequired : null,
      category: current.categoryId === null ? TRANSACTION_MESSAGES.categoryRequired : null,
      memo: memo.length > TRANSACTION_MEMO_MAX_LENGTH
        ? {
          key: `TransactionMessages.memoTooLong`,
          values: { max: TRANSACTION_MEMO_MAX_LENGTH, count: memo.length },
        }
        : hasUnsafeTextCharacters(memo)
        ? TRANSACTION_MESSAGES.memoUnsafe
        : null,
    }
    const converted = current.currency !== null && current.currency !== accountCurrency
    if (errors.noRate && converted && current.accountAmount === null) {
      errors.accountAmount = formErrors.value.accountAmount
    }
    const blocked = errors.amount || errors.currency || errors.account || errors.category ||
      errors.memo || errors.accountAmount
    if (blocked || accountCurrency === undefined) {
      formErrors.value = errors
      return null
    }
    return {
      accountId: current.accountId!,
      categoryId: current.categoryId!,
      kind: current.kind,
      amount: current.amount!,
      currency: current.currency!,
      ...(converted && current.accountAmount !== null
        ? { accountAmount: current.accountAmount }
        : {}),
      memo,
      date: current.date,
      accountCurrency,
    }
  }

  /**
   * Saves the editor: creates or updates. Resolves the entry as saved; `null` when it was refused
   * or failed, with the reason under its field. An entry that moved on is read again and shown as
   * it is now, with a message.
   */
  async function save(): Promise<TransactionItem | null> {
    const forGroup = groupId.value
    const current = form.value
    if (!forGroup || !current || saving.value) return null
    const fields = validated(current)
    if (!fields) return null
    saving.value = true
    formErrors.value = NO_ERRORS
    try {
      const { transaction } = current.id === null
        ? await dependencies.create({ groupId: forGroup, id: draftId, ...fields })
        : await dependencies.update({
          groupId: forGroup,
          id: current.id,
          version: current.version,
          ...fields,
        })
      if (groupId.value === forGroup) keep(transaction)
      if (current.id === null) draftId = dependencies.newId()
      form.value = toForm(transaction)
      return transaction
    } catch (cause) {
      formErrors.value = await refusal(cause, current)
      return null
    } finally {
      saving.value = false
    }
  }

  /** What a refused or failed write says, each reason under its field. */
  async function refusal(cause: unknown, current: TransactionForm): Promise<TransactionFormErrors> {
    const code = transactionCode(cause)
    switch (code) {
      case "VERSION_CONFLICT":
      case "TRANSACTION_NOT_FOUND": {
        await refresh()
        const latest = current.id === null ? undefined : byId.value.get(current.id)
        form.value = latest ? toForm(latest) : null
        return {
          ...NO_ERRORS,
          form: latest && code === "VERSION_CONFLICT"
            ? TRANSACTION_MESSAGES.conflict
            : TRANSACTION_MESSAGES.gone,
        }
      }
      case "NO_RATE":
        return {
          ...NO_ERRORS,
          noRate: true,
          accountAmount: { key: `TransactionMessages.noRate`, values: {} },
        }
      case "ACCOUNT_NOT_FOUND":
        return { ...NO_ERRORS, account: TRANSACTION_MESSAGES.accountGone }
      case "CATEGORY_NOT_FOUND":
        return { ...NO_ERRORS, category: TRANSACTION_MESSAGES.categoryGone }
      case "CATEGORY_KIND_MISMATCH":
        return { ...NO_ERRORS, category: TRANSACTION_MESSAGES.categoryKind }
      case "ROLE_INSUFFICIENT":
        return { ...NO_ERRORS, form: TRANSACTION_MESSAGES.role }
      case "ID_ALREADY_EXISTS":
        // The id was used for another entry: the next Save sends a new one.
        draftId = dependencies.newId()
        return { ...NO_ERRORS, form: TRANSACTION_MESSAGES.create }
    }
    const plan = planRefusal(cause)
    if (plan) return { ...NO_ERRORS, plan }
    const fields = {
      amount: refusedField(cause, "amount"),
      currency: refusedField(cause, "currency"),
      accountAmount: refusedField(cause, "accountAmount"),
      date: refusedField(cause, "date"),
      memo: refusedField(cause, "memo"),
    }
    const any = Object.values(fields).some((value) => value !== null)
    return {
      ...NO_ERRORS,
      ...fields,
      form: any ? null : describeError(
        cause,
        current.id === null ? TRANSACTION_MESSAGES.create : TRANSACTION_MESSAGES.save,
      ),
    }
  }

  /** Deletes an entry at the version the person saw, and offers Undo. Resolves `true` once deleted. */
  async function remove(id: string): Promise<boolean> {
    const forGroup = groupId.value
    const entry = byId.value.get(id)
    if (!forGroup || !entry || pendingId.value) return false
    pendingId.value = id
    listError.value = null
    try {
      await dependencies.delete({ groupId: forGroup, id, version: entry.version })
      transactions.value = transactions.value.filter((other) => other.id !== id)
      if (form.value?.id === id) closeForm()
      undo.value = { id, transaction: entry, until: Date.now() + UNDO_MS }
      return true
    } catch (cause) {
      const code = transactionCode(cause)
      // Read the list first: a read that succeeds clears the list's message.
      if (code === "VERSION_CONFLICT" || code === "TRANSACTION_NOT_FOUND") await refresh()
      listError.value = code === "VERSION_CONFLICT"
        ? TRANSACTION_MESSAGES.conflict
        : code === "TRANSACTION_NOT_FOUND"
        ? TRANSACTION_MESSAGES.gone
        : describeError(cause, TRANSACTION_MESSAGES.delete)
      return false
    } finally {
      pendingId.value = null
    }
  }

  /**
   * Brings a deleted entry back. Resolves the entry once restored, `null` when it was refused or
   * failed (the reason is in `listError` or `listPlan`). A delete still queued on the device is
   * taken back without the server; any other restore needs it and is never queued.
   */
  async function restore(id: string): Promise<TransactionItem | null> {
    const forGroup = groupId.value
    if (!forGroup || pendingId.value) return null
    pendingId.value = id
    listError.value = null
    listPlan.value = null
    try {
      const { transaction } = await dependencies.restore({ groupId: forGroup, id })
      if (deleted.value) deleted.value = deleted.value.filter((other) => other.id !== id)
      if (undo.value?.id === id) undo.value = null
      if (groupId.value === forGroup) keep(transaction)
      return transaction
    } catch (cause) {
      const code = transactionCode(cause)
      listPlan.value = planRefusal(cause)
      listError.value = listPlan.value
        ? null
        : code === "TRANSACTION_NOT_FOUND"
        ? TRANSACTION_MESSAGES.restoreGone
        : cause instanceof RealtimeRequestError
        ? describeError(cause, TRANSACTION_MESSAGES.restore)
        : TRANSACTION_MESSAGES.restoreOffline
      if (code === "TRANSACTION_NOT_FOUND") {
        if (undo.value?.id === id) undo.value = null
        if (deleted.value !== null) await readDeleted(forGroup).catch(() => {})
      }
      return null
    } finally {
      pendingId.value = null
    }
  }

  /** Takes back the delete the Undo toast offers. */
  async function undoDelete(): Promise<boolean> {
    const offer = undo.value
    if (!offer) return false
    undo.value = null
    return (await restore(offer.id)) !== null
  }

  function dismissUndo(): void {
    undo.value = null
  }

  function reset(): void {
    reads++
    groupId.value = null
    transactions.value = []
    loaded.value = false
    deleted.value = null
    loading.value = false
    listError.value = null
    listPlan.value = null
    form.value = null
    formErrors.value = NO_ERRORS
    saving.value = false
    pendingId.value = null
    undo.value = null
  }

  return {
    groupId,
    transactions,
    loaded,
    deleted,
    byId,
    loading,
    listError,
    listPlan,
    form,
    formErrors,
    saving,
    pendingId,
    undo,
    unsaved,
    open,
    refresh,
    showDeleted,
    startCreate,
    startEdit,
    change,
    closeForm,
    save,
    remove,
    restore,
    undoDelete,
    dismissUndo,
    reset,
  }
}

/** One page of `group.changes`, as far as the entries go. */
interface ChangesPage {
  status: string
  through?: number
  more?: boolean
  upserts?: { transactions?: TransactionItem[] }
}

/**
 * The entries as the server serves them, through the calls port. There is no list query: without
 * the device's copy, the live entries are read whole from the changes pull.
 */
export const onlineTransactions: TransactionsDependencies = {
  async fetchList(groupId) {
    const rows: TransactionItem[] = []
    let after = 0
    for (;;) {
      const page = await callQuery<ChangesPage>("group.changes", { groupId, after })
      rows.push(...(page.upserts?.transactions ?? []))
      if (page.status !== "changes" || !page.more || page.through === undefined) break
      after = page.through
    }
    return rows.sort(byDate)
  },
  async fetchDeleted(groupId) {
    const { transactions } = await callQuery<{ transactions: TransactionItem[] }>(
      "transaction.listDeleted",
      { groupId },
    )
    return transactions
  },
  create: ({ accountCurrency: _, ...input }) => callCommand("transaction.create", input),
  update: ({ accountCurrency: _, ...input }) => callCommand("transaction.update", input),
  async delete(input) {
    await callCommand("transaction.delete", input)
  },
  restore(input) {
    if (!canCall()) {
      return Promise.reject(new ConnectionLostError("the server cannot be reached"))
    }
    return callCommand("transaction.restore", input)
  },
  newId: () => uuidV7(),
}

/** The pages' own store: the device's copy and the queue in front of the server. */
export const transactionsStore = createTransactionsStore(
  offlineTransactions(onlineTransactions, currentLayer),
  {
    accountCurrency: (id) => accountsStore.byId.value.get(id)?.currency,
    categoryKind: (id) => categoriesStore.byId.value.get(id)?.kind,
  },
)
