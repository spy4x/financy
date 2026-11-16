/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { Hono } from "hono"
import type postgres from "postgres"
import type { OutboxEvent } from "@spy4x/server/outbox"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { ACCOUNT_MAX_PER_GROUP, AccountKind } from "@domain/accounts"
import {
  CATEGORY_MAX_PER_GROUP,
  CATEGORY_MAX_STORED,
  CategoryKind,
  DEFAULT_CATEGORY_ICON,
} from "@domain/categories"
import type { GroupRole } from "@domain/groups"
import type { Actor } from "@domain/identity"
import { TransactionKind } from "@domain/transactions"
import {
  ImportCheckQuery,
  ImportCommitCommand,
  ImportCreateCommand,
  ImportGetQuery,
  ImportStatus,
  ImportUndoCommand,
  importUpload,
} from "@domain/imports"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { importCommitJob, type ImportJobSetup, importReadJob } from "@server/imports/import-jobs.ts"
import { PostgresImportRepository } from "@server/imports/postgres-import-repository.ts"
import { starterDataJob } from "@server/jobs/starter-data.ts"
import { SKIP_SAVED_BEFORE } from "@server/transactions/statement-import.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import {
  actualZip,
  FIREFLY_ROWS,
  fireflyCsv,
  ynabZip,
} from "@server/transactions/history-fixtures.ts"
import { historyImportKind, NEW_RECORD } from "@server/transactions/history-import.ts"
import {
  createImportCheckHandler,
  createImportCommitHandler,
  createImportCreateHandler,
  createImportGetHandler,
  createImportUndoHandler,
} from "../../apps/api/features/imports/handlers.ts"
import type { APIContext } from "../../apps/api/_types.ts"
import { AppDbBase } from "../../apps/api/services/db-base.ts"
import { createSignIn } from "../../apps/api/services/sign-in.ts"
import { withSchema } from "./group-team.ts"

/**
 * The app history import against a real Postgres built from schema.sql, in a household made by the
 * real sign-up and its starter data: one small export of each app (Firefly III, YNAB, Actual
 * Budget) saved with the accounts and categories it needed, the same file again adding nothing, an
 * undo that removes every record the import made but keeps an account the household used since,
 * and the household's own account cap refusing an import before it writes. Every export is
 * synthetic (`libs/server/transactions/history-fixtures.ts`). Needs "DB_HOST", "DB_USER",
 * "DB_PASS" and "DB_NAME" (recipe in docs/handoff.md); it fails when they are missing.
 */

const KINDS = [historyImportKind]
const NO_BILLING: ImportJobSetup = { kinds: KINDS, billingEnabled: false, graceDays: 0 }
const MAPPING = Object.fromEntries(
  historyImportKind.fields.map((field, index) => [field.key, index]),
)
// Test-only secrets, long enough for the package's 32-character minimum.
const PEPPER = `integration-test-only-pepper-0123456789`
const COOKIE_SECRET = `integration-test-only-cookie-secret-0123456789`

const job = (id: string) => ({ id: uuidV7(), aggregateId: id }) as OutboxEvent

/** A person signed up through the API's sign-up, with the starter data job run: their household. */
async function household(sql: postgres.Sql) {
  const signIn = createSignIn({
    db: new AppDbBase({ sql }),
    pepper: PEPPER,
    cookieSecret: COOKIE_SECRET,
    secureCookie: false,
    sessionMinutes: 60,
    totpIssuer: `example.test`,
  })
  const app = new Hono<APIContext>()
  app.use(signIn.auth.parseAuth)
  app.post(`/sign-up`, async (c) => {
    const result = await signIn.signUp(c, `history-${uuidV7()}@example.com`, `Passw0rd!`)
    return result ? c.json(result.user) : c.json({ error: `refused` }, 401)
  })
  const response = await app.request(`http://local/sign-up`, { method: `POST` })
  expect(response.status).toBe(200)
  const userId = ((await response.json()) as { id: number }).id
  const [request] = await sql<{ id: string }[]>`
    SELECT id FROM starter_data_requests WHERE user_id = ${userId}
  `
  await starterDataJob(sql)(job(request.id))
  const [group] = await sql<{ id: string }[]>`
    SELECT group_id AS id FROM group_members WHERE user_id = ${userId}
  `
  return { userId, groupId: group.id, actor: { userId } as Actor }
}

type Household = Awaited<ReturnType<typeof household>>

function handlers(sql: postgres.Sql) {
  const dependencies = {
    roleOf: async (groupId: string, userId: number) =>
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

/** Uploads `file` under a name that says nothing of its format, and runs the read job. */
async function uploaded(sql: postgres.Sql, h: Household, file: Uint8Array, currency = `USD`) {
  const api = handlers(sql)
  const created = await api.create(
    new ImportCreateCommand({
      actor: h.actor,
      groupId: h.groupId,
      kind: `app-history`,
      fileName: `export.csv`,
      file: await importUpload(file),
      options: { currency },
    }),
  )
  await importReadJob(sql, KINDS)(job(created.id))
  return await api.get(
    new ImportGetQuery({ actor: h.actor, groupId: h.groupId, importId: created.id }),
  )
}

async function preview(sql: postgres.Sql, h: Household, importId: string) {
  return await handlers(sql).check(
    new ImportCheckQuery({ actor: h.actor, groupId: h.groupId, importId, mapping: MAPPING }),
  )
}

/** Confirms the import and runs the save job: the import, after it. */
async function confirm(sql: postgres.Sql, h: Household, importId: string) {
  const api = handlers(sql)
  await api.commit(
    new ImportCommitCommand({ actor: h.actor, groupId: h.groupId, importId, mapping: MAPPING }),
  )
  await importCommitJob(sql, NO_BILLING)(job(importId))
  return await api.get(new ImportGetQuery({ actor: h.actor, groupId: h.groupId, importId }))
}

async function undo(sql: postgres.Sql, h: Household, importId: string) {
  return await handlers(sql).undo(
    new ImportUndoCommand({ actor: h.actor, groupId: h.groupId, importId }),
  )
}

/** What a person sees in the household: live accounts, live categories, entries and transfers. */
async function snapshot(sql: postgres.Sql, groupId: string) {
  const accounts = await sql<{ name: string; currency: string; aliases: string[] }[]>`
    SELECT name, currency, aliases FROM accounts
    WHERE group_id = ${groupId} AND deleted_at IS NULL ORDER BY name
  `
  const categories = await sql<{ name: string }[]>`
    SELECT name FROM categories WHERE group_id = ${groupId} AND archived_at IS NULL ORDER BY name
  `
  const entries = await sql<{ date: string; amount: number; currency: string; memo: string }[]>`
    SELECT to_char(date, 'YYYY-MM-DD') AS date, amount::int AS amount, currency, memo
    FROM transactions WHERE group_id = ${groupId} AND deleted_at IS NULL ORDER BY date, amount
  `
  const transfers = await sql<{ date: string; sent: number; received: number }[]>`
    SELECT to_char(date, 'YYYY-MM-DD') AS date, sent_amount::int AS sent,
      received_amount::int AS received
    FROM transfers WHERE group_id = ${groupId} AND deleted_at IS NULL ORDER BY date
  `
  return {
    accounts,
    categories: categories.map((row) => row.name),
    entries,
    transfers,
  }
}

for (
  const [app, file, currency, saved] of [
    // Four rows; new: Checking and Savings, Books (Food and Salary are starter categories).
    [`Firefly III`, fireflyCsv(FIREFLY_ROWS), `EUR`, 4 + 2 + 1],
    // Three rows; new: Checking, Savings, Food: Eating out and Uncategorized.
    [`YNAB`, ynabZip(), `USD`, 3 + 2 + 2],
    // Two rows; new: Checking, Savings and Rent.
    [`Actual Budget`, actualZip(), `USD`, 2 + 2 + 1],
  ] as const
) {
  Deno.test(`history imports: an export of ${app} saves its rows with the records it needs, and undo removes them all`, async () => {
    await withSchema(async (sql) => {
      const h = await household(sql)
      const before = await snapshot(sql, h.groupId)
      expect(before.accounts).toEqual([])
      expect(before.categories.length).toBeGreaterThan(0)

      const read = await uploaded(sql, h, file, currency)
      expect(read.status).toBe(ImportStatus.READY)
      const checked = await preview(sql, h, read.id)
      expect(checked.withErrors).toBe(0)
      // Nothing matches in a new household: every row's account is a new one.
      expect(checked.reviews!.map((review) => review.suggestions.accountId)).toEqual(
        checked.reviews!.map(() => NEW_RECORD),
      )
      expect(await snapshot(sql, h.groupId)).toEqual(before)

      const done = await confirm(sql, h, read.id)
      expect(done).toMatchObject({ status: ImportStatus.COMMITTED, savedCount: saved })
      const after = await snapshot(sql, h.groupId)
      expect(after.accounts.map((account) => [account.name, account.currency])).toEqual([
        [`Checking`, currency],
        [`Savings`, currency],
      ])
      expect(after.entries.length + after.transfers.length).toBe(checked.reviews!.length)

      // The same file again matches every account and category, and saves nothing new.
      const again = await uploaded(sql, h, file, currency)
      const rechecked = await preview(sql, h, again.id)
      expect(rechecked.reviews!.map((review) => review.skip)).toEqual(
        rechecked.reviews!.map(() => SKIP_SAVED_BEFORE),
      )
      expect(JSON.stringify(rechecked.reviews)).not.toContain(`"${NEW_RECORD}"`)

      const undone = await undo(sql, h, read.id)
      expect(undone.status).toBe(ImportStatus.UNDONE)
      expect(await snapshot(sql, h.groupId)).toEqual(before)
    })
  })
}

Deno.test("history imports: the amounts, IBAN and foreign amount of a Firefly III export land as written", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const read = await uploaded(sql, h, fireflyCsv(FIREFLY_ROWS), `JPY`)
    await confirm(sql, h, read.id)
    const after = await snapshot(sql, h.groupId)
    expect(after.accounts).toEqual([
      { name: `Checking`, currency: `EUR`, aliases: [`DE00123456780000000001`] },
      { name: `Savings`, currency: `EUR`, aliases: [] },
    ])
    expect(after.entries).toEqual([
      { date: `2024-03-01`, amount: -1234, currency: `EUR`, memo: `Cafe · Lunch` },
      { date: `2024-03-02`, amount: 250000, currency: `EUR`, memo: `Employer · March salary` },
      {
        date: `2024-03-04`,
        amount: -1000,
        currency: `USD`,
        memo: `Bookshop · Book · paid in dollars`,
      },
    ])
    expect(after.transfers).toEqual([{ date: `2024-03-03`, sent: 10000, received: 10000 }])
    // The entry's amount is in the foreign currency; its account amount is in the account's.
    const own = await sql<{ amount: number; accountAmount: number }[]>`
      SELECT amount::int AS amount, account_amount::int AS "accountAmount" FROM transactions
      WHERE group_id = ${h.groupId} AND date = '2024-03-04'
    `
    expect(own).toEqual([{ amount: -1000, accountAmount: -920 }])
  })
})

/** The ids of the Actual Budget export's Checking account and Rent category, and a starter one. */
async function actualRecords(sql: postgres.Sql, groupId: string) {
  const [checking] = await sql<{ id: string }[]>`
    SELECT id FROM accounts WHERE group_id = ${groupId} AND name = 'Checking'
  `
  const [savings] = await sql<{ id: string }[]>`
    SELECT id FROM accounts WHERE group_id = ${groupId} AND name = 'Savings'
  `
  const [rent] = await sql<{ id: string }[]>`
    SELECT id FROM categories WHERE group_id = ${groupId} AND name = 'Rent'
  `
  const [starter] = await sql<{ id: string }[]>`
    SELECT id FROM categories
    WHERE group_id = ${groupId} AND name <> 'Rent' AND kind = ${CategoryKind.EXPENSE}
    ORDER BY name LIMIT 1
  `
  return { checking: checking.id, savings: savings.id, rent: rent.id, starter: starter.id }
}

type Records = Awaited<ReturnType<typeof actualRecords>>

for (
  const [use, change, accounts, keepsRent] of [
    [
      `a transfer outside the batch`,
      (sql: postgres.Sql, h: Household, r: Records) =>
        sql`
          INSERT INTO transfers (
            id, group_id, from_account_id, to_account_id, sent_amount, received_amount, date,
            change_sequence
          ) VALUES (${uuidV7()}, ${h.groupId}, ${r.checking}, ${r.savings}, 100, 100, '2024-04-01', 1)
        `,
      [`Checking`, `Savings`],
      false,
    ],
    [
      `a recurring rule`,
      (sql: postgres.Sql, h: Household, r: Records) =>
        sql`
          INSERT INTO recurring_rules (
            id, group_id, account_id, category_id, kind, amount, currency, rrule, start_date,
            change_sequence
          ) VALUES (
            ${uuidV7()}, ${h.groupId}, ${r.checking}, ${r.rent}, ${TransactionKind.EXPENSE}, 100,
            'USD', 'FREQ=MONTHLY', '2024-04-01', 1
          )
        `,
      [`Checking`],
      true,
    ],
    [
      `a budget`,
      (sql: postgres.Sql, h: Household, r: Records) =>
        sql`
          INSERT INTO budgets (id, group_id, category_id, month, amount, currency, change_sequence)
          VALUES (${uuidV7()}, ${h.groupId}, ${r.rent}, '2024-04-01', 100, 'USD', 1)
        `,
      [],
      true,
    ],
    [
      `a budget move`,
      (sql: postgres.Sql, h: Household, r: Records) =>
        sql`
          INSERT INTO budget_moves (
            id, group_id, month, from_category_id, to_category_id, amount, currency,
            change_sequence
          ) VALUES (${uuidV7()}, ${h.groupId}, '2024-04-01', ${r.starter}, ${r.rent}, 100, 'USD', 1)
        `,
      [],
      true,
    ],
    [
      `a subcategory`,
      (sql: postgres.Sql, h: Household, r: Records) =>
        sql`
          INSERT INTO categories (id, group_id, parent_id, name, kind, icon, color, change_sequence)
          VALUES (
            ${uuidV7()}, ${h.groupId}, ${r.rent}, 'Deposit', ${CategoryKind.EXPENSE},
            ${DEFAULT_CATEGORY_ICON}, '#123456', 1
          )
        `,
      [],
      true,
    ],
    [
      `being made the default account`,
      (sql: postgres.Sql, h: Household, r: Records) =>
        sql`UPDATE accounts SET is_default = true WHERE group_id = ${h.groupId} AND id = ${r.checking}`,
      [`Checking`],
      false,
    ],
  ] as const
) {
  Deno.test(`history imports: undo keeps a created record held by ${use}`, async () => {
    await withSchema(async (sql) => {
      const h = await household(sql)
      const read = await uploaded(sql, h, actualZip(), `USD`)
      await confirm(sql, h, read.id)
      await change(sql, h, await actualRecords(sql, h.groupId))

      const undone = await undo(sql, h, read.id)

      expect(undone.status).toBe(ImportStatus.UNDONE)
      const after = await snapshot(sql, h.groupId)
      expect(after.accounts.map((account) => account.name)).toEqual(accounts)
      expect(after.categories.includes(`Rent`)).toBe(keepsRent)
      expect(after.entries).toEqual([])
    })
  })
}

Deno.test("history imports: undo keeps an account the household has used since, and removes the rest", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const read = await uploaded(sql, h, actualZip(), `USD`)
    await confirm(sql, h, read.id)
    const [checking] = await sql<{ id: string }[]>`
      SELECT id FROM accounts WHERE group_id = ${h.groupId} AND name = 'Checking'
    `
    const [category] = await sql<{ id: string }[]>`
      SELECT id FROM categories WHERE group_id = ${h.groupId} AND name = 'Rent'
    `
    await new PostgresTransactionRepository(sql).create({
      groupId: h.groupId,
      id: uuidV7(),
      accountId: checking.id,
      categoryId: category.id,
      kind: TransactionKind.EXPENSE,
      amount: 500,
      currency: `USD`,
      memo: `By hand`,
      date: `2024-04-01`,
      allowance: null,
    }, h.userId)

    await undo(sql, h, read.id)

    const after = await snapshot(sql, h.groupId)
    expect(after.accounts.map((account) => account.name)).toEqual([`Checking`])
    expect(after.categories).toContain(`Rent`)
    expect(after.entries).toEqual([
      { date: `2024-04-01`, amount: -500, currency: `USD`, memo: `By hand` },
    ])
    expect(after.transfers).toEqual([])
  })
})

Deno.test("history imports: an export whose new accounts pass the household's cap is refused before it writes", async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const accounts = new PostgresAccountRepository(sql)
    for (let index = 0; index < ACCOUNT_MAX_PER_GROUP - 1; index++) {
      await accounts.create({
        groupId: h.groupId,
        id: uuidV7(),
        name: `Account ${index}`,
        kind: AccountKind.BANK,
        currency: `USD`,
        startingBalance: 0,
        allowance: null,
      }, h.userId)
    }
    const before = await snapshot(sql, h.groupId)

    const read = await uploaded(sql, h, actualZip(), `USD`)
    const done = await confirm(sql, h, read.id)

    expect(done.status).toBe(ImportStatus.FAILED)
    expect(done.failure).toContain(`accounts`)
    expect(await snapshot(sql, h.groupId)).toEqual(before)
  })
})

for (
  const [cap, archived, limit] of [
    [`live categories`, false, CATEGORY_MAX_PER_GROUP],
    [`stored categories`, true, CATEGORY_MAX_STORED],
  ] as const
) {
  Deno.test(`history imports: an export whose new category passes the household's cap of ${cap} is refused before it writes`, async () => {
    await withSchema(async (sql) => {
      const h = await household(sql)
      const [{ count }] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM categories WHERE group_id = ${h.groupId}
      `
      // The household reaches the cap exactly; the export's new Rent category would pass it.
      const filler = Array.from({ length: limit - count }, (_, index) => ({
        id: uuidV7(),
        group_id: h.groupId,
        name: `Category ${index}`,
        kind: CategoryKind.EXPENSE,
        icon: DEFAULT_CATEGORY_ICON,
        color: `#123456`,
        change_sequence: 1,
        archived_at: archived ? new Date(`2024-01-01T00:00:00Z`) : null,
      }))
      await sql`INSERT INTO categories ${sql(filler)}`
      const before = await snapshot(sql, h.groupId)

      const read = await uploaded(sql, h, actualZip(), `USD`)
      const done = await confirm(sql, h, read.id)

      expect(done.status).toBe(ImportStatus.FAILED)
      expect(done.failure).toContain(`at most ${limit}`)
      expect(await snapshot(sql, h.groupId)).toEqual(before)
    })
  })
}
