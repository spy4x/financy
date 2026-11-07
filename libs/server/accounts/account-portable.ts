import {
  type AccountExportEntry,
  accountExportProblems,
  parseAccountExportEntry,
} from "@domain/accounts"
import { portable } from "@server/groups/portable.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** Rows one statement writes: well under Postgres's 65,535 parameters at thirteen columns a row. */
const WRITE_BATCH = 1_000

/**
 * Accounts in a household's export file: what a person typed (name, kind, currency, starting
 * balance) and whether each was archived or the default. Never a balance, which is derived, nor a
 * deleted account. Each gets a new id on import. A file's accounts fit one household: at most
 * `ACCOUNT_MAX_PER_GROUP`, one default, never an archived one. They count against the new
 * household's `maxAccounts`.
 */
export const accountPortable = portable<AccountExportEntry>({
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
      SELECT id, name, kind, currency, starting_balance::text AS starting_balance,
        archived_at IS NOT NULL AS archived, is_default, created_at, updated_at
      FROM accounts WHERE group_id = ${groupId} AND deleted_at IS NULL
      ORDER BY lower(name), id
    `
    yield rows.map((row) => ({ ...row, startingBalance: Number(row.startingBalance) }))
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
