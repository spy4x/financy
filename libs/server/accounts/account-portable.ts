import {
  type AccountExportEntry,
  accountExportProblems,
  AccountKind,
  parseAccountExportEntry,
} from "@domain/accounts"
import { portable } from "@server/groups/portable.ts"
import { amountCell } from "@server/money/spreadsheet-amount.ts"
import type { CsvDecimal } from "@spy4x/platform/universal/csv"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { accountBalance } from "./account-balance.ts"

/** Rows one statement writes: well under Postgres's 65,535 parameters at fourteen columns a row. */
const WRITE_BATCH = 1_000

/** The catalog key of each account kind's word. */
const KIND_WORDS: Record<AccountKind, string> = {
  [AccountKind.CASH]: "AccountKinds.cash",
  [AccountKind.BANK]: "AccountKinds.bank",
  [AccountKind.CARD]: "AccountKinds.card",
  [AccountKind.SAVINGS]: "AccountKinds.savings",
  [AccountKind.ASSET]: "AccountKinds.asset",
  [AccountKind.LIABILITY]: "AccountKinds.liability",
  [AccountKind.CRYPTO]: "AccountKinds.crypto",
}

/** A row of `accounts.csv`: what a person reads, in their words. */
interface AccountSpreadsheetRow {
  name: string
  type: string
  currency: string
  startingBalance: CsvDecimal | string
  balanceToday: CsvDecimal | string
  archived: string
}

/**
 * Accounts in a household's export file: what a person typed (name, kind, currency, starting
 * balance, aliases) and whether each was archived or the default. Never a balance, which is derived, nor a
 * deleted account. Each gets a new id on import. A file's accounts fit one household: at most
 * `ACCOUNT_MAX_PER_GROUP`, one default, never an archived one. They count against the new
 * household's `maxAccounts`. In the spreadsheets, `accounts.csv` adds each account's balance today,
 * the one the accounts screen shows.
 */
export const accountPortable = portable<AccountExportEntry, AccountSpreadsheetRow>({
  kind: "accounts",
  one: "account",
  other: "accounts",
  limit: "maxAccounts",
  parse: parseAccountExportEntry,
  check: accountExportProblems,
  async *read(sql, groupId) {
    const rows = await sql<
      (Omit<AccountExportEntry, "startingBalance"> & { startingBalance: string })[]
    >`
      SELECT id, name, kind, currency, starting_balance::text AS starting_balance, aliases,
        archived_at IS NOT NULL AS archived, is_default, created_at, updated_at
      FROM accounts WHERE group_id = ${groupId} AND deleted_at IS NULL
      ORDER BY lower(name), id
    `
    yield rows.map((row) => ({ ...row, startingBalance: Number(row.startingBalance) }))
  },
  csv: {
    columns: [
      { key: "name", header: "AccountSpreadsheet.name" },
      { key: "type", header: "AccountSpreadsheet.type" },
      { key: "currency", header: "AccountSpreadsheet.currency" },
      { key: "startingBalance", header: "AccountSpreadsheet.startingBalance" },
      { key: "balanceToday", header: "AccountSpreadsheet.balanceToday" },
      { key: "archived", header: "AccountSpreadsheet.archived" },
    ],
    async *read(sql, groupId, { t }) {
      const rows = await sql<
        {
          name: string
          kind: AccountKind
          currency: string
          startingBalance: string
          balance: string
          archived: boolean
        }[]
      >`
        SELECT name, kind, currency, starting_balance::text AS starting_balance,
          ${accountBalance(sql)} AS balance, archived_at IS NOT NULL AS archived
        FROM accounts WHERE group_id = ${groupId} AND deleted_at IS NULL
        ORDER BY lower(name), id
      `
      yield rows.map((row) => ({
        name: row.name,
        type: t(KIND_WORDS[row.kind]),
        currency: row.currency,
        startingBalance: amountCell(row.startingBalance, row.currency),
        balanceToday: amountCell(row.balance, row.currency),
        archived: t(row.archived ? "GroupSpreadsheets.yes" : "GroupSpreadsheets.no"),
      }))
    },
  },
  async write(sql, entries, context) {
    const ids = new Map<string, string>()
    const rows = entries.map((account) => {
      const id = uuidV7()
      ids.set(account.id, id)
      return {
        id,
        group_id: context.groupId,
        name: account.name,
        kind: account.kind,
        currency: account.currency,
        starting_balance: account.startingBalance,
        // A file exported before aliases existed has none.
        aliases: sql.array(account.aliases ?? []),
        archived_at: account.archived ? account.updatedAt : null,
        is_default: account.isDefault,
        change_sequence: context.changeSequence,
        created_by_user_id: context.actorId,
        updated_by_user_id: context.actorId,
        created_at: account.createdAt,
        updated_at: account.updatedAt,
      }
    })
    for (let start = 0; start < rows.length; start += WRITE_BATCH) {
      await sql`INSERT INTO accounts ${sql(rows.slice(start, start + WRITE_BATCH))}`
    }
    return ids
  },
})
