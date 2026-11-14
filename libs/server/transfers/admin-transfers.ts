/**
 * The operator area's read over transfers: counts per month and per household, and the latest
 * transfer day. No amount, currency, memo, account or person leaves here: they say how much a
 * household moves and where (product.md §5). Reads no environment and imports no singleton.
 *
 * @module
 */

import type postgres from "postgres"
import {
  ADMIN_TRANSFERS_HOUSEHOLD_LIMIT,
  ADMIN_TRANSFERS_MONTHS,
  type AdminTransfersOverview,
} from "@domain/transfers"

/**
 * Counts every household's live transfers as {@link AdminTransfersOverview}.
 *
 * @param today `YYYY-MM-DD`, the day whose month comes last. Default: the database's day in UTC.
 */
export async function readAdminTransfers(
  sql: postgres.Sql,
  today?: string,
): Promise<AdminTransfersOverview> {
  // The last months, oldest first, made in SQL so a month without transfers is still a row.
  const months = () =>
    sql`
    SELECT (start - make_interval(months => step))::date AS month
    FROM (
      SELECT date_trunc(
        'month', COALESCE(${today ?? null}::date, (now() AT TIME ZONE 'UTC')::date)
      )::date AS start
    ) AS current_month,
    generate_series(0, ${ADMIN_TRANSFERS_MONTHS - 1}::int) AS step
  `
  const [[totals], monthRows, households] = await Promise.all([
    sql<Omit<AdminTransfersOverview, "months" | "topHouseholds">[]>`
      SELECT
        COUNT(*)::int AS transfers,
        COUNT(DISTINCT group_id)::int AS households,
        to_char(MAX(date), 'YYYY-MM-DD') AS last_transfer_date
      FROM transfers
      WHERE deleted_at IS NULL
    `,
    sql<AdminTransfersOverview["months"]>`
      WITH months AS (${months()})
      SELECT
        to_char(m.month, 'YYYY-MM') AS month,
        COUNT(t.id)::int AS transfers,
        COUNT(DISTINCT t.group_id)::int AS households
      FROM months m
      LEFT JOIN transfers t ON t.deleted_at IS NULL
        AND t.date >= m.month AND t.date < (m.month + interval '1 month')::date
      GROUP BY m.month
      ORDER BY m.month
    `,
    sql<AdminTransfersOverview["topHouseholds"]>`
      WITH months AS (${months()}),
      span AS (
        SELECT MIN(month) AS first, (MAX(month) + interval '1 month')::date AS stop FROM months
      ),
      per_group AS (
        SELECT
          t.group_id,
          COUNT(*)::int AS transfers,
          COUNT(*) FILTER (WHERE t.date >= span.first AND t.date < span.stop)::int AS recent,
          MAX(t.date) AS last_date
        FROM transfers t CROSS JOIN span
        WHERE t.deleted_at IS NULL
        GROUP BY t.group_id
        ORDER BY recent DESC, transfers DESC, t.group_id
        LIMIT ${ADMIN_TRANSFERS_HOUSEHOLD_LIMIT}
      )
      SELECT
        p.group_id,
        g.name AS group_name,
        p.transfers,
        ARRAY(
          SELECT COUNT(t.id)::int
          FROM months m
          LEFT JOIN transfers t ON t.group_id = p.group_id AND t.deleted_at IS NULL
            AND t.date >= m.month AND t.date < (m.month + interval '1 month')::date
          GROUP BY m.month
          ORDER BY m.month
        ) AS months,
        to_char(p.last_date, 'YYYY-MM-DD') AS last_transfer_date
      FROM per_group p JOIN groups g ON g.id = p.group_id
      ORDER BY p.recent DESC, p.transfers DESC, p.group_id
    `,
  ])
  return {
    ...totals,
    months: monthRows.map(({ month, transfers, households }) => ({ month, transfers, households })),
    topHouseholds: households.map((
      { groupId, groupName, transfers, months, lastTransferDate },
    ) => ({ groupId, groupName, transfers, months, lastTransferDate })),
  }
}
