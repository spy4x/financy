import type { RecurringDependencies, RecurringRuleItem } from "../state/recurring.ts"
import { type DeviceCopy, pullOrKeep } from "./device-copy.ts"

/**
 * The repeating rules the server sent, kept on this device for one signed-in user. Level 2
 * (`docs/offline-data.md`): readable offline, written online only, so there is no queue.
 */
export interface RecurringRulesCache {
  /** A household's live rules on the device, oldest first, as the server lists them. */
  readRules(groupId: string): Promise<RecurringRuleItem[]>
  /** Keeps the rule a write answered with, at the group's cursor. */
  putRule(rule: RecurringRuleItem): Promise<void>
  /** Takes a deleted rule out of every group the device holds. */
  removeRule(ruleId: string): Promise<void>
}

/** What the rules need from the layer: the pull, and the view over the copy. */
export interface RecurringLayer {
  copy: Pick<DeviceCopy, "pull" | "drop" | "recurringRules">
}

/**
 * The rules' dependencies with the device copy in front of the server. The list pulls the group's
 * changes, or keeps the copy when the server cannot be reached, then reads the copy. Every write
 * goes to the server; its answer is kept in the copy, so the list shows it before the next pull.
 * With no layer (the local-data module is off, or nobody is signed in) the server answers alone and
 * the device keeps nothing.
 */
export function offlineRecurring(
  online: RecurringDependencies,
  current: () => RecurringLayer | null,
): RecurringDependencies {
  /** Sends the write, then keeps the rule it answered with on the device that sent it. */
  async function kept<I, R extends { rule: RecurringRuleItem }>(
    write: (input: I) => Promise<R>,
    input: I,
  ): Promise<R> {
    const result = await write(input)
    await current()?.copy.recurringRules.putRule(result.rule)
    return result
  }

  return {
    ...online,
    async fetchList(groupId) {
      const layer = current()
      if (!layer) return await online.fetchList(groupId)
      await pullOrKeep(layer, groupId)
      return await layer.copy.recurringRules.readRules(groupId)
    },
    create: (input) => kept(online.create, input),
    update: (input) => kept(online.update, input),
    async delete(input) {
      const result = await online.delete(input)
      await current()?.copy.recurringRules.removeRule(input.id)
      return result
    },
    restore: (input) => kept(online.restore, input),
    skip: (input) => kept(online.skip, input),
  }
}
