/**
 * Financy's bank statement import kind (`docs/imports.md`, "The bank statement kind"): a member
 * uploads a statement for one of the household's accounts, the read job parses it with
 * `@spy4x/bank-statements` and checks its balances, the check marks the rows saved before, and
 * the save writes the rest as one batch of entries that one undo removes.
 *
 * @module
 */

import type postgres from "postgres"
import { type } from "arktype"
import { assertRoomFor } from "@domain/billing"
import { CategoryKind } from "@domain/categories"
import { canMutateNotes } from "@domain/groups"
import { ImportError } from "@domain/imports"
import {
  BANK_STATEMENT_IMPORT_KIND,
  categoryFitsKind,
  TRANSACTION_BANK_REFERENCE_MAX_LENGTH,
  TRANSACTION_MEMO_MAX_LENGTH,
  TransactionKind,
} from "@domain/transactions"
import {
  type BalanceFailure,
  builtInProfiles,
  detectFormat,
  matchProfile,
  type ParsedStatement,
  readStatement,
  StatementError,
  type StatementFormat,
  verifyStatement,
} from "@spy4x/bank-statements"
import { decodeTextFile } from "@spy4x/platform/universal/csv"
import {
  currencyDecimals,
  isCurrencyCode,
  moneyDecimalString,
  parseAmount,
} from "@spy4x/platform/universal/money"
import { err, ok, type Result } from "@spy4x/platform/universal/result"
import { hasUnsafeTextCharacters } from "@spy4x/platform/universal/text"
import { UUID_PATTERN, uuidV7 } from "@spy4x/platform/universal/uuid"
import { parseIsoDate } from "@spy4x/time/date"
import { recordTombstones } from "@server/groups/group-changes.ts"
import { cellOf, importKind, type ImportRow } from "@server/imports/import-kind.ts"
import { countPlanTransactions } from "./plan-count.ts"

/** The columns every statement reads into, whatever its format, and the mapping they take. */
const COLUMNS = [`Date`, `Amount`, `Currency`, `Payee`, `Memo`, `Reference`]
const MAPPING = { date: 0, amount: 1, currency: 2, payee: 3, memo: 4, reference: 5 }

/**
 * QIF names no currency, and the read job does not know the account yet. Its amounts are read in
 * a currency with four decimals, the most ISO 4217 has, so nothing is lost; the check reads them
 * again in the account's currency and refuses digits that currency lacks.
 */
const QIF_READ_CURRENCY = `CLF`

/** Rows one statement writes: well under Postgres's 65,535 parameters at sixteen columns a row. */
const WRITE_BATCH = 1_000

/** How far apart, in days, a statement row and a transfer side may be to match. */
const TRANSFER_MATCH_DAYS = 3

/** The most lines a refusal names. */
const LINES_NAMED = 10

/** Why a review leaves a row out, in words. */
export const SKIP_SAVED_BEFORE = `Saved before`
export const SKIP_TRANSFER = `Matches a transfer`

const optionsSchema = type({
  accountId: UUID_PATTERN,
  expenseCategoryId: UUID_PATTERN,
  incomeCategoryId: UUID_PATTERN,
  "+": `reject`,
})

/** What `readOptions` stores: the account, its currency, and the category of each sign. */
export interface StatementOptions {
  accountId: string
  currency: string
  expenseCategoryId: string
  incomeCategoryId: string
}

/** One checked row, as `commit` writes it. */
export interface StatementValue {
  date: string
  /** Signed, in the account currency's smallest unit: money in is positive. Never zero. */
  amount: number
  memo: string
  reference: string | null
}

/** The bank statement import kind. See the module doc. */
export const statementImportKind = importKind<StatementValue>({
  id: BANK_STATEMENT_IMPORT_KIND.id,
  label: `Entries`,
  accept: BANK_STATEMENT_IMPORT_KIND.accept,
  maxBytes: BANK_STATEMENT_IMPORT_KIND.maxBytes,
  fields: [
    { key: `date`, label: `Date`, required: true },
    { key: `amount`, label: `Amount`, required: true },
    { key: `currency`, label: `Currency` },
    { key: `payee`, label: `Payee` },
    { key: `memo`, label: `Memo` },
    { key: `reference`, label: `Reference` },
    { key: `category`, label: `Category`, choice: true },
  ],
  canCreate: canMutateNotes,
  read(bytes) {
    const read = readStatementFile(bytes)
    if (!read.ok) return read
    const { statement } = read.value
    const rows: ImportRow[] = statement.rows.map((row) => [
      row.date,
      moneyDecimalString(row.amount, currencyDecimals(row.currency)),
      statement.format === `qif` ? `` : row.currency,
      row.payee ?? ``,
      row.memo ?? ``,
      row.reference ?? ``,
    ])
    return ok({ columns: [...COLUMNS], rows, mapping: { ...MAPPING } })
  },
  check(row, mapping, options) {
    const { currency } = options as StatementOptions
    const problems: string[] = []
    const date = cellOf(row, mapping, `date`)
    if (!isCalendarDate(date)) problems.push(`The date is not a date like 2026-01-31.`)
    const stated = cellOf(row, mapping, `currency`)
    let amount = 0
    if (stated !== `` && stated !== currency) {
      problems.push(`The statement is in ${stated}, but the account is in ${currency}.`)
    } else {
      const parsed = parseAmount(cellOf(row, mapping, `amount`), currency, {
        decimal: `.`,
        group: ``,
      })
      if (!parsed.ok) problems.push(`The amount is not a sum in ${currency}.`)
      else if (parsed.value === 0) problems.push(`An entry of zero cannot be saved.`)
      else amount = parsed.value
    }
    const memo = Array.from(
      [cellOf(row, mapping, `payee`), cellOf(row, mapping, `memo`)]
        .map(oneLine).filter((part) => part !== ``).join(` · `),
    ).slice(0, TRANSACTION_MEMO_MAX_LENGTH).join(``).trim()
    if (hasUnsafeTextCharacters(memo)) {
      problems.push(`The payee or memo holds control or invisible characters.`)
    }
    const reference = oneLine(cellOf(row, mapping, `reference`))
    if (Array.from(reference).length > TRANSACTION_BANK_REFERENCE_MAX_LENGTH) {
      problems.push(
        `The reference is longer than ${TRANSACTION_BANK_REFERENCE_MAX_LENGTH} characters.`,
      )
    } else if (hasUnsafeTextCharacters(reference)) {
      problems.push(`The reference holds control or invisible characters.`)
    }
    if (problems.length > 0) return err(problems)
    return ok({ date, amount, memo, reference: reference === `` ? null : reference })
  },
  async readOptions(tx, raw, context) {
    const parsed = optionsSchema(raw)
    if (parsed instanceof type.errors) {
      throw new ImportError(
        `INVALID_REQUEST`,
        `Choose the account and the categories for expenses and income`,
      )
    }
    const [account] = await tx<{ currency: string }[]>`
      SELECT currency FROM accounts
      WHERE id = ${parsed.accountId} AND group_id = ${context.groupId} AND deleted_at IS NULL
    `
    if (!account) throw new ImportError(`ITEM_NOT_FOUND`, `Account not found`)
    if (!isCurrencyCode(account.currency)) {
      throw new ImportError(
        `INVALID_REQUEST`,
        `A bank statement goes into an account in a national currency, not ${account.currency}`,
      )
    }
    const kinds = await categoryKinds(tx, context.groupId, [
      parsed.expenseCategoryId,
      parsed.incomeCategoryId,
    ])
    const expense = kinds.get(parsed.expenseCategoryId)
    const income = kinds.get(parsed.incomeCategoryId)
    if (expense === undefined || income === undefined) {
      throw new ImportError(`ITEM_NOT_FOUND`, `Category not found`)
    }
    if (expense !== CategoryKind.EXPENSE) {
      throw new ImportError(`INVALID_REQUEST`, `Expenses need an expense category`)
    }
    if (income !== CategoryKind.INCOME) {
      throw new ImportError(`INVALID_REQUEST`, `Income needs an income category`)
    }
    return { ...parsed, currency: account.currency } satisfies StatementOptions
  },
  async review(tx, values, context) {
    return await reviewStatement(tx, values, context.groupId, context.options as StatementOptions)
  },
  async commit(tx, values, context) {
    const options = context.options as StatementOptions
    const [account] = await tx<{ currency: string }[]>`
      SELECT currency FROM accounts
      WHERE id = ${options.accountId} AND group_id = ${context.groupId} AND deleted_at IS NULL
    `
    if (!account) throw new ImportError(`ITEM_NOT_FOUND`, `Account not found`)
    if (account.currency !== options.currency) {
      throw new ImportError(
        `IMPORT_REFUSED`,
        `The account's currency changed to ${account.currency} since the upload`,
      )
    }
    const categoryIds = values.map((value, index) =>
      context.choices[index]?.category ||
      (value.amount < 0 ? options.expenseCategoryId : options.incomeCategoryId)
    )
    const kinds = await categoryKinds(tx, context.groupId, [...new Set(categoryIds)])
    const rows = values.map((value, index) => {
      const kind = value.amount < 0 ? TransactionKind.EXPENSE : TransactionKind.INCOME
      const category = kinds.get(categoryIds[index])
      if (category === undefined) throw new ImportError(`ITEM_NOT_FOUND`, `Category not found`)
      if (!categoryFitsKind(kind, category)) {
        throw new ImportError(`INVALID_REQUEST`, `An expense needs an expense category`)
      }
      return {
        id: uuidV7(),
        group_id: context.groupId,
        account_id: options.accountId,
        category_id: categoryIds[index],
        kind,
        account_amount: value.amount,
        amount: value.amount,
        currency: options.currency,
        converted: false,
        memo: value.memo,
        date: value.date,
        change_sequence: context.changeSequence,
        created_by_user_id: context.actorId,
        updated_by_user_id: context.actorId,
        bank_reference: value.reference,
        import_batch_id: context.importId,
      }
    })
    for (let start = 0; start < rows.length; start += WRITE_BATCH) {
      await tx`INSERT INTO transactions ${tx(rows.slice(start, start + WRITE_BATCH))}`
    }
    // A household whose plan lapsed has no room (#87): it keeps reading, but adds nothing.
    const cap = context.allowances.maxTransactions
    if (cap !== null && rows.length > 0) {
      const used = await countPlanTransactions(tx, context.groupId) - 1
      assertRoomFor(`maxTransactions`, cap, used, context.role)
    }
    return rows.map((row) => row.id)
  },
  async undo(tx, ids, context) {
    // As the entry's delete does, for many at once: each live entry of this batch goes to the
    // deleted list with its version grown by one and its tombstone, stamped with the undo's change.
    for (let start = 0; start < ids.length; start += WRITE_BATCH) {
      const batch = ids.slice(start, start + WRITE_BATCH)
      const gone = await tx<{ id: string }[]>`
        UPDATE transactions
        SET deleted_at = CURRENT_TIMESTAMP,
            version = version + 1,
            updated_by_user_id = ${context.actorId},
            updated_at = CURRENT_TIMESTAMP,
            change_sequence = ${context.changeSequence}::bigint
        WHERE group_id = ${context.groupId} AND import_batch_id = ${context.importId}
          AND deleted_at IS NULL AND id IN ${tx(batch)}
        RETURNING id
      `
      await recordTombstones(
        tx,
        context.groupId,
        `transactions`,
        gone.map((row) => row.id),
        context.changeSequence,
      )
    }
  },
})

/**
 * Reads a statement file: its format by content, a CSV through the built-in profile whose header
 * it matches in full, then the balance check. Every refusal is in words that name lines, never the
 * file's text, since the admin panel shows why an import failed.
 */
function readStatementFile(bytes: Uint8Array): Result<{ statement: ParsedStatement }, string> {
  const format = detectFormat(bytes)
  if (format === `pdf`) {
    return err(`PDF statements cannot be imported yet. ${FORMATS}`)
  }
  if (format === `unknown`) return err(`The file is not a bank statement. ${FORMATS}`)
  let profile
  if (format === `csv`) {
    const sample = decodeTextFile(bytes.subarray(0, 65_536)).text
    profile = matchProfile(sample, builtInProfiles).find((match) => match.score === 1)?.profile
    if (!profile) {
      return err(
        `This CSV file's columns match no bank layout Financy knows yet. ` +
          `Export the statement as OFX, QIF, CAMT.053 or MT940 if the bank offers one.`,
      )
    }
  }
  let statement: ParsedStatement
  try {
    statement = readStatement(bytes, {
      profile,
      currency: QIF_READ_CURRENCY,
      maxBytes: BANK_STATEMENT_IMPORT_KIND.maxBytes,
      maxRows: BANK_STATEMENT_IMPORT_KIND.maxRows,
    })
  } catch (error) {
    if (error instanceof StatementError) return err(statementProblem(error, format))
    throw error
  }
  const verification = verifyStatement(statement)
  if (verification.status === `failed`) return err(balanceProblem(verification.failures))
  if (statement.rows.length === 0) return err(`The statement has no entries to import.`)
  return ok({ statement })
}

/** The formats the kind reads, for a refusal. */
const FORMATS = `Use a CSV, OFX, QIF, CAMT.053 or MT940 export from the bank.`

/** Why a whole file was refused, in words that quote nothing from it. */
function statementProblem(error: StatementError, format: StatementFormat): string {
  switch (error.code) {
    case `too-large`:
      return `The statement holds more than ${BANK_STATEMENT_IMPORT_KIND.maxRows} entries ` +
        `or is too deeply nested. Split it into smaller files.`
    case `forbidden`:
      return `The file declares XML entities, which Financy does not read.`
    case `malformed`:
      return `The file is not a valid ${FORMAT_NAMES[format]} statement.`
    case `unsupported`:
      return `Financy cannot read this ${FORMAT_NAMES[format]} statement: it may hold several ` +
        `accounts or investments. Export one bank account at a time.`
  }
}

const FORMAT_NAMES: Record<StatementFormat, string> = {
  ofx: `OFX`,
  qif: `QIF`,
  camt053: `CAMT.053`,
  mt940: `MT940`,
  csv: `CSV`,
  pdf: `PDF`,
  unknown: `bank`,
}

/** A failed balance check in words: the lines that do not read or do not add up. */
function balanceProblem(failures: readonly BalanceFailure[]): string {
  const unread = failures.filter((failure) => failure.type === `row-error`)
  const wrong = unread.length > 0 ? unread : failures
  const lines = [...new Set(wrong.map((failure) => failure.line))].sort((a, b) => a - b)
  const named = lines.slice(0, LINES_NAMED).join(`, `) +
    (lines.length > LINES_NAMED ? ` and ${lines.length - LINES_NAMED} more` : ``)
  const where = lines.length === 1 ? `line ${named}` : `lines ${named}`
  return unread.length > 0
    ? `The statement could not be read on ${where}.`
    : `The statement's balances do not add up on ${where}. ` +
      `Check that the file is the bank's own export, unchanged.`
}

/** Text from a statement on one line: line breaks and runs of spaces become one space. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ` `).trim()
}

function isCalendarDate(text: string): boolean {
  try {
    parseIsoDate(text)
    return true
  } catch {
    return false
  }
}

/** The kind of each category of `ids` in the household; archived ones count, as for any entry. */
async function categoryKinds(
  tx: postgres.TransactionSql,
  groupId: string,
  ids: readonly string[],
): Promise<Map<string, CategoryKind>> {
  const valid = ids.filter((id) => UUID_PATTERN.test(id))
  if (valid.length === 0) return new Map()
  const rows = await tx<{ id: string; kind: CategoryKind }[]>`
    SELECT id, kind FROM categories WHERE group_id = ${groupId} AND id IN ${tx(valid)}
  `
  return new Map(rows.map((row) => [row.id, row.kind]))
}

/**
 * Marks the rows a save leaves out, in file order. A row is saved before when a live entry in the
 * account matches it: by bank reference when the row has one, else by date, amount and memo. Each
 * stored entry matches one row only, so two equal rows in one file (two coffees on a day) are both
 * saved the first time and both skipped the next. A row left after that is skipped when it matches
 * a side of a live transfer of the account, the same amount within three days; each side matches
 * one row, and each row takes the nearest side still free.
 */
async function reviewStatement(
  tx: postgres.TransactionSql,
  values: readonly StatementValue[],
  groupId: string,
  options: StatementOptions,
): Promise<{ skip: string | null; suggestions: Record<string, string> }[]> {
  const dates = values.map((value) => value.date).sort()
  const from = dates[0]
  const to = dates[dates.length - 1]
  const references = [
    ...new Set(values.flatMap((value) => value.reference === null ? [] : [value.reference])),
  ]
  const entries = await tx<{ key: string; reference: string | null }[]>`
    SELECT to_char(date, 'YYYY-MM-DD') || '|' || account_amount::text || '|' || memo AS key,
      bank_reference AS reference
    FROM transactions
    WHERE group_id = ${groupId} AND account_id = ${options.accountId} AND deleted_at IS NULL
      AND (bank_reference = ANY(${references}::text[]) OR date BETWEEN ${from}::date AND ${to}::date)
  `
  const byKey = new Counter()
  const keysOfReference = new Map<string, string[]>()
  for (const entry of entries) {
    byKey.add(entry.key)
    if (entry.reference === null) continue
    const keys = keysOfReference.get(entry.reference) ?? []
    keys.push(entry.key)
    keysOfReference.set(entry.reference, keys)
  }
  const skips: (string | null)[] = values.map((value) => {
    if (value.reference !== null) {
      const key = keysOfReference.get(value.reference)?.pop()
      if (key === undefined) return null
      // The entry this row matched by reference matches no other row by its date and memo.
      byKey.take(key)
      return SKIP_SAVED_BEFORE
    }
    return byKey.take(keyOf(value)) ? SKIP_SAVED_BEFORE : null
  })
  const sides = await tx<{ day: number; amount: string }[]>`
    SELECT (date - DATE '1970-01-01') AS day,
      (CASE WHEN from_account_id = ${options.accountId} THEN -sent_amount
        ELSE received_amount END)::text AS amount
    FROM transfers
    WHERE group_id = ${groupId} AND deleted_at IS NULL
      AND (from_account_id = ${options.accountId} OR to_account_id = ${options.accountId})
      AND date BETWEEN ${from}::date - ${TRANSFER_MATCH_DAYS}::int
        AND ${to}::date + ${TRANSFER_MATCH_DAYS}::int
  `
  const sidesOfAmount = new Map<string, number[]>()
  for (const side of sides) {
    sidesOfAmount.set(side.amount, [...sidesOfAmount.get(side.amount) ?? [], side.day])
  }
  values.forEach((value, index) => {
    if (skips[index] !== null) return
    const days = sidesOfAmount.get(String(value.amount))
    if (!days || days.length === 0) return
    const day = parseIsoDate(value.date) / 86_400_000
    let nearest = -1
    for (let at = 0; at < days.length; at++) {
      const distance = Math.abs(days[at] - day)
      if (
        distance <= TRANSFER_MATCH_DAYS &&
        (nearest === -1 || distance < Math.abs(days[nearest] - day))
      ) nearest = at
    }
    if (nearest === -1) return
    days.splice(nearest, 1)
    skips[index] = SKIP_TRANSFER
  })
  return skips.map((skip) => ({ skip, suggestions: {} }))
}

/** A row's date, amount and memo, as the review's query keys a stored entry. */
function keyOf(value: StatementValue): string {
  return `${value.date}|${value.amount}|${value.memo}`
}

/** How many of each key are left to match. */
class Counter {
  private readonly counts = new Map<string, number>()

  add(key: string): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1)
  }

  /** Takes one `key`, answering whether one was left. */
  take(key: string): boolean {
    const count = this.counts.get(key) ?? 0
    if (count === 0) return false
    this.counts.set(key, count - 1)
    return true
  }
}
