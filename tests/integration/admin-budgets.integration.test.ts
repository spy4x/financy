/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { ADMIN_BUDGETS_HOUSEHOLD_LIMIT, BudgetMethod } from "@domain/budgets"
import { readAdminBudgets } from "@server/budgets/admin-budgets.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { createAdminBudgetsRoutes } from "../../apps/api/routes/admin/budgets.ts"
import { insertUser, withSchema } from "./group-team.ts"

/**
 * The operator's budgets read against a real Postgres built from schema.sql: which categories have
 * a limit this month under each method, the method in effect, the latest change day, the
 * household order and limit, and no amount, currency or category name in the answer. The route's
 * 404 for anyone below operator is in `apps/api/routes/admin/`. Needs `DB_*` (recipe in
 * docs/handoff.md); it fails when they are missing rather than skipping.
 */

// Not the day the test runs.
const TODAY = `2027-01-13`
const MONTH = `2027-01`
const AMOUNT = 987654321
const CURRENCY = `JPY`
const MOVED = 555444333
const NAME = `SECRET-CATEGORY-286`

/** A household whose categories, budgets and methods are written straight to the tables. */
async function household(sql: postgres.Sql, name: string) {
  const owner = await insertUser(sql)
  const groupId = uuidV7()
  await sql`INSERT INTO groups (id, name, owner_user_id) VALUES (${groupId}, ${name}, ${owner})`
  let sequence = 1
  /** Adds a category: an expense one unless told otherwise, archived when told so. */
  const category = async (options: { income?: boolean; archived?: boolean } = {}) => {
    const id = uuidV7()
    await sql`
      INSERT INTO categories (id, group_id, name, kind, icon, color, archived_at, change_sequence)
      VALUES (
        ${id}, ${groupId}, ${NAME}, ${options.income ? 2 : 1}, 'utensils', '#c2410c',
        CASE WHEN ${options.archived ?? false}::boolean THEN now() END, ${sequence++}
      )
    `
    return id
  }
  /** Writes a budget row of `month` (`YYYY-MM`), with the amount or, for `null`, without. */
  const budget = async (
    categoryId: string,
    month: string,
    amount: number | null = AMOUNT,
    updatedAt = `2026-12-01T00:00:00Z`,
  ) => {
    await sql`
      INSERT INTO budgets (
        id, group_id, category_id, month, amount, currency, change_sequence, updated_at
      ) VALUES (
        ${uuidV7()}, ${groupId}, ${categoryId}, ${`${month}-01`}::date, ${amount},
        ${amount === null ? null : CURRENCY}, ${sequence++}, ${updatedAt}::timestamptz
      )
    `
  }
  /** Writes the method of `month` (`YYYY-MM`) on. */
  const method = async (
    month: string,
    value: BudgetMethod,
    updatedAt = `2026-12-01T00:00:00Z`,
  ) => {
    await sql`
      INSERT INTO budget_methods (id, group_id, month, method, change_sequence, updated_at)
      VALUES (
        ${uuidV7()}, ${groupId}, ${`${month}-01`}::date, ${value}, ${sequence++},
        ${updatedAt}::timestamptz
      )
    `
  }
  return { groupId, owner, category, budget, method }
}

Deno.test("the operator's budgets read with no budgets counts nothing and lists no household", async () => {
  await withSchema(async (sql) => {
    const quiet = await household(sql, "Quiet")
    await quiet.category()

    expect(await readAdminBudgets(sql, TODAY)).toEqual({
      month: MONTH,
      households: 0,
      categories: 0,
      envelopeHouseholds: 0,
      topHouseholds: [],
    })
  })
})

Deno.test("the operator's budgets read under limits counts the latest row at or before the month with an amount, on live expense categories only", async () => {
  await withSchema(async (sql) => {
    const home = await household(sql, "Home")
    // No method row: the household uses monthly limits.
    const carried = await home.category()
    await home.budget(carried, `2026-10`)
    const removed = await home.category()
    await home.budget(removed, `2026-10`)
    await home.budget(removed, `2026-12`, null)
    const future = await home.category()
    await home.budget(future, `2027-02`)
    const setAgain = await home.category()
    await home.budget(setAgain, `2026-11`, null)
    await home.budget(setAgain, MONTH)
    const archived = await home.category({ archived: true })
    await home.budget(archived, MONTH)
    const income = await home.category({ income: true })
    await home.budget(income, MONTH, AMOUNT, `2027-01-05T23:30:00Z`)

    expect(await readAdminBudgets(sql, TODAY)).toEqual({
      month: MONTH,
      households: 1,
      categories: 2,
      envelopeHouseholds: 0,
      topHouseholds: [{
        groupId: home.groupId,
        groupName: "Home",
        categories: 2,
        method: BudgetMethod.LIMITS,
        lastChangeDate: `2027-01-05`,
      }],
    })
  })
})

Deno.test("the operator's budgets read under envelopes counts only the row of exactly the month with an amount", async () => {
  await withSchema(async (sql) => {
    const home = await household(sql, "Envelopes")
    await home.method(`2026-12`, BudgetMethod.ENVELOPES)
    const lastMonthOnly = await home.category()
    await home.budget(lastMonthOnly, `2026-12`)
    const thisMonth = await home.category()
    await home.budget(thisMonth, `2026-12`)
    await home.budget(thisMonth, MONTH)
    const emptied = await home.category()
    await home.budget(emptied, `2026-12`)
    await home.budget(emptied, MONTH, null)
    const archived = await home.category({ archived: true })
    await home.budget(archived, MONTH)
    // Switched back to limits this month, and to envelopes only from next month: limits now.
    const back = await household(sql, "Back")
    await back.method(`2026-11`, BudgetMethod.ENVELOPES)
    await back.method(MONTH, BudgetMethod.LIMITS)
    await back.method(`2027-02`, BudgetMethod.ENVELOPES)
    await back.budget(await back.category(), `2026-10`)

    const { categories, households, envelopeHouseholds, topHouseholds } = await readAdminBudgets(
      sql,
      TODAY,
    )

    expect({ categories, households, envelopeHouseholds }).toEqual({
      categories: 2,
      households: 2,
      envelopeHouseholds: 1,
    })
    expect(topHouseholds.find((row) => row.groupId === home.groupId)).toMatchObject({
      categories: 1,
      method: BudgetMethod.ENVELOPES,
    })
    expect(topHouseholds.find((row) => row.groupId === back.groupId)).toMatchObject({
      categories: 1,
      method: BudgetMethod.LIMITS,
    })
  })
})

Deno.test("the operator's budgets read takes the latest change day in UTC from budgets and methods, and carries no amount, currency or category", async () => {
  await withSchema(async (sql) => {
    const home = await household(sql, "Home")
    const food = await home.category()
    await home.budget(food, `2026-11`, AMOUNT, `2027-01-01T12:00:00Z`)
    // A household that only picked a method still shows, with no category, its method and day.
    const picked = await household(sql, "Picked")
    await picked.method(MONTH, BudgetMethod.ENVELOPES, `2027-01-02T10:00:00Z`)
    const other = await picked.category()
    await picked.budget(other, `2026-12`, AMOUNT, `2026-12-15T00:00:00Z`)
    await sql`
      INSERT INTO budget_moves (
        id, group_id, month, from_category_id, to_category_id, amount, currency, change_sequence
      ) VALUES (
        ${uuidV7()}, ${picked.groupId}, ${`${MONTH}-01`}::date, ${other},
        ${await picked.category()}, ${MOVED}, ${CURRENCY}, 99
      )
    `

    // A session far east of UTC: the days must still be UTC days.
    const east = await sql.reserve()
    await east`SET TIME ZONE 'Pacific/Kiritimati'`
    const overview = await readAdminBudgets(east, TODAY).finally(() => east.release())

    expect(overview).toEqual({
      month: MONTH,
      households: 1,
      categories: 1,
      envelopeHouseholds: 1,
      topHouseholds: [
        {
          groupId: home.groupId,
          groupName: "Home",
          categories: 1,
          method: BudgetMethod.LIMITS,
          lastChangeDate: `2027-01-01`,
        },
        {
          groupId: picked.groupId,
          groupName: "Picked",
          categories: 0,
          method: BudgetMethod.ENVELOPES,
          lastChangeDate: `2027-01-02`,
        },
      ],
    })
    const route = createAdminBudgetsRoutes({
      limit: async (_c, next) => await next(),
      read: () => readAdminBudgets(sql, TODAY),
    })
    const response = await route.request(`/budgets`)
    expect(response.status).toBe(200)
    const json = await response.text()
    expect(JSON.parse(json)).toEqual(overview)
    for (const text of [JSON.stringify(overview), json]) {
      expect(text).not.toContain(String(AMOUNT))
      expect(text).not.toContain(String(MOVED))
      expect(text).not.toContain(CURRENCY)
      expect(text).not.toContain(NAME)
      expect(text).not.toContain(food)
      expect(text).not.toContain(other)
    }
  })
})

Deno.test("the operator's budgets read ranks households by categories with a limit, then by id, and stops at the limit", async () => {
  await withSchema(async (sql) => {
    const two = await household(sql, "Two")
    await two.budget(await two.category(), MONTH)
    await two.budget(await two.category(), `2026-06`)
    const ones = []
    for (let i = 0; i < ADMIN_BUDGETS_HOUSEHOLD_LIMIT - 1; i++) {
      const one = await household(sql, `One ${i}`)
      await one.budget(await one.category(), MONTH)
      ones.push(one.groupId)
    }
    ones.sort()
    // The one household too many: it set a budget once, but no limit is in effect this month.
    const none = await household(sql, "None")
    const food = await none.category()
    await none.budget(food, `2026-06`)
    await none.budget(food, `2026-07`, null)

    const { households, topHouseholds } = await readAdminBudgets(sql, TODAY)

    expect(households).toBe(ADMIN_BUDGETS_HOUSEHOLD_LIMIT)
    expect(topHouseholds.map((row) => row.groupId)).toEqual([two.groupId, ...ones])
    expect(topHouseholds.map((row) => row.groupId)).not.toContain(none.groupId)
    expect(topHouseholds[0].categories).toBe(2)
  })
})
