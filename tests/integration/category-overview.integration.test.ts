/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { AccountKind } from "@domain/accounts"
import { type CategoryIcon, CategoryKind } from "@domain/categories"
import { type Actor, UserMFAStatus } from "@domain/identity"
import { RATE_SOURCES } from "@domain/money"
import { TransactionCategoryWidgetQuery, TransactionKind } from "@domain/transactions"
import { SecondFactorStatus } from "@spy4x/server/sign-in"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { createTransactionCategoryWidgetHandler } from "../../apps/api/features/transactions/handlers.ts"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { PostgresGroupRepository } from "@server/groups/postgres-group-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { PostgresTransferRepository } from "@server/transfers/postgres-transfer-repository.ts"
import { team, withSchema } from "./group-team.ts"

/**
 * "Where did the money go?" against a real Postgres built from schema.sql: each category's figure
 * is the ledger read's, a child's spending shows under its parent only, a refund lowers its
 * category, transfers never reach it (R11), an archived category keeps its name, and another
 * household's rows never count. The drawing is in `libs/ui/category-widgets.test.tsx`. Needs
 * `DB_HOST`, `DB_USER`, `DB_PASS` and `DB_NAME` (recipe in docs/handoff.md); it fails when they are
 * missing rather than skipping.
 */

const NOVEMBER = { from: "2026-11-01", to: "2026-11-30" }

/** Rates against the euro, as the daily fetch stores them. */
async function rates(sql: postgres.Sql, date: string, quotes: Record<string, string>) {
  await new PostgresRateRepository(sql).insert(
    Object.entries(quotes).map(([quote, rate]) => ({
      base: "EUR",
      quote,
      rate,
      date,
      source: RATE_SOURCES.ecb,
    })),
    new Date(),
    (_rate, problem) => {
      throw new Error(problem)
    },
  )
}

Deno.test(`"Where did the money go?" read against Postgres`, async (t) => {
  await withSchema(async (sql) => {
    const accounts = new PostgresAccountRepository(sql)
    const categories = new PostgresCategoryRepository(sql)
    const transactions = new PostgresTransactionRepository(sql)
    const transfers = new PostgresTransferRepository(sql)
    const groups = new PostgresGroupRepository(sql)
    const handler = createTransactionCategoryWidgetHandler({
      transactions,
      groups: {
        roleOf: async (group, user) => (await groups.getForMember(group, user))?.role ?? null,
      },
      settings: { get: () => Promise.resolve({ baseCurrency: "EUR" }) },
      categories,
      now: () => new Date("2026-11-30T12:00:00.000Z"),
    })
    // 5 November: a euro is 1.10 dollars and 28,000 dong.
    await rates(sql, "2026-11-05", { USD: "1.1", VND: "28000" })

    /** A household in euros: euro, dollar and dong accounts; Food with Groceries in it, and Rent. */
    async function household() {
      const members = await team(sql)
      const account = async (currency: string) =>
        (await accounts.create({
          groupId: members.groupId,
          id: uuidV7(),
          name: currency,
          kind: AccountKind.BANK,
          currency,
          startingBalance: 0,
          allowance: null,
        }, members.owner)).account
      const category = async (name: string, parentId: string | null = null) =>
        (await categories.create({
          groupId: members.groupId,
          id: uuidV7(),
          name,
          kind: CategoryKind.EXPENSE,
          icon: "utensils" as CategoryIcon,
          color: "#c2410c",
          parentId,
          allowance: null,
        }, members.owner)).category
      const eur = await account("EUR")
      const usd = await account("USD")
      const vnd = await account("VND")
      const food = await category("Food")
      const groceries = await category("Groceries", food.id)
      const rent = await category("Rent")
      /** Writes an entry as the owner: an expense unless `kind` says income (a refund). */
      const add = async (
        accountId: string,
        currency: string,
        amount: number,
        categoryId: string,
        kind = TransactionKind.EXPENSE,
        date = "2026-11-05",
      ) =>
        await transactions.create({
          groupId: members.groupId,
          id: uuidV7(),
          accountId,
          categoryId,
          kind,
          amount,
          currency,
          memo: "",
          date,
          allowance: null,
        }, members.owner)
      /** The widget's read for November, as `userId` asks for it. */
      const read = (userId = members.viewer) => {
        const actor: Actor = {
          userId,
          userMfa: UserMFAStatus.NOT_CONFIGURED,
          sessionSecondFactor: SecondFactorStatus.NotRequired,
        }
        return handler(
          new TransactionCategoryWidgetQuery({
            actor,
            groupId: members.groupId,
            ...NOVEMBER,
            timeZone: "Asia/Ho_Chi_Minh",
          }),
        )
      }
      const ledger = () => transactions.ledger(members.groupId, "EUR", NOVEMBER.from, NOVEMBER.to)
      return { ...members, eur, usd, vnd, food, groceries, rent, add, read, ledger }
    }

    await t.step(
      "gives each category the ledger read's figure for a month of EUR, USD and VND, a child under its parent only",
      async () => {
        const h = await household()
        await h.add(h.usd.id, "USD", 5500, h.groceries.id)
        await h.add(h.eur.id, "EUR", 1200, h.food.id)
        await h.add(h.vnd.id, "VND", 2_800_000, h.rent.id)

        const result = await h.read()
        const ledger = await h.ledger()

        // 55.00 USD at 1.1 is 50.00 EUR; 2,800,000 VND at 28,000 is 100.00 EUR.
        expect(result.top).toEqual([
          { categoryId: h.rent.id, name: "Rent", spending: 10000 },
          { categoryId: h.food.id, name: "Food", spending: 5000 + 1200 },
        ])
        for (const row of result.top) {
          expect(row.spending).toBe(
            ledger.categories.find((entry) => entry.categoryId === row.categoryId)?.spending,
          )
        }
        expect(result).toMatchObject({
          currency: "EUR",
          spending: ledger.spending,
          more: 0,
          spendingRateDate: "2026-11-05",
          spendingLeftOut: [],
          tooLarge: false,
        })
      },
    )

    await t.step(
      "lowers a category by its refund, and counts a transfer in none (R11)",
      async () => {
        const h = await household()
        await h.add(h.eur.id, "EUR", 5000, h.rent.id)
        await h.add(h.eur.id, "EUR", 1500, h.rent.id, TransactionKind.INCOME)
        const before = await h.read()

        await transfers.create(
          {
            groupId: h.groupId,
            id: uuidV7(),
            fromAccountId: h.eur.id,
            toAccountId: h.usd.id,
            sentAmount: 1000,
            memo: "",
            date: "2026-11-05",
            allowance: null,
          } as Parameters<typeof transfers.create>[0],
          h.owner,
        )

        expect(before.top).toEqual([{ categoryId: h.rent.id, name: "Rent", spending: 3500 }])
        expect(await h.read()).toEqual(before)
      },
    )

    await t.step("keeps an archived category's name", async () => {
      const h = await household()
      await h.add(h.eur.id, "EUR", 5000, h.rent.id)
      await categories.archive(
        {
          groupId: h.groupId,
          id: h.rent.id,
          expectedVersion: h.rent.version,
          archived: true,
          allowance: null,
        } as Parameters<typeof categories.archive>[0],
        h.owner,
      )

      expect((await h.read()).top).toEqual([
        { categoryId: h.rent.id, name: "Rent", spending: 5000 },
      ])
    })

    await t.step("never counts another household's rows", async () => {
      const h = await household()
      const other = await household()
      await h.add(h.eur.id, "EUR", 1200, h.food.id)
      await other.add(other.eur.id, "EUR", 99900, other.food.id)

      const result = await h.read()

      expect(result.top).toEqual([{ categoryId: h.food.id, name: "Food", spending: 1200 }])
      expect(result.spending).toBe(1200)
    })

    await t.step("tells a stranger the household does not exist", async () => {
      const h = await household()
      const refusal = await h.read(h.stranger).then(() => null, (error) => error)
      expect(refusal).toMatchObject({ code: "GROUP_NOT_FOUND" })
    })
  })
})
