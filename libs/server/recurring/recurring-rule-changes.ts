import type { ChangesAggregate } from "@server/groups/group-changes.ts"
import { PostgresRecurringRuleRepository } from "./postgres-recurring-rule-repository.ts"

/**
 * Repeating rules in the changes pull of a household: the live rules written after the cursor, in
 * the shape a read returns. A deleted rule is a tombstone (`group_change_tombstones`), never a row,
 * so a deleted rule's memo and amounts never reach a device through it. "Move all data" moves every
 * rule at once and makes the source's cursors too old instead (`forgetChangesBefore`). The kind is
 * the table's name, as for the other aggregates, and the one the rule's delete records.
 */
export const recurringRuleChanges: ChangesAggregate = {
  kind: `recurring_rules`,
  sequences: (sql, groupId, after) =>
    sql`
      SELECT change_sequence AS sequence FROM recurring_rules
      WHERE group_id = ${groupId} AND deleted_at IS NULL AND change_sequence > ${after}
    `,
  rows: (sql, groupId, after, through) =>
    new PostgresRecurringRuleRepository(sql).listChanged(groupId, after, through),
}
