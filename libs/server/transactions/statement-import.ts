/**
 * Financy's bank statement import kind (`docs/imports.md`, "The bank statement kind"): a member
 * uploads a statement for one of the household's accounts, the read job parses it with
 * `@spy4x/bank-statements` and checks its balances, the check marks the rows saved before, and
 * the save writes the rest as one batch that one undo removes: entries, and a transfer for each row
 * that the person accepted as the other side of an entry in another of the household's accounts.
 *
 * @module
 */

import type postgres from "postgres"
import { type } from "arktype"
import { assertRoomFor } from "@domain/billing"
import { CategoryKind } from "@domain/categories"
import { canMutateNotes } from "@domain/groups"
import { ImportError, ImportStatus } from "@domain/imports"
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
import { memoryKey, rememberedCategories, rememberPayees } from "./payee-memory.ts"
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
  /** The row's payee on one line, `""` for none: the payee memory's key comes from it. */
  payee: string
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
    { key: `transfer`, label: `Transfer`, choice: true },
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
    const payee = oneLine(cellOf(row, mapping, `payee`))
    const memo = Array.from(
      [payee, cellOf(row, mapping, `memo`)]
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
    return ok({ date, amount, memo, reference: reference === `` ? null : reference, payee })
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
    const others = await chosenCounterparts(tx, values, context.choices, context.groupId, options)
    const categoryIds = values.map((value, index) =>
      context.choices[index]?.category ||
      (value.amount < 0 ? options.expenseCategoryId : options.incomeCategoryId)
    )
    // A transfer row has no category: its choice is ignored, never checked.
    const kinds = await categoryKinds(tx, context.groupId, [
      ...new Set(categoryIds.filter((_, index) => others[index] === null)),
    ])
    // A row saved with a category choice teaches the household's payee memory; the last row of a
    // payee wins. Every category is checked below, before anything is written.
    const remembered = new Map<string, string>()
    const transfers: Record<string, unknown>[] = []
    const ids: string[] = []
    const rows = values.flatMap((value, index) => {
      const other = others[index]
      if (other !== null) {
        const sides = transferSides(value, other, options.accountId)
        const id = uuidV7()
        ids.push(id)
        transfers.push({
          id,
          group_id: context.groupId,
          from_account_id: sides.from,
          to_account_id: sides.to,
          sent_amount: Math.abs(value.amount),
          received_amount: Math.abs(value.amount),
          converted: false,
          memo: value.memo,
          date: sides.date,
          change_sequence: context.changeSequence,
          created_by_user_id: context.actorId,
          updated_by_user_id: context.actorId,
          import_batch_id: context.importId,
        })
        return []
      }
      const kind = value.amount < 0 ? TransactionKind.EXPENSE : TransactionKind.INCOME
      const category = kinds.get(categoryIds[index])
      if (category === undefined) throw new ImportError(`ITEM_NOT_FOUND`, `Category not found`)
      if (!categoryFitsKind(kind, category)) {
        throw new ImportError(`INVALID_REQUEST`, `An expense needs an expense category`)
      }
      const key = memoryKey(value.payee)
      if (context.choices[index]?.category && key !== ``) remembered.set(key, categoryIds[index])
      const id = uuidV7()
      ids.push(id)
      return [{
        id,
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
      }]
    })
    for (let start = 0; start < rows.length; start += WRITE_BATCH) {
      await tx`INSERT INTO transactions ${tx(rows.slice(start, start + WRITE_BATCH))}`
    }
    for (let start = 0; start < transfers.length; start += WRITE_BATCH) {
      await tx`INSERT INTO transfers ${tx(transfers.slice(start, start + WRITE_BATCH))}`
    }
    // As the entry's delete does, for many at once: each entry a transfer replaced goes to the
    // deleted list with its version grown by one and its tombstone, marked so the undo restores it.
    const replaced = others.flatMap((other) => other === null ? [] : [other.id])
    for (let start = 0; start < replaced.length; start += WRITE_BATCH) {
      const gone = await tx<{ id: string }[]>`
        UPDATE transactions
        SET deleted_at = CURRENT_TIMESTAMP,
            version = version + 1,
            updated_by_user_id = ${context.actorId},
            updated_at = CURRENT_TIMESTAMP,
            change_sequence = ${context.changeSequence}::bigint,
            replaced_by_import_id = ${context.importId}
        WHERE group_id = ${context.groupId} AND deleted_at IS NULL
          AND id IN ${tx(replaced.slice(start, start + WRITE_BATCH))}
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
    await rememberPayees(tx, context.groupId, context.actorId, remembered)
    // A household whose plan lapsed has no room: it keeps reading, but adds nothing. The plan counts
    // live entries and transfers together, so a transfer that replaced an entry counts once.
    const cap = context.allowances.maxTransactions
    if (cap !== null && ids.length > 0) {
      const used = await countPlanTransactions(tx, context.groupId) - 1
      assertRoomFor(`maxTransactions`, cap, used, context.role)
    }
    return ids
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
      const transfers = await tx<{ id: string }[]>`
        UPDATE transfers
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
        `transfers`,
        transfers.map((row) => row.id),
        context.changeSequence,
      )
    }
    // As the entry's restore does: each entry a transfer of this batch replaced comes back from the
    // deleted list, stamped with the undo's change so devices put it back over its tombstone. One
    // purged since is gone for good, and one saved by an import undone since stays deleted.
    await tx`
      UPDATE transactions
      SET deleted_at = NULL,
          version = version + 1,
          updated_by_user_id = ${context.actorId},
          updated_at = CURRENT_TIMESTAMP,
          change_sequence = ${context.changeSequence}::bigint,
          replaced_by_import_id = NULL
      WHERE group_id = ${context.groupId} AND replaced_by_import_id = ${context.importId}
        AND deleted_at IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM imports
          WHERE imports.id = transactions.import_batch_id AND imports.status = ${ImportStatus.UNDONE}
        )
    `
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
export function oneLine(text: string): string {
  return text.replace(/\s+/g, ` `).trim()
}

export function isCalendarDate(text: string): boolean {
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
 * account matches it: by bank reference first, then by date, amount and memo, where a row with a
 * reference only matches an entry without one (typed by hand, or brought back from an export). Each
 * stored entry matches one row only, so two equal rows in one file (two coffees on a day) are both
 * saved the first time and both skipped the next. A row left after that is skipped when it matches
 * a side of a live transfer of the account, the same amount within three days; each side matches
 * one row, and each row takes the nearest side still free. A row left to save gets the category
 * the household's payee memory holds for its payee as a suggestion, when that category fits the
 * row's sign, and, as its `transfer`, the entry it is likely the other side of: in another live
 * account of the same currency, the opposite amount within three days, each entry proposed for one
 * row, each row taking the nearest still free.
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
  // Entries with a reference, keyed by it, and the date-amount-memo keys of the rest of each kind.
  const keysOfReference = new Map<string, string[]>()
  const referenced = new Counter()
  const unreferenced = new Counter()
  for (const entry of entries) {
    if (entry.reference === null) {
      unreferenced.add(entry.key)
      continue
    }
    referenced.add(entry.key)
    const keys = keysOfReference.get(entry.reference) ?? []
    keys.push(entry.key)
    keysOfReference.set(entry.reference, keys)
  }
  const skips: (string | null)[] = values.map((value) => {
    if (value.reference === null) return null
    const key = keysOfReference.get(value.reference)?.pop()
    if (key === undefined) return null
    // The entry this row matched by its reference matches no other row by its date and memo.
    referenced.take(key)
    return SKIP_SAVED_BEFORE
  })
  values.forEach((value, index) => {
    if (skips[index] !== null) return
    const key = keyOf(value)
    // A row with a reference never matches an entry with another one: that is another payment.
    // It may match an entry without one, typed by hand or brought back from an export.
    const saved = value.reference === null
      ? referenced.take(key) || unreferenced.take(key)
      : unreferenced.take(key)
    if (saved) skips[index] = SKIP_SAVED_BEFORE
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
  const sidesOfAmount = groupByAmount(sides)
  values.forEach((value, index) => {
    if (skips[index] !== null) return
    const side = takeNearest(sidesOfAmount.get(String(value.amount)), dayOf(value.date))
    if (side) skips[index] = SKIP_TRANSFER
  })
  // A row left is proposed as a transfer when another live account of the household in the same
  // currency has a live entry of the opposite amount within three days: the other side, which that
  // account's statement or a person saved as an entry. One query for the whole file.
  const left = values.filter((_, index) => skips[index] === null)
  const opposite = [...new Set(left.map((value) => String(-value.amount)))]
  const candidates = left.length === 0
    ? []
    : await tx<{ id: string; day: number; amount: string }[]>`
    SELECT transactions.id, (transactions.date - DATE '1970-01-01') AS day,
      transactions.account_amount::text AS amount
    FROM transactions
    JOIN accounts ON accounts.id = transactions.account_id AND accounts.group_id = transactions.group_id
    WHERE transactions.group_id = ${groupId} AND transactions.deleted_at IS NULL
      AND transactions.account_id <> ${options.accountId}
      AND accounts.deleted_at IS NULL AND accounts.currency = ${options.currency}
      AND transactions.account_amount = ANY(${opposite}::bigint[])
      AND transactions.date BETWEEN ${from}::date - ${TRANSFER_MATCH_DAYS}::int
        AND ${to}::date + ${TRANSFER_MATCH_DAYS}::int
    ORDER BY transactions.date, transactions.id
  `
  const candidatesOfAmount = groupByAmount(candidates)
  const transfers = values.map((value, index) =>
    skips[index] === null
      ? takeNearest(candidatesOfAmount.get(String(-value.amount)), dayOf(value.date))?.id
      : undefined
  )
  const keys = values.map((value) => memoryKey(value.payee))
  const memory = await rememberedCategories(tx, groupId, keys)
  return skips.map((skip, index) => {
    const category = memory.get(keys[index])
    const kind = values[index].amount < 0 ? TransactionKind.EXPENSE : TransactionKind.INCOME
    const suggestions: Record<string, string> = {}
    if (skip === null && category && categoryFitsKind(kind, category.kind)) {
      suggestions.category = category.id
    }
    const transfer = transfers[index]
    if (transfer) suggestions.transfer = transfer
    return { skip, suggestions }
  })
}

/** A date like 2026-01-31 as days since 1970-01-01, as the review's queries answer them. */
function dayOf(date: string): number {
  return parseIsoDate(date) / 86_400_000
}

/** Each of `items`, by its amount, in their order. */
function groupByAmount<T extends { amount: string }>(items: readonly T[]): Map<string, T[]> {
  const byAmount = new Map<string, T[]>()
  for (const item of items) byAmount.set(item.amount, [...byAmount.get(item.amount) ?? [], item])
  return byAmount
}

/**
 * Takes out of `items` the one nearest to `day`, at most {@link TRANSFER_MATCH_DAYS} days away,
 * and answers it; the first of equally near ones. `undefined` when none is that near.
 */
export function takeNearest<T extends { day: number }>(
  items: T[] | undefined,
  day: number,
): T | undefined {
  if (!items) return undefined
  let nearest = -1
  for (let at = 0; at < items.length; at++) {
    const distance = Math.abs(items[at].day - day)
    if (
      distance <= TRANSFER_MATCH_DAYS &&
      (nearest === -1 || distance < Math.abs(items[nearest].day - day))
    ) nearest = at
  }
  return nearest === -1 ? undefined : items.splice(nearest, 1)[0]
}

/** An entry of another account chosen as a row's other side, as the save reads it. */
export interface Counterpart {
  id: string
  /** Its account. */
  account: string
  date: string
  /** What moved in its account, signed, in that account's currency's smallest unit. */
  amount: number
  /** Its account's currency. */
  currency: string
  /** Whether its account is live. */
  open: boolean
}

/**
 * Whether `other` can be the other side of `value` saved into the import's account: a live entry
 * of another live account in the same currency, of the opposite amount, at most
 * {@link TRANSFER_MATCH_DAYS} days apart. The same rules the review proposes by.
 */
export function counterpartFits(
  value: StatementValue,
  other: Counterpart,
  options: Pick<StatementOptions, "accountId" | "currency">,
): boolean {
  return other.account !== options.accountId && other.open &&
    other.currency === options.currency && other.amount === -value.amount &&
    Math.abs(dayOf(other.date) - dayOf(value.date)) <= TRANSFER_MATCH_DAYS
}

/**
 * The transfer a row and its other side become: from the account the money left, to the one it
 * reached, dated on the sending side.
 */
export function transferSides(
  value: StatementValue,
  other: Pick<Counterpart, "account" | "date">,
  accountId: string,
): { from: string; to: string; date: string } {
  return value.amount < 0
    ? { from: accountId, to: other.account, date: value.date }
    : { from: other.account, to: accountId, date: other.date }
}

/**
 * The entry each value's `transfer` choice names, or `null` for a row saved as an entry. Whatever
 * the choices name is checked again, as any value from outside: a malformed id or one entry named
 * by two rows is `INVALID_REQUEST`, an id that is no live entry of the household `ITEM_NOT_FOUND`,
 * and an entry that does not fit its row ({@link counterpartFits}) `INVALID_REQUEST`.
 */
async function chosenCounterparts(
  tx: postgres.TransactionSql,
  values: readonly StatementValue[],
  choices: readonly Readonly<Record<string, string>>[],
  groupId: string,
  options: StatementOptions,
): Promise<(Counterpart | null)[]> {
  const chosen = values.map((_, index) => choices[index]?.transfer ?? ``)
  const ids = chosen.filter((id) => id !== ``)
  if (ids.length === 0) return chosen.map(() => null)
  if (!ids.every((id) => UUID_PATTERN.test(id))) {
    throw new ImportError(`INVALID_REQUEST`, `A transfer must name an entry`)
  }
  if (new Set(ids).size !== ids.length) {
    throw new ImportError(`INVALID_REQUEST`, `One entry cannot be the other side of two rows`)
  }
  const found = new Map<string, Counterpart>()
  for (let start = 0; start < ids.length; start += WRITE_BATCH) {
    const rows = await tx<(Omit<Counterpart, "amount"> & { amount: string })[]>`
      SELECT transactions.id, transactions.account_id AS account,
        to_char(transactions.date, 'YYYY-MM-DD') AS date,
        transactions.account_amount::text AS amount, accounts.currency,
        accounts.deleted_at IS NULL AS open
      FROM transactions
      JOIN accounts ON accounts.id = transactions.account_id
        AND accounts.group_id = transactions.group_id
      WHERE transactions.group_id = ${groupId} AND transactions.deleted_at IS NULL
        AND transactions.id IN ${tx(ids.slice(start, start + WRITE_BATCH))}
      FOR UPDATE OF transactions
    `
    for (const row of rows) found.set(row.id, { ...row, amount: Number(row.amount) })
  }
  return chosen.map((id, index) => {
    if (id === ``) return null
    const other = found.get(id)
    if (!other) throw new ImportError(`ITEM_NOT_FOUND`, `Entry not found`)
    if (!counterpartFits(values[index], other, options)) {
      throw new ImportError(
        `INVALID_REQUEST`,
        `The entry chosen as a transfer does not match its row`,
      )
    }
    return other
  })
}

/** A row's date, amount and memo, as the review's query keys a stored entry. */
function keyOf(value: StatementValue): string {
  return `${value.date}|${value.amount}|${value.memo}`
}

/** How many of each key are left to match. */
export class Counter {
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
