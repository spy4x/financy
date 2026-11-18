import type postgres from "postgres"

/**
 * The balance of the `accounts` row in scope, as decimal text: the starting balance plus the
 * account's live entries, minus what its live transfers sent and plus what they brought in (R5),
 * all dated on or before `on` (`YYYY-MM-DD`), by default today in the household's time zone (R9,
 * R14). The accounts screen and the accounts spreadsheet both read it, so they never disagree.
 */
export function accountBalance(sql: postgres.Sql, on?: string) {
  const day = on === undefined
    ? sql`(
        SELECT (CURRENT_TIMESTAMP AT TIME ZONE groups.time_zone)::date
        FROM groups WHERE groups.id = accounts.group_id
      )`
    : sql`${on}::date`
  return sql`(
    accounts.starting_balance + COALESCE((
      SELECT sum(transactions.account_amount) FROM transactions
      WHERE transactions.account_id = accounts.id AND transactions.deleted_at IS NULL
        AND transactions.date <= ${day}
    ), 0) - COALESCE((
      SELECT sum(transfers.sent_amount) FROM transfers
      WHERE transfers.from_account_id = accounts.id AND transfers.deleted_at IS NULL
        AND transfers.date <= ${day}
    ), 0) + COALESCE((
      SELECT sum(transfers.received_amount) FROM transfers
      WHERE transfers.to_account_id = accounts.id AND transfers.deleted_at IS NULL
        AND transfers.date <= ${day}
    ), 0)
  )::text`
}
