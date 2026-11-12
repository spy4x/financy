import type { ChangesAggregate } from "@server/groups/group-changes.ts"
import { PostgresTransactionRepository } from "./postgres-transaction-repository.ts"

/**
 * Entries in the changes pull of a household: the live entries written after the cursor, in the
 * shape a read returns. A deleted entry is a tombstone (`group_change_tombstones`), never a row, so
 * a deleted entry's memo and amounts never reach a device through it. "Move all data" moves every
 * entry at once and makes the source's cursors too old instead (`forgetChangesBefore`).
 */
export const transactionChanges: ChangesAggregate = {
  kind: `transactions`,
  sequences: (sql, groupId, after) =>
    sql`
      SELECT change_sequence AS sequence FROM transactions
      WHERE group_id = ${groupId} AND deleted_at IS NULL AND change_sequence > ${after}
    `,
  rows: (sql, groupId, after, through) =>
    new PostgresTransactionRepository(sql).listChanged(groupId, after, through),
}
