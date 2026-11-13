import type { CommandHandler, QueryHandler } from "@spy4x/platform/cqrs"
import {
  assertCanReadRecurringRules,
  assertCanWriteRecurringRules,
  RecurringRuleCreateCommand,
  RecurringRuleDeleteCommand,
  RecurringRuleError,
  type RecurringRuleFields,
  RecurringRuleGetQuery,
  RecurringRuleListQuery,
  type RecurringRuleRepository,
  type RecurringRuleRequestFields,
  RecurringRuleRestoreCommand,
  RecurringRuleSkipCommand,
  RecurringRuleUpdateCommand,
} from "@domain/recurring"
import type { GroupRoleLookup } from "@domain/notes"

/** What every rule handler needs: the rules and the actor's role in the household. */
export interface RecurringRuleHandlerDependencies {
  rules: RecurringRuleRepository
  groups: GroupRoleLookup
}

/**
 * Throws unless the entitlement gate set the plan's cap on the command: a bus without the gate
 * would add rules to a household that has no plan, so it fails closed.
 */
function assertGated(
  allowance: number | null | undefined,
  command: string,
): asserts allowance is number | null {
  if (allowance === undefined) {
    throw new Error(`${command} reached its handler without the entitlement gate`)
  }
}

/** The fields a rule stores: no memo is an empty one, and no account amount or end is `null`. */
function ruleFields(data: RecurringRuleRequestFields): RecurringRuleFields {
  return {
    accountId: data.accountId,
    categoryId: data.categoryId,
    kind: data.kind,
    amount: data.amount,
    currency: data.currency,
    accountAmount: data.accountAmount ?? null,
    memo: data.memo ?? ``,
    rrule: data.rrule,
    startDate: data.startDate,
    endDate: data.endDate ?? null,
    count: data.count ?? null,
  }
}

/**
 * The rule handlers. Each one decides who may act before it touches a rule: every member reads, an
 * editor or above writes, and a stranger is told the household does not exist. The repository
 * checks the role again inside each write's transaction, so a write that races a removal or a
 * demotion is refused too.
 */
export function createRecurringRuleCreateHandler(
  { rules, groups }: RecurringRuleHandlerDependencies,
): CommandHandler<RecurringRuleCreateCommand> {
  return async ({ data, allowance }) => {
    assertGated(allowance, `RecurringRuleCreateCommand`)
    assertCanWriteRecurringRules(await groups.roleOf(data.groupId, data.actor.userId))
    return await rules.create(
      {
        allowance,
        groupId: data.groupId,
        id: data.id,
        requestId: data.requestId,
        ...ruleFields(data),
      },
      data.actor.userId,
    )
  }
}

export function createRecurringRuleUpdateHandler(
  { rules, groups }: RecurringRuleHandlerDependencies,
): CommandHandler<RecurringRuleUpdateCommand> {
  return async ({ data }) => {
    assertCanWriteRecurringRules(await groups.roleOf(data.groupId, data.actor.userId))
    const rule = await rules.update(
      {
        groupId: data.groupId,
        id: data.id,
        expectedVersion: data.version,
        requestId: data.requestId,
        ...ruleFields(data),
      },
      data.actor.userId,
    )
    return { rule }
  }
}

export function createRecurringRuleDeleteHandler(
  { rules, groups }: RecurringRuleHandlerDependencies,
): CommandHandler<RecurringRuleDeleteCommand> {
  return async ({ data }) => {
    assertCanWriteRecurringRules(await groups.roleOf(data.groupId, data.actor.userId))
    const rule = await rules.delete(
      {
        groupId: data.groupId,
        id: data.id,
        expectedVersion: data.version,
        requestId: data.requestId,
      },
      data.actor.userId,
    )
    return { rule }
  }
}

export function createRecurringRuleRestoreHandler(
  { rules, groups }: RecurringRuleHandlerDependencies,
): CommandHandler<RecurringRuleRestoreCommand> {
  return async ({ data, allowance }) => {
    assertGated(allowance, `RecurringRuleRestoreCommand`)
    assertCanWriteRecurringRules(await groups.roleOf(data.groupId, data.actor.userId))
    const rule = await rules.restore(
      { allowance, groupId: data.groupId, id: data.id, requestId: data.requestId },
      data.actor.userId,
    )
    return { rule }
  }
}

export function createRecurringRuleSkipHandler(
  { rules, groups }: RecurringRuleHandlerDependencies,
): CommandHandler<RecurringRuleSkipCommand> {
  return async ({ data }) => {
    assertCanWriteRecurringRules(await groups.roleOf(data.groupId, data.actor.userId))
    const rule = await rules.skip(
      { groupId: data.groupId, id: data.id, date: data.date, requestId: data.requestId },
      data.actor.userId,
    )
    return { rule }
  }
}

export function createRecurringRuleGetHandler(
  { rules, groups }: RecurringRuleHandlerDependencies,
): QueryHandler<RecurringRuleGetQuery> {
  return async ({ data }) => {
    assertCanReadRecurringRules(await groups.roleOf(data.groupId, data.actor.userId))
    const rule = await rules.get(data.groupId, data.id)
    if (!rule) {
      throw new RecurringRuleError(`RECURRING_RULE_NOT_FOUND`, `Repeating entry not found`)
    }
    return { rule }
  }
}

export function createRecurringRuleListHandler(
  { rules, groups }: RecurringRuleHandlerDependencies,
): QueryHandler<RecurringRuleListQuery> {
  return async ({ data }) => {
    assertCanReadRecurringRules(await groups.roleOf(data.groupId, data.actor.userId))
    return { rules: await rules.list(data.groupId) }
  }
}
