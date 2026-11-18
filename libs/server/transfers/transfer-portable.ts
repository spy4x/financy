import { GROUP_IMPORT_PROBLEMS_MAX, GroupImportError } from "@domain/groups"
import {
  parseTransferExportEntry,
  type TransferExportEntry,
  transferReferenceProblems,
} from "@domain/transfers"
import { amountDecimals } from "@domain/money"
import { portable } from "@server/groups/portable.ts"
import { amountCell } from "@server/money/spreadsheet-amount.ts"
import { type CsvDecimal, csvDecimal } from "@spy4x/platform/universal/csv"
import { crossRate, type ExchangeRate, moneyDecimalString } from "@spy4x/platform/universal/money"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** Transfers one page of the export reads. */
const READ_PAGE = 1_000

/** Rows one statement writes: well under Postgres's 65,535 parameters at fourteen columns a row. */
const WRITE_BATCH = 1_000

/** The currency the two legs of an implied rate share: ISO 4217's code for "no currency". */
const IMPLIED_RATE_COMMON = `XXX`

/** A row of `transfers.csv`: what a person reads, in their words. */
interface TransferSpreadsheetRow {
  date: string
  fromAccount: string
  sentAmount: CsvDecimal | string
  sentCurrency: string
  toAccount: string
  receivedAmount: CsvDecimal | string
  receivedCurrency: string
  impliedRate: CsvDecimal | string
  note: string
}

/** A transfer as `transfers.csv` reads it, its two amounts exact. */
interface TransferSpreadsheetRecord {
  id: string
  date: string
  fromName: string
  fromCurrency: string
  toName: string
  toCurrency: string
  sentAmount: string
  receivedAmount: string
  memo: string
}

/**
 * How much of the received currency one unit of the sent currency bought, as an exact decimal.
 * Empty between two accounts of one currency: the two legs then share both currencies, which
 * `crossRate` refuses.
 */
function impliedRateCell(transfer: TransferSpreadsheetRecord): CsvDecimal | string {
  const { fromCurrency, toCurrency, date } = transfer
  const leg = (quote: string, amount: string): ExchangeRate => ({
    base: IMPLIED_RATE_COMMON,
    quote,
    rate: moneyDecimalString(Number(amount), amountDecimals(quote)),
    date,
    source: ``,
  })
  const implied = crossRate(
    leg(fromCurrency, transfer.sentAmount),
    leg(toCurrency, transfer.receivedAmount),
  )
  return implied.ok ? csvDecimal(implied.value.rate) : ``
}

/**
 * Transfers in a household's export file: every live transfer as the server stored it, both
 * amounts and the conversion flag included, so an import never converts again (R4). Deleted
 * transfers stay behind. On import each transfer gets a new id and names the new ids of its two
 * accounts, which the registry writes before it. A transfer whose account the file lacks, one from
 * an account to itself, or one between two accounts of one currency whose amounts differ refuses
 * the whole import. They count against the new household's `maxTransactions`, together with its
 * entries. In the spreadsheets, `transfers.csv` has a row per live transfer, oldest first, with both
 * amounts and the rate they imply.
 */
export const transferPortable = portable<TransferExportEntry, TransferSpreadsheetRow>({
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
  csv: {
    columns: [
      { key: "date", header: "TransferSpreadsheet.date" },
      { key: "fromAccount", header: "TransferSpreadsheet.fromAccount" },
      { key: "sentAmount", header: "TransferSpreadsheet.sentAmount" },
      { key: "sentCurrency", header: "TransferSpreadsheet.sentCurrency" },
      { key: "toAccount", header: "TransferSpreadsheet.toAccount" },
      { key: "receivedAmount", header: "TransferSpreadsheet.receivedAmount" },
      { key: "receivedCurrency", header: "TransferSpreadsheet.receivedCurrency" },
      { key: "impliedRate", header: "TransferSpreadsheet.impliedRate" },
      { key: "note", header: "TransferSpreadsheet.note" },
    ],
    async *read(sql, groupId) {
      let after: { date: string; id: string } | null = null
      while (true) {
        const transfers: TransferSpreadsheetRecord[] = await sql<TransferSpreadsheetRecord[]>`
          SELECT transfers.id, to_char(transfers.date, 'YYYY-MM-DD') AS date,
            sender.name AS from_name, sender.currency AS from_currency,
            receiver.name AS to_name, receiver.currency AS to_currency,
            transfers.sent_amount::text AS sent_amount,
            transfers.received_amount::text AS received_amount, transfers.memo
          FROM transfers
          INNER JOIN accounts AS sender
            ON sender.id = transfers.from_account_id AND sender.group_id = transfers.group_id
          INNER JOIN accounts AS receiver
            ON receiver.id = transfers.to_account_id AND receiver.group_id = transfers.group_id
          WHERE transfers.group_id = ${groupId} AND transfers.deleted_at IS NULL
            ${
          after === null
            ? sql``
            : sql`AND (transfers.date, transfers.id) > (${after.date}::date, ${after.id}::uuid)`
        }
          ORDER BY transfers.date, transfers.id
          LIMIT ${READ_PAGE}
        `
        if (transfers.length > 0) {
          yield transfers.map((transfer) => ({
            date: transfer.date,
            fromAccount: transfer.fromName,
            sentAmount: amountCell(transfer.sentAmount, transfer.fromCurrency),
            sentCurrency: transfer.fromCurrency,
            toAccount: transfer.toName,
            receivedAmount: amountCell(transfer.receivedAmount, transfer.toCurrency),
            receivedCurrency: transfer.toCurrency,
            impliedRate: impliedRateCell(transfer),
            note: transfer.memo,
          }))
        }
        if (transfers.length < READ_PAGE) return
        const last: TransferSpreadsheetRecord = transfers[transfers.length - 1]
        after = { date: last.date, id: last.id }
      }
    },
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
