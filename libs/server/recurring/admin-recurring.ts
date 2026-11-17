/**
 * The operator area's read over repeating entries: per household, how many live rules it has, how
 * many of them are paused, how many live entries rules made, and the day of the latest rule change.
 * It reads only ids, `group_id`, whether `paused_reason`, `deleted_at` and `recurring_rule_id` are
 * null, and `updated_at`/`deleted_at`: no amount, account amount, currency, memo, schedule (`rrule`),
 * account or category leaves here, since they say what a household pays, how often and for what
 * (product.md §5). Reads no environment and imports no singleton.
 *
 * A rule is live while `deleted_at` is null. An entry counts as made by a rule while its
 * `recurring_rule_id` is set and its own `deleted_at` is null: a deleted entry counts nowhere,
 * and an entry keeps counting after its rule is deleted or purged.
 *
 * @module
 */

import type postgres from "postgres"
import { ADMIN_RECURRING_HOUSEHOLD_LIMIT, type AdminRecurringOverview } from "@domain/recurring"

/** Counts every household's repeating entries as {@link AdminRecurringOverview}. */
export async function readAdminRecurring(sql: postgres.Sql): Promise<AdminRecurringOverview> {
  const [[totals], households] = await Promise.all([
    sql<Omit<AdminRecurringOverview, "topHouseholds">[]>`
      SELECT
        (SELECT COUNT(DISTINCT group_id)::int FROM recurring_rules WHERE deleted_at IS NULL)
          AS households,
        (SELECT COUNT(*)::int FROM recurring_rules WHERE deleted_at IS NULL) AS rules,
        (SELECT COUNT(*)::int FROM recurring_rules
          WHERE deleted_at IS NULL AND paused_reason IS NOT NULL) AS paused,
        (SELECT COUNT(*)::int FROM transactions
          WHERE recurring_rule_id IS NOT NULL AND deleted_at IS NULL) AS made
    `,
    sql<AdminRecurringOverview["topHouseholds"]>`
      SELECT
        r.group_id,
        g.name AS group_name,
        r.rules,
        r.paused,
        (
          SELECT COUNT(*)::int FROM transactions t
          WHERE t.group_id = r.group_id AND t.recurring_rule_id IS NOT NULL
            AND t.deleted_at IS NULL
        ) AS made,
        to_char(r.last_change AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS last_change_date
      FROM (
        SELECT
          group_id,
          (COUNT(*) FILTER (WHERE deleted_at IS NULL))::int AS rules,
          (COUNT(*) FILTER (WHERE deleted_at IS NULL AND paused_reason IS NOT NULL))::int
            AS paused,
          GREATEST(MAX(updated_at), MAX(deleted_at)) AS last_change
        FROM recurring_rules
        GROUP BY group_id
      ) AS r
      JOIN groups g ON g.id = r.group_id
      ORDER BY r.rules DESC, r.group_id
      LIMIT ${ADMIN_RECURRING_HOUSEHOLD_LIMIT}
    `,
  ])
  return {
    households: totals.households,
    rules: totals.rules,
    paused: totals.paused,
    made: totals.made,
    topHouseholds: households.map((
      { groupId, groupName, rules, paused, made, lastChangeDate },
    ) => ({ groupId, groupName, rules, paused, made, lastChangeDate })),
  }
}
