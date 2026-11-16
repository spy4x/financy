import { signal } from "@preact/signals"
import { ConnectionLostError } from "@spy4x/realtime"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import type { RecurringRule, RecurringRuleRequestFields } from "@domain/recurring"
import { callCommand, callQuery, canCall, offlineRecurring } from "../modules.ts"
import { byCreated } from "./recurring-order.ts"

/** A repeating rule as the API sends it: dates are ISO strings, the sequence a decimal string. */
export interface RecurringRuleItem
  extends Omit<RecurringRule, `createdAt` | `updatedAt` | `deletedAt`> {
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

/** One rule a write names. */
interface RuleRef {
  groupId: string
  id: string
}

/** What the rules store needs from the outside. Injected so tests need no network. */
export interface RecurringDependencies {
  /** A household's live rules, oldest first. */
  fetchList(groupId: string): Promise<RecurringRuleItem[]>
  create(
    input: RuleRef & RecurringRuleRequestFields,
  ): Promise<{ rule: RecurringRuleItem; created: boolean }>
  update(
    input: RuleRef & RecurringRuleRequestFields & { memo: string; version: number },
  ): Promise<{ rule: RecurringRuleItem }>
  delete(input: RuleRef & { version: number }): Promise<{ rule: RecurringRuleItem }>
  restore(input: RuleRef): Promise<{ rule: RecurringRuleItem }>
  skip(input: RuleRef & { date: string }): Promise<{ rule: RecurringRuleItem }>
  newId(): string
}

/**
 * One household's repeating rules. The list is level 2 (`docs/offline-data.md`): the layer reads it
 * from the device copy, which the changes pull keeps current, so it still reads with no network.
 * Writes go to the server only. A write the server refused, or could not be reached for, rejects
 * with that error and changes nothing; the screen chooses its words.
 */
export function createRecurringStore(dependencies: RecurringDependencies) {
  const groupId = signal<string | null>(null)
  const rules = signal<readonly RecurringRuleItem[]>([])
  const loading = signal(false)
  /** Why the last read failed, or `null`. */
  const error = signal<unknown>(null)
  let reads = 0

  /** Reads the open household's rules again; a read answered for another group is dropped. */
  async function refresh(): Promise<void> {
    const id = groupId.value
    if (id === null) return
    const read = ++reads
    loading.value = true
    try {
      const rows = await dependencies.fetchList(id)
      if (read !== reads || groupId.value !== id) return
      rules.value = rows
      error.value = null
    } catch (cause) {
      if (read !== reads || groupId.value !== id) return
      error.value = cause
    } finally {
      if (read === reads) loading.value = false
    }
  }

  /** Forgets the household on screen and its rules, for sign-out; a read in flight is dropped. */
  function reset(): void {
    reads++
    groupId.value = null
    rules.value = []
    loading.value = false
    error.value = null
  }

  /** Shows a household's rules. Opening the household already open reads it again. */
  function open(nextGroupId: string): Promise<void> {
    if (groupId.value !== nextGroupId) {
      reset()
      groupId.value = nextGroupId
    }
    return refresh()
  }

  /** Puts the rule a write answered with into the list on screen, in the server's order. */
  function show(rule: RecurringRuleItem): RecurringRuleItem {
    if (rule.groupId !== groupId.value) return rule
    const others = rules.value.filter((item) => item.id !== rule.id)
    rules.value = [...others, rule].sort(byCreated)
    return rule
  }

  return {
    groupId,
    rules,
    loading,
    error,
    open,
    refresh,
    reset,
    /** Adds a rule with a new id; returns it as the server saved it. */
    async create(
      input: { groupId: string } & RecurringRuleRequestFields,
    ): Promise<RecurringRuleItem> {
      const { rule } = await dependencies.create({ ...input, id: dependencies.newId() })
      return show(rule)
    },
    async update(
      input: Parameters<RecurringDependencies["update"]>[0],
    ): Promise<RecurringRuleItem> {
      return show((await dependencies.update(input)).rule)
    },
    async delete(input: RuleRef & { version: number }): Promise<void> {
      await dependencies.delete(input)
      rules.value = rules.value.filter((item) => item.id !== input.id)
    },
    async restore(input: RuleRef): Promise<RecurringRuleItem> {
      return show((await dependencies.restore(input)).rule)
    },
    async skip(input: RuleRef & { date: string }): Promise<RecurringRuleItem> {
      return show((await dependencies.skip(input)).rule)
    },
  }
}

/** The store {@link createRecurringStore} returns. */
export type RecurringStore = ReturnType<typeof createRecurringStore>

/** Refuses a write the server cannot be reached for, before the call waits on a socket. */
function online<T>(call: () => Promise<T>): Promise<T> {
  if (!canCall()) return Promise.reject(new ConnectionLostError("the server cannot be reached"))
  return call()
}

/** The rules as the server serves them, through the calls port. */
export const onlineRecurring: RecurringDependencies = {
  async fetchList(groupId) {
    const { rules } = await callQuery<{ rules: RecurringRuleItem[] }>("recurring.list", { groupId })
    return rules
  },
  create: (input) => online(() => callCommand("recurring.create", input)),
  update: (input) => online(() => callCommand("recurring.update", input)),
  delete: (input) => online(() => callCommand("recurring.delete", input)),
  restore: (input) => online(() => callCommand("recurring.restore", input)),
  skip: (input) => online(() => callCommand("recurring.skip", input)),
  newId: () => uuidV7(),
}

/** The app's own store: the device copy in front of the server's reads. */
export const recurringStore = createRecurringStore(offlineRecurring(onlineRecurring))
