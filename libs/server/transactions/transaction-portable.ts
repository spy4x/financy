import type { CategoryKind } from "@domain/categories"
import { GROUP_IMPORT_PROBLEMS_MAX, GroupImportError } from "@domain/groups"
import {
  parseTransactionExportEntry,
  type TransactionExportEntry,
  transactionReferenceProblems,
} from "@domain/transactions"
import { portable } from "@server/groups/portable.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** Entries one page of the export reads. */
const READ_PAGE = 1_000

/** Rows one statement writes: well under Postgres's 65,535 parameters at sixteen columns a row. */
const WRITE_BATCH = 1_000

/**
 * Entries in a household's export file: every live entry as the server stored it, both amounts,
 * the currency paid and the conversion flag included, so an import never converts again (R4).
 * Deleted entries stay behind. On import each entry gets a new id and names the new ids of its
 * account and category, which the registry writes before it. An entry whose account or category
 * the file lacks, an expense in an income category, or an entry in its account's own currency
 * whose amounts differ refuses the whole import. They count against the new household's
 * `maxTransactions`.
 */
export const transactionPortable = portable<TransactionExportEntry>({
  kind: "transactions",
  one: "entry",
  other: "entries",
  limit: "maxTransactions",
  parse: parseTransactionExportEntry,
  async *read(sql, groupId) {
    // Keyset pages after the last id, as the notes read them: nothing is held between pages.
    let after: string | null = null
    while (true) {
      const rows: (TransactionExportEntry & { amount: string; accountAmount: string })[] =
        await sql`
          SELECT id, account_id, category_id, kind, account_amount::text AS account_amount,
            amount::text AS amount, currency, converted, memo, to_char(date, 'YYYY-MM-DD') AS date,
            created_at, updated_at
          FROM transactions
          WHERE group_id = ${groupId} AND deleted_at IS NULL
            AND (${after}::uuid IS NULL OR id > ${after}::uuid)
          ORDER BY id
          LIMIT ${READ_PAGE}
        `
      if (rows.length > 0) {
        yield rows.map((row) => ({
          ...row,
          amount: Number(row.amount),
          accountAmount: Number(row.accountAmount),
        }))
      }
      if (rows.length < READ_PAGE) return
      after = rows[rows.length - 1].id
    }
  },
  async write(sql, entries, context) {
    const ids = new Map<string, string>()
    if (entries.length === 0) return ids
    const [accounts, categories] = await Promise.all([
      sql<{ id: string; currency: string }[]>`
        SELECT id, currency FROM accounts WHERE group_id = ${context.groupId}
      `,
      sql<{ id: string; kind: CategoryKind }[]>`
        SELECT id, kind FROM categories WHERE group_id = ${context.groupId}
      `,
    ])
    const accountOf = new Map(accounts.map((account) => [account.id, account]))
    const categoryOf = new Map(categories.map((category) => [category.id, category]))
    const newAccount = (fileId: string) => context.newIdOf("accounts", fileId)
    const newCategory = (fileId: string) => context.newIdOf("categories", fileId)
    const problems = transactionReferenceProblems(entries, {
      account: (fileId) => accountOf.get(newAccount(fileId) ?? "") ?? null,
      category: (fileId) => categoryOf.get(newCategory(fileId) ?? "") ?? null,
    })
    if (problems.length > 0) {
      throw new GroupImportError(
        problems.slice(0, GROUP_IMPORT_PROBLEMS_MAX).map(({ index, problem, issue }) => ({
          kind: "invalid",
          where: `Entry ${index + 1}`,
          problem,
          place: { part: "transactions", index: index + 1 },
          issue,
        })),
        problems.length,
      )
    }
    const rows = entries.map((entry) => {
      const id = uuidV7()
      ids.set(entry.id, id)
      return {
        id,
        group_id: context.groupId,
        account_id: newAccount(entry.accountId)!,
        category_id: newCategory(entry.categoryId)!,
        kind: entry.kind,
        account_amount: entry.accountAmount,
        amount: entry.amount,
        currency: entry.currency,
        converted: entry.converted,
        memo: entry.memo,
        date: entry.date,
        change_sequence: context.changeSequence,
        created_by_user_id: context.actorId,
        updated_by_user_id: context.actorId,
        created_at: entry.createdAt,
        updated_at: entry.updatedAt,
      }
    })
    for (let start = 0; start < rows.length; start += WRITE_BATCH) {
      await sql`INSERT INTO transactions ${sql(rows.slice(start, start + WRITE_BATCH))}`
    }
    return ids
  },
})
