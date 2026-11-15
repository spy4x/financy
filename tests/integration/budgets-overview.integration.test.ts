/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { AccountKind } from "@domain/accounts"
import { BudgetMonthQuery, BudgetWidgetQuery } from "@domain/budgets"
import { type CategoryIcon, CategoryKind } from "@domain/categories"
import { type Actor, UserMFAStatus } from "@domain/identity"
import { TransactionKind } from "@domain/transactions"
import { SecondFactorStatus } from "@spy4x/server/sign-in"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import {
  createBudgetMonthHandler,
  createBudgetWidgetHandler,
} from "../../apps/api/features/budgets/handlers.ts"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresBudgetRepository } from "@server/budgets/postgres-budget-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { team, withSchema } from "./group-team.ts"

/**
 * The overview's budgets widget against a real Postgres built from schema.sql: its figures are
 * `budget.month`'s for the month the range ends in, never past the household's current month in
 * the zone stored for it, and a stranger reads nothing. The drawing is in
 * `libs/ui/budget-widgets.test.tsx`. Needs `DB_HOST`, `DB_USER`, `DB_PASS` and `DB_NAME` (recipe in
 * docs/handoff.md); it fails when they are missing rather than skipping.
 */

Deno.test("the budgets widget's read against Postgres", async (t) => {
  await withSchema(async (sql) => {
    const budgets = new PostgresBudgetRepository(sql)
    const categories = new PostgresCategoryRepository(sql)
    const transactions = new PostgresTransactionRepository(sql)
    const rates = new PostgresRateRepository(sql)

    /** A household in Ho Chi Minh City with a USD account, Food › Groceries and Rent, at `now`. */
    async function household(now: Date) {
      const members = await team(sql)
      await sql`UPDATE groups SET time_zone = 'Asia/Ho_Chi_Minh' WHERE id = ${members.groupId}`
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
        }, members.owner)).category.id
      const food = await category("Food")
      const groceries = await category("Groceries", food)
      const rent = await category("Rent")
      const account = (await new PostgresAccountRepository(sql).create({
        groupId: members.groupId,
        id: uuidV7(),
        name: "Main",
        kind: AccountKind.BANK,
        currency: "USD",
        startingBalance: 0,
        allowance: null,
      }, members.owner)).account
      const spend = (categoryId: string, amount: number, date: string) =>
        transactions.create({
          groupId: members.groupId,
          id: uuidV7(),
          accountId: account.id,
          categoryId,
          kind: TransactionKind.EXPENSE,
          amount,
          currency: "USD",
          memo: "",
          date,
          allowance: null,
        }, members.owner)
      const limit = (categoryId: string, month: string, amount: number) =>
        budgets.set(
          {
            groupId: members.groupId,
            categoryId,
            month,
            amount,
            currency: "USD",
            expectedVersion: null,
          } as Parameters<typeof budgets.set>[0],
          members.owner,
        )
      const dependencies = {
        budgets,
        groups: {
          roleOf: async (groupId: string, userId: number) =>
            (await members.repository.getForMember(groupId, userId))?.role ?? null,
        },
        settings: { get: () => Promise.resolve({ baseCurrency: "USD" }) },
        ledger: (groupId: string, currency: string, from: string, to: string) =>
          transactions.ledger(groupId, currency, from, to),
        ledgerMonths: (groupId: string, currency: string, from: string, to: string) =>
          transactions.ledgerMonths(groupId, currency, from, to),
        rate: async (base: string, quote: string, date: string) => {
          const lookup = await rates.lookup(base, quote, date)
          return lookup.found ? lookup.rate : null
        },
        now: () => now,
      }
      const actor = (userId: number): Actor => ({
        userId,
        userMfa: UserMFAStatus.NOT_CONFIGURED,
        sessionSecondFactor: SecondFactorStatus.NotRequired,
      })
      const widget = createBudgetWidgetHandler({ ...dependencies, categories })
      const month = createBudgetMonthHandler(dependencies)
      /** The widget's read for `range`, as `userId` asks for it, the payload's zone UTC. */
      const read = (range: { from: string; to: string }, userId = members.viewer) =>
        widget(
          new BudgetWidgetQuery({
            actor: actor(userId),
            groupId: members.groupId,
            ...range,
            timeZone: "UTC",
          }),
        )
      /** The Budgets screen's read of `at`, or of the current month without one. */
      const screen = async (at?: string) =>
        (await month(
          new BudgetMonthQuery({
            actor: actor(members.viewer),
            groupId: members.groupId,
            month: at,
          }),
        )).budgets
      return { ...members, food, groceries, rent, spend, limit, read, screen }
    }

    await t.step(
      "gives the widget the Budgets screen's figures for the month a range ends in",
      async () => {
        const h = await household(new Date("2026-11-16T05:00:00.000Z"))
        await h.limit(h.food, "2026-09", 50000)
        await h.limit(h.rent, "2026-10", 120000)
        await h.spend(h.groceries, 58000, "2026-10-31")
        await h.spend(h.rent, 100000, "2026-10-01")
        await h.spend(h.food, 9999, "2026-11-01")

        const answer = await h.read({ from: "2026-10-01", to: "2026-10-31" })

        expect(answer.budgets).toEqual(await h.screen("2026-10"))
        expect(answer.budgets.rows.find((row) => row.categoryId === h.food)).toMatchObject({
          limit: { amount: 50000, currency: "USD" },
          spending: 58000,
        })
        expect(answer.categories.map((category) => category.name)).toEqual([
          "Food",
          "Groceries",
          "Rent",
        ])
      },
    )

    await t.step(
      "shows this month for a year range, starting it at midnight on the 1st in the household's zone",
      async () => {
        // 17:30 UTC on 30 November is 00:30 on 1 December in Ho Chi Minh City.
        const h = await household(new Date("2026-11-30T17:30:00.000Z"))
        await h.limit(h.food, "2026-12", 20000)
        await h.spend(h.food, 30000, "2026-12-01")

        const answer = await h.read({ from: "2026-01-01", to: "2026-12-31" })

        expect(answer.budgets.month).toBe("2026-12")
        expect(answer.budgets).toEqual(await h.screen())
        expect(answer.budgets.rows.find((row) => row.categoryId === h.food)?.spending).toBe(30000)
      },
    )

    await t.step("never counts another household's limits or spending", async () => {
      const now = new Date("2026-11-16T05:00:00.000Z")
      const h = await household(now)
      const other = await household(now)
      await other.limit(other.food, "2026-11", 1000)
      await other.spend(other.food, 70000, "2026-11-10")

      const answer = await h.read({ from: "2026-11-01", to: "2026-11-30" })

      expect(answer.budgets.rows.map((row) => [row.limit, row.spending])).toEqual([
        [null, 0],
        [null, 0],
        [null, 0],
      ])
    })

    await t.step("tells a stranger the household does not exist", async () => {
      const h = await household(new Date("2026-11-16T05:00:00.000Z"))
      const refusal = await h.read({ from: "2026-11-01", to: "2026-11-30" }, h.stranger)
        .then(() => null, (error) => error)
      expect(refusal).toMatchObject({ code: "GROUP_NOT_FOUND" })
    })
  })
})
