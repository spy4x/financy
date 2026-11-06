/**
 * The operator area's read over accounts: counts per kind, per currency and per household. No
 * account name and no amount leaves here (product.md §5). Reads no environment and imports no
 * singleton.
 *
 * @module
 */

import type postgres from "postgres"
import {
  ACCOUNT_KINDS,
  type AccountKind,
  ADMIN_ACCOUNTS_HOUSEHOLD_LIMIT,
  type AdminAccountsOverview,
} from "@domain/accounts"

/** Counts the live accounts, archived ones included, as {@link AdminAccountsOverview}. */
export async function readAdminAccounts(sql: postgres.Sql): Promise<AdminAccountsOverview> {
  const [[totals], kinds, currencies, households] = await Promise.all([
    sql<{ accounts: number; households: number }[]>`
      SELECT COUNT(*)::int AS accounts, COUNT(DISTINCT group_id)::int AS households
      FROM accounts WHERE deleted_at IS NULL
    `,
    sql<{ kind: AccountKind; accounts: number }[]>`
      SELECT kind, COUNT(*)::int AS accounts FROM accounts
      WHERE deleted_at IS NULL GROUP BY kind
    `,
    sql<{ currency: string; accounts: number }[]>`
      SELECT currency, COUNT(*)::int AS accounts FROM accounts
      WHERE deleted_at IS NULL GROUP BY currency ORDER BY accounts DESC, currency
    `,
    sql<AdminAccountsOverview["topHouseholds"]>`
      SELECT g.id AS group_id, g.name AS group_name, COUNT(*)::int AS accounts,
        ARRAY_AGG(DISTINCT a.currency ORDER BY a.currency) AS currencies
      FROM accounts a JOIN groups g ON g.id = a.group_id
      WHERE a.deleted_at IS NULL
      GROUP BY g.id, g.name
      ORDER BY accounts DESC, g.id
      LIMIT ${ADMIN_ACCOUNTS_HOUSEHOLD_LIMIT}
    `,
  ])
  const byKind = new Map(kinds.map((row) => [row.kind, row.accounts]))
  return {
    accounts: totals.accounts,
    households: totals.households,
    byKind: ACCOUNT_KINDS.filter((kind) => byKind.has(kind))
      .map((kind) => ({ kind, accounts: byKind.get(kind)! })),
    byCurrency: currencies.map(({ currency, accounts }) => ({ currency, accounts })),
    topHouseholds: households.map(({ groupId, groupName, accounts, currencies }) => ({
      groupId,
      groupName,
      accounts,
      currencies,
    })),
  }
}
