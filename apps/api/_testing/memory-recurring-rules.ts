import { assertRoomFor } from "@domain/billing"
import { GroupRole } from "@domain/groups"
import {
  assertRuleReferences,
  type RecurringRule,
  type RecurringRuleCreateInput,
  type RecurringRuleDeleteInput,
  RecurringRuleError,
  type RecurringRuleRepository,
  type RecurringRuleRestoreInput,
  type RecurringRuleSkipInput,
  type RecurringRuleUpdateInput,
  RecurringRuleVersionConflictError,
  type RecurringRuleWriteResult,
  skipDate,
} from "@domain/recurring"
import type { MemoryEntryReferences } from "./memory-transactions.ts"

const AT = new Date(`2026-11-02T10:00:00.000Z`)

const notFound = () =>
  new RecurringRuleError(`RECURRING_RULE_NOT_FOUND`, `Repeating entry not found`)

/**
 * Repeating rules in memory, with the Postgres repository's rules: an id, an account and a category
 * are looked up inside their group, a write at another version is refused with the current one,
 * and a skip uses the domain's {@link skipDate}. The role check under the lock and the race with a
 * removal need Postgres; the integration tests hold them.
 */
export class MemoryRecurringRuleRepository implements RecurringRuleRepository {
  readonly rules = new Map<string, RecurringRule>()
  writes = 0
  #sequence = 1

  constructor(
    readonly references: Pick<MemoryEntryReferences, `accounts` | `categories`>,
  ) {}

  get(groupId: string, id: string): Promise<RecurringRule | null> {
    const rule = this.#find(groupId, id)
    return Promise.resolve(rule && rule.deletedAt === null ? rule : null)
  }

  list(groupId: string): Promise<RecurringRule[]> {
    return Promise.resolve(
      [...this.rules.values()].filter((rule) => rule.groupId === groupId && !rule.deletedAt),
    )
  }

  async count(groupId: string): Promise<number> {
    return (await this.list(groupId)).length
  }

  async create(
    input: RecurringRuleCreateInput,
    actorId: number,
  ): Promise<RecurringRuleWriteResult> {
    const existing = this.rules.get(input.id)
    if (existing) {
      if (existing.groupId === input.groupId && existing.createdByUserId === actorId) {
        return { rule: existing, created: false }
      }
      throw new RecurringRuleError(`ID_ALREADY_EXISTS`, `taken`)
    }
    assertRuleReferences(input, this.#referencesOf(input))
    await this.#assertRoom(input.groupId, input.allowance)
    const { allowance: _allowance, requestId: _requestId, ...fields } = input
    const rule: RecurringRule = {
      ...fields,
      skippedDates: [],
      madeThrough: null,
      pausedReason: null,
      version: 1,
      changeSequence: String(this.#sequence++),
      createdByUserId: actorId,
      updatedByUserId: actorId,
      createdAt: AT,
      updatedAt: AT,
      deletedAt: null,
    }
    this.rules.set(rule.id, rule)
    this.writes++
    return { rule, created: true }
  }

  update(input: RecurringRuleUpdateInput, actorId: number): Promise<RecurringRule> {
    const current = this.#live(input.groupId, input.id)
    if (current.version !== input.expectedVersion) {
      throw new RecurringRuleVersionConflictError(current.version)
    }
    assertRuleReferences(input, this.#referencesOf(input))
    const { expectedVersion: _version, requestId: _requestId, ...fields } = input
    return Promise.resolve(this.#write({ ...current, ...fields, updatedByUserId: actorId }))
  }

  delete(input: RecurringRuleDeleteInput, actorId: number): Promise<RecurringRule> {
    const current = this.#live(input.groupId, input.id)
    if (current.version !== input.expectedVersion) {
      throw new RecurringRuleVersionConflictError(current.version)
    }
    return Promise.resolve(this.#write({ ...current, deletedAt: AT, updatedByUserId: actorId }))
  }

  async restore(input: RecurringRuleRestoreInput, actorId: number): Promise<RecurringRule> {
    const current = this.#find(input.groupId, input.id)
    if (!current || current.deletedAt === null) throw notFound()
    assertRuleReferences(current, this.#referencesOf(current))
    await this.#assertRoom(input.groupId, input.allowance)
    return this.#write({ ...current, deletedAt: null, updatedByUserId: actorId })
  }

  skip(input: RecurringRuleSkipInput, actorId: number): Promise<RecurringRule> {
    const current = this.#live(input.groupId, input.id)
    const skippedDates = skipDate(current, input.date)
    if (skippedDates === null) return Promise.resolve(current)
    return Promise.resolve(this.#write({ ...current, skippedDates, updatedByUserId: actorId }))
  }

  async #assertRoom(groupId: string, allowance: number | null): Promise<void> {
    if (allowance === null) return
    assertRoomFor(`maxRecurringRules`, allowance, await this.count(groupId), GroupRole.EDITOR)
  }

  #find(groupId: string, id: string): RecurringRule | null {
    const rule = this.rules.get(id)
    return rule && rule.groupId === groupId ? rule : null
  }

  #live(groupId: string, id: string): RecurringRule {
    const current = this.#find(groupId, id)
    if (!current || current.deletedAt !== null) throw notFound()
    return current
  }

  #referencesOf(input: { groupId: string; accountId: string; categoryId: string }) {
    const account = this.references.accounts.get(input.accountId)
    const category = this.references.categories.get(input.categoryId)
    return {
      account: account && account.groupId === input.groupId && !account.deleted
        ? { currency: account.currency }
        : null,
      category: category && category.groupId === input.groupId ? { kind: category.kind } : null,
    }
  }

  #write(rule: RecurringRule): RecurringRule {
    const written = {
      ...rule,
      version: rule.version + 1,
      changeSequence: String(this.#sequence++),
      updatedAt: AT,
    }
    this.rules.set(written.id, written)
    this.writes++
    return written
  }
}
