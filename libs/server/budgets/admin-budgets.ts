/**
 * The operator area's read over budgets: per household, how many categories have a limit this
 * month, the method in effect and the day of the latest change. It reads only ids, `group_id`,
 * `month`, `method`, `updated_at` and whether a budget's amount is null: no amount, currency,
 * move, category name or person leaves here, since they say how much a household plans to spend
 * and on what (product.md §5). Reads no environment and imports no singleton.
 *
 * @module
 */

import type postgres from "postgres"
import {
  ADMIN_BUDGETS_HOUSEHOLD_LIMIT,
  type AdminBudgetsOverview,
  BudgetMethod,
} from "@domain/budgets"
import { CategoryKind } from "@domain/categories"

/**
 * Counts every household's budgets for the current month as {@link AdminBudgetsOverview}.
 *
 * @param today `YYYY-MM-DD`, the day whose month is counted. Default: the database's day in UTC.
 */
export async function readAdminBudgets(
  sql: postgres.Sql,
  today?: string,
): Promise<AdminBudgetsOverview> {
  // One row per household that ever set a budget or a method: its count, method and last change.
  const perGroup = () =>
    sql`
    WITH current_month AS (
      SELECT date_trunc(
        'month', COALESCE(${today ?? null}::date, (now() AT TIME ZONE 'UTC')::date)
      )::date AS month
    ),
    used AS (
      SELECT group_id FROM budgets UNION SELECT group_id FROM budget_methods
    ),
    methods AS (
      SELECT u.group_id, COALESCE((
        SELECT bm.method FROM budget_methods bm
        WHERE bm.group_id = u.group_id AND bm.month <= (SELECT month FROM current_month)
        ORDER BY bm.month DESC
        LIMIT 1
      ), ${BudgetMethod.LIMITS}::int)::int AS method
      FROM used u
    ),
    latest AS (
      SELECT DISTINCT ON (b.group_id, b.category_id)
        b.group_id, b.category_id, b.month, b.amount IS NOT NULL AS has_amount
      FROM budgets b
      WHERE b.month <= (SELECT month FROM current_month)
      ORDER BY b.group_id, b.category_id, b.month DESC
    ),
    limited AS (
      SELECT l.group_id, l.category_id
      FROM latest l
      JOIN methods m ON m.group_id = l.group_id
      JOIN categories c ON c.group_id = l.group_id AND c.id = l.category_id
      WHERE l.has_amount AND c.archived_at IS NULL AND c.kind = ${CategoryKind.EXPENSE}
        AND (m.method = ${BudgetMethod.LIMITS} OR l.month = (SELECT month FROM current_month))
    )
    SELECT
      m.group_id,
      m.method,
      (SELECT COUNT(*)::int FROM limited l WHERE l.group_id = m.group_id) AS categories,
      GREATEST(
        (SELECT MAX(b.updated_at) FROM budgets b WHERE b.group_id = m.group_id),
        (SELECT MAX(bm.updated_at) FROM budget_methods bm WHERE bm.group_id = m.group_id)
      ) AS last_change
    FROM methods m
  `
  const [[totals], households] = await Promise.all([
    sql<Omit<AdminBudgetsOverview, "topHouseholds">[]>`
      SELECT
        to_char(date_trunc(
          'month', COALESCE(${today ?? null}::date, (now() AT TIME ZONE 'UTC')::date)
        ), 'YYYY-MM') AS month,
        COUNT(*) FILTER (WHERE p.categories > 0)::int AS households,
        COALESCE(SUM(p.categories), 0)::int AS categories,
        COUNT(*) FILTER (WHERE p.method = ${BudgetMethod.ENVELOPES})::int AS envelope_households
      FROM (${perGroup()}) AS p
    `,
    sql<AdminBudgetsOverview["topHouseholds"]>`
      SELECT
        p.group_id,
        g.name AS group_name,
        p.categories,
        p.method,
        to_char(p.last_change AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS last_change_date
      FROM (${perGroup()}) AS p JOIN groups g ON g.id = p.group_id
      ORDER BY p.categories DESC, p.group_id
      LIMIT ${ADMIN_BUDGETS_HOUSEHOLD_LIMIT}
    `,
  ])
  return {
    month: totals.month,
    households: totals.households,
    categories: totals.categories,
    envelopeHouseholds: totals.envelopeHouseholds,
    topHouseholds: households.map((
      { groupId, groupName, categories, method, lastChangeDate },
    ) => ({ groupId, groupName, categories, method, lastChangeDate })),
  }
}
