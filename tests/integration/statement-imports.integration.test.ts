/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import type { OutboxEvent } from "@spy4x/server/outbox"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { AccountKind } from "@domain/accounts"
import { type CategoryIcon, CategoryKind } from "@domain/categories"
import type { GroupRole } from "@domain/groups"
import type { Actor } from "@domain/identity"
import {
  ImportCheckQuery,
  ImportCommitCommand,
  ImportCreateCommand,
  ImportError,
  ImportGetQuery,
  ImportStatus,
  type ImportSummary,
  ImportUndoCommand,
  importUpload,
} from "@domain/imports"
import { TransactionKind } from "@domain/transactions"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { listAdminImports } from "@server/imports/admin-imports.ts"
import {
  deleteStaleImports,
  IMPORT_STALE_MS,
  importCommitJob,
  type ImportJobSetup,
  importReadJob,
} from "@server/imports/import-jobs.ts"
import { PostgresImportRepository } from "@server/imports/postgres-import-repository.ts"
import {
  SKIP_SAVED_BEFORE,
  SKIP_TRANSFER,
  statementImportKind,
} from "@server/transactions/statement-import.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { PostgresTransferRepository } from "@server/transfers/postgres-transfer-repository.ts"
import {
  createImportCheckHandler,
  createImportCommitHandler,
  createImportCreateHandler,
  createImportGetHandler,
  createImportUndoHandler,
  type ImportHandlerDependencies,
} from "../../apps/api/features/imports/handlers.ts"
import { team, withSchema } from "./group-team.ts"

/**
 * The bank statement import against a real Postgres built from schema.sql: a preview that writes
 * nothing, a save of exactly the previewed rows, a second import of the same file that adds
 * nothing, rows that match a transfer, an undo of one batch only, the plan's read-only state, the
 * options a household may name, and an admin list that holds no row content. Every statement is
 * synthetic (`tests/integration/statements/`). Needs "DB_HOST", "DB_USER", "DB_PASS" and "DB_NAME"
 * (recipe in docs/handoff.md); it fails when they are missing.
 */

const KINDS = [statementImportKind]
const NO_BILLING: ImportJobSetup = { kinds: KINDS, billingEnabled: false, graceDays: 0 }
const MAPPING = { date: 0, amount: 1, currency: 2, payee: 3, memo: 4, reference: 5 }
const FIXTURES = new URL(`./statements/`, import.meta.url)

const actor = (userId: number) => ({ userId }) as Actor
const job = (id: string) => ({ id: uuidV7(), aggregateId: id }) as OutboxEvent

async function fixture(name: string): Promise<Uint8Array> {
  return await Deno.readFile(new URL(name, FIXTURES))
}

function handlers(sql: postgres.Sql) {
  const dependencies: ImportHandlerDependencies = {
    roleOf: async (groupId, userId) =>
      (await sql<{ role: GroupRole }[]>`
        SELECT role FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}
      `)[0]?.role ?? null,
    imports: new PostgresImportRepository(sql, KINDS),
    kinds: KINDS,
  }
  return {
    create: createImportCreateHandler(dependencies),
    get: createImportGetHandler(dependencies),
    check: createImportCheckHandler(dependencies),
    commit: createImportCommitHandler(dependencies),
    undo: createImportUndoHandler(dependencies),
  }
}

/** The code of the `ImportError` that `run` rejects with, or `null` when it resolves. */
async function codeOf(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run()
    return null
  } catch (error) {
    if (error instanceof ImportError) return error.code
    throw error
  }
}

/** A household with a euro bank account, savings, and a category of each kind, made by its owner. */
async function household(sql: postgres.Sql) {
  const members = await team(sql)
  const accounts = new PostgresAccountRepository(sql)
  const categories = new PostgresCategoryRepository(sql)
  const account = async (name: string, currency = `EUR`) =>
    (await accounts.create({
      groupId: members.groupId,
      id: uuidV7(),
      name,
      kind: AccountKind.BANK,
      currency,
      startingBalance: 0,
      allowance: null,
    }, members.owner)).account.id
  const category = async (name: string, kind: CategoryKind) =>
    (await categories.create({
      groupId: members.groupId,
      id: uuidV7(),
      name,
      kind,
      icon: `utensils` as CategoryIcon,
      color: `#c2410c`,
      parentId: null,
      allowance: null,
    }, members.owner)).category.id
  const bank = await account(`Bank`)
  const savings = await account(`Savings`)
  const groceries = await category(`Groceries`, CategoryKind.EXPENSE)
  const shopping = await category(`Shopping`, CategoryKind.EXPENSE)
  const salary = await category(`Salary`, CategoryKind.INCOME)
  const options = { accountId: bank, expenseCategoryId: groceries, incomeCategoryId: salary }
  /** Each account's balance, by name. */
  const balances = async () =>
    Object.fromEntries(
      (await accounts.list(members.groupId, false)).map((row) => [row.name, row.balance]),
    )
  return { ...members, account, bank, savings, groceries, shopping, salary, options, balances }
}

type Household = Awaited<ReturnType<typeof household>>

/** Uploads `file` to the household's bank account as its editor and runs the read job. */
async function uploaded(
  sql: postgres.Sql,
  h: Household,
  file: Uint8Array,
  options: Record<string, string> = h.options,
): Promise<ImportSummary> {
  const api = handlers(sql)
  const created = await api.create(
    new ImportCreateCommand({
      actor: actor(h.editor),
      groupId: h.groupId,
      kind: `bank-statement`,
      // The format is read from the bytes, never the name: any accepted extension does.
      fileName: `statement.txt`,
      file: await importUpload(file),
      options,
    }),
  )
  await importReadJob(sql, KINDS)(job(created.id))
  return await get(sql, h, created.id)
}

async function get(sql: postgres.Sql, h: Household, importId: string) {
  return await handlers(sql).get(
    new ImportGetQuery({ actor: actor(h.editor), groupId: h.groupId, importId }),
  )
}

async function preview(sql: postgres.Sql, h: Household, importId: string) {
  return await handlers(sql).check(
    new ImportCheckQuery({
      actor: actor(h.editor),
      groupId: h.groupId,
      importId,
      mapping: MAPPING,
    }),
  )
}

/** Confirms the import as its editor and runs the save job: the import, after it. */
async function confirm(
  sql: postgres.Sql,
  h: Household,
  importId: string,
  choices?: Record<string, Record<string, string>>,
  setup: ImportJobSetup = NO_BILLING,
) {
  await handlers(sql).commit(
    new ImportCommitCommand({
      actor: actor(h.editor),
      groupId: h.groupId,
      importId,
      mapping: MAPPING,
      choices,
    }),
  )
  await importCommitJob(sql, setup)(job(importId))
  return await get(sql, h, importId)
}

/** Uploads, previews and confirms `file`: the import, after it. */
async function imported(sql: postgres.Sql, h: Household, file: Uint8Array) {
  const read = await uploaded(sql, h, file)
  return await confirm(sql, h, read.id)
}

interface Entry {
  date: string
  amount: number
  kind: TransactionKind
  memo: string
  categoryId: string
  bankReference: string | null
}

/** The household's live entries, oldest first. */
async function entries(sql: postgres.Sql, groupId: string): Promise<Entry[]> {
  return await sql<Entry[]>`
    SELECT to_char(date, 'YYYY-MM-DD') AS date, amount::int AS amount, kind, memo,
      category_id::text AS "categoryId", bank_reference AS "bankReference"
    FROM transactions WHERE group_id = ${groupId} AND deleted_at IS NULL
    ORDER BY date, amount, memo
  `
}

Deno.test("statement imports: upload, preview and an unsaved import add no entry; Confirm adds exactly the previewed rows", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const file = await fixture(`signed.csv`)

    const left = await uploaded(sql, h, file)
    expect(left.status).toBe(ImportStatus.READY)
    await preview(sql, h, left.id)
    expect(await entries(sql, h.groupId)).toEqual([])
    // An import nobody confirms is cancelled by the cleanup a day later.
    const old = new Date(Date.now() - IMPORT_STALE_MS - 60_000)
    await sql`UPDATE imports SET created_at = ${old} WHERE id = ${left.id}`
    expect(await deleteStaleImports(sql)).toBe(1)
    expect(await entries(sql, h.groupId)).toEqual([])

    const read = await uploaded(sql, h, file)
    const checked = await preview(sql, h, read.id)
    expect(checked).toMatchObject({ rowCount: 3, valid: 3, withErrors: 0 })
    const previewed = checked.reviews!.filter((review) => review.skip === null)
    const done = await confirm(sql, h, read.id)

    expect(done).toMatchObject({ status: ImportStatus.COMMITTED, savedCount: previewed.length })
    expect(await entries(sql, h.groupId)).toEqual([
      {
        date: `2026-01-03`,
        amount: -8437,
        kind: TransactionKind.EXPENSE,
        memo: `Example Grocer`,
        categoryId: h.groceries,
        bankReference: null,
      },
      {
        date: `2026-01-03`,
        amount: -8437,
        kind: TransactionKind.EXPENSE,
        memo: `Example Grocer`,
        categoryId: h.groceries,
        bankReference: null,
      },
      {
        date: `2026-01-02`,
        amount: 250000,
        kind: TransactionKind.INCOME,
        memo: `Example Employer salary`,
        categoryId: h.salary,
        bankReference: null,
      },
    ].sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount))
    expect(previewed.map((review) => review.cells[1]).sort()).toEqual(
      [`-84.37`, `-84.37`, `2500.00`],
    )
  })
})

for (
  const [name, saved] of [
    [`signed.csv`, 3],
    [`statement.ofx`, 2],
    [`statement.qif`, 2],
    [`camt053.xml`, 2],
    [`statement.mt940.sta`, 2],
  ] as const
) {
  Deno.test(`statement imports: ${name} imports end to end, and a second import of it adds nothing`, async () => {
    await withSchema(async (sql) => {
      const h = await household(sql)
      const file = await fixture(name)

      const first = await imported(sql, h, file)
      expect(first).toMatchObject({ status: ImportStatus.COMMITTED, savedCount: saved })
      const after = await entries(sql, h.groupId)
      expect(after).toHaveLength(saved)

      const again = await uploaded(sql, h, file)
      const reviews = (await preview(sql, h, again.id)).reviews!
      expect(reviews.map((review) => review.skip)).toEqual(Array(saved).fill(SKIP_SAVED_BEFORE))
      const second = await confirm(sql, h, again.id)
      expect(second).toMatchObject({
        status: ImportStatus.COMMITTED,
        savedCount: 0,
        skippedCount: saved,
      })
      expect(await entries(sql, h.groupId)).toEqual(after)
    })
  })
}

Deno.test("statement imports: a bank's reference finds the saved entry even after its memo was edited", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const file = await fixture(`statement.ofx`)
    await imported(sql, h, file)
    await sql`UPDATE transactions SET memo = 'Edited by hand' WHERE group_id = ${h.groupId}`

    const again = await uploaded(sql, h, file)
    const reviews = (await preview(sql, h, again.id)).reviews!
    expect(reviews.map((review) => review.skip)).toEqual([SKIP_SAVED_BEFORE, SKIP_SAVED_BEFORE])
  })
})

Deno.test("statement imports: a file with one of two equal rows saved before saves only the other", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await imported(sql, h, await fixture(`signed.csv`))
    const [one] = await sql<{ id: string }[]>`
      SELECT id FROM transactions WHERE group_id = ${h.groupId} AND amount = -8437 LIMIT 1
    `
    await sql`UPDATE transactions SET deleted_at = now() WHERE id = ${one.id}`

    const again = await uploaded(sql, h, await fixture(`signed.csv`))
    const done = await confirm(sql, h, again.id)
    expect(done).toMatchObject({ savedCount: 1, skippedCount: 2 })
    expect((await entries(sql, h.groupId)).filter((row) => row.amount === -8437)).toHaveLength(2)
  })
})

Deno.test("statement imports: a row matching a side of a transfer within three days is skipped", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const transfer = (date: string) =>
      new PostgresTransferRepository(sql).create(
        {
          groupId: h.groupId,
          id: uuidV7(),
          fromAccountId: h.savings,
          toAccountId: h.bank,
          sentAmount: 250000,
          memo: ``,
          date,
          allowance: null,
        } as Parameters<PostgresTransferRepository[`create`]>[0],
        h.owner,
      )
    // The salary row is 2 January: 5 January is three days off, 6 January four.
    await transfer(`2026-01-06`)
    const far = await uploaded(sql, h, await fixture(`signed.csv`))
    expect((await preview(sql, h, far.id)).reviews!.map((review) => review.skip)).toEqual(
      [null, null, null],
    )

    await transfer(`2026-01-05`)
    const near = await uploaded(sql, h, await fixture(`signed.csv`))
    expect((await preview(sql, h, near.id)).reviews!.map((review) => review.skip)).toEqual(
      [SKIP_TRANSFER, null, null],
    )
    expect(await confirm(sql, h, near.id)).toMatchObject({ savedCount: 2, skippedCount: 1 })
  })
})

Deno.test("statement imports: undo of batch A after a manual entry and batch B removes only A's rows, and the balances return", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const before = await h.balances()
    const a = await imported(sql, h, await fixture(`statement.ofx`))
    await new PostgresTransactionRepository(sql).create(
      {
        groupId: h.groupId,
        id: uuidV7(),
        accountId: h.bank,
        categoryId: h.groceries,
        kind: TransactionKind.EXPENSE,
        amount: 1000,
        currency: `EUR`,
        memo: `Typed by hand`,
        date: `2026-01-07`,
        allowance: null,
      } as Parameters<PostgresTransactionRepository[`create`]>[0],
      h.owner,
    )
    await imported(sql, h, await fixture(`statement.qif`))
    const withB = await entries(sql, h.groupId)
    expect(withB).toHaveLength(5)

    const undone = await handlers(sql).undo(
      new ImportUndoCommand({ actor: actor(h.editor), groupId: h.groupId, importId: a.id }),
    )
    expect(undone.status).toBe(ImportStatus.UNDONE)
    expect((await entries(sql, h.groupId)).map((row) => row.memo).sort()).toEqual(
      [`Example Employer · January salary`, `Example Pharmacy`, `Typed by hand`],
    )
    const [{ count: tombstones }] = await sql<{ count: number }[]>`
      SELECT count(*)::int FROM group_change_tombstones WHERE group_id = ${h.groupId}
    `
    expect(tombstones).toBe(2)
    // Without A: the 10.00 typed by hand and B's 1250.00 in and 75.25 out, from a zero start.
    expect(before).toEqual({ Bank: 0, Savings: 0 })
    expect(await h.balances()).toEqual({ Bank: -10_00 + 1250_00 - 75_25, Savings: 0 })
  })
})

Deno.test("statement imports: a household whose plan lapsed saves no row and the import fails in words", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const read = await uploaded(sql, h, await fixture(`statement.ofx`))
    const done = await confirm(sql, h, read.id, undefined, {
      kinds: KINDS,
      billingEnabled: true,
      graceDays: 0,
    })
    expect(done.status).toBe(ImportStatus.FAILED)
    expect(await entries(sql, h.groupId)).toEqual([])
  })
})

Deno.test("statement imports: a row's category choice is saved, and a choice of the wrong kind fails the save", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const read = await uploaded(sql, h, await fixture(`statement.ofx`))
    const done = await confirm(sql, h, read.id, { "2": { category: h.shopping } })
    expect(done.savedCount).toBe(2)
    expect((await entries(sql, h.groupId)).map((row) => row.categoryId).sort()).toEqual(
      [h.salary, h.shopping].sort(),
    )

    const other = await household(sql)
    const wrong = await uploaded(sql, other, await fixture(`statement.ofx`))
    const failed = await confirm(sql, other, wrong.id, { "2": { category: other.salary } })
    expect(failed.status).toBe(ImportStatus.FAILED)
    expect(await entries(sql, other.groupId)).toEqual([])
  })
})

Deno.test("statement imports: an account or category of another household is not found, and a wrong category kind is refused", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const other = await household(sql)
    const file = await fixture(`statement.ofx`)
    const upload = (options: Record<string, string>) => () => uploaded(sql, h, file, options)

    expect(await codeOf(upload({ ...h.options, accountId: other.bank }))).toBe(`ITEM_NOT_FOUND`)
    expect(await codeOf(upload({ ...h.options, expenseCategoryId: other.groceries }))).toBe(
      `ITEM_NOT_FOUND`,
    )
    expect(await codeOf(upload({ ...h.options, incomeCategoryId: other.salary }))).toBe(
      `ITEM_NOT_FOUND`,
    )
    expect(await codeOf(upload({ ...h.options, expenseCategoryId: h.salary }))).toBe(
      `INVALID_REQUEST`,
    )
    expect(await codeOf(upload({ ...h.options, incomeCategoryId: h.groceries }))).toBe(
      `INVALID_REQUEST`,
    )
    expect(await codeOf(upload({ accountId: h.bank }))).toBe(`INVALID_REQUEST`)
    const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int FROM imports`
    expect(count).toBe(0)
  })
})

Deno.test("statement imports: a statement in another currency than the account's saves nothing", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const dollars = await h.account(`Dollars`, `USD`)
    const read = await uploaded(sql, h, await fixture(`camt053.xml`), {
      ...h.options,
      accountId: dollars,
    })
    const checked = await preview(sql, h, read.id)
    expect(checked).toMatchObject({ valid: 0, withErrors: 2 })
    expect(checked.rows[0].errors).toEqual([`The statement is in EUR, but the account is in USD.`])
  })
})

Deno.test("statement imports: the admin list shows the kind and the counts, and no payee or memo", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await imported(sql, h, await fixture(`camt053.xml`))
    const broken = new TextEncoder().encode(
      `Date,Description,Amount,Currency,Balance\n2026-01-02,Example Secret Payee,10.00,EUR,99.00\n` +
        `2026-01-03,Example Secret Shop,-1.00,EUR,1.00\n`,
    )
    const failed = await uploaded(sql, h, broken)
    expect(failed.status).toBe(ImportStatus.FAILED)

    const page = await listAdminImports(sql, { status: `all`, page: 1 })
    expect(page.imports.map((row) => row.kind)).toEqual([`bank-statement`, `bank-statement`])
    const text = JSON.stringify(page)
    for (const content of [`Example`, `Secret`, `Invoice`, `Licence`, `BANK-REF`]) {
      expect(text).not.toContain(content)
    }
  })
})
