import { GROUP_IMPORT_PROBLEMS_MAX, GroupImportError } from "@domain/groups"
import {
  parseTransferExportEntry,
  type TransferExportEntry,
  transferReferenceProblems,
} from "@domain/transfers"
import { portable } from "@server/groups/portable.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** Transfers one page of the export reads. */
const READ_PAGE = 1_000

/** Rows one statement writes: well under Postgres's 65,535 parameters at fourteen columns a row. */
const WRITE_BATCH = 1_000

/**
 * Transfers in a household's export file: every live transfer as the server stored it, both
 * amounts and the conversion flag included, so an import never converts again (R4). Deleted
 * transfers stay behind. On import each transfer gets a new id and names the new ids of its two
 * accounts, which the registry writes before it. A transfer whose account the file lacks, one from
 * an account to itself, or one between two accounts of one currency whose amounts differ refuses
 * the whole import. They count against the new household's `maxTransactions`, together with its
 * entries.
 */
export const transferPortable = portable<TransferExportEntry>({
  kind: "transfers",
  one: "transfer",
  other: "transfers",
  limit: "maxTransactions",
  parse: parseTransferExportEntry,
  async *read(sql, groupId) {
    // Keyset pages after the last id, as the entries read them: nothing is held between pages.
    let after: string | null = null
    while (true) {
      const rows: (TransferExportEntry & { sentAmount: string; receivedAmount: string })[] =
        await sql`
          SELECT id, from_account_id, to_account_id, sent_amount::text AS sent_amount,
            received_amount::text AS received_amount, converted, memo,
            to_char(date, 'YYYY-MM-DD') AS date, created_at, updated_at
          FROM transfers
          WHERE group_id = ${groupId} AND deleted_at IS NULL
            AND (${after}::uuid IS NULL OR id > ${after}::uuid)
          ORDER BY id
          LIMIT ${READ_PAGE}
        `
      if (rows.length > 0) {
        yield rows.map((row) => ({
          ...row,
          sentAmount: Number(row.sentAmount),
          receivedAmount: Number(row.receivedAmount),
        }))
      }
      if (rows.length < READ_PAGE) return
      after = rows[rows.length - 1].id
    }
  },
  async write(sql, transfers, context) {
    const ids = new Map<string, string>()
    if (transfers.length === 0) return ids
    const accounts = await sql<{ id: string; currency: string }[]>`
      SELECT id, currency FROM accounts WHERE group_id = ${context.groupId}
    `
    const accountOf = new Map(accounts.map((account) => [account.id, account]))
    const newAccount = (fileId: string) => context.newIdOf("accounts", fileId)
    const problems = transferReferenceProblems(transfers, {
      account: (fileId) => accountOf.get(newAccount(fileId) ?? "") ?? null,
    })
    if (problems.length > 0) {
      throw new GroupImportError(
        problems.slice(0, GROUP_IMPORT_PROBLEMS_MAX).map(({ index, problem, issue }) => ({
          kind: "invalid",
          where: `Transfer ${index + 1}`,
          problem,
          place: { part: "transfers", index: index + 1 },
          issue,
        })),
        problems.length,
      )
    }
    const rows = transfers.map((transfer) => {
      const id = uuidV7()
      ids.set(transfer.id, id)
      return {
        id,
        group_id: context.groupId,
        from_account_id: newAccount(transfer.fromAccountId)!,
        to_account_id: newAccount(transfer.toAccountId)!,
        sent_amount: transfer.sentAmount,
        received_amount: transfer.receivedAmount,
        converted: transfer.converted,
        memo: transfer.memo,
        date: transfer.date,
        change_sequence: context.changeSequence,
        created_by_user_id: context.actorId,
        updated_by_user_id: context.actorId,
        created_at: transfer.createdAt,
        updated_at: transfer.updatedAt,
      }
    })
    for (let start = 0; start < rows.length; start += WRITE_BATCH) {
      await sql`INSERT INTO transfers ${sql(rows.slice(start, start + WRITE_BATCH))}`
    }
    return ids
  },
})
