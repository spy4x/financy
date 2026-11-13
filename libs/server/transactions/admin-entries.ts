/**
 * The operator area's read over entries: counts per month and per household, and the latest entry
 * day. No amount, currency, memo, account, category or person leaves here: they say what a
 * household spends and on what (product.md §5). Reads no environment and imports no singleton.
 *
 * @module
 */

import type postgres from "postgres"
import {
  ADMIN_ENTRIES_HOUSEHOLD_LIMIT,
  ADMIN_ENTRIES_MONTHS,
  type AdminEntriesOverview,
} from "@domain/transactions"

/**
 * Counts every household's live entries as {@link AdminEntriesOverview}.
 *
 * @param today `YYYY-MM-DD`, the day whose month comes last. Default: the database's day in UTC.
 */
export async function readAdminEntries(
  sql: postgres.Sql,
  today?: string,
): Promise<AdminEntriesOverview> {
  // The last months, oldest first, made in SQL so a month without entries is still a row.
  const months = () =>
    sql`
    SELECT (start - make_interval(months => step))::date AS month
    FROM (
      SELECT date_trunc(
        'month', COALESCE(${today ?? null}::date, (now() AT TIME ZONE 'UTC')::date)
      )::date AS start
    ) AS current_month,
    generate_series(0, ${ADMIN_ENTRIES_MONTHS - 1}::int) AS step
  `
  const [[totals], monthRows, households] = await Promise.all([
    sql<Omit<AdminEntriesOverview, "months" | "topHouseholds">[]>`
      SELECT
        COUNT(*)::int AS entries,
        COUNT(DISTINCT group_id)::int AS households,
        to_char(MAX(date), 'YYYY-MM-DD') AS last_entry_date
      FROM transactions
      WHERE deleted_at IS NULL
    `,
    sql<AdminEntriesOverview["months"]>`
      WITH months AS (${months()})
      SELECT
        to_char(m.month, 'YYYY-MM') AS month,
        COUNT(t.id)::int AS entries,
        COUNT(DISTINCT t.group_id)::int AS households
      FROM months m
      LEFT JOIN transactions t ON t.deleted_at IS NULL
        AND t.date >= m.month AND t.date < (m.month + interval '1 month')::date
      GROUP BY m.month
      ORDER BY m.month
    `,
    sql<AdminEntriesOverview["topHouseholds"]>`
      WITH months AS (${months()}),
      span AS (
        SELECT MIN(month) AS first, (MAX(month) + interval '1 month')::date AS stop FROM months
      ),
      per_group AS (
        SELECT
          t.group_id,
          COUNT(*)::int AS entries,
          COUNT(*) FILTER (WHERE t.date >= span.first AND t.date < span.stop)::int AS recent,
          MAX(t.date) AS last_date
        FROM transactions t CROSS JOIN span
        WHERE t.deleted_at IS NULL
        GROUP BY t.group_id
        ORDER BY recent DESC, entries DESC, t.group_id
        LIMIT ${ADMIN_ENTRIES_HOUSEHOLD_LIMIT}
      )
      SELECT
        p.group_id,
        g.name AS group_name,
        p.entries,
        ARRAY(
          SELECT COUNT(t.id)::int
          FROM months m
          LEFT JOIN transactions t ON t.group_id = p.group_id AND t.deleted_at IS NULL
            AND t.date >= m.month AND t.date < (m.month + interval '1 month')::date
          GROUP BY m.month
          ORDER BY m.month
        ) AS months,
        to_char(p.last_date, 'YYYY-MM-DD') AS last_entry_date
      FROM per_group p JOIN groups g ON g.id = p.group_id
      ORDER BY p.recent DESC, p.entries DESC, p.group_id
    `,
  ])
  return {
    ...totals,
    months: monthRows.map(({ month, entries, households }) => ({ month, entries, households })),
    topHouseholds: households.map(({ groupId, groupName, entries, months, lastEntryDate }) => ({
      groupId,
      groupName,
      entries,
      months,
      lastEntryDate,
    })),
  }
}
