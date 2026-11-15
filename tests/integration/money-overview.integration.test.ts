/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { AccountKind } from "@domain/accounts"
import { type CategoryIcon, CategoryKind } from "@domain/categories"
import { type Actor, UserMFAStatus } from "@domain/identity"
import { RATE_SOURCES } from "@domain/money"
import { TransactionKind, TransactionWidgetQuery } from "@domain/transactions"
import { SecondFactorStatus } from "@spy4x/server/sign-in"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { createTransactionWidgetHandler } from "../../apps/api/features/transactions/handlers.ts"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { PostgresGroupRepository } from "@server/groups/postgres-group-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { PostgresTransferRepository } from "@server/transfers/postgres-transfer-repository.ts"
import { team, withSchema } from "./group-team.ts"

/**
 * The overview's money widgets (Net, Income, Spending) against a real Postgres built from
 * schema.sql: their read is the ledger read's, transfers never reach it (R11), another household's
 * rows never count, and the period before the range is read only when the household has live
 * entries that old. The drawing is in `libs/ui/money-widgets.test.tsx`. Needs `DB_HOST`, `DB_USER`,
 * `DB_PASS` and `DB_NAME` (recipe in docs/handoff.md); it fails when they are missing rather than
 * skipping.
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

Deno.test("the money widgets' read against Postgres", async (t) => {
  await withSchema(async (sql) => {
    const accounts = new PostgresAccountRepository(sql)
    const categories = new PostgresCategoryRepository(sql)
    const transactions = new PostgresTransactionRepository(sql)
    const transfers = new PostgresTransferRepository(sql)
    const groups = new PostgresGroupRepository(sql)
    const handler = createTransactionWidgetHandler({
      transactions,
      groups: {
        roleOf: async (group, user) => (await groups.getForMember(group, user))?.role ?? null,
      },
      settings: { get: () => Promise.resolve({ baseCurrency: "EUR" }) },
      now: () => new Date("2026-11-30T12:00:00.000Z"),
    })
    // 5 November: a euro is 1.10 dollars and 28,000 dong.
    await rates(sql, "2026-11-05", { USD: "1.1", VND: "28000" })

    /** A household in euros with a euro, a dollar and a dong account, a food and a salary category. */
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
      const category = async (name: string, kind: CategoryKind) =>
        (await categories.create({
          groupId: members.groupId,
          id: uuidV7(),
          name,
          kind,
          icon: "utensils" as CategoryIcon,
          color: "#c2410c",
          parentId: null,
          allowance: null,
        }, members.owner)).category.id
      const eur = await account("EUR")
      const usd = await account("USD")
      const vnd = await account("VND")
      const food = await category("Food", CategoryKind.EXPENSE)
      const salary = await category("Salary", CategoryKind.INCOME)
      /** Writes an entry as the owner: an expense in food unless `kind` says income. */
      const add = async (
        accountId: string,
        currency: string,
        amount: number,
        date: string,
        kind = TransactionKind.EXPENSE,
      ) =>
        await transactions.create({
          groupId: members.groupId,
          id: uuidV7(),
          accountId,
          categoryId: kind === TransactionKind.INCOME ? salary : food,
          kind,
          amount,
          currency,
          memo: "",
          date,
          allowance: null,
        }, members.owner)
      /** The widgets' read for `range`, as `userId` asks for it. */
      const read = (range = NOVEMBER, userId = members.viewer) => {
        const actor: Actor = {
          userId,
          userMfa: UserMFAStatus.NOT_CONFIGURED,
          sessionSecondFactor: SecondFactorStatus.NotRequired,
        }
        return handler(
          new TransactionWidgetQuery({
            actor,
            groupId: members.groupId,
            ...range,
            timeZone: "Asia/Ho_Chi_Minh",
          }),
        )
      }
      return { ...members, eur, usd, vnd, add, read }
    }

    await t.step(
      "gives each widget the ledger read's figures for a month of EUR, USD and VND (legacy §4 item 2)",
      async () => {
        const h = await household()
        await h.add(h.eur.id, "EUR", 300000, "2026-11-01", TransactionKind.INCOME)
        await h.add(h.usd.id, "USD", 5500, "2026-11-05")
        await h.add(h.vnd.id, "VND", 2_800_000, "2026-11-05")
        await h.add(h.eur.id, "EUR", 1200, "2026-11-12")

        const { current } = await h.read()
        const { categories: _categories, ...ledger } = await transactions.ledger(
          h.groupId,
          "EUR",
          NOVEMBER.from,
          NOVEMBER.to,
        )

        expect(current).toEqual(ledger)
        // 55.00 USD at 1.1 is 50.00 EUR; 2,800,000 VND at 28,000 is 100.00 EUR.
        expect(current).toMatchObject({
          income: 300000,
          spending: 5000 + 10000 + 1200,
          net: 300000 - 16200,
          rateDate: "2026-11-05",
          incomeRateDate: null,
          spendingRateDate: "2026-11-05",
        })
      },
    )

    await t.step("changes no income, spending or net figure for a transfer (R11)", async () => {
      const h = await household()
      await h.add(h.eur.id, "EUR", 1200, "2026-11-12")
      const before = await h.read()

      for (const [from, to] of [[h.eur, h.usd], [h.usd, h.vnd]]) {
        await transfers.create(
          {
            groupId: h.groupId,
            id: uuidV7(),
            fromAccountId: from.id,
            toAccountId: to.id,
            sentAmount: 1000,
            memo: "",
            date: "2026-11-12",
            allowance: null,
          } as Parameters<typeof transfers.create>[0],
          h.owner,
        )
      }

      expect(await h.read()).toEqual(before)
      expect(before.current).toMatchObject({ income: 0, spending: 1200, net: -1200 })
    })

    await t.step("never counts another household's rows, now or in the period before", async () => {
      const h = await household()
      const other = await household()
      await h.add(h.eur.id, "EUR", 1200, "2026-11-12")
      await other.add(other.eur.id, "EUR", 99900, "2026-11-12")
      await other.add(other.eur.id, "EUR", 99900, "2026-10-02")

      const result = await h.read()

      expect(result.current).toMatchObject({ income: 0, spending: 1200 })
      expect(result.previous).toBeNull()
    })

    await t.step(
      "reads the period before only when a live entry is that old, never counting a deleted one",
      async () => {
        const h = await household()
        await h.add(h.eur.id, "EUR", 1200, "2026-11-12")
        const old = await h.add(h.eur.id, "EUR", 800, "2026-10-02")
        expect((await h.read()).previous).toMatchObject({ from: "2026-10-02", spending: 800 })

        await transactions.delete(
          { groupId: h.groupId, id: old.transaction.id, expectedVersion: old.transaction.version },
          h.owner,
        )

        expect((await h.read()).previous).toBeNull()
      },
    )

    await t.step("tells a stranger the household does not exist", async () => {
      const h = await household()
      const refusal = await h.read(NOVEMBER, h.stranger).then(() => null, (error) => error)
      expect(refusal).toMatchObject({ code: "GROUP_NOT_FOUND" })
    })
  })
})
