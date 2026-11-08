import { computed, signal } from "@preact/signals"
import { describeError, RealtimeRequestError } from "@spy4x/realtime"
import { ReadRefused } from "@spy4x/realtime/read-cache"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { ACCOUNT_MAX_PER_GROUP, ACCOUNT_NAME_MAX_LENGTH, AccountKind } from "@domain/accounts"
import { type PlanRefusal, readPlanRefusal } from "@domain/billing"
import type { AccountFormValue } from "@ui/account-editor-screen.tsx"
import type { Message } from "@ui/message.ts"
import { apiAsUser } from "./realtime-call.ts"
import { READ_KEYS } from "./read-keys.ts"
import { refusedField } from "../i18n.ts"
import { callCommand, type LocalReads, localReads, noLocalReads } from "../modules.ts"

/** An account as the API sends it: dates are ISO strings, the sequence a decimal string. */
export interface AccountItem {
  id: string
  groupId: string
  name: string
  kind: AccountKind
  currency: string
  startingBalance: number
  /** Derived by the server; a write's answer carries none, so the store keeps the one it had. */
  balance?: number
  archivedAt: string | null
  isDefault: boolean
  version: number
  changeSequence: string
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

interface Versioned {
  groupId: string
  id: string
  version: number
}

/** What the accounts store needs from the outside. Injected so tests need no network. */
export interface AccountsDependencies {
  /** Reads a household's live accounts, or its deleted ones, over REST. */
  fetchList(groupId: string, deleted: boolean): Promise<AccountItem[]>
  create(
    input: { groupId: string; id: string } & AccountFields,
  ): Promise<{ account: AccountItem }>
  update(input: Versioned & AccountFields): Promise<{ account: AccountItem }>
  archive(input: Versioned & { archived: boolean }): Promise<{ account: AccountItem }>
  setDefault(input: Versioned & { isDefault: boolean }): Promise<{ account: AccountItem }>
  delete(input: Versioned): Promise<{ account: AccountItem }>
  restore(input: { groupId: string; id: string }): Promise<{ account: AccountItem }>
  newId(): string
}

interface AccountFields {
  name: string
  kind: AccountKind
  currency: string
  startingBalance: number
}

/** What the store says went wrong, as keys of the `app` catalog. */
export const ACCOUNT_MESSAGES = {
  nameRequired: `AccountMessages.nameRequired`,
  currencyRequired: `AccountMessages.currencyRequired`,
  conflict: `AccountMessages.conflict`,
  gone: `AccountMessages.gone`,
  load: `AccountMessages.load`,
  create: `AccountMessages.create`,
  save: `AccountMessages.save`,
  change: `AccountMessages.change`,
} as const

const LIMIT: Message = { key: `AccountMessages.limit`, values: { max: ACCOUNT_MAX_PER_GROUP } }

/** The editor: the account being created (`id: null`) or edited, and what it was when opened. */
export interface AccountForm extends AccountFormValue {
  id: string | null
  version: number
  base: AccountFormValue
}

export interface AccountFormErrors {
  name: Message | null
  currency: Message | null
  form: Message | null
  /**
   * The household's plan refused the new account: it has no paid plan, or it has reached its
   * plan's account cap.
   */
  plan: PlanRefusal | null
}

const NO_ERRORS: AccountFormErrors = { name: null, currency: null, form: null, plan: null }
const NEW_ACCOUNT: AccountFormValue = {
  name: "",
  kind: AccountKind.BANK,
  currency: null,
  startingBalance: 0,
}

/** The plan's refusal of a call, or `null` when the plan did not refuse it. */
function planRefusal(error: unknown): PlanRefusal | null {
  return error instanceof RealtimeRequestError ? readPlanRefusal(error.details) : null
}

/** The account code of a refused call (`ACCOUNT_NOT_FOUND`, `VERSION_CONFLICT`...), or `null`. */
function accountCode(error: unknown): string | null {
  if (!(error instanceof RealtimeRequestError)) return null
  const code = (error.details as { code?: unknown } | undefined)?.code
  return typeof code === "string" ? code : null
}

function fieldsOf(account: AccountItem): AccountFormValue {
  return {
    name: account.name,
    kind: account.kind,
    currency: account.currency,
    startingBalance: account.startingBalance,
  }
}

function toForm(account: AccountItem): AccountForm {
  const base = fieldsOf(account)
  return { id: account.id, ...base, version: account.version, base }
}

function sameFields(a: AccountFormValue, b: AccountFormValue): boolean {
  return a.name === b.name && a.kind === b.kind && a.currency === b.currency &&
    a.startingBalance === b.startingBalance
}

/**
 * The accounts of one household: the list (offline-readable, ADR 003 level 2, through the device's
 * copy), the trash while it is shown, and the one editor the account pages open. Writes go to the
 * server only; a balance is never computed here, it comes with the list.
 */
export function createAccountsStore(
  dependencies: AccountsDependencies,
  device: LocalReads = noLocalReads,
) {
  const groupId = signal<string | null>(null)
  const accounts = signal<readonly AccountItem[]>([])
  /** The deleted accounts while the trash is shown, else `null`. */
  const deleted = signal<readonly AccountItem[] | null>(null)
  const showArchived = signal(false)
  const loading = signal(false)
  const listError = signal<Message | null>(null)
  /** The plan's refusal of the last restore from the trash, shown in place of `listError`. */
  const listPlan = signal<PlanRefusal | null>(null)
  const form = signal<AccountForm | null>(null)
  const formErrors = signal<AccountFormErrors>(NO_ERRORS)
  const saving = signal(false)
  /** The account whose archive, default, delete or restore is in flight. */
  const pendingId = signal<string | null>(null)
  const byId = computed(() => new Map(accounts.value.map((account) => [account.id, account])))
  const unsaved = computed(() => {
    const current = form.value
    return current !== null && !sameFields(current, current.base)
  })
  /** The currencies the household uses, most accounts first: the picker offers them first. */
  const currencies = computed(() => {
    const counts = new Map<string, number>()
    for (const account of accounts.value) {
      counts.set(account.currency, (counts.get(account.currency) ?? 0) + 1)
    }
    return [...counts].sort((a, b) => b[1] - a[1]).map(([code]) => code)
  })
  let reads = 0
  /** The id of the new account in the editor: every Save of that draft sends it, so a retry is the same create. */
  let draftId = ""

  /** Reads the open household's accounts again; a read answered for another group is dropped. */
  async function refresh(): Promise<void> {
    const id = groupId.value
    if (id === null) return
    const read = ++reads
    loading.value = true
    try {
      const { value } = await device.through(
        READ_KEYS.accounts(id),
        () => dependencies.fetchList(id, false),
        (copy) => {
          if (read !== reads || groupId.value !== id) return false
          if (copy && accounts.value.length > 0) return false
          accounts.value = copy ? copy.value : []
        },
      )
      if (read !== reads || groupId.value !== id) return
      accounts.value = value
      listError.value = null
      if (deleted.value !== null) deleted.value = await dependencies.fetchList(id, true)
    } catch (cause) {
      if (read !== reads || groupId.value !== id) return
      listError.value = describeError(cause, ACCOUNT_MESSAGES.load)
    } finally {
      if (read === reads) loading.value = false
    }
  }

  /** Shows a household's accounts. Opening the household already open reads it again. */
  function open(nextGroupId: string): Promise<void> {
    if (groupId.value !== nextGroupId) {
      reset()
      groupId.value = nextGroupId
    }
    return refresh()
  }

  /** Shows or hides the trash; showing it reads the deleted accounts. */
  async function showDeleted(show: boolean): Promise<void> {
    const id = groupId.value
    if (!show || id === null) return void (deleted.value = null)
    deleted.value = []
    try {
      const rows = await dependencies.fetchList(id, true)
      if (groupId.value === id && deleted.value !== null) deleted.value = rows
    } catch (cause) {
      listError.value = describeError(cause, ACCOUNT_MESSAGES.load)
    }
  }

  function startCreate(): void {
    if (form.value?.id === null) return
    draftId = dependencies.newId()
    form.value = { id: null, ...NEW_ACCOUNT, version: 0, base: NEW_ACCOUNT }
    formErrors.value = NO_ERRORS
  }

  /** Opens the editor of an account; a form with unsaved changes on it is kept. */
  function startEdit(id: string): void {
    const account = byId.value.get(id)
    if (!account) return
    if (form.value?.id === id && unsaved.value) return
    const same = form.value?.id === id
    form.value = toForm(account)
    if (!same) formErrors.value = NO_ERRORS
  }

  function change(next: AccountFormValue): void {
    if (form.value) form.value = { ...form.value, ...next }
  }

  function revert(): void {
    if (!form.value) return
    form.value = { ...form.value, ...form.value.base }
    formErrors.value = NO_ERRORS
  }

  function closeForm(): void {
    form.value = null
    formErrors.value = NO_ERRORS
  }

  /** Puts `account` in the list in place of its old copy, keeping the balance the list had. */
  function keep(account: AccountItem, balance = byId.value.get(account.id)?.balance): AccountItem {
    const kept = { ...account, balance: balance ?? account.startingBalance }
    accounts.value = sorted([kept, ...accounts.value.filter((other) => other.id !== account.id)])
    return kept
  }

  /**
   * Saves the editor: creates or updates. Resolves the account as saved; `null` when it was refused
   * or failed. An account that moved on is read again and shown as it is now, with a message.
   */
  async function save(): Promise<AccountItem | null> {
    const forGroup = groupId.value
    const current = form.value
    if (!forGroup || !current || saving.value) return null
    const name = current.name.trim()
    if (!name || current.currency === null) {
      formErrors.value = {
        ...NO_ERRORS,
        name: name ? null : ACCOUNT_MESSAGES.nameRequired,
        currency: current.currency === null ? ACCOUNT_MESSAGES.currencyRequired : null,
      }
      return null
    }
    const fields: AccountFields = {
      name: name.slice(0, ACCOUNT_NAME_MAX_LENGTH),
      kind: current.kind,
      currency: current.currency,
      startingBalance: current.startingBalance ?? 0,
    }
    saving.value = true
    formErrors.value = NO_ERRORS
    try {
      const { account } = current.id === null
        ? await dependencies.create({ groupId: forGroup, id: draftId, ...fields })
        : await dependencies.update({
          groupId: forGroup,
          id: current.id,
          version: current.version,
          ...fields,
        })
      const old = byId.value.get(account.id)
      // Until transactions exist the balance is the starting balance; after a change of it the
      // list's balance moves by the same amount.
      const balance = old?.balance === undefined
        ? account.startingBalance
        : old.balance - old.startingBalance + account.startingBalance
      const saved = keep(account, balance)
      form.value = toForm(saved)
      return saved
    } catch (cause) {
      const code = accountCode(cause)
      if (code === "VERSION_CONFLICT" || code === "ACCOUNT_NOT_FOUND") {
        await refresh()
        const latest = current.id === null ? undefined : byId.value.get(current.id)
        form.value = latest ? toForm(latest) : null
        formErrors.value = {
          ...NO_ERRORS,
          form: latest && code === "VERSION_CONFLICT"
            ? ACCOUNT_MESSAGES.conflict
            : ACCOUNT_MESSAGES.gone,
        }
      } else if (code === "ACCOUNT_LIMIT_REACHED") {
        formErrors.value = { ...NO_ERRORS, form: LIMIT }
      } else if (planRefusal(cause)) {
        formErrors.value = { ...NO_ERRORS, plan: planRefusal(cause) }
      } else {
        const nameError = refusedField(cause, "name")
        const currencyError = refusedField(cause, "currency")
        formErrors.value = {
          ...NO_ERRORS,
          name: nameError,
          currency: currencyError,
          form: nameError || currencyError ? null : describeError(
            cause,
            current.id === null ? ACCOUNT_MESSAGES.create : ACCOUNT_MESSAGES.save,
          ),
        }
      }
      return null
    } finally {
      saving.value = false
    }
  }

  /**
   * Runs one change from a menu (archive, default, delete) at the version the person saw. Resolves
   * the account as changed, or `null` with the list's error set.
   */
  async function act(
    id: string,
    run: (input: Versioned) => Promise<{ account: AccountItem }>,
  ): Promise<AccountItem | null> {
    const forGroup = groupId.value
    const account = byId.value.get(id)
    if (!forGroup || !account || pendingId.value) return null
    pendingId.value = id
    listError.value = null
    try {
      const { account: changed } = await run({ groupId: forGroup, id, version: account.version })
      return changed
    } catch (cause) {
      const code = accountCode(cause)
      listError.value = code === "VERSION_CONFLICT"
        ? ACCOUNT_MESSAGES.conflict
        : code === "ACCOUNT_NOT_FOUND"
        ? ACCOUNT_MESSAGES.gone
        : describeError(cause, ACCOUNT_MESSAGES.change)
      if (code === "VERSION_CONFLICT" || code === "ACCOUNT_NOT_FOUND") await refresh()
      return null
    } finally {
      pendingId.value = null
    }
  }

  async function archive(id: string, archived: boolean): Promise<AccountItem | null> {
    const changed = await act(id, (input) => dependencies.archive({ ...input, archived }))
    return changed && afterChange(changed)
  }

  /** Makes `id` the default, or clears it; the old default loses its flag in the same read. */
  async function setDefault(id: string, isDefault: boolean): Promise<AccountItem | null> {
    const changed = await act(id, (input) => dependencies.setDefault({ ...input, isDefault }))
    if (!changed) return null
    // The server cleared the old default in the same write and moved its version: read it again.
    if (isDefault) void refresh()
    return afterChange(changed)
  }

  function afterChange(changed: AccountItem): AccountItem {
    const kept = keep(changed)
    if (form.value?.id === kept.id && !unsaved.value) form.value = toForm(kept)
    else if (form.value?.id === kept.id) form.value = { ...form.value, version: kept.version }
    return kept
  }

  /** Deletes an account; Undo restores it within the restore window. */
  async function remove(id: string): Promise<AccountItem | null> {
    const balance = byId.value.get(id)?.balance
    const changed = await act(id, (input) => dependencies.delete(input))
    if (!changed) return null
    accounts.value = accounts.value.filter((account) => account.id !== id)
    if (form.value?.id === id) closeForm()
    return { ...changed, balance }
  }

  /** Brings a deleted account back into the list. */
  async function restore(id: string): Promise<AccountItem | null> {
    const forGroup = groupId.value
    if (!forGroup || pendingId.value) return null
    pendingId.value = id
    listError.value = null
    listPlan.value = null
    try {
      const { account } = await dependencies.restore({ groupId: forGroup, id })
      if (deleted.value) deleted.value = deleted.value.filter((other) => other.id !== id)
      return keep(account, account.startingBalance)
    } catch (cause) {
      listPlan.value = planRefusal(cause)
      listError.value = listPlan.value
        ? null
        : accountCode(cause) === "ACCOUNT_LIMIT_REACHED"
        ? LIMIT
        : describeError(cause, ACCOUNT_MESSAGES.change)
      return null
    } finally {
      pendingId.value = null
      void refresh()
    }
  }

  function reset(): void {
    reads++
    groupId.value = null
    accounts.value = []
    deleted.value = null
    loading.value = false
    listError.value = null
    listPlan.value = null
    // A new account belongs to no household yet; an edited one belongs to the old household.
    if (form.value?.id !== null) form.value = null
    formErrors.value = NO_ERRORS
    saving.value = false
    pendingId.value = null
  }

  return {
    groupId,
    accounts,
    deleted,
    showArchived,
    byId,
    currencies,
    loading,
    listError,
    listPlan,
    form,
    formErrors,
    saving,
    pendingId,
    unsaved,
    open,
    refresh,
    showDeleted,
    startCreate,
    startEdit,
    change,
    revert,
    closeForm,
    save,
    archive,
    setDefault,
    remove,
    restore,
    reset,
  }
}

function sorted(all: AccountItem[]): AccountItem[] {
  return all.sort((a, b) =>
    a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id)
  )
}

/** The accounts as the server serves them: reads over REST, writes through the calls port. */
export const onlineAccounts: AccountsDependencies = {
  async fetchList(groupId, deleted) {
    const query = deleted ? "?deleted=true" : ""
    const result = await apiAsUser<{ accounts: AccountItem[] }>(
      `/api/groups/${groupId}/accounts${query}`,
    )
    if (!result.ok) throw new ReadRefused(result.error.message, result.status, result.error.reason)
    return result.data.accounts
  },
  create: (input) => callCommand("account.create", input),
  update: (input) => callCommand("account.update", input),
  archive: (input) => callCommand("account.archive", input),
  setDefault: (input) => callCommand("account.setDefault", input),
  delete: (input) => callCommand("account.delete", input),
  restore: (input) => callCommand("account.restore", input),
  newId: () => uuidV7(),
}

/** The page's own store, reading through the device's copy of the list. */
export const accountsStore = createAccountsStore(onlineAccounts, localReads)
