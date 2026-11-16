/**
 * Financy's app history import kind (`docs/imports.md`, "The app history kind"): a member uploads
 * the export of another money app (Firefly III's transactions CSV, YNAB's export or its register
 * CSV, Actual Budget's export zip), the read job parses it with `@spy4x/bank-statements` into one
 * row per entry or transfer, the check marks the rows saved before and says which accounts and
 * categories a save creates, and the save writes the entries, the transfers and the accounts and
 * categories they need as one batch that one undo removes.
 *
 * @module
 */

import type postgres from "postgres"
import { type } from "arktype"
import { ACCOUNT_MAX_PER_GROUP, ACCOUNT_NAME_MAX_LENGTH, AccountKind } from "@domain/accounts"
import { assertRoomFor } from "@domain/billing"
import {
  CATEGORY_MAX_PER_GROUP,
  CATEGORY_MAX_STORED,
  CATEGORY_NAME_MAX_LENGTH,
  CategoryKind,
  DEFAULT_CATEGORY_ICON,
} from "@domain/categories"
import { canMutateNotes } from "@domain/groups"
import { ImportError } from "@domain/imports"
import {
  APP_HISTORY_IMPORT_KIND,
  categoryFitsKind,
  TRANSACTION_MEMO_MAX_LENGTH,
  TransactionKind,
} from "@domain/transactions"
import { StatementError } from "@spy4x/bank-statements"
import {
  type HistoryAccount,
  type HistoryAccountKind,
  parseActualBudget,
  type ParsedHistory,
  parseFireflyIii,
  parseYnab,
} from "@spy4x/bank-statements/app-exports"
import { AsyncMutex } from "@spy4x/platform/universal/concurrency"
import { decodeTextFile } from "@spy4x/platform/universal/csv"
import {
  currencyDecimals,
  isCurrencyCode,
  moneyDecimalString,
  parseAmount,
} from "@spy4x/platform/universal/money"
import { err, ok, type Result } from "@spy4x/platform/universal/result"
import { hasUnsafeTextCharacters } from "@spy4x/platform/universal/text"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { recordTombstones } from "@server/groups/group-changes.ts"
import { cellOf, importKind, type ImportRow } from "@server/imports/import-kind.ts"
import { PostgresHouseholdSettingsRepository } from "@server/money/postgres-household-settings-repository.ts"
import { countPlanTransactions } from "./plan-count.ts"
import { Counter, isCalendarDate, oneLine, SKIP_SAVED_BEFORE } from "./statement-import.ts"

/** The columns every export reads into, whatever the app, and the mapping they take. */
const COLUMNS = [
  `Kind`,
  `Date`,
  `Amount`,
  `Whole amount`,
  `Currency`,
  `Account`,
  `Account IBAN`,
  `Account type`,
  `To account`,
  `To account IBAN`,
  `To account type`,
  `Foreign amount`,
  `Foreign currency`,
  `Category`,
  `Payee`,
  `Description`,
  `Notes`,
  `Line`,
]
const MAPPING = {
  kind: 0,
  date: 1,
  amount: 2,
  wholeAmount: 3,
  currency: 4,
  account: 5,
  accountIban: 6,
  accountType: 7,
  toAccount: 8,
  toAccountIban: 9,
  toAccountType: 10,
  foreignAmount: 11,
  foreignCurrency: 12,
  category: 13,
  payee: 14,
  description: 15,
  notes: 16,
  line: 17,
}

/**
 * YNAB and Actual Budget name no currency, and the read job does not know the upload's options.
 * Their amounts are read in a currency with four decimals, the most ISO 4217 has, so nothing is
 * lost; the check reads them again in the upload's currency and refuses digits it lacks.
 */
const PLACEHOLDER_CURRENCY = `CLF`

/**
 * YNAB writes amounts in the budget's own format, and a lone mark followed by three digits
 * (`¥1,000`) groups thousands in a currency without decimals but is a decimal mark in the
 * placeholder. The register is read a second time in a currency without decimals, into the
 * `Whole amount` column, which the check reads for such a currency.
 */
const WHOLE_CURRENCY = `JPY`

/**
 * The most bytes Actual Budget's database may inflate to: years of history. One read near the cap
 * adds about three times the database to the process's memory, which must fit next to the rest of
 * the API and the worker.
 */
export const ACTUAL_DATABASE_MAX_BYTES = 32 * 1024 * 1024

/**
 * One Actual Budget read at a time in this process: a tiny zip can inflate to a database near
 * {@link ACTUAL_DATABASE_MAX_BYTES}, and every check request reads the file again, so parallel
 * requests would each hold one in memory. Exported for its test only.
 */
export const actualReads = new AsyncMutex()

/** Rows one write inserts: well under Postgres's 65,535 parameters at sixteen columns a row. */
const WRITE_BATCH = 1_000

/** The category of an entry the export files under none. */
export const UNCATEGORIZED = `Uncategorized`

/** The colour of a category an import creates: the colour field's gray preset. */
const NEW_CATEGORY_COLOR = `#4b5563`

/**
 * The `Kind` cell of a row the reader could not read, and the `Whole amount` of a YNAB row that
 * did not read without decimals.
 */
const UNREADABLE = `unreadable`

/** What a review suggests for a record the save creates instead of matching. */
export const NEW_RECORD = `new`

const optionsSchema = type({ "currency?": /^[A-Z]{3}$/, "+": `reject` })

/** What `readOptions` stores: the currency of an export that names none. */
export interface HistoryOptions {
  currency: string
}

/** An account a row names, as the export describes it. */
export interface HistoryAccountRef {
  name: string
  /** Upper case without spaces, or `null` for none or one that is not an IBAN. */
  iban: string | null
  type: HistoryAccountKind | null
}

/** One checked row, as `commit` writes it. */
export interface HistoryValue {
  kind: `entry` | `transfer`
  date: string
  /** An entry's is signed, money in positive; a transfer's is what left `account`, positive. */
  amount: number
  currency: string
  account: HistoryAccountRef
  /** The account a transfer went to; `null` for an entry. */
  to: HistoryAccountRef | null
  /** An entry's amount where it was spent, or what reached a transfer's `to`; `null` for none. */
  foreignAmount: number | null
  foreignCurrency: string | null
  /** An entry's category name; `null` for none. Always `null` for a transfer. */
  category: string | null
  memo: string
}

/** The app history import kind. See the module doc. */
export const historyImportKind = importKind<HistoryValue>({
  id: APP_HISTORY_IMPORT_KIND.id,
  label: `Entries and transfers`,
  accept: APP_HISTORY_IMPORT_KIND.accept,
  maxBytes: APP_HISTORY_IMPORT_KIND.maxBytes,
  fields: [
    { key: `kind`, label: `Kind`, required: true },
    { key: `date`, label: `Date`, required: true },
    { key: `amount`, label: `Amount`, required: true },
    { key: `wholeAmount`, label: `Whole amount` },
    { key: `currency`, label: `Currency` },
    { key: `account`, label: `Account`, required: true },
    { key: `accountIban`, label: `Account IBAN` },
    { key: `accountType`, label: `Account type` },
    { key: `toAccount`, label: `To account` },
    { key: `toAccountIban`, label: `To account IBAN` },
    { key: `toAccountType`, label: `To account type` },
    { key: `foreignAmount`, label: `Foreign amount` },
    { key: `foreignCurrency`, label: `Foreign currency` },
    { key: `category`, label: `Category` },
    { key: `payee`, label: `Payee` },
    { key: `description`, label: `Description` },
    { key: `notes`, label: `Notes` },
    { key: `line`, label: `Line` },
  ],
  canCreate: canMutateNotes,
  async read(bytes) {
    const read = await readHistoryFile(bytes)
    if (!read.ok) return read
    return ok({ columns: [...COLUMNS], rows: historyRows(read.value), mapping: { ...MAPPING } })
  },
  check(row, mapping, options) {
    return checkHistoryRow(row, mapping, options as HistoryOptions | null | undefined)
  },
  async readOptions(tx, raw, context) {
    const parsed = optionsSchema(raw)
    if (parsed instanceof type.errors) {
      throw new ImportError(
        `INVALID_REQUEST`,
        `The only option is the currency the export is in, such as EUR`,
      )
    }
    const currency = parsed.currency ??
      (await new PostgresHouseholdSettingsRepository(tx).get(context.groupId)).baseCurrency
    if (!isCurrencyCode(currency)) {
      throw new ImportError(`INVALID_REQUEST`, `Choose a national currency, such as EUR`)
    }
    return { currency } satisfies HistoryOptions
  },
  async review(tx, values, context) {
    const stored = await storedRecords(tx, context.groupId)
    const plan = planHistory(values, stored.accounts, stored.categories)
    const saved = await savedBefore(tx, context.groupId, values, plan)
    return plan.rows.map((row, index) => ({
      skip: row.problem ?? (saved[index] ? SKIP_SAVED_BEFORE : null),
      suggestions: suggestionsOf(row),
    }))
  },
  async commit(tx, values, context) {
    const stored = await storedRecords(tx, context.groupId)
    const plan = planHistory(values, stored.accounts, stored.categories)
    // The save's own review skipped every row with a problem, in this transaction; one left here
    // is a fault, never a reason to write half a row.
    if (plan.rows.some((row) => row.problem !== null)) {
      throw new ImportError(`IMPORT_REFUSED`, `The household's accounts changed during the save`)
    }
    const liveAccounts = stored.accounts.length + plan.accounts.length
    if (liveAccounts > ACCOUNT_MAX_PER_GROUP) {
      throw new ImportError(
        `IMPORT_REFUSED`,
        `The export needs ${plan.accounts.length} new accounts, but a household holds at most ` +
          `${ACCOUNT_MAX_PER_GROUP}`,
      )
    }
    const liveCategories = stored.categories.filter((one) => !one.archived).length +
      plan.categories.length
    if (liveCategories > CATEGORY_MAX_PER_GROUP) {
      throw new ImportError(
        `IMPORT_REFUSED`,
        `The export needs ${plan.categories.length} new categories, but a household holds at ` +
          `most ${CATEGORY_MAX_PER_GROUP}`,
      )
    }
    if (stored.categories.length + plan.categories.length > CATEGORY_MAX_STORED) {
      throw new ImportError(
        `IMPORT_REFUSED`,
        `The export needs ${plan.categories.length} new categories, but a household keeps at ` +
          `most ${CATEGORY_MAX_STORED}, archived ones included`,
      )
    }
    const accountIds: string[] = []
    for (const account of plan.accounts) {
      const id = uuidV7()
      accountIds.push(id)
      await tx`
        INSERT INTO accounts (
          id, group_id, name, kind, currency, starting_balance, aliases, change_sequence,
          created_by_user_id, updated_by_user_id
        ) VALUES (
          ${id}, ${context.groupId}, ${account.name}, ${account.kind}, ${account.currency}, 0,
          ${tx.array(account.iban === null ? [] : [account.iban])}::text[],
          ${context.changeSequence}::bigint, ${context.actorId}, ${context.actorId}
        )
      `
    }
    const categoryIds: string[] = []
    for (const category of plan.categories) {
      const id = uuidV7()
      categoryIds.push(id)
      await tx`
        INSERT INTO categories (
          id, group_id, name, kind, icon, color, change_sequence, created_by_user_id,
          updated_by_user_id
        ) VALUES (
          ${id}, ${context.groupId}, ${category.name}, ${category.kind}, ${DEFAULT_CATEGORY_ICON},
          ${NEW_CATEGORY_COLOR}, ${context.changeSequence}::bigint, ${context.actorId},
          ${context.actorId}
        )
      `
    }
    // A household whose plan lapsed has no room: it keeps reading, but adds nothing.
    const { maxAccounts, maxCategories, maxTransactions } = context.allowances
    if (maxAccounts !== null && plan.accounts.length > 0) {
      assertRoomFor(`maxAccounts`, maxAccounts, liveAccounts - 1, context.role)
    }
    if (maxCategories !== null && plan.categories.length > 0) {
      assertRoomFor(`maxCategories`, maxCategories, liveCategories - 1, context.role)
    }
    const idOf = (target: Target, created: readonly string[]) =>
      `existing` in target ? target.existing : created[target.created]
    const entries: Record<string, unknown>[] = []
    const transfers: Record<string, unknown>[] = []
    values.forEach((value, index) => {
      const row = plan.rows[index]
      const common = {
        id: uuidV7(),
        group_id: context.groupId,
        memo: value.memo,
        date: value.date,
        change_sequence: context.changeSequence,
        created_by_user_id: context.actorId,
        updated_by_user_id: context.actorId,
        converted: false,
      }
      if (value.kind === `transfer`) {
        transfers.push({
          ...common,
          from_account_id: idOf(row.account, accountIds),
          to_account_id: idOf(row.to!, accountIds),
          sent_amount: value.amount,
          received_amount: value.foreignAmount ?? value.amount,
        })
        return
      }
      entries.push({
        ...common,
        account_id: idOf(row.account, accountIds),
        category_id: idOf(row.category!, categoryIds),
        kind: value.amount < 0 ? TransactionKind.EXPENSE : TransactionKind.INCOME,
        account_amount: value.amount,
        amount: value.foreignAmount ?? value.amount,
        currency: value.foreignCurrency ?? value.currency,
        bank_reference: null,
        import_batch_id: context.importId,
      })
    })
    for (let start = 0; start < entries.length; start += WRITE_BATCH) {
      await tx`INSERT INTO transactions ${tx(entries.slice(start, start + WRITE_BATCH))}`
    }
    for (let start = 0; start < transfers.length; start += WRITE_BATCH) {
      await tx`INSERT INTO transfers ${tx(transfers.slice(start, start + WRITE_BATCH))}`
    }
    if (maxTransactions !== null && values.length > 0) {
      const used = await countPlanTransactions(tx, context.groupId) - 1
      assertRoomFor(`maxTransactions`, maxTransactions, used, context.role)
    }
    return [
      ...entries.map((row) => row.id as string),
      ...transfers.map((row) => row.id as string),
      ...accountIds,
      ...categoryIds,
    ]
  },
  async undo(tx, ids, context) {
    // As the entry's and the transfer's delete do, for many at once: each live one of this batch
    // goes to the deleted list with its version grown by one and its tombstone.
    for (let start = 0; start < ids.length; start += WRITE_BATCH) {
      const batch = ids.slice(start, start + WRITE_BATCH)
      const entries = await tx<{ id: string }[]>`
        UPDATE transactions
        SET deleted_at = CURRENT_TIMESTAMP, version = version + 1,
            updated_by_user_id = ${context.actorId}, updated_at = CURRENT_TIMESTAMP,
            change_sequence = ${context.changeSequence}::bigint
        WHERE group_id = ${context.groupId} AND import_batch_id = ${context.importId}
          AND deleted_at IS NULL AND id IN ${tx(batch)}
        RETURNING id
      `
      await recordTombstones(
        tx,
        context.groupId,
        `transactions`,
        entries.map((row) => row.id),
        context.changeSequence,
      )
      const transfers = await tx<{ id: string }[]>`
        UPDATE transfers
        SET deleted_at = CURRENT_TIMESTAMP, version = version + 1,
            updated_by_user_id = ${context.actorId}, updated_at = CURRENT_TIMESTAMP,
            change_sequence = ${context.changeSequence}::bigint
        WHERE group_id = ${context.groupId} AND deleted_at IS NULL AND id IN ${tx(batch)}
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
    // Then the accounts and categories the batch created, except one that anything outside the
    // batch names now, live or deleted: as the account's own delete refuses, and as a category in
    // use stays live. Such a record is kept as it is, and so is an account made the household's
    // default since, which would otherwise leave the household without one.
    for (let start = 0; start < ids.length; start += WRITE_BATCH) {
      const batch = ids.slice(start, start + WRITE_BATCH)
      await tx`
        UPDATE accounts
        SET deleted_at = CURRENT_TIMESTAMP, version = version + 1,
            updated_by_user_id = ${context.actorId}, updated_at = CURRENT_TIMESTAMP,
            change_sequence = ${context.changeSequence}::bigint
        WHERE group_id = ${context.groupId} AND deleted_at IS NULL AND id IN ${tx(batch)}
          AND NOT is_default
          AND NOT EXISTS (
            SELECT 1 FROM transactions
            WHERE transactions.group_id = accounts.group_id
              AND transactions.account_id = accounts.id
              AND transactions.import_batch_id IS DISTINCT FROM ${context.importId}::uuid
          )
          AND NOT EXISTS (
            SELECT 1 FROM transfers
            WHERE transfers.group_id = accounts.group_id
              AND (transfers.from_account_id = accounts.id OR transfers.to_account_id = accounts.id)
              AND NOT transfers.id = ANY(${ids as string[]}::uuid[])
          )
          AND NOT EXISTS (
            SELECT 1 FROM recurring_rules
            WHERE recurring_rules.group_id = accounts.group_id
              AND recurring_rules.account_id = accounts.id
          )
      `
      await tx`
        UPDATE categories
        SET archived_at = CURRENT_TIMESTAMP, version = version + 1,
            updated_by_user_id = ${context.actorId}, updated_at = CURRENT_TIMESTAMP,
            change_sequence = ${context.changeSequence}::bigint
        WHERE group_id = ${context.groupId} AND archived_at IS NULL AND id IN ${tx(batch)}
          AND NOT EXISTS (
            SELECT 1 FROM transactions
            WHERE transactions.group_id = categories.group_id
              AND transactions.category_id = categories.id
              AND transactions.import_batch_id IS DISTINCT FROM ${context.importId}::uuid
          )
          AND NOT EXISTS (
            SELECT 1 FROM categories AS children
            WHERE children.group_id = categories.group_id AND children.parent_id = categories.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM budgets
            WHERE budgets.group_id = categories.group_id AND budgets.category_id = categories.id
          )
          AND NOT EXISTS (
            SELECT 1 FROM budget_moves
            WHERE budget_moves.group_id = categories.group_id
              AND (budget_moves.from_category_id = categories.id
                OR budget_moves.to_category_id = categories.id)
          )
          AND NOT EXISTS (
            SELECT 1 FROM recurring_rules
            WHERE recurring_rules.group_id = categories.group_id
              AND recurring_rules.category_id = categories.id
          )
      `
    }
  },
})

/** Which app wrote an export, read from its bytes; never from its name. */
export type HistoryFormat = `firefly-iii` | `ynab` | `zip` | `unknown`

/**
 * The format of `bytes`: a zip (YNAB's export or Actual Budget's), or a CSV whose header has
 * Firefly III's `source_name` and `destination_name`, or YNAB's `Outflow` and `Inflow`.
 */
export function detectHistoryFormat(bytes: Uint8Array): HistoryFormat {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return `zip`
  }
  const text = decodeTextFile(bytes.subarray(0, 65_536)).text
  const header = new Set(
    text.split(/\r?\n/, 1)[0].split(/[,;\t]/).map((cell) =>
      cell.trim().replace(/^"|"$/g, ``).trim().toLowerCase()
    ),
  )
  if (header.has(`source_name`) && header.has(`destination_name`)) return `firefly-iii`
  if (header.has(`outflow`) && header.has(`inflow`)) return `ynab`
  return `unknown`
}

/** What a reader got, and how its amounts are written. */
export interface ReadHistory {
  history: ParsedHistory
  /** Whether amounts are in {@link PLACEHOLDER_CURRENCY}: the file names no currency. */
  placeholder: boolean
  /**
   * YNAB's amounts read without decimals, by `entry:<line>` or `transfer:<line>`; a row missing
   * here did not read that way. `null` for the other apps.
   */
  whole: Map<string, number> | null
}

/** The formats the kind reads, for a refusal. */
const FORMATS = `Use Firefly III's transactions export, YNAB's export or Actual Budget's export.`

/**
 * Reads an export: its app by content, then its reader with the kind's limits. Every refusal is in
 * words that quote nothing from the file, since the admin panel shows why an import failed.
 */
export async function readHistoryFile(bytes: Uint8Array): Promise<Result<ReadHistory, string>> {
  const limits = {
    maxBytes: APP_HISTORY_IMPORT_KIND.maxBytes,
    maxRows: APP_HISTORY_IMPORT_KIND.maxRows,
  }
  const format = detectHistoryFormat(bytes)
  if (format === `unknown`) return err(`The file is not an export Financy reads. ${FORMATS}`)
  let read: ReadHistory
  try {
    if (format === `firefly-iii`) {
      read = {
        history: parseFireflyIii(decodeTextFile(bytes).text, limits),
        placeholder: false,
        whole: null,
      }
    } else if (format === `ynab`) read = await readYnab(bytes, limits)
    else {
      // A zip is Actual Budget's when it holds `db.sqlite`, else YNAB's when it holds a register;
      // each reader looks for its own entry before it reads anything else.
      try {
        read = {
          history: await actualReads.runExclusive(() =>
            parseActualBudget(bytes, {
              ...limits,
              maxDatabaseBytes: ACTUAL_DATABASE_MAX_BYTES,
              currency: PLACEHOLDER_CURRENCY,
            })
          ),
          placeholder: true,
          whole: null,
        }
      } catch (error) {
        if (!(error instanceof StatementError) || error.code !== `malformed`) throw error
        read = await readYnab(bytes, limits)
      }
    }
  } catch (error) {
    if (!(error instanceof StatementError)) throw error
    if (error.code === `too-large`) {
      return err(
        `The export holds more than ${APP_HISTORY_IMPORT_KIND.maxRows} rows or is larger than ` +
          `Financy reads. Export a shorter period.`,
      )
    }
    return err(`The file is not ${FORMAT_NAMES[format]} Financy can read. ${FORMATS}`)
  }
  const { history } = read
  if (history.entries.length + history.transfers.length + history.rowErrors.length === 0) {
    return err(`The export has no entries to import.`)
  }
  return ok(read)
}

const FORMAT_NAMES: Record<HistoryFormat, string> = {
  "firefly-iii": `a Firefly III export`,
  ynab: `a YNAB export`,
  zip: `a YNAB or Actual Budget export`,
  unknown: `an export`,
}

/** YNAB's export read in the placeholder, and again without decimals for the `Whole amount`. */
async function readYnab(
  bytes: Uint8Array,
  limits: { maxBytes: number; maxRows: number },
): Promise<ReadHistory> {
  const history = await parseYnab(bytes, { ...limits, currency: PLACEHOLDER_CURRENCY })
  const whole = new Map<string, number>()
  const again = await parseYnab(bytes, { ...limits, currency: WHOLE_CURRENCY })
  for (const entry of again.entries) whole.set(`entry:${entry.line}`, entry.amount)
  for (const transfer of again.transfers) whole.set(`transfer:${transfer.line}`, transfer.amount)
  return { history, placeholder: true, whole }
}

/** The rows of the kind's fixed columns, in the file's line order; unread rows become refusals. */
export function historyRows({ history, placeholder, whole }: ReadHistory): ImportRow[] {
  const accounts = new Map<string, HistoryAccount>()
  for (const account of history.accounts) {
    if (!accounts.has(account.name)) accounts.set(account.name, account)
  }
  const accountCells = (name: string) => {
    const account = accounts.get(name)
    return [name, account?.iban ?? ``, account?.kind ?? ``]
  }
  const money = (amount: number, currency: string) =>
    moneyDecimalString(amount, currencyDecimals(placeholder ? PLACEHOLDER_CURRENCY : currency))
  const foreign = (amount: number | undefined, currency: string | undefined) =>
    amount === undefined || currency === undefined
      ? [``, ``]
      : [moneyDecimalString(amount, currencyDecimals(currency)), currency]
  const wholeOf = (key: string) => {
    if (whole === null) return ``
    const amount = whole.get(key)
    return amount === undefined ? UNREADABLE : moneyDecimalString(amount, 0)
  }
  const rows: { line: number; cells: string[] }[] = []
  for (const entry of history.entries) {
    rows.push({
      line: entry.line,
      cells: [
        `entry`,
        entry.date,
        money(entry.amount, entry.currency),
        wholeOf(`entry:${entry.line}`),
        placeholder ? `` : entry.currency,
        ...accountCells(entry.account),
        ``,
        ``,
        ``,
        ...foreign(entry.foreignAmount, entry.foreignCurrency),
        entry.category ?? ``,
        entry.payee ?? ``,
        entry.description,
        entry.notes ?? ``,
        String(entry.line),
      ],
    })
  }
  for (const transfer of history.transfers) {
    rows.push({
      line: transfer.line,
      cells: [
        `transfer`,
        transfer.date,
        money(transfer.amount, transfer.currency),
        wholeOf(`transfer:${transfer.line}`),
        placeholder ? `` : transfer.currency,
        ...accountCells(transfer.from),
        ...accountCells(transfer.to),
        ...foreign(transfer.foreignAmount, transfer.foreignCurrency),
        ``,
        ``,
        transfer.description,
        transfer.notes ?? ``,
        String(transfer.line),
      ],
    })
  }
  for (const error of history.rowErrors) {
    const cells = COLUMNS.map(() => ``)
    cells[MAPPING.kind] = UNREADABLE
    cells[MAPPING.line] = String(error.line)
    rows.push({ line: error.line, cells })
  }
  return rows.sort((a, b) => a.line - b.line).map((row) => row.cells)
}

/** Checks one row: the value `commit` writes, or each problem in words that quote no cell. */
export function checkHistoryRow(
  row: ImportRow,
  mapping: Record<string, number>,
  options: HistoryOptions | null | undefined,
): Result<HistoryValue, string[]> {
  const cell = (key: string) => cellOf(row, mapping, key)
  const kind = cell(`kind`)
  if (kind === UNREADABLE) {
    const line = cell(`line`)
    return err([
      /^\d{1,9}$/.test(line)
        ? `Line ${line} of the export could not be read.`
        : `A line of the export could not be read.`,
    ])
  }
  if (kind !== `entry` && kind !== `transfer`) return err([`The kind is not entry or transfer.`])
  const problems: string[] = []
  const date = cell(`date`)
  if (!isCalendarDate(date)) problems.push(`The date is not a date like 2026-01-31.`)
  const currency = cell(`currency`) || options?.currency || ``
  let amount = 0
  if (!isCurrencyCode(currency)) {
    problems.push(
      currency === `` ? `Choose the currency the export is in.` : `The currency is not known.`,
    )
  } else {
    const whole = cell(`wholeAmount`)
    const read = currencyDecimals(currency) !== 0 || whole === ``
      ? readAmount(cell(`amount`), currency)
      : whole === UNREADABLE
      ? err(`The amount is not a sum in ${currency}.`)
      : readAmount(whole, currency)
    if (!read.ok) problems.push(read.error)
    else if (read.value === 0) problems.push(`An amount of zero cannot be saved.`)
    else if (kind === `transfer` && read.value < 0) {
      problems.push(`A transfer's amount is negative.`)
    } else amount = read.value
  }
  let foreignAmount: number | null = null
  let foreignCurrency: string | null = null
  const statedForeign = cell(`foreignCurrency`)
  const foreignText = cell(`foreignAmount`)
  if (statedForeign !== `` && statedForeign !== currency) {
    if (!isCurrencyCode(statedForeign)) problems.push(`The foreign currency is not known.`)
    else {
      const read = readAmount(foreignText, statedForeign)
      if (!read.ok) problems.push(`The foreign amount: ${read.error}`)
      else if (read.value === 0 || (amount !== 0 && Math.sign(read.value) !== Math.sign(amount))) {
        problems.push(`The foreign amount does not go the same way as the amount.`)
      } else {
        foreignAmount = read.value
        foreignCurrency = statedForeign
      }
    }
  } else if (statedForeign === `` && foreignText !== ``) {
    problems.push(`The foreign amount has no currency.`)
  }
  const account = accountRef(cell(`account`), cell(`accountIban`), cell(`accountType`))
  if (typeof account === `string`) problems.push(`The account ${account}`)
  let to: HistoryAccountRef | null = null
  if (kind === `transfer`) {
    const target = accountRef(cell(`toAccount`), cell(`toAccountIban`), cell(`toAccountType`))
    if (typeof target === `string`) problems.push(`The account it went to ${target}`)
    else if (typeof account !== `string` && fold(target.name) === fold(account.name)) {
      problems.push(`A transfer needs two different accounts.`)
    } else to = target
  }
  let category: string | null = null
  if (kind === `entry`) {
    const name = oneLine(cell(`category`))
    if (Array.from(name).length > CATEGORY_NAME_MAX_LENGTH) {
      problems.push(`The category is longer than ${CATEGORY_NAME_MAX_LENGTH} characters.`)
    } else if (hasUnsafeTextCharacters(name)) {
      problems.push(`The category holds control or invisible characters.`)
    } else if (name !== ``) category = name
  }
  const memo = memoOf([cell(`payee`), cell(`description`), cell(`notes`)])
  if (hasUnsafeTextCharacters(memo)) {
    problems.push(`The payee, description or notes hold control or invisible characters.`)
  }
  if (problems.length > 0 || typeof account === `string`) return err(problems)
  return ok({
    kind,
    date,
    amount,
    currency,
    account,
    to,
    foreignAmount,
    foreignCurrency,
    category,
    memo,
  })
}

/** An amount the read wrote with `.` decimals, in `currency`'s smallest unit, or why not. */
function readAmount(text: string, currency: string): Result<number, string> {
  const read = parseAmount(text, currency, { decimal: `.`, group: `` })
  if (read.ok) return read
  return err(
    read.error.type === `too-many-decimals`
      ? `The amount has more decimal places than ${currency} has.`
      : `The amount is not a sum in ${currency}.`,
  )
}

const ACCOUNT_TYPES: readonly HistoryAccountKind[] = [
  `asset`,
  `expense`,
  `revenue`,
  `liability`,
  `other`,
]

/** The account a row names, or the end of a sentence saying what is wrong with it. */
function accountRef(
  nameCell: string,
  ibanCell: string,
  typeCell: string,
): HistoryAccountRef | string {
  const name = oneLine(nameCell)
  if (name === ``) return `has no name.`
  if (Array.from(name).length > ACCOUNT_NAME_MAX_LENGTH) {
    return `name is longer than ${ACCOUNT_NAME_MAX_LENGTH} characters.`
  }
  if (hasUnsafeTextCharacters(name)) return `name holds control or invisible characters.`
  const type = ACCOUNT_TYPES.find((one) => one === typeCell) ?? null
  // The export's expense and revenue accounts are who was paid or who paid: a payee.
  if (type === `expense` || type === `revenue`) return `is a payee in the export, not an account.`
  const iban = ibanCell.replace(/\s+/g, ``).toUpperCase()
  return { name, iban: IBAN.test(iban) ? iban : null, type }
}

const IBAN = /^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/

/** The memo of a row: its distinct parts on one line, joined, cut to a memo's length. */
function memoOf(parts: readonly string[]): string {
  const kept: string[] = []
  for (const part of parts.map(oneLine)) {
    if (part !== `` && !kept.includes(part)) kept.push(part)
  }
  return Array.from(kept.join(` · `)).slice(0, TRANSACTION_MEMO_MAX_LENGTH).join(``).trim()
}

/** A name as two names compare: trimmed, in lower case. */
function fold(name: string): string {
  return name.trim().toLowerCase()
}

/** A live account of the household, as a plan matches it. */
export interface StoredAccount {
  id: string
  name: string
  currency: string
  aliases: string[]
}

/** A category of the household, archived ones included, as a plan matches it. */
export interface StoredCategory {
  id: string
  name: string
  kind: CategoryKind
  archived: boolean
}

/** An account a save creates. */
export interface NewAccount {
  name: string
  kind: AccountKind
  currency: string
  /** Kept as the account's alias, so the next import of the same export finds it. */
  iban: string | null
}

/** A category a save creates. */
export interface NewCategory {
  name: string
  kind: CategoryKind
}

/** A record a row writes to: a stored one by id, or one the save creates, by its place. */
export type Target = { existing: string } | { created: number }

/** Where one row goes. */
export interface RowPlan {
  account: Target
  /** A transfer's other side; `null` for an entry. */
  to: Target | null
  /** An entry's category; `null` for a transfer. */
  category: Target | null
  /** Why the row cannot be saved here, in words, or `null`. */
  problem: string | null
}

/** Where every row goes, and the accounts and categories that takes, each once. */
export interface HistoryPlan {
  rows: RowPlan[]
  accounts: NewAccount[]
  categories: NewCategory[]
}

/**
 * Where each value goes, in order. An account the export names is the stored one whose alias is
 * its IBAN, else the stored one of its name in any letter case, else a new one, in the currency of
 * the first row that names it; each name is decided once. A category is the stored one of its name
 * and kind, else one of its name that the entry fits (an expense category takes a refund), else a
 * new one of the entry's kind; an entry without one goes to {@link UNCATEGORIZED}. A row whose
 * account holds another currency, or a transfer between one account, has a problem.
 */
export function planHistory(
  values: readonly HistoryValue[],
  accounts: readonly StoredAccount[],
  categories: readonly StoredCategory[],
): HistoryPlan {
  const byIban = new Map<string, StoredAccount>()
  const byName = new Map<string, StoredAccount>()
  for (const account of accounts) {
    for (const alias of account.aliases) {
      const iban = alias.replace(/\s+/g, ``).toUpperCase()
      if (IBAN.test(iban) && !byIban.has(iban)) byIban.set(iban, account)
    }
    if (!byName.has(fold(account.name))) byName.set(fold(account.name), account)
  }
  const currencyOfStored = new Map(accounts.map((account) => [account.id, account.currency]))
  const categoriesByName = new Map<string, StoredCategory[]>()
  for (const category of [...categories].sort((a, b) => Number(a.archived) - Number(b.archived))) {
    const named = categoriesByName.get(fold(category.name)) ?? []
    named.push(category)
    categoriesByName.set(fold(category.name), named)
  }
  const newAccounts: NewAccount[] = []
  const newCategories: NewCategory[] = []
  const accountOf = new Map<string, Target>()
  const categoryOf = new Map<string, Target>()
  const account = (ref: HistoryAccountRef, currency: string): Target => {
    const key = fold(ref.name)
    let target = accountOf.get(key)
    if (!target) {
      const found = (ref.iban === null ? undefined : byIban.get(ref.iban)) ?? byName.get(key)
      target = found ? { existing: found.id } : {
        created: newAccounts.push({
          name: ref.name,
          kind: ref.type === `liability`
            ? AccountKind.LIABILITY
            : ref.type === `other`
            ? AccountKind.ASSET
            : AccountKind.BANK,
          currency,
          iban: ref.iban,
        }) - 1,
      }
      accountOf.set(key, target)
    }
    return target
  }
  const currencyOf = (target: Target) =>
    `existing` in target
      ? currencyOfStored.get(target.existing)!
      : newAccounts[target.created].currency
  const category = (name: string, kind: TransactionKind): Target => {
    const wanted = kind === TransactionKind.EXPENSE ? CategoryKind.EXPENSE : CategoryKind.INCOME
    const key = `${fold(name)}|${wanted}`
    let target = categoryOf.get(key)
    if (!target) {
      const named = categoriesByName.get(fold(name)) ?? []
      const found = named.find((one) => one.kind === wanted) ??
        named.find((one) => categoryFitsKind(kind, one.kind))
      target = found
        ? { existing: found.id }
        : { created: newCategories.push({ name, kind: wanted }) - 1 }
      categoryOf.set(key, target)
    }
    return target
  }
  const rows = values.map((value): RowPlan => {
    const from = account(value.account, value.currency)
    if (value.kind === `entry`) {
      const kind = value.amount < 0 ? TransactionKind.EXPENSE : TransactionKind.INCOME
      const held = currencyOf(from)
      return {
        account: from,
        to: null,
        category: category(value.category ?? UNCATEGORIZED, kind),
        problem: held === value.currency
          ? null
          : `The account is in ${held}, the row in ${value.currency}`,
      }
    }
    const received = value.foreignCurrency ?? value.currency
    const to = account(value.to!, received)
    let problem: string | null = null
    if (sameTarget(from, to)) problem = `Both sides are the same account`
    else if (currencyOf(from) !== value.currency) {
      problem = `The account it left is in ${currencyOf(from)}, the row in ${value.currency}`
    } else if (currencyOf(to) !== received) {
      problem = `The account it went to is in ${currencyOf(to)}, the row in ${received}`
    }
    return { account: from, to, category: null, problem }
  })
  return { rows, accounts: newAccounts, categories: newCategories }
}

function sameTarget(a: Target, b: Target): boolean {
  return `existing` in a
    ? `existing` in b && a.existing === b.existing
    : `created` in b && a.created === b.created
}

/** What the check shows of a row's plan: each record's id, or {@link NEW_RECORD}. */
function suggestionsOf(row: RowPlan): Record<string, string> {
  const shown = (target: Target) => `existing` in target ? target.existing : NEW_RECORD
  return {
    accountId: shown(row.account),
    ...(row.to && { toAccountId: shown(row.to) }),
    ...(row.category && { categoryId: shown(row.category) }),
  }
}

/** The household's live accounts and every category, in id order, as a plan matches them. */
async function storedRecords(tx: postgres.TransactionSql, groupId: string) {
  const accounts = await tx<StoredAccount[]>`
    SELECT id, name, currency, aliases FROM accounts
    WHERE group_id = ${groupId} AND deleted_at IS NULL ORDER BY id
  `
  const categories = await tx<StoredCategory[]>`
    SELECT id, name, kind, archived_at IS NOT NULL AS archived FROM categories
    WHERE group_id = ${groupId} ORDER BY id
  `
  return { accounts, categories }
}

/**
 * Which rows are saved before. An entry is when a live entry of its stored account has its date,
 * amount and memo; a transfer is when a live transfer between its two stored accounts has its date,
 * amounts and memo. Each stored record matches one row only, so two equal rows in one export (two
 * coffees on a day) are both saved the first time and both skipped the next. A row going to an
 * account the save creates, or with a problem, never is.
 */
async function savedBefore(
  tx: postgres.TransactionSql,
  groupId: string,
  values: readonly HistoryValue[],
  plan: HistoryPlan,
): Promise<boolean[]> {
  const saved = values.map(() => false)
  const entries: { index: number; key: string }[] = []
  const transfers: { index: number; key: string }[] = []
  values.forEach((value, index) => {
    const { account, to, problem } = plan.rows[index]
    if (problem !== null || !(`existing` in account)) return
    if (value.kind === `entry`) {
      entries.push({
        index,
        key: `${account.existing}|${value.date}|${value.amount}|${value.memo}`,
      })
    } else if (to && `existing` in to) {
      const received = value.foreignAmount ?? value.amount
      transfers.push({
        index,
        key: `${account.existing}|${to.existing}|${value.date}|${value.amount}|${received}|` +
          value.memo,
      })
    }
  })
  const dates = values.map((value) => value.date).sort()
  const from = dates[0]
  const until = dates[dates.length - 1]
  if (entries.length > 0) {
    const ids = [
      ...new Set(entries.map(({ index }) =>
        (plan.rows[index].account as {
          existing: string
        }).existing
      )),
    ]
    const stored = await tx<{ key: string }[]>`
      SELECT account_id::text || '|' || to_char(date, 'YYYY-MM-DD') || '|' ||
        account_amount::text || '|' || memo AS key
      FROM transactions
      WHERE group_id = ${groupId} AND deleted_at IS NULL AND account_id = ANY(${ids}::uuid[])
        AND date BETWEEN ${from}::date AND ${until}::date
    `
    const left = new Counter()
    for (const row of stored) left.add(row.key)
    for (const { index, key } of entries) saved[index] = left.take(key)
  }
  if (transfers.length > 0) {
    const ids = [
      ...new Set(transfers.map(({ index }) =>
        (plan.rows[index].account as {
          existing: string
        }).existing
      )),
    ]
    const stored = await tx<{ key: string }[]>`
      SELECT from_account_id::text || '|' || to_account_id::text || '|' ||
        to_char(date, 'YYYY-MM-DD') || '|' || sent_amount::text || '|' ||
        received_amount::text || '|' || memo AS key
      FROM transfers
      WHERE group_id = ${groupId} AND deleted_at IS NULL AND from_account_id = ANY(${ids}::uuid[])
        AND date BETWEEN ${from}::date AND ${until}::date
    `
    const left = new Counter()
    for (const row of stored) left.add(row.key)
    for (const { index, key } of transfers) saved[index] = left.take(key)
  }
  return saved
}
