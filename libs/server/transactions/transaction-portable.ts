import type { CategoryKind } from "@domain/categories"
import { GROUP_IMPORT_PROBLEMS_MAX, GroupImportError } from "@domain/groups"
import { convertAmount, RATE_SOURCES, type RateLookup } from "@domain/money"
import {
  parseTransactionExportEntry,
  type TransactionExportEntry,
  TransactionKind,
  transactionReferenceProblems,
} from "@domain/transactions"
import { portable } from "@server/groups/portable.ts"
import { PostgresHouseholdSettingsRepository } from "@server/money/postgres-household-settings-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { amountCell } from "@server/money/spreadsheet-amount.ts"
import { type CsvDecimal, csvDecimal } from "@spy4x/platform/universal/csv"
import { crossRate, type ExchangeRate } from "@spy4x/platform/universal/money"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** Entries one page of the export reads. */
const READ_PAGE = 1_000

/** Rows one statement writes: well under Postgres's 65,535 parameters at sixteen columns a row. */
const WRITE_BATCH = 1_000

/** The catalog key of each entry kind's word. */
const KIND_WORDS: Record<TransactionKind, string> = {
  [TransactionKind.EXPENSE]: "TransactionEditor.expense",
  [TransactionKind.INCOME]: "TransactionEditor.income",
}

/** The name a person knows each rate source by; any other source reads as stored. */
const RATE_SOURCE_WORDS: Readonly<Record<string, string>> = {
  [RATE_SOURCES.ecb]: `ECB`,
  [RATE_SOURCES.fallback]: `ExchangeRate-API`,
  [RATE_SOURCES.demo]: `Demo`,
}

/** The conversion cells of a row of `transactions.csv`. */
interface EntryConversionCells {
  baseAmount: CsvDecimal | string
  rate: CsvDecimal | string
  rateDate: string
  rateSource: string
}

/** A row of `transactions.csv`: what a person reads, in their words. */
interface TransactionSpreadsheetRow extends EntryConversionCells {
  date: string
  type: string
  account: string
  category: string
  parentCategory: string
  note: string
  amount: CsvDecimal | string
  currency: string
  baseCurrency: string
  accountAmount: CsvDecimal | string
  accountCurrency: string
  addedBy: string
}

/** An entry as `transactions.csv` reads it, its two amounts signed and exact. */
interface EntrySpreadsheetRecord {
  id: string
  date: string
  kind: TransactionKind
  accountName: string
  accountCurrency: string
  categoryName: string
  parentName: string | null
  memo: string
  amount: string
  currency: string
  accountAmount: string
  isMember: boolean
  memberName: string
}

/** The cells of an entry with no conversion to show: never a rate of 1 or an amount of 0. */
const NO_CONVERSION: EntryConversionCells = {
  baseAmount: ``,
  rate: ``,
  rateDate: ``,
  rateSource: ``,
}

/** A signed amount read as text, without its sign: the type column carries the direction. */
function unsigned(amount: string): string {
  return amount.replace(/^-/, ``)
}

/**
 * The rate cell: how much of the base currency one unit of `accountCurrency` buys. `lookup` quotes
 * a pair with the euro from the euro, so such a rate is turned round first. A fallback rate's value
 * stays out, because its provider's terms forbid serving it.
 */
function accountRateCell(rate: ExchangeRate, accountCurrency: string): CsvDecimal | string {
  if (rate.source === RATE_SOURCES.fallback) return ``
  if (rate.base === accountCurrency) return csvDecimal(rate.rate)
  const turned = crossRate(rate, { ...rate, quote: rate.base, rate: `1` })
  return turned.ok ? csvDecimal(turned.value.rate) : ``
}

/**
 * What an entry counts for in the base currency, the way the ledger counts it
 * (`PostgresTransactionRepository.ledgerRows`, `summarizeLedger`): the amount typed when it is in
 * the base currency, else what moved in the account, converted at its day's rate when the account
 * is in another currency.
 */
async function entryConversion(
  entry: EntrySpreadsheetRecord,
  baseCurrency: string,
  rateOn: (currency: string, date: string) => Promise<RateLookup>,
): Promise<EntryConversionCells> {
  if (entry.currency === baseCurrency) {
    return { ...NO_CONVERSION, baseAmount: amountCell(unsigned(entry.amount), baseCurrency) }
  }
  if (entry.accountCurrency === baseCurrency) {
    return { ...NO_CONVERSION, baseAmount: amountCell(unsigned(entry.accountAmount), baseCurrency) }
  }
  const lookup = await rateOn(entry.accountCurrency, entry.date)
  if (!lookup.found) return NO_CONVERSION
  const converted = convertAmount(
    Number(entry.accountAmount),
    entry.accountCurrency,
    baseCurrency,
    lookup.rate,
  )
  if (!converted.ok) return NO_CONVERSION
  return {
    baseAmount: amountCell(Math.abs(converted.value), baseCurrency),
    rate: accountRateCell(lookup.rate, entry.accountCurrency),
    rateDate: lookup.rate.date,
    rateSource: RATE_SOURCE_WORDS[lookup.rate.source] ?? lookup.rate.source,
  }
}

/**
 * Entries in a household's export file: every live entry as the server stored it, both amounts,
 * the currency paid and the conversion flag included, so an import never converts again (R4).
 * Deleted entries stay behind. On import each entry gets a new id and names the new ids of its
 * account and category, which the registry writes before it. An entry whose account or category
 * the file lacks, an expense in an income category, or an entry in its account's own currency
 * whose amounts differ refuses the whole import. They count against the new household's
 * `maxTransactions`. In the spreadsheets, `transactions.csv` has a row per live entry, oldest first,
 * with names instead of ids and the amount the app's ledger counts in the base currency.
 */
export const transactionPortable = portable<TransactionExportEntry, TransactionSpreadsheetRow>({
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
  csv: {
    columns: [
      { key: "date", header: "TransactionSpreadsheet.date" },
      { key: "type", header: "TransactionSpreadsheet.type" },
      { key: "account", header: "TransactionSpreadsheet.account" },
      { key: "category", header: "TransactionSpreadsheet.category" },
      { key: "parentCategory", header: "TransactionSpreadsheet.parentCategory" },
      { key: "note", header: "TransactionSpreadsheet.note" },
      { key: "amount", header: "TransactionSpreadsheet.amount" },
      { key: "currency", header: "TransactionSpreadsheet.currency" },
      { key: "baseAmount", header: "TransactionSpreadsheet.baseAmount" },
      { key: "baseCurrency", header: "TransactionSpreadsheet.baseCurrency" },
      { key: "rate", header: "TransactionSpreadsheet.rate" },
      { key: "rateDate", header: "TransactionSpreadsheet.rateDate" },
      { key: "rateSource", header: "TransactionSpreadsheet.rateSource" },
      { key: "accountAmount", header: "TransactionSpreadsheet.accountAmount" },
      { key: "accountCurrency", header: "TransactionSpreadsheet.accountCurrency" },
      { key: "addedBy", header: "TransactionSpreadsheet.addedBy" },
    ],
    async *read(sql, groupId, { t }) {
      const { baseCurrency } = await new PostgresHouseholdSettingsRepository(sql).get(groupId)
      const rates = new PostgresRateRepository(sql)
      // A repeated currency and day costs no second query.
      const lookups = new Map<string, Promise<RateLookup>>()
      const rateOn = (currency: string, date: string) => {
        const key = `${currency} ${date}`
        const lookup = lookups.get(key) ?? rates.lookup(currency, baseCurrency, date)
        lookups.set(key, lookup)
        return lookup
      }
      let after: { date: string; id: string } | null = null
      while (true) {
        const entries: EntrySpreadsheetRecord[] = await sql<EntrySpreadsheetRecord[]>`
          SELECT transactions.id, to_char(transactions.date, 'YYYY-MM-DD') AS date, transactions.kind,
            accounts.name AS account_name, accounts.currency AS account_currency,
            categories.name AS category_name, parents.name AS parent_name, transactions.memo,
            transactions.amount::text AS amount, transactions.currency,
            transactions.account_amount::text AS account_amount,
            users.id IS NOT NULL AS is_member,
            btrim(concat_ws(' ', users.first_name, users.last_name)) AS member_name
          FROM transactions
          INNER JOIN accounts
            ON accounts.id = transactions.account_id AND accounts.group_id = transactions.group_id
          INNER JOIN categories
            ON categories.id = transactions.category_id
            AND categories.group_id = transactions.group_id
          LEFT JOIN categories AS parents
            ON parents.id = categories.parent_id AND parents.group_id = transactions.group_id
          LEFT JOIN group_members
            ON group_members.user_id = transactions.created_by_user_id
            AND group_members.group_id = transactions.group_id
          LEFT JOIN users ON users.id = group_members.user_id AND users.deleted_at IS NULL
          WHERE transactions.group_id = ${groupId} AND transactions.deleted_at IS NULL
            ${
          after === null
            ? sql``
            : sql`AND (transactions.date, transactions.id) > (${after.date}::date, ${after.id}::uuid)`
        }
          ORDER BY transactions.date, transactions.id
          LIMIT ${READ_PAGE}
        `
        const page: TransactionSpreadsheetRow[] = []
        for (const entry of entries) {
          page.push({
            date: entry.date,
            type: t(KIND_WORDS[entry.kind]),
            account: entry.accountName,
            category: entry.categoryName,
            parentCategory: entry.parentName ?? ``,
            note: entry.memo,
            amount: amountCell(unsigned(entry.amount), entry.currency),
            currency: entry.currency,
            ...await entryConversion(entry, baseCurrency, rateOn),
            baseCurrency,
            accountAmount: amountCell(unsigned(entry.accountAmount), entry.accountCurrency),
            accountCurrency: entry.accountCurrency,
            addedBy: entry.isMember
              ? entry.memberName || t(`NotePeople.unnamed`)
              : t(`NotePeople.former`),
          })
        }
        if (page.length > 0) yield page
        if (entries.length < READ_PAGE) return
        const last: EntrySpreadsheetRecord = entries[entries.length - 1]
        after = { date: last.date, id: last.id }
      }
    },
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
