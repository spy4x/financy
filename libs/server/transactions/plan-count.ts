import type postgres from "postgres"

/**
 * What the plan's `maxTransactions` counts in a household: its live entries and its live transfers
 * together (`docs/billing-plans.md`). The entitlement gate reads it before a write, and each write
 * of either kind counts again under the household's lock, so neither kind can slip past the other.
 */
export async function countPlanTransactions(sql: postgres.Sql, groupId: string): Promise<number> {
  const [{ count }] = await sql<{ count: number }[]>`
    SELECT (
      (SELECT count(*) FROM transactions WHERE group_id = ${groupId} AND deleted_at IS NULL) +
      (SELECT count(*) FROM transfers WHERE group_id = ${groupId} AND deleted_at IS NULL)
    )::int AS count
  `
  return count
}
