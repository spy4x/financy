import { computed, signal } from "@preact/signals"
import { ConnectionLostError, describeError, RealtimeRequestError } from "@spy4x/realtime"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { hasUnsafeTextCharacters } from "@spy4x/platform/universal/text"
import { type PlanRefusal, readPlanRefusal } from "@domain/billing"
import { TRANSFER_MEMO_MAX_LENGTH } from "@domain/transfers"
import type { Message } from "@ui/message.ts"
import { refusedField } from "../i18n.ts"
import { byDate } from "./transaction-order.ts"
import { type AccountItem, accountsStore } from "./accounts.ts"
import type { TransactionFormValue } from "./transactions.ts"
import { callCommand, callQuery, canCall, currentLayer, offlineTransfers } from "../modules.ts"

/** A transfer as the API sends it: dates are ISO strings, the sequence a decimal string. */
export interface TransferItem {
  id: string
  groupId: string
  fromAccountId: string
  /** What left the from account, above zero, in its currency's smallest unit. */
  sentAmount: number
  toAccountId: string
  /** What arrived in the to account, above zero, in its currency's smallest unit. */
  receivedAmount: number
  /** The server filled `receivedAmount` from the rate of the transfer's date. */
  converted: boolean
  memo: string
  date: string
  version: number
  changeSequence: string
  createdByUserId: number | null
  updatedByUserId: number | null
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
}

/** What the person types into the transfer editor. Amounts are positive, in smallest units. */
export interface TransferFormValue {
  fromAccountId: string | null
  toAccountId: string | null
  sentAmount: number | null
  /** Only across currencies; `null` lets the server convert at the date's rate. */
  receivedAmount: number | null
  date: string
  memo: string
}

/** The fields a write sends, as the server reads them. */
export interface TransferFields {
  fromAccountId: string
  toAccountId: string
  sentAmount: number
  receivedAmount?: number
  memo: string
  date: string
}

interface Versioned {
  groupId: string
  id: string
  version: number
}

/** What the transfers store needs from the outside. Injected so tests need no network. */
export interface TransfersDependencies {
  /** A household's live transfers, the latest date first. */
  fetchList(groupId: string): Promise<TransferItem[]>
  create(
    input: { groupId: string; id: string } & TransferFields,
  ): Promise<{ transfer: TransferItem }>
  update(input: Versioned & TransferFields): Promise<{ transfer: TransferItem }>
  delete(input: Versioned): Promise<void>
  restore(input: { groupId: string; id: string }): Promise<{ transfer: TransferItem }>
  newId(): string
}

/** What the store says went wrong, as keys of the `app` catalog. */
export const TRANSFER_MESSAGES = {
  fromRequired: `TransferMessages.fromRequired`,
  toRequired: `TransferMessages.toRequired`,
  amountRequired: `TransactionMessages.amountRequired`,
  memoUnsafe: `TransactionMessages.memoUnsafe`,
  accountGone: `TransactionMessages.accountGone`,
  sameAccount: `TransferMessages.sameAccount`,
  role: `TransferMessages.role`,
  conflict: `TransferMessages.conflict`,
  gone: `TransferMessages.gone`,
  load: `TransferMessages.load`,
  create: `TransferMessages.create`,
  save: `TransferMessages.save`,
  delete: `TransferMessages.delete`,
  restore: `TransferMessages.restore`,
  restoreOffline: `TransferMessages.restoreOffline`,
} as const

/** The editor's errors, each under its field. */
export interface TransferFormErrors {
  from: Message | null
  to: Message | null
  sentAmount: Message | null
  receivedAmount: Message | null
  date: Message | null
  memo: Message | null
  form: Message | null
  /** The server has no rate for the date: the received amount is now required. */
  noRate: boolean
  plan: PlanRefusal | null
}

export const NO_TRANSFER_ERRORS: TransferFormErrors = {
  from: null,
  to: null,
  sentAmount: null,
  receivedAmount: null,
  date: null,
  memo: null,
  form: null,
  noRate: false,
  plan: null,
}

/** The editor: the transfer being created (`id: null`) or edited, and what it was when opened. */
export interface TransferForm extends TransferFormValue {
  id: string | null
  version: number
  base: TransferFormValue
}

/** The transfer a person just deleted and may still take back. */
export interface TransferUndoOffer {
  id: string
  transfer: TransferItem
  /** When the offer ends, in milliseconds since the epoch. */
  until: number
}

/** How long Undo is offered after a delete, in milliseconds. */
export const TRANSFER_UNDO_MS = 8_000

/** What the store reads of the household's accounts, which another store keeps. */
export interface TransferReferences {
  accountCurrency(accountId: string): string | undefined
}

/** The code of a refused call (`TRANSFER_NOT_FOUND`, `NO_RATE`...), or `null`. */
function refusalCode(error: unknown): string | null {
  if (!(error instanceof RealtimeRequestError)) return null
  const code = (error.details as { code?: unknown } | undefined)?.code
  return typeof code === "string" ? code : null
}

function planRefusal(error: unknown): PlanRefusal | null {
  return error instanceof RealtimeRequestError ? readPlanRefusal(error.details) : null
}

/**
 * A saved transfer as the editor opens it. A converted received amount is the server's: the field
 * stays empty, so an unchanged save keeps it. A stated one is the person's own rate and shows.
 */
function fieldsOf(transfer: TransferItem, references: TransferReferences): TransferFormValue {
  const from = references.accountCurrency(transfer.fromAccountId)
  const to = references.accountCurrency(transfer.toAccountId)
  const across = from !== undefined && to !== undefined && from !== to
  return {
    fromAccountId: transfer.fromAccountId,
    toAccountId: transfer.toAccountId,
    sentAmount: transfer.sentAmount,
    receivedAmount: across && !transfer.converted ? transfer.receivedAmount : null,
    date: transfer.date,
    memo: transfer.memo,
  }
}

function sameFields(a: TransferFormValue, b: TransferFormValue): boolean {
  return a.fromAccountId === b.fromAccountId && a.toAccountId === b.toAccountId &&
    a.sentAmount === b.sentAmount && a.receivedAmount === b.receivedAmount &&
    a.date === b.date && a.memo === b.memo
}

/**
 * The transfers of one household: the list (offline-readable, ADR 003 level 2, from the device's
 * copy of the changes pull), the one editor the transfer pages open, and the Undo a delete
 * offers. Writes need the server; offline writes come with #248.
 */
export function createTransfersStore(
  dependencies: TransfersDependencies,
  references: TransferReferences,
) {
  const groupId = signal<string | null>(null)
  const transfers = signal<readonly TransferItem[]>([])
  const loaded = signal(false)
  const loading = signal(false)
  const listError = signal<Message | null>(null)
  const listPlan = signal<PlanRefusal | null>(null)
  const form = signal<TransferForm | null>(null)
  const formErrors = signal<TransferFormErrors>(NO_TRANSFER_ERRORS)
  const saving = signal(false)
  const pendingId = signal<string | null>(null)
  const undo = signal<TransferUndoOffer | null>(null)
  const byId = computed(() => new Map(transfers.value.map((item) => [item.id, item])))
  const unsaved = computed(() => {
    const current = form.value
    return current !== null && !sameFields(current, current.base)
  })
  let reads = 0
  /** The id of the new transfer in the editor: every Save of that draft sends it. */
  let draftId = ""
  const currency = (id: string | null) => id === null ? undefined : references.accountCurrency(id)
  const toForm = (transfer: TransferItem): TransferForm => {
    const base = fieldsOf(transfer, references)
    return { id: transfer.id, ...base, version: transfer.version, base }
  }

  /** Reads the open household's transfers again; a read answered for another group is dropped. */
  async function refresh(): Promise<void> {
    const id = groupId.value
    if (id === null) return
    const read = ++reads
    loading.value = true
    try {
      const rows = await dependencies.fetchList(id)
      if (read !== reads || groupId.value !== id) return
      transfers.value = rows
      loaded.value = true
      listError.value = null
    } catch (cause) {
      if (read !== reads || groupId.value !== id) return
      listError.value = describeError(cause, TRANSFER_MESSAGES.load)
    } finally {
      if (read === reads) loading.value = false
    }
  }

  /** Shows a household's transfers. Opening the household already open reads it again. */
  function open(nextGroupId: string): Promise<void> {
    if (groupId.value !== nextGroupId) {
      reset()
      groupId.value = nextGroupId
    }
    return refresh()
  }

  /** Opens the editor for a new transfer with `value` filled in. */
  function startCreate(value: TransferFormValue): void {
    draftId = dependencies.newId()
    form.value = { id: null, ...value, version: 0, base: value }
    formErrors.value = NO_TRANSFER_ERRORS
  }

  /** Opens the editor of a transfer; a form with unsaved changes on it is kept. */
  function startEdit(id: string): void {
    const transfer = byId.value.get(id)
    if (!transfer) return
    if (form.value?.id === id && unsaved.value) return
    const same = form.value?.id === id
    form.value = toForm(transfer)
    if (!same) formErrors.value = NO_TRANSFER_ERRORS
  }

  /**
   * Takes what the person changed. A from account equal to the to account clears the to account,
   * so the two never match. A new account on either side drops the received amount, which was in
   * the old pair's terms, and so do two accounts of one currency. On a saved transfer, a new sent
   * amount drops a received amount the person has not typed since opening it, so the server
   * converts the new amount at the date's rate and what is saved is what the form says. A new
   * account, sent amount or date drops the rate prompt.
   */
  function change(next: Partial<TransferFormValue>): void {
    const current = form.value
    if (!current) return
    const merged = { ...current, ...next }
    if (
      next.fromAccountId !== undefined && merged.fromAccountId !== null &&
      merged.fromAccountId === merged.toAccountId
    ) merged.toAccountId = null
    const accountsMoved = merged.fromAccountId !== current.fromAccountId ||
      merged.toAccountId !== current.toAccountId
    const from = currency(merged.fromAccountId)
    const to = currency(merged.toAccountId)
    const sentMoved = next.sentAmount !== undefined && next.sentAmount !== current.sentAmount
    if (accountsMoved || from === undefined || to === undefined || from === to) {
      merged.receivedAmount = null
    } else if (
      sentMoved && current.id !== null && next.receivedAmount === undefined &&
      current.receivedAmount === current.base.receivedAmount
    ) merged.receivedAmount = null
    form.value = merged
    if (accountsMoved || sentMoved || (next.date !== undefined && next.date !== current.date)) {
      formErrors.value = { ...formErrors.value, noRate: false, receivedAmount: null }
    }
  }

  function closeForm(): void {
    form.value = null
    formErrors.value = NO_TRANSFER_ERRORS
  }

  function keep(transfer: TransferItem): TransferItem {
    transfers.value = [transfer, ...transfers.value.filter((other) => other.id !== transfer.id)]
      .sort(byDate)
    return transfer
  }

  /** Checks the editor before a write; `null` with the errors set when it cannot be sent. */
  function validated(current: TransferForm): TransferFields | null {
    const memo = current.memo.trim()
    const from = currency(current.fromAccountId)
    const to = currency(current.toAccountId)
    const across = from !== undefined && to !== undefined && from !== to
    const errors: TransferFormErrors = {
      ...NO_TRANSFER_ERRORS,
      noRate: formErrors.value.noRate,
      from: from === undefined ? TRANSFER_MESSAGES.fromRequired : null,
      to: to === undefined
        ? TRANSFER_MESSAGES.toRequired
        : current.toAccountId === current.fromAccountId
        ? TRANSFER_MESSAGES.sameAccount
        : null,
      sentAmount: current.sentAmount === null || current.sentAmount <= 0
        ? TRANSFER_MESSAGES.amountRequired
        : null,
      memo: memo.length > TRANSFER_MEMO_MAX_LENGTH
        ? {
          key: `TransactionMessages.memoTooLong`,
          values: { max: TRANSFER_MEMO_MAX_LENGTH, count: memo.length },
        }
        : hasUnsafeTextCharacters(memo)
        ? TRANSFER_MESSAGES.memoUnsafe
        : null,
    }
    if (errors.noRate && across && current.receivedAmount === null) {
      errors.receivedAmount = formErrors.value.receivedAmount
    }
    if (
      errors.from || errors.to || errors.sentAmount || errors.memo || errors.receivedAmount
    ) {
      formErrors.value = errors
      return null
    }
    return {
      fromAccountId: current.fromAccountId!,
      toAccountId: current.toAccountId!,
      sentAmount: current.sentAmount!,
      ...(across && current.receivedAmount !== null
        ? { receivedAmount: current.receivedAmount }
        : {}),
      memo,
      date: current.date,
    }
  }

  /**
   * Saves the editor: creates or updates. Resolves the transfer as saved; `null` when it was
   * refused or failed, with the reason under its field. A transfer that moved on is read again
   * and shown as it is now, with a message.
   */
  async function save(): Promise<TransferItem | null> {
    const forGroup = groupId.value
    const current = form.value
    if (!forGroup || !current || saving.value) return null
    const fields = validated(current)
    if (!fields) return null
    saving.value = true
    formErrors.value = NO_TRANSFER_ERRORS
    try {
      const { transfer } = current.id === null
        ? await dependencies.create({ groupId: forGroup, id: draftId, ...fields })
        : await dependencies.update({
          groupId: forGroup,
          id: current.id,
          version: current.version,
          ...fields,
        })
      if (groupId.value === forGroup) keep(transfer)
      if (current.id === null) draftId = dependencies.newId()
      form.value = toForm(transfer)
      return transfer
    } catch (cause) {
      formErrors.value = await refusal(cause, current)
      return null
    } finally {
      saving.value = false
    }
  }

  /** What a refused or failed write says, each reason under its field. */
  async function refusal(cause: unknown, current: TransferForm): Promise<TransferFormErrors> {
    const code = refusalCode(cause)
    switch (code) {
      case "VERSION_CONFLICT":
      case "TRANSFER_NOT_FOUND": {
        await refresh()
        const latest = current.id === null ? undefined : byId.value.get(current.id)
        form.value = latest ? toForm(latest) : null
        return {
          ...NO_TRANSFER_ERRORS,
          form: latest && code === "VERSION_CONFLICT"
            ? TRANSFER_MESSAGES.conflict
            : TRANSFER_MESSAGES.gone,
        }
      }
      case "NO_RATE":
        return {
          ...NO_TRANSFER_ERRORS,
          noRate: true,
          receivedAmount: { key: `TransferMessages.noRate`, values: {} },
        }
      case "ACCOUNT_NOT_FOUND":
        return refusedField(cause, "toAccountId")
          ? { ...NO_TRANSFER_ERRORS, to: TRANSFER_MESSAGES.accountGone }
          : { ...NO_TRANSFER_ERRORS, from: TRANSFER_MESSAGES.accountGone }
      case "TRANSFER_SAME_ACCOUNT":
        return { ...NO_TRANSFER_ERRORS, to: TRANSFER_MESSAGES.sameAccount }
      case "ROLE_INSUFFICIENT":
        return { ...NO_TRANSFER_ERRORS, form: TRANSFER_MESSAGES.role }
      case "ID_ALREADY_EXISTS":
        // The id was used for another transfer: the next Save sends a new one.
        draftId = dependencies.newId()
        return { ...NO_TRANSFER_ERRORS, form: TRANSFER_MESSAGES.create }
    }
    const plan = planRefusal(cause)
    if (plan) return { ...NO_TRANSFER_ERRORS, plan }
    const fields = {
      sentAmount: refusedField(cause, "sentAmount"),
      receivedAmount: refusedField(cause, "receivedAmount"),
      date: refusedField(cause, "date"),
      memo: refusedField(cause, "memo"),
    }
    const any = Object.values(fields).some((value) => value !== null)
    return {
      ...NO_TRANSFER_ERRORS,
      ...fields,
      form: any ? null : describeError(
        cause,
        current.id === null ? TRANSFER_MESSAGES.create : TRANSFER_MESSAGES.save,
      ),
    }
  }

  /** Deletes a transfer at the version the person saw, and offers Undo. Resolves `true` once deleted. */
  async function remove(id: string): Promise<boolean> {
    const forGroup = groupId.value
    const transfer = byId.value.get(id)
    if (!forGroup || !transfer || pendingId.value) return false
    pendingId.value = id
    listError.value = null
    try {
      await dependencies.delete({ groupId: forGroup, id, version: transfer.version })
      transfers.value = transfers.value.filter((other) => other.id !== id)
      if (form.value?.id === id) closeForm()
      undo.value = { id, transfer, until: Date.now() + TRANSFER_UNDO_MS }
      return true
    } catch (cause) {
      const code = refusalCode(cause)
      // Read the list first: a read that succeeds clears the list's message.
      if (code === "VERSION_CONFLICT" || code === "TRANSFER_NOT_FOUND") await refresh()
      listError.value = code === "VERSION_CONFLICT"
        ? TRANSFER_MESSAGES.conflict
        : code === "TRANSFER_NOT_FOUND"
        ? TRANSFER_MESSAGES.gone
        : describeError(cause, TRANSFER_MESSAGES.delete)
      return false
    } finally {
      pendingId.value = null
    }
  }

  /**
   * Brings a deleted transfer back with the amounts it was stored with. Resolves the transfer once
   * restored, `null` when it was refused or failed (the reason is in `listError` or `listPlan`).
   */
  async function restore(id: string): Promise<TransferItem | null> {
    const forGroup = groupId.value
    if (!forGroup || pendingId.value) return null
    pendingId.value = id
    listError.value = null
    listPlan.value = null
    try {
      const { transfer } = await dependencies.restore({ groupId: forGroup, id })
      if (undo.value?.id === id) undo.value = null
      if (groupId.value === forGroup) keep(transfer)
      return transfer
    } catch (cause) {
      const code = refusalCode(cause)
      listPlan.value = planRefusal(cause)
      listError.value = listPlan.value
        ? null
        : code === "TRANSFER_NOT_FOUND"
        ? TRANSFER_MESSAGES.gone
        : cause instanceof RealtimeRequestError
        ? describeError(cause, TRANSFER_MESSAGES.restore)
        : TRANSFER_MESSAGES.restoreOffline
      if (code === "TRANSFER_NOT_FOUND" && undo.value?.id === id) undo.value = null
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
    transfers.value = []
    loaded.value = false
    loading.value = false
    listError.value = null
    listPlan.value = null
    form.value = null
    formErrors.value = NO_TRANSFER_ERRORS
    saving.value = false
    pendingId.value = null
    undo.value = null
  }

  return {
    groupId,
    transfers,
    loaded,
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

/**
 * What a new transfer opens with: the default account (else the first one not archived) as From,
 * no To, so the person names where the money goes, today, and empty amounts and memo.
 */
export function prefillTransfer(
  accounts: readonly Pick<AccountItem, "id" | "isDefault" | "archivedAt">[],
  today: string,
): TransferFormValue {
  const open = accounts.filter((account) => account.archivedAt === null)
  const from = open.find((account) => account.isDefault) ?? open[0] ?? null
  return {
    fromAccountId: from?.id ?? null,
    toAccountId: null,
    sentAmount: null,
    receivedAmount: null,
    date: today,
    memo: "",
  }
}

/** The fields the kind control carries between the transaction and transfer create pages. */
type EntryCarried = Pick<
  TransactionFormValue,
  "amount" | "currency" | "accountId" | "date" | "memo"
>

/**
 * What the transaction create page carries to a new transfer when the person picks Transfer: its
 * account as From, the date and the memo, and the amount when it is in that account's currency,
 * since a sent amount is always in the from account's.
 */
export function transferFromEntry(
  entry: EntryCarried,
  accountCurrency: (accountId: string) => string | undefined,
): Partial<TransferFormValue> {
  const currency = entry.accountId === null ? undefined : accountCurrency(entry.accountId)
  return {
    ...(currency === undefined ? {} : { fromAccountId: entry.accountId }),
    ...(currency !== undefined && currency === entry.currency ? { sentAmount: entry.amount } : {}),
    date: entry.date,
    memo: entry.memo,
  }
}

/**
 * What the transfer create page carries back to a new transaction when the person picks Expense
 * or Income: From as the account, with its currency and the sent amount, the date and the memo.
 */
export function entryFromTransfer(
  transfer: TransferFormValue,
  accountCurrency: (accountId: string) => string | undefined,
): Partial<EntryCarried> {
  const currency = transfer.fromAccountId === null
    ? undefined
    : accountCurrency(transfer.fromAccountId)
  return {
    ...(currency === undefined
      ? {}
      : { accountId: transfer.fromAccountId, currency, amount: transfer.sentAmount }),
    date: transfer.date,
    memo: transfer.memo,
  }
}

/** One page of `group.changes`, as far as the transfers go. */
interface ChangesPage {
  status: string
  through?: number
  more?: boolean
  upserts?: { transfers?: TransferItem[] }
}

/** Refuses a write the server cannot be reached for, before the call waits on a socket. */
function online<T>(call: () => Promise<T>): Promise<T> {
  if (!canCall()) return Promise.reject(new ConnectionLostError("the server cannot be reached"))
  return call()
}

/**
 * The transfers as the server serves them, through the calls port. There is no list query:
 * without the device's copy, the live transfers are read whole from the changes pull.
 */
export const onlineTransfers: TransfersDependencies = {
  async fetchList(groupId) {
    const rows: TransferItem[] = []
    let after = 0
    for (;;) {
      const page = await callQuery<ChangesPage>("group.changes", { groupId, after })
      rows.push(...(page.upserts?.transfers ?? []))
      if (page.status !== "changes" || !page.more || page.through === undefined) break
      after = page.through
    }
    return rows.sort(byDate)
  },
  create: (input) => online(() => callCommand("transfer.create", input)),
  update: (input) => online(() => callCommand("transfer.update", input)),
  async delete(input) {
    await online(() => callCommand("transfer.delete", input))
  },
  restore: (input) => online(() => callCommand("transfer.restore", input)),
  newId: () => uuidV7(),
}

/** The pages' own store: the device's copy in front of the server for reads. */
export const transfersStore = createTransfersStore(
  offlineTransfers(onlineTransfers, currentLayer),
  { accountCurrency: (id) => accountsStore.byId.value.get(id)?.currency },
)
