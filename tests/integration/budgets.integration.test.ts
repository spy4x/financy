/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { AccountKind } from "@domain/accounts"
import { BudgetBand, BudgetError, BudgetLimitSource, BudgetMonthQuery } from "@domain/budgets"
import { type CategoryIcon, CategoryKind } from "@domain/categories"
import { UserMFAStatus } from "@domain/identity"
import { RATE_SOURCES } from "@domain/money"
import { TransactionKind } from "@domain/transactions"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresBudgetRepository } from "@server/budgets/postgres-budget-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { createBudgetMonthHandler } from "../../apps/api/features/budgets/handlers.ts"
import { holdMemberChange, stillWaiting, team, withSchema } from "./group-team.ts"
import { expectVersion7Ids } from "./ids.ts"

/**
 * Budgets against a real Postgres built from schema.sql: the month's row and its version, the
 * change each set records, the role checked again under the group lock, the table's own refusals,
 * the limit in effect for a month and the month's bars over the real ledger and rates. The
 * transports and the gates are in `apps/api/features/budgets/`. Needs `DB_HOST`, `DB_USER`,
 * `DB_PASS` and `DB_NAME` (recipe in docs/handoff.md); it fails when they are missing rather than
 * skipping.
 */

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(() => null, (error) => error)
}

async function nextSequence(sql: postgres.Sql, groupId: string): Promise<bigint> {
  return BigInt(
    (await sql<{ next: string }[]>`
      SELECT next_change_sequence::text AS next FROM groups WHERE id = ${groupId}
    `)[0].next,
  )
}

/** A household with a Food parent, a Groceries child and a Salary income category, by its owner. */
async function household(sql: postgres.Sql) {
  const members = await team(sql)
  const categories = new PostgresCategoryRepository(sql)
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
  const groceries = await category("Groceries", CategoryKind.EXPENSE, food)
  const salary = await category("Salary", CategoryKind.INCOME)
  return { ...members, categories, category, food, groceries, salary }
}

Deno.test("budgets against Postgres", async (t) => {
  await withSchema(async (sql) => {
    const budgets = new PostgresBudgetRepository(sql)
    const at = (groupId: string, categoryId: string, more: Record<string, unknown> = {}) =>
      ({
        groupId,
        categoryId,
        month: "2026-11",
        amount: 50000,
        currency: "USD",
        expectedVersion: null,
        ...more,
      }) as Parameters<typeof budgets.set>[0]

    await t.step(
      "every set moves the household's sequence once and leaves a budget.set outbox row",
      async () => {
        const h = await household(sql)
        const before = await nextSequence(sql, h.groupId)

        const first = await budgets.set(at(h.groupId, h.food), h.editor)
        await budgets.set(at(h.groupId, h.food, { amount: 60000, expectedVersion: 1 }), h.editor)
        const removed = await budgets.set(
          at(h.groupId, h.food, { amount: null, currency: null, expectedVersion: 2 }),
          h.owner,
        )

        expect(first).toMatchObject({
          groupId: h.groupId,
          categoryId: h.food,
          month: "2026-11",
          amount: 50000,
          currency: "USD",
          version: 1,
          createdByUserId: h.editor,
        })
        expect(removed).toMatchObject({
          id: first.id,
          amount: null,
          currency: null,
          version: 3,
          createdByUserId: h.editor,
          updatedByUserId: h.owner,
          changeSequence: String(before + 2n),
        })
        expectVersion7Ids([removed])
        expect(await nextSequence(sql, h.groupId)).toBe(before + 3n)
        const outbox = await sql<{ eventKind: string }[]>`
          SELECT event_kind FROM outbox_events
          WHERE group_id = ${h.groupId} AND event_kind LIKE 'budget.%'
        `
        expect(outbox.map((row) => row.eventKind)).toEqual(Array(3).fill("budget.set"))
        const [{ rows }] = await sql<{ rows: number }[]>`
          SELECT count(*)::int AS rows FROM budgets WHERE group_id = ${h.groupId}
        `
        expect(rows).toBe(1)
      },
    )

    await t.step("refuses a stale version with the current one and writes nothing", async () => {
      const h = await household(sql)
      const before = await nextSequence(sql, h.groupId)

      const missing = await refusal(
        budgets.set(at(h.groupId, h.food, { expectedVersion: 1 }), h.editor),
      )
      await budgets.set(at(h.groupId, h.food), h.editor)
      const stale = await refusal(budgets.set(at(h.groupId, h.food, { amount: 1 }), h.editor))

      expect(missing).toMatchObject({ code: "VERSION_CONFLICT", currentVersion: null })
      expect(stale).toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 1 })
      expect(await nextSequence(sql, h.groupId)).toBe(before + 1n)
    })

    await t.step(
      "refuses an income, an archived and another household's category, but removes an archived one's limit (R12, R17)",
      async () => {
        const h = await household(sql)
        const other = await household(sql)
        const old = await h.category("Old", CategoryKind.EXPENSE)
        await h.categories.archive(
          { groupId: h.groupId, id: old, expectedVersion: 1, archived: true, allowance: null },
          h.owner,
        )

        const codes = await Promise.all([
          refusal(budgets.set(at(h.groupId, h.salary), h.editor)),
          refusal(budgets.set(at(h.groupId, old), h.editor)),
          refusal(budgets.set(at(h.groupId, other.food), h.editor)),
          refusal(budgets.set(at(other.groupId, h.food), other.owner)),
        ])
        const removal = await budgets.set(
          at(h.groupId, old, { amount: null, currency: null }),
          h.editor,
        )

        expect(codes.map((error) => (error as BudgetError).code)).toEqual([
          "BUDGET_INCOME_CATEGORY",
          "CATEGORY_ARCHIVED",
          "CATEGORY_NOT_FOUND",
          "CATEGORY_NOT_FOUND",
        ])
        expect(removal).toMatchObject({ categoryId: old, amount: null })
        const [{ rows }] = await sql<{ rows: number }[]>`
          SELECT count(*)::int AS rows FROM budgets
          WHERE group_id IN (${h.groupId}, ${other.groupId})
        `
        expect(rows).toBe(1)
      },
    )

    await t.step(
      "checks the role in the write's transaction: a viewer cannot set, a stranger finds no household (R16)",
      async () => {
        const h = await household(sql)

        const viewer = await refusal(budgets.set(at(h.groupId, h.food), h.viewer))
        const stranger = await refusal(budgets.set(at(h.groupId, h.food), h.stranger))

        expect(viewer).toMatchObject({ code: "ROLE_INSUFFICIENT" })
        expect(stranger).toMatchObject({ code: "GROUP_NOT_FOUND" })
      },
    )

    await t.step(
      "the table refuses a second row for a month, a currency without an amount, and another household's category",
      async () => {
        const h = await household(sql)
        const other = await household(sql)
        await budgets.set(at(h.groupId, h.food), h.editor)
        const insert = (
          groupId: string,
          categoryId: string,
          amount: number | null,
          currency: string | null,
        ) =>
          refusal(sql`
            INSERT INTO budgets (
              id, group_id, category_id, month, amount, currency, change_sequence,
              created_by_user_id, updated_by_user_id
            ) VALUES (
              ${uuidV7()}, ${groupId}, ${categoryId}, '2026-11-01', ${amount}, ${currency}, 1,
              ${h.owner}, ${h.owner}
            )
          `)

        const errors = await Promise.all([
          insert(h.groupId, h.food, 1, "USD"),
          insert(h.groupId, h.groceries, null, "USD"),
          insert(h.groupId, h.groceries, 1, null),
          insert(h.groupId, other.food, 1, "USD"),
        ])

        expect(errors.map((error) => (error as { constraint_name?: string }).constraint_name))
          .toEqual([
            "budgets_group_category_month_key",
            "budgets_currency_check",
            "budgets_currency_check",
            "budgets_category_fkey",
          ])
      },
    )

    await t.step(
      "reads each category's latest row up to the month, so a removal ends a limit and a later set leaves the month before it",
      async () => {
        const h = await household(sql)
        await budgets.set(at(h.groupId, h.food, { month: "2026-10", amount: 40000 }), h.editor)
        await budgets.set(
          at(h.groupId, h.food, { month: "2026-12", amount: null, currency: null }),
          h.editor,
        )
        await budgets.set(at(h.groupId, h.food, { month: "2027-02", amount: 70000 }), h.editor)
        await budgets.set(at(h.groupId, h.groceries, { month: "2026-11", amount: 9000 }), h.editor)

        const limit = async (month: string) =>
          (await budgets.limitsAt(h.groupId, month)).map((row) => [
            row.categoryId,
            row.month,
            row.amount,
          ])

        expect(await limit("2026-09")).toEqual([])
        expect(await limit("2026-11")).toEqual(
          [[h.food, "2026-10", 40000], [h.groceries, "2026-11", 9000]].sort(),
        )
        expect(await limit("2027-01")).toEqual(
          [[h.food, "2026-12", null], [h.groceries, "2026-11", 9000]].sort(),
        )
        expect(await limit("2027-03")).toEqual(
          [[h.food, "2027-02", 70000], [h.groceries, "2026-11", 9000]].sort(),
        )
      },
    )

    await t.step(
      "a household's hard delete takes its budgets with its categories, but a budgeted category alone cannot go",
      async () => {
        const h = await household(sql)
        await budgets.set(at(h.groupId, h.groceries), h.editor)

        const lone = await refusal(sql`DELETE FROM categories WHERE id = ${h.groceries}`)
        await sql`DELETE FROM groups WHERE id = ${h.groupId}`

        expect(lone).toMatchObject({ constraint_name: "budgets_category_fkey" })
        expect(await sql`SELECT id FROM budgets WHERE group_id = ${h.groupId}`).toEqual([])
      },
    )

    await t.step("lists only the household's live expense categories, by name", async () => {
      const h = await household(sql)
      const old = await h.category("Archived", CategoryKind.EXPENSE)
      await h.categories.archive(
        { groupId: h.groupId, id: old, expectedVersion: 1, archived: true, allowance: null },
        h.owner,
      )

      expect(await budgets.categories(h.groupId)).toEqual([
        { id: h.food, parentId: null },
        { id: h.groceries, parentId: h.food },
      ])
    })

    await t.step(
      "shows a parent's bar against its children's limits in two currencies, converted at the month's last day, over the real ledger (R13, R15)",
      async () => {
        const h = await household(sql)
        const rates = new PostgresRateRepository(sql)
        await rates.insert(
          [
            { base: "EUR", quote: "USD", rate: "1", date: "2026-10-31", source: RATE_SOURCES.ecb },
            {
              base: "EUR",
              quote: "USD",
              rate: "1.25",
              date: "2026-11-30",
              source: RATE_SOURCES.ecb,
            },
            { base: "EUR", quote: "USD", rate: "2", date: "2026-12-05", source: RATE_SOURCES.ecb },
          ],
          new Date(),
          (_rate, problem) => {
            throw new Error(problem)
          },
        )
        const transactions = new PostgresTransactionRepository(sql)
        const account = await new PostgresAccountRepository(sql).create({
          groupId: h.groupId,
          id: uuidV7(),
          name: "Main",
          kind: AccountKind.BANK,
          currency: "USD",
          startingBalance: 0,
          allowance: null,
        }, h.owner)
        const entry = (categoryId: string, kind: TransactionKind, amount: number, date: string) =>
          transactions.create({
            groupId: h.groupId,
            id: uuidV7(),
            accountId: account.account.id,
            categoryId,
            kind,
            amount,
            currency: "USD",
            memo: "",
            date,
            allowance: null,
          }, h.owner)
        await entry(h.groceries, TransactionKind.EXPENSE, 30000, "2026-11-05")
        await entry(h.groceries, TransactionKind.INCOME, 5000, "2026-11-06")
        await entry(h.groceries, TransactionKind.EXPENSE, 99999, "2026-10-30")
        const drinks = await h.category("Drinks", CategoryKind.EXPENSE, h.food)
        await budgets.set(at(h.groupId, h.groceries, { amount: 20000, currency: "USD" }), h.editor)
        await budgets.set(at(h.groupId, drinks, { amount: 10000, currency: "EUR" }), h.editor)
        const handler = createBudgetMonthHandler({
          budgets,
          groups: {
            roleOf: async (groupId, userId) =>
              (await h.repository.getForMember(groupId, userId))?.role ?? null,
          },
          settings: { get: () => Promise.resolve({ baseCurrency: "EUR" }) },
          ledger: (groupId, currency, from, to) => transactions.ledger(groupId, currency, from, to),
          rate: async (base, quote, date) => {
            const lookup = await rates.lookup(base, quote, date)
            return lookup.found ? lookup.rate : null
          },
          now: () => new Date("2026-12-10T12:00:00Z"),
        })

        const { budgets: month } = await handler(
          new BudgetMonthQuery({
            actor: { userId: h.viewer, userMfa: UserMFAStatus.NOT_CONFIGURED } as never,
            groupId: h.groupId,
            month: "2026-11",
          }),
        )

        // The limits: 200 USD at 1.25 on 30 November, not at the later rate of 2, is 160 EUR, plus
        // 100 EUR: 260 EUR. The spending: 300 USD less the 50 refunded, each at its own day's rate
        // of 1, is 250 EUR; October's entry does not count. 250 of 260 is 96%.
        expect(month.rows.find((row) => row.categoryId === h.food)).toMatchObject({
          limit: { amount: 26000, currency: "EUR" },
          source: BudgetLimitSource.CHILDREN,
          spending: 25000,
          band: BudgetBand.ORANGE,
          percent: 96,
          leftOut: [],
        })
        expect(month.rows.find((row) => row.categoryId === h.groceries)).toMatchObject({
          limit: { amount: 20000, currency: "USD" },
          spending: 25000,
          percent: 125,
        })
      },
    )
  })
})

for (const change of ["removal", "demotion"] as const) {
  Deno.test(`budget set: refused when a ${change} commits while the set waits`, async () => {
    await withSchema(async (sql) => {
      const h = await household(sql)
      const budgets = new PostgresBudgetRepository(sql)

      const held = await holdMemberChange(sql, h.groupId, h.owner, h.editor, change)
      const outcome = budgets.set({
        groupId: h.groupId,
        categoryId: h.food,
        month: "2026-11",
        amount: 50000,
        currency: "USD",
        expectedVersion: null,
      }, h.editor).then(() => null, (error) => error)

      expect(await stillWaiting(outcome)).toBe(true)
      held.release()
      await held.committed

      const error = await outcome
      expect(error).toBeInstanceOf(BudgetError)
      expect((error as BudgetError).code).toBe(
        change === "removal" ? "GROUP_NOT_FOUND" : "ROLE_INSUFFICIENT",
      )
      expect(await sql`SELECT id FROM budgets WHERE group_id = ${h.groupId}`).toEqual([])
    })
  })
}
