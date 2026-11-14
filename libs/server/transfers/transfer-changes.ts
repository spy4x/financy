import type { ChangesAggregate } from "@server/groups/group-changes.ts"
import { PostgresTransferRepository } from "./postgres-transfer-repository.ts"

/**
 * Transfers in the changes pull of a household: the live transfers written after the cursor, in
 * the shape a read returns. A deleted transfer is a tombstone (`group_change_tombstones`), never a
 * row, so a deleted transfer's memo and amounts never reach a device through it. "Move all data"
 * moves every transfer at once and makes the source's cursors too old instead
 * (`forgetChangesBefore`).
 */
export const transferChanges: ChangesAggregate = {
  kind: `transfers`,
  sequences: (sql, groupId, after) =>
    sql`
      SELECT change_sequence AS sequence FROM transfers
      WHERE group_id = ${groupId} AND deleted_at IS NULL AND change_sequence > ${after}
    `,
  rows: (sql, groupId, after, through) =>
    new PostgresTransferRepository(sql).listChanged(groupId, after, through),
}
