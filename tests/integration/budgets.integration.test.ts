/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { AccountKind } from "@domain/accounts"
import {
  BudgetBand,
  BudgetError,
  BudgetLimitSource,
  BudgetMethod,
  BudgetMonthQuery,
  type BudgetMoveInput,
} from "@domain/budgets"
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
          ledgerMonths: (groupId, currency, from, to) =>
            transactions.ledgerMonths(groupId, currency, from, to),
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

/** A USD account in the household, and a way to write its entries. */
async function ledgerOf(sql: postgres.Sql, h: Awaited<ReturnType<typeof household>>) {
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
  return { transactions, entry }
}

Deno.test("budget methods and moves against Postgres", async (t) => {
  await withSchema(async (sql) => {
    const budgets = new PostgresBudgetRepository(sql)
    const moveOf = (
      h: { groupId: string; food: string; groceries: string },
      more: Partial<BudgetMoveInput> = {},
    ): BudgetMoveInput => ({
      id: uuidV7(),
      groupId: h.groupId,
      month: "2026-11",
      fromCategoryId: h.food,
      toCategoryId: h.groceries,
      amount: 5000,
      currency: "USD",
      ...more,
    })

    await t.step(
      "a switch writes its month's row at the version named, moves the sequence once per write and leaves a budget.method.set outbox row",
      async () => {
        const h = await household(sql)
        const before = await nextSequence(sql, h.groupId)

        const first = await budgets.setMethod(
          {
            groupId: h.groupId,
            month: "2026-11",
            method: BudgetMethod.ENVELOPES,
            expectedVersion: null,
          },
          h.owner,
        )
        const stale = await refusal(budgets.setMethod(
          {
            groupId: h.groupId,
            month: "2026-11",
            method: BudgetMethod.LIMITS,
            expectedVersion: null,
          },
          h.admin,
        ))
        const back = await budgets.setMethod(
          { groupId: h.groupId, month: "2026-11", method: BudgetMethod.LIMITS, expectedVersion: 1 },
          h.admin,
        )
        await budgets.setMethod(
          {
            groupId: h.groupId,
            month: "2027-01",
            method: BudgetMethod.ENVELOPES,
            expectedVersion: null,
          },
          h.owner,
        )

        expect(first).toMatchObject({
          groupId: h.groupId,
          month: "2026-11",
          method: BudgetMethod.ENVELOPES,
          version: 1,
          createdByUserId: h.owner,
          changeSequence: String(before),
        })
        expect(stale).toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 1 })
        expect(back).toMatchObject({
          id: first.id,
          method: BudgetMethod.LIMITS,
          version: 2,
          updatedByUserId: h.admin,
          changeSequence: String(before + 1n),
        })
        expectVersion7Ids([first])
        expect(await nextSequence(sql, h.groupId)).toBe(before + 3n)
        const outbox = await sql<{ eventKind: string }[]>`
          SELECT event_kind FROM outbox_events
          WHERE group_id = ${h.groupId} AND event_kind LIKE 'budget.%'
        `
        expect(outbox.map((row) => row.eventKind)).toEqual(Array(3).fill("budget.method.set"))
        expect(
          (await budgets.methodsUpTo(h.groupId, "2026-12")).map((row) => [row.month, row.method]),
        ).toEqual([["2026-11", BudgetMethod.LIMITS]])
        expect((await budgets.methodsUpTo(h.groupId, "2027-01")).map((row) => row.month)).toEqual([
          "2026-11",
          "2027-01",
        ])
      },
    )

    await t.step(
      "checks the role in the switch's transaction: an editor and a viewer cannot switch, a stranger finds no household",
      async () => {
        const h = await household(sql)
        const input = {
          groupId: h.groupId,
          month: "2026-11",
          method: BudgetMethod.ENVELOPES,
          expectedVersion: null,
        }

        const errors = await Promise.all(
          [h.editor, h.viewer, h.stranger].map((user) => refusal(budgets.setMethod(input, user))),
        )

        expect(errors.map((error) => (error as BudgetError).code)).toEqual([
          "ROLE_INSUFFICIENT",
          "ROLE_INSUFFICIENT",
          "GROUP_NOT_FOUND",
        ])
        expect(await sql`SELECT id FROM budget_methods WHERE group_id = ${h.groupId}`).toEqual([])
      },
    )

    await t.step(
      "a retried move finds its row and records one change; the id with other fields or in another household is refused",
      async () => {
        const h = await household(sql)
        const other = await household(sql)
        const before = await nextSequence(sql, h.groupId)
        const otherBefore = await nextSequence(sql, other.groupId)
        const input = moveOf(h)

        const first = await budgets.move(input, h.editor)
        const retry = await budgets.move(input, h.editor)
        const errors = await Promise.all([
          refusal(budgets.move({ ...input, amount: 6000 }, h.editor)),
          refusal(budgets.move({ ...input, month: "2026-12" }, h.editor)),
          refusal(budgets.move(moveOf(other, { id: input.id }), other.owner)),
        ])

        expect(first).toMatchObject({
          id: input.id,
          groupId: h.groupId,
          month: "2026-11",
          fromCategoryId: h.food,
          toCategoryId: h.groceries,
          amount: 5000,
          currency: "USD",
          createdByUserId: h.editor,
          changeSequence: String(before),
        })
        expect(retry).toEqual(first)
        expect(errors.map((error) => (error as BudgetError).code)).toEqual(
          Array(3).fill("ID_ALREADY_EXISTS"),
        )
        expect(await nextSequence(sql, h.groupId)).toBe(before + 1n)
        expect(await nextSequence(sql, other.groupId)).toBe(otherBefore)
        const outbox = await sql<{ eventKind: string }[]>`
          SELECT event_kind FROM outbox_events
          WHERE group_id = ${h.groupId} AND event_kind LIKE 'budget.%'
        `
        expect(outbox.map((row) => row.eventKind)).toEqual(["budget.move"])
      },
    )

    await t.step(
      "refuses a move by a viewer, or with an income, archived or another household's category (R12, R17)",
      async () => {
        const h = await household(sql)
        const other = await household(sql)
        const old = await h.category("Old", CategoryKind.EXPENSE)
        await h.categories.archive(
          { groupId: h.groupId, id: old, expectedVersion: 1, archived: true, allowance: null },
          h.owner,
        )

        const errors = await Promise.all([
          refusal(budgets.move(moveOf(h), h.viewer)),
          refusal(budgets.move(moveOf(h), h.stranger)),
          refusal(budgets.move(moveOf(h, { toCategoryId: h.salary }), h.editor)),
          refusal(budgets.move(moveOf(h, { fromCategoryId: old }), h.editor)),
          refusal(budgets.move(moveOf(h, { toCategoryId: other.food }), h.editor)),
        ])

        expect(errors.map((error) => (error as BudgetError).code)).toEqual([
          "ROLE_INSUFFICIENT",
          "GROUP_NOT_FOUND",
          "BUDGET_INCOME_CATEGORY",
          "CATEGORY_ARCHIVED",
          "CATEGORY_NOT_FOUND",
        ])
        expect(await sql`SELECT id FROM budget_moves WHERE group_id = ${h.groupId}`).toEqual([])
      },
    )

    await t.step(
      "the tables refuse a move into its own category or another household's, a second method row in a month, an unknown method and a day that is not the 1st",
      async () => {
        const h = await household(sql)
        const other = await household(sql)
        await budgets.setMethod(
          {
            groupId: h.groupId,
            month: "2026-11",
            method: BudgetMethod.ENVELOPES,
            expectedVersion: null,
          },
          h.owner,
        )
        const move = (from: string, to: string) =>
          refusal(sql`
            INSERT INTO budget_moves (
              id, group_id, month, from_category_id, to_category_id, amount, currency,
              change_sequence
            ) VALUES (${uuidV7()}, ${h.groupId}, '2026-11-01', ${from}, ${to}, 1, 'USD', 1)
          `)
        const method = (month: string, value: number) =>
          refusal(sql`
            INSERT INTO budget_methods (id, group_id, month, method, change_sequence)
            VALUES (${uuidV7()}, ${h.groupId}, ${month}::date, ${value}, 1)
          `)

        const errors = await Promise.all([
          move(h.food, h.food),
          move(h.food, other.food),
          move(other.food, h.food),
          method("2026-11-01", BudgetMethod.LIMITS),
          method("2026-12-01", 3),
          method("2026-12-02", BudgetMethod.LIMITS),
        ])

        expect(errors.map((error) => (error as { constraint_name?: string }).constraint_name))
          .toEqual([
            "budget_moves_categories_check",
            "budget_moves_to_category_fkey",
            "budget_moves_from_category_fkey",
            "budget_methods_group_month_key",
            "budget_methods_method_check",
            "budget_methods_month_check",
          ])
      },
    )

    await t.step(
      "a household's hard delete takes its methods and moves with its categories",
      async () => {
        const h = await household(sql)
        await budgets.setMethod(
          {
            groupId: h.groupId,
            month: "2026-11",
            method: BudgetMethod.ENVELOPES,
            expectedVersion: null,
          },
          h.owner,
        )
        await budgets.move(moveOf(h), h.editor)

        const lone = await refusal(sql`DELETE FROM categories WHERE id = ${h.groceries}`)
        await sql`DELETE FROM groups WHERE id = ${h.groupId}`

        expect(lone).toMatchObject({ constraint_name: "budget_moves_to_category_fkey" })
        expect(await sql`SELECT id FROM budget_moves WHERE group_id = ${h.groupId}`).toEqual([])
        expect(await sql`SELECT id FROM budget_methods WHERE group_id = ${h.groupId}`).toEqual([])
      },
    )

    await t.step(
      "reads a run of envelope months over the real ledger, moves and rates: rollover, overspending, and assignments at the rate of the month's last day or of today",
      async () => {
        const h = await household(sql)
        const rates = new PostgresRateRepository(sql)
        await rates.insert(
          [
            {
              base: "EUR",
              quote: "USD",
              rate: "1.25",
              date: "2026-11-30",
              source: RATE_SOURCES.ecb,
            },
            { base: "EUR", quote: "USD", rate: "2", date: "2026-12-05", source: RATE_SOURCES.ecb },
            { base: "EUR", quote: "USD", rate: "4", date: "2026-12-20", source: RATE_SOURCES.ecb },
          ],
          new Date(),
          (_rate, problem) => {
            throw new Error(problem)
          },
        )
        const { transactions, entry } = await ledgerOf(sql, h)
        await budgets.setMethod(
          {
            groupId: h.groupId,
            month: "2026-11",
            method: BudgetMethod.ENVELOPES,
            expectedVersion: null,
          },
          h.owner,
        )
        const at = (categoryId: string, month: string, amount: number, currency: string) => ({
          groupId: h.groupId,
          categoryId,
          month,
          amount,
          currency,
          expectedVersion: null,
        })
        await budgets.set(at(h.food, "2026-11", 30000, "USD"), h.editor)
        await budgets.set(at(h.groceries, "2026-11", 10000, "EUR"), h.editor)
        await budgets.set(at(h.food, "2026-12", 5000, "USD"), h.editor)
        await budgets.set(at(h.groceries, "2026-12", 1000, "EUR"), h.editor)
        await entry(h.salary, TransactionKind.INCOME, 100000, "2026-11-01")
        await entry(h.food, TransactionKind.EXPENSE, 1000, "2026-11-15")
        await entry(h.groceries, TransactionKind.EXPENSE, 20000, "2026-11-30")
        await entry(h.groceries, TransactionKind.EXPENSE, 3000, "2026-12-01")
        await entry(h.groceries, TransactionKind.EXPENSE, 99999, "2026-10-31")
        await budgets.move(moveOf(h), h.editor)
        const handler = createBudgetMonthHandler({
          budgets,
          groups: {
            roleOf: async (groupId, userId) =>
              (await h.repository.getForMember(groupId, userId))?.role ?? null,
          },
          settings: { get: () => Promise.resolve({ baseCurrency: "USD" }) },
          ledger: (groupId, currency, from, to) => transactions.ledger(groupId, currency, from, to),
          ledgerMonths: (groupId, currency, from, to) =>
            transactions.ledgerMonths(groupId, currency, from, to),
          rate: async (base, quote, date) => {
            const lookup = await rates.lookup(base, quote, date)
            return lookup.found ? lookup.rate : null
          },
          now: () => new Date("2026-12-10T12:00:00Z"),
        })
        const read = async (month: string) =>
          (await handler(
            new BudgetMonthQuery({
              actor: { userId: h.viewer, userMfa: UserMFAStatus.NOT_CONFIGURED } as never,
              groupId: h.groupId,
              month,
            }),
          )).budgets

        const october = await read("2026-10")
        const november = await read("2026-11")
        const december = await read("2026-12")
        const envelope = (month: typeof november, id: string) =>
          month.rows.find((row) => row.categoryId === id)?.envelope

        expect(await budgets.moveTotalsIn(h.groupId, "2026-10", "2026-12")).toEqual(
          expect.arrayContaining([
            { month: "2026-11", categoryId: h.food, currency: "USD", movedIn: 0, movedOut: 5000 },
            {
              month: "2026-11",
              categoryId: h.groceries,
              currency: "USD",
              movedIn: 5000,
              movedOut: 0,
            },
          ]),
        )
        expect(october).toMatchObject({ method: BudgetMethod.LIMITS, methodVersion: null })
        expect(october).not.toHaveProperty("readyToAssign")
        // 100 EUR assigned to Groceries at 1.25 on 30 November is 125 USD; 50 moved in, 200 spent.
        expect(envelope(november, h.groceries)).toEqual({
          assigned: 12500,
          movedIn: 5000,
          movedOut: 0,
          spent: 20000,
          available: -2500,
        })
        expect(november).toMatchObject({ method: BudgetMethod.ENVELOPES, methodVersion: 1 })
        expect(november.readyToAssign).toBe(57500)
        // December runs: its 10 EUR convert at the rate of today, 10 December, not of 20 December.
        // Groceries starts again at zero; Food's own 240 rolls over and takes December's 50.
        expect(envelope(december, h.groceries)).toMatchObject({
          assigned: 2000,
          spent: 3000,
          available: -1000,
        })
        expect(envelope(december, h.food)).toEqual({
          assigned: 7000,
          movedIn: 0,
          movedOut: 0,
          spent: 3000,
          available: 28000,
        })
        // 575 carried, 70 assigned, 25 overspent in November.
        expect(december).toMatchObject({ readyToAssign: 48000, methodVersion: null })
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

  Deno.test(`budget move: refused when a ${change} commits while the move waits`, async () => {
    await withSchema(async (sql) => {
      const h = await household(sql)
      const budgets = new PostgresBudgetRepository(sql)

      const held = await holdMemberChange(sql, h.groupId, h.owner, h.editor, change)
      const outcome = refusal(budgets.move({
        id: uuidV7(),
        groupId: h.groupId,
        month: "2026-11",
        fromCategoryId: h.food,
        toCategoryId: h.groceries,
        amount: 5000,
        currency: "USD",
      }, h.editor))

      expect(await stillWaiting(outcome)).toBe(true)
      held.release()
      await held.committed

      expect((await outcome as BudgetError).code).toBe(
        change === "removal" ? "GROUP_NOT_FOUND" : "ROLE_INSUFFICIENT",
      )
      expect(await sql`SELECT id FROM budget_moves WHERE group_id = ${h.groupId}`).toEqual([])
    })
  })

  Deno.test(`budget method: refused when an admin's ${change} commits first`, async () => {
    await withSchema(async (sql) => {
      const h = await household(sql)
      const budgets = new PostgresBudgetRepository(sql)

      const held = await holdMemberChange(sql, h.groupId, h.owner, h.admin, change)
      const outcome = refusal(budgets.setMethod({
        groupId: h.groupId,
        month: "2026-11",
        method: BudgetMethod.ENVELOPES,
        expectedVersion: null,
      }, h.admin))

      expect(await stillWaiting(outcome)).toBe(true)
      held.release()
      await held.committed

      expect((await outcome as BudgetError).code).toBe(
        change === "removal" ? "GROUP_NOT_FOUND" : "ROLE_INSUFFICIENT",
      )
      expect(await sql`SELECT id FROM budget_methods WHERE group_id = ${h.groupId}`).toEqual([])
    })
  })
}
