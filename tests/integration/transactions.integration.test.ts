/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { AccountError, AccountKind } from "@domain/accounts"
import { PlanError } from "@domain/billing"
import { CategoryError, type CategoryIcon, CategoryKind } from "@domain/categories"
import { COINS, RATE_SOURCES } from "@domain/money"
import { TRANSACTION_RESTORE_DAYS, TransactionError, TransactionKind } from "@domain/transactions"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { purgeDeletedTransactions } from "@server/transactions/purge-deleted-transactions.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { team, withSchema } from "./group-team.ts"
import { expectVersion7Ids } from "./ids.ts"

/**
 * Entries against a real Postgres built from schema.sql: the stored amounts and the rate each one
 * used, the balance on a day, the locks entries put on their account and category, the ledger's
 * sums, the purge and the tenant boundary. The transports and the gates are in
 * `apps/api/features/transactions/`; a write racing a member's removal is in
 * `group-write-race.integration.test.ts`. Needs `DB_HOST`, `DB_USER`, `DB_PASS` and `DB_NAME`
 * (recipe in docs/handoff.md); it fails when they are missing rather than skipping.
 */

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(() => null, (error) => error)
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  return ((await refusal(promise)) as { code?: string } | null)?.code
}

async function nextSequence(sql: postgres.Sql, groupId: string): Promise<bigint> {
  return BigInt(
    (await sql<{ next: string }[]>`
      SELECT next_change_sequence::text AS next FROM groups WHERE id = ${groupId}
    `)[0].next,
  )
}

/** Rates against the euro, as the daily fetch stores them. */
async function rates(
  sql: postgres.Sql,
  date: string,
  source: string,
  quotes: Record<string, string>,
) {
  await new PostgresRateRepository(sql).insert(
    Object.entries(quotes).map(([quote, rate]) => ({ base: "EUR", quote, rate, date, source })),
    new Date(),
    (_rate, problem) => {
      throw new Error(problem)
    },
  )
}

Deno.test("entries against Postgres", async (t) => {
  await withSchema(async (sql) => {
    const accounts = new PostgresAccountRepository(sql)
    const categories = new PostgresCategoryRepository(sql)
    const transactions = new PostgresTransactionRepository(sql)

    /** A household with one account and one expense and one income category, made by its owner. */
    async function household(currency = "USD", startingBalance = 0) {
      const members = await team(sql)
      const account = await accounts.create({
        groupId: members.groupId,
        id: uuidV7(),
        name: "Main",
        kind: AccountKind.BANK,
        currency,
        startingBalance,
        allowance: null,
      }, members.owner)
      const category = async (name: string, kind: CategoryKind, parentId: string | null = null) =>
        (await categories.create({
          groupId: members.groupId,
          id: uuidV7(),
          name,
          kind,
          icon: "utensils" as CategoryIcon,
          color: "#c2410c",
          parentId,
          allowance: null,
        }, members.owner)).category.id
      const food = await category("Food", CategoryKind.EXPENSE)
      const salary = await category("Salary", CategoryKind.INCOME)
      /** Writes an entry as the owner, a 12.34 expense in Food on 5 November unless told otherwise. */
      const entry = async (more: Record<string, unknown> = {}, actor = members.owner) =>
        (await transactions.create(
          {
            groupId: members.groupId,
            id: uuidV7(),
            accountId: account.account.id,
            categoryId: food,
            kind: TransactionKind.EXPENSE,
            amount: 1234,
            currency,
            memo: "",
            date: "2026-11-05",
            allowance: null,
            ...more,
          } as Parameters<typeof transactions.create>[0],
          actor,
        )).transaction
      return { ...members, account: account.account, food, salary, category, entry }
    }

    await t.step(
      "every entry write moves the household's sequence once and leaves its outbox row; a retry writes nothing",
      async () => {
        const h = await household()
        const before = await nextSequence(sql, h.groupId)
        const id = uuidV7()

        const fields = {
          groupId: h.groupId,
          id,
          accountId: h.account.id,
          categoryId: h.food,
          kind: TransactionKind.EXPENSE,
          amount: 1234,
          currency: "USD",
          memo: "",
          date: "2026-11-05",
        }
        const first = await transactions.create({ ...fields, allowance: null }, h.editor)
        const retry = await transactions.create({ ...fields, allowance: null }, h.editor)
        await transactions.update({ ...fields, memo: "Lunch", expectedVersion: 1 }, h.editor)
        await transactions.delete({ groupId: h.groupId, id, expectedVersion: 2 }, h.editor)
        const restored = await transactions.restore(
          { groupId: h.groupId, id, allowance: null },
          h.owner,
        )

        expect(first.created).toBe(true)
        expect(retry).toMatchObject({ created: false, transaction: { id, version: 1 } })
        expect(await nextSequence(sql, h.groupId)).toBe(before + 4n)
        const outbox = await sql<{ eventKind: string }[]>`
          SELECT event_kind FROM outbox_events
          WHERE group_id = ${h.groupId} AND event_kind LIKE 'transaction.%'
          ORDER BY aggregate_version
        `
        expect(outbox.map((row) => row.eventKind)).toEqual([
          "transaction.created",
          "transaction.updated",
          "transaction.deleted",
          "transaction.restored",
        ])
        expect(restored).toMatchObject({
          amount: -1234,
          accountAmount: -1234,
          memo: "Lunch",
          version: 4,
          createdByUserId: h.editor,
          updatedByUserId: h.owner,
          deletedAt: null,
        })
        expectVersion7Ids([restored])
        expect(
          await codeOf(transactions.create({ ...fields, amount: 99, allowance: null }, h.editor)),
        )
          .toBe("ID_ALREADY_EXISTS")
      },
    )

    await t.step(
      "lists only the household's deleted entries, the latest deleted first, up to the limit",
      async () => {
        const h = await household()
        const other = await household()
        const [first, second, third] = [await h.entry(), await h.entry(), await h.entry()]
        const live = await h.entry()
        const theirs = await other.entry()
        for (const [entry, ago] of [[first, 3], [second, 2], [third, 1]] as const) {
          await transactions.delete(
            { groupId: h.groupId, id: entry.id, expectedVersion: 1 },
            h.owner,
          )
          await sql`
            UPDATE transactions SET deleted_at = now() - make_interval(hours => ${ago})
            WHERE id = ${entry.id}
          `
        }
        await transactions.delete(
          { groupId: other.groupId, id: theirs.id, expectedVersion: 1 },
          other.owner,
        )

        const listed = await transactions.listDeleted(h.groupId, 2)

        expect(listed.map((entry) => entry.id)).toEqual([third.id, second.id])
        expect(listed[0].deletedAt).toBeInstanceOf(Date)
        const all = (await transactions.listDeleted(h.groupId, 10)).map((entry) => entry.id)
        expect(all).toEqual([third.id, second.id, first.id])
        expect(all).not.toContain(live.id)
      },
    )

    await t.step(
      "keeps an entry's stored account amount when a better rate arrives, and converts again on a new date with the latest earlier rate (R4, R6)",
      async () => {
        const h = await household("USD")
        await rates(sql, "2026-11-05", RATE_SOURCES.fallback, { USD: "1.1", JPY: "160" })
        const yen = await h.entry({ amount: 5000, currency: "JPY" })
        // 5000 JPY at 1.1 / 160 = 34.375 USD.
        expect(yen).toMatchObject({ amount: -5000, accountAmount: -3438, converted: true })

        await rates(sql, "2026-11-05", RATE_SOURCES.ecb, { USD: "1.2", JPY: "160" })
        const edited = await transactions.update({
          groupId: h.groupId,
          id: yen.id,
          expectedVersion: 1,
          accountId: h.account.id,
          categoryId: h.food,
          kind: TransactionKind.EXPENSE,
          amount: 5000,
          currency: "JPY",
          memo: "Ramen",
          date: "2026-11-05",
        }, h.owner)
        expect(edited).toMatchObject({ memo: "Ramen", accountAmount: -3438, converted: true })

        // 7 November has no rate of its own: the ECB's of 5 November, 1.2 / 160, is the latest.
        const moved = await transactions.update({
          groupId: h.groupId,
          id: yen.id,
          expectedVersion: 2,
          accountId: h.account.id,
          categoryId: h.food,
          kind: TransactionKind.EXPENSE,
          amount: 5000,
          currency: "JPY",
          memo: "Ramen",
          date: "2026-11-07",
        }, h.owner)
        expect(moved).toMatchObject({ accountAmount: -3750, converted: true })

        const manual = await h.entry({ amount: 5000, currency: "JPY", accountAmount: 3000 })
        expect(manual).toMatchObject({ accountAmount: -3000, converted: false })
      },
    )

    await t.step(
      "refuses an entry in a currency with no rate on or before its date (R8)",
      async () => {
        const h = await household("USD")
        expect(await codeOf(h.entry({ currency: "GBP" }))).toBe("NO_RATE")
        expect(await codeOf(h.entry({ currency: "JPY", date: "2020-01-01" }))).toBe("NO_RATE")
        expect(await transactions.count(h.groupId)).toBe(0)
      },
    )

    await t.step(
      "stores every listed coin's entry in a crypto account at 8 decimals, and leaves a coin with no price out of the ledger",
      async () => {
        const h = await household("USD")
        for (const coin of COINS) {
          const wallet = (await accounts.create({
            groupId: h.groupId,
            id: uuidV7(),
            name: `${coin.name} wallet`,
            kind: AccountKind.CRYPTO,
            currency: coin.code,
            startingBalance: 100_000_000,
            allowance: null,
          }, h.owner)).account
          // 0.5 of the coin, in its smallest unit, paid from the wallet in the coin itself.
          const entry = await h.entry({
            accountId: wallet.id,
            amount: 50_000_000,
            currency: coin.code,
          })
          expect(entry).toMatchObject({
            amount: -50_000_000,
            currency: coin.code,
            accountAmount: -50_000_000,
            converted: false,
          })
          expect((await accounts.get(h.groupId, wallet.id))?.balance).toBe(50_000_000)
        }

        // A coin paid from a dollar account: no price yet, so a rate must be stated.
        expect(await codeOf(h.entry({ amount: 50_000_000, currency: "BTC" }))).toBe("NO_RATE")
        const manual = await h.entry({
          amount: 50_000_000,
          currency: "BTC",
          accountAmount: 3_000_000,
        })
        expect(manual).toMatchObject({ accountAmount: -3_000_000, converted: false })

        await rates(sql, "2026-11-05", RATE_SOURCES.ecb, { USD: "1.2" })
        const ledger = await transactions.ledger(h.groupId, "EUR", "2026-11-01", "2026-11-30")
        // The dollar entry counts (30000.00 USD at 1.2 is 25000.00 EUR); both coins are named.
        expect(ledger.spending).toBe(2_500_000)
        expect(ledger.leftOut).toEqual(COINS.map((coin) => coin.code).sort())
      },
    )

    await t.step(
      "gives an account's balance on a day as its starting balance plus the live entries dated on or before it (R9)",
      async () => {
        const h = await household("USD", 10000)
        await h.entry({ date: "2026-11-01", amount: 1000 })
        await h.entry({
          date: "2026-11-03",
          amount: 500,
          kind: TransactionKind.INCOME,
          categoryId: h.salary,
        })
        const gone = await h.entry({ date: "2026-11-02", amount: 200 })
        await transactions.delete({ groupId: h.groupId, id: gone.id, expectedVersion: 1 }, h.owner)
        await h.entry({ date: "2099-01-01", amount: 7 })

        const balanceOn = async (on?: string) =>
          (await accounts.get(h.groupId, h.account.id, on))?.balance

        expect(await balanceOn("2026-10-31")).toBe(10000)
        expect(await balanceOn("2026-11-01")).toBe(9000)
        expect(await balanceOn("2026-11-02")).toBe(9000)
        expect(await balanceOn("2026-11-03")).toBe(9500)
        expect(await balanceOn()).toBe(9500)
        expect((await accounts.list(h.groupId)).map((account) => account.balance)).toEqual([9500])
        expect(await balanceOn("2099-01-01")).toBe(9493)
      },
    )

    await t.step(
      "locks an account's currency once any entry names it, a trashed one included (R10)",
      async () => {
        const h = await household("USD")
        const fields = {
          groupId: h.groupId,
          id: h.account.id,
          name: "Main",
          kind: AccountKind.BANK,
          startingBalance: 0,
        }
        const gone = await h.entry()
        await transactions.delete({ groupId: h.groupId, id: gone.id, expectedVersion: 1 }, h.owner)

        const error = await refusal(
          accounts.update({ ...fields, currency: "EUR", expectedVersion: 1 }, h.owner),
        )
        expect(error).toBeInstanceOf(AccountError)
        expect((error as AccountError).code).toBe("CURRENCY_LOCKED")
        const renamed = await accounts.update(
          { ...fields, name: "Daily", currency: "USD", expectedVersion: 1 },
          h.owner,
        )
        expect(renamed).toMatchObject({ name: "Daily", currency: "USD", version: 2 })

        const empty = await household("USD")
        const moved = await accounts.update({
          ...fields,
          groupId: empty.groupId,
          id: empty.account.id,
          currency: "EUR",
          expectedVersion: 1,
        }, empty.owner)
        expect(moved.currency).toBe("EUR")
      },
    )

    await t.step(
      "refuses to delete an account any entry names, a trashed one included, and offers archiving instead",
      async () => {
        const h = await household("USD")
        const gone = await h.entry()
        await transactions.delete({ groupId: h.groupId, id: gone.id, expectedVersion: 1 }, h.owner)

        const error = await refusal(
          accounts.delete({ groupId: h.groupId, id: h.account.id, expectedVersion: 1 }, h.owner),
        )
        expect(error).toBeInstanceOf(AccountError)
        expect((error as AccountError).code).toBe("ACCOUNT_HAS_TRANSACTIONS")
        expect((await accounts.get(h.groupId, h.account.id))?.deletedAt).toBeNull()
        const archived = await accounts.archive(
          { groupId: h.groupId, id: h.account.id, expectedVersion: 1, archived: true },
          h.owner,
        )
        expect(archived.archivedAt).not.toBeNull()
      },
    )

    await t.step(
      "locks a category's kind once an entry names it, and counts a refund against its spending, not as income (R12)",
      async () => {
        const h = await household("EUR")
        await h.entry({ amount: 5000 })
        await h.entry({ amount: 1500, kind: TransactionKind.INCOME })
        await h.entry({ amount: 100000, kind: TransactionKind.INCOME, categoryId: h.salary })
        const fields = {
          groupId: h.groupId,
          id: h.food,
          name: "Food",
          icon: "utensils" as CategoryIcon,
          color: "#c2410c",
          parentId: null,
          expectedVersion: 1,
        }

        const error = await refusal(
          categories.update({ ...fields, kind: CategoryKind.INCOME }, h.owner),
        )
        expect(error).toBeInstanceOf(CategoryError)
        expect((error as CategoryError).code).toBe("KIND_LOCKED")
        expect(
          (await categories.update(
            { ...fields, name: "Meals", kind: CategoryKind.EXPENSE },
            h.owner,
          ))
            .name,
        ).toBe("Meals")
        expect(await codeOf(h.entry({ categoryId: h.salary }))).toBe("CATEGORY_KIND_MISMATCH")

        const ledger = await transactions.ledger(h.groupId, "EUR", "2026-11-01", "2026-11-30")
        expect(ledger).toMatchObject({
          income: 100000,
          spending: 3500,
          net: 96500,
          categories: [{ categoryId: h.food, spending: 3500 }],
          leftOut: [],
          tooLarge: false,
        })
      },
    )

    await t.step(
      "counts a child category's spending in its parent's, and once in the total (R13)",
      async () => {
        const h = await household("EUR")
        const groceries = await h.category("Groceries", CategoryKind.EXPENSE, h.food)
        await h.entry({ amount: 1000 })
        await h.entry({ amount: 2000, categoryId: groceries })
        await h.entry({ amount: 400, date: "2026-12-01" })

        const ledger = await transactions.ledger(h.groupId, "EUR", "2026-11-01", "2026-11-30")

        expect(ledger.spending).toBe(3000)
        expect(ledger.categories).toEqual([
          { categoryId: h.food, spending: 3000 },
          { categoryId: groceries, spending: 2000 },
        ])
      },
    )

    await t.step(
      "sums US dollars and yen in euros, each entry at its own date's rate and through its account amount when in another currency (legacy §4 item 2)",
      async () => {
        await rates(sql, "2026-11-20", RATE_SOURCES.ecb, { USD: "1.25", JPY: "125" })
        await rates(sql, "2026-11-21", RATE_SOURCES.ecb, { USD: "2" })
        const dollars = await household("USD")
        const yen = await accounts.create({
          groupId: dollars.groupId,
          id: uuidV7(),
          name: "Yen",
          kind: AccountKind.CASH,
          currency: "JPY",
          startingBalance: 0,
          allowance: null,
        }, dollars.owner)
        await dollars.entry({ amount: 1000, date: "2026-11-20" })
        await dollars.entry({ amount: 1000, date: "2026-11-21" })
        await dollars.entry({
          accountId: yen.account.id,
          currency: "JPY",
          amount: 1000,
          date: "2026-11-20",
        })
        // Yen paid from the dollar account at a manual rate: the ledger counts the 10 dollars.
        await dollars.entry({
          currency: "JPY",
          amount: 1000,
          accountAmount: 1000,
          date: "2026-11-21",
        })

        const ledger = await transactions.ledger(dollars.groupId, "EUR", "2026-11-20", "2026-11-21")

        // 10 USD / 1.25 + 10 USD / 2 + 1000 JPY / 125 + 10 USD / 2 = 8 + 5 + 8 + 5 euros.
        expect(ledger).toMatchObject({ currency: "EUR", spending: 2600, income: 0, net: -2600 })
        expect(ledger.leftOut).toEqual([])
      },
    )

    await t.step(
      "leaves a currency with no rate out of the ledger and names it (R8)",
      async () => {
        const h = await household("GBP")
        const euros = await accounts.create({
          groupId: h.groupId,
          id: uuidV7(),
          name: "Euro",
          kind: AccountKind.CASH,
          currency: "EUR",
          startingBalance: 0,
          allowance: null,
        }, h.owner)
        await h.entry({ amount: 999 })
        await h.entry({ accountId: euros.account.id, currency: "EUR", amount: 300 })

        const ledger = await transactions.ledger(h.groupId, "EUR", "2026-11-01", "2026-11-30")

        expect(ledger).toMatchObject({ spending: 300, leftOut: ["GBP"] })
      },
    )

    await t.step(
      "keeps entries inside their household: a foreign account, category or entry is not found, and the table refuses a cross link (R17)",
      async () => {
        const mine = await household("USD")
        const theirs = await household("USD")
        const foreign = await theirs.entry()

        expect(await codeOf(mine.entry({ accountId: theirs.account.id })))
          .toBe("ACCOUNT_NOT_FOUND")
        expect(await codeOf(mine.entry({ categoryId: theirs.food }))).toBe("CATEGORY_NOT_FOUND")
        expect(await transactions.get(mine.groupId, foreign.id)).toBeNull()
        expect(
          await codeOf(
            transactions.delete(
              { groupId: mine.groupId, id: foreign.id, expectedVersion: 1 },
              mine.owner,
            ),
          ),
        ).toBe("TRANSACTION_NOT_FOUND")
        const crossLink = await refusal(
          sql`UPDATE transactions SET account_id = ${mine.account.id} WHERE id = ${foreign.id}`,
        )
        expect((crossLink as { code?: string }).code).toBe("23503")
        expect(await transactions.get(theirs.groupId, foreign.id)).toMatchObject({
          accountId: theirs.account.id,
          version: 1,
        })
      },
    )

    await t.step(
      "refuses a viewer's write and a removed member's write under the household lock (R16)",
      async () => {
        const h = await household("USD")
        expect(await codeOf(h.entry({}, h.viewer))).toBe("ROLE_INSUFFICIENT")
        expect(await codeOf(h.entry({}, h.stranger))).toBe("GROUP_NOT_FOUND")
        await sql`DELETE FROM group_members WHERE group_id = ${h.groupId} AND user_id = ${h.editor}`
        const error = await refusal(h.entry({}, h.editor))
        expect(error).toBeInstanceOf(TransactionError)
        expect((error as TransactionError).code).toBe("GROUP_NOT_FOUND")
        expect(await transactions.count(h.groupId)).toBe(0)
      },
    )

    await t.step(
      "counts live entries against the plan's cap under the lock, on create and on restore",
      async () => {
        const h = await household("USD")
        expect(await refusal(h.entry({ allowance: 0 }))).toBeInstanceOf(PlanError)
        const first = await h.entry({ allowance: 1 })
        expect(await refusal(h.entry({ allowance: 1 }))).toBeInstanceOf(PlanError)
        await transactions.delete({ groupId: h.groupId, id: first.id, expectedVersion: 1 }, h.owner)
        const second = await h.entry({ allowance: 1 })
        expect(
          await refusal(
            transactions.restore({ groupId: h.groupId, id: first.id, allowance: 1 }, h.owner),
          ),
        ).toBeInstanceOf(PlanError)
        expect(await transactions.count(h.groupId)).toBe(1)
        expect((await transactions.get(h.groupId, second.id))?.id).toBe(second.id)
      },
    )

    await t.step(
      `purges an entry deleted more than ${TRANSACTION_RESTORE_DAYS} days ago, then lets its account go`,
      async () => {
        const h = await household("USD")
        const gone = await h.entry()
        await transactions.delete({ groupId: h.groupId, id: gone.id, expectedVersion: 1 }, h.owner)
        const [{ deletedAt }] = await sql<{ deletedAt: Date }[]>`
          SELECT deleted_at FROM transactions WHERE id = ${gone.id}
        `
        const boundary = new Date(deletedAt.getTime() + TRANSACTION_RESTORE_DAYS * 86_400_000)

        await purgeDeletedTransactions(sql, boundary)
        expect(await sql`SELECT id FROM transactions WHERE id = ${gone.id}`).toHaveLength(1)

        await purgeDeletedTransactions(sql, new Date(boundary.getTime() + 1))
        expect(await sql`SELECT id FROM transactions WHERE id = ${gone.id}`).toHaveLength(0)
        const deleted = await accounts.delete(
          { groupId: h.groupId, id: h.account.id, expectedVersion: 1 },
          h.owner,
        )
        expect(deleted.deletedAt).not.toBeNull()
      },
    )
  })
})
