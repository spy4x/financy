/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { ADMIN_RECURRING_HOUSEHOLD_LIMIT, RecurringPauseReason } from "@domain/recurring"
import { readAdminRecurring } from "@server/recurring/admin-recurring.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { createAdminRecurringRoutes } from "../../apps/api/routes/admin/recurring.ts"
import { insertUser, withSchema } from "./group-team.ts"

/**
 * The operator's repeating entries read against a real Postgres built from schema.sql: live and
 * deleted rules, paused rules, entries rules made (live or deleted, of a live or a deleted rule)
 * next to manual ones, the latest change day in UTC, the household order and limit, and no
 * amount, currency, memo, schedule, account or category name in the answer. The route's 404 for
 * anyone below operator is in `apps/api/routes/admin/`. Needs `DB_*` (recipe in docs/handoff.md);
 * it fails when they are missing rather than skipping.
 */

const AMOUNT = 987654321
const ACCOUNT_AMOUNT = 876543219
const CURRENCY = `JPY`
const MEMO = `SECRET-MEMO-363`
const RRULE = `FREQ=WEEKLY;INTERVAL=3;BYDAY=TU`
const ACCOUNT = `SECRET-ACCOUNT-363`
const CATEGORY = `SECRET-CATEGORY-363`

/** A household with one account and one category, its rules and entries written to the tables. */
async function household(sql: postgres.Sql, name: string) {
  const owner = await insertUser(sql)
  const groupId = uuidV7()
  const accountId = uuidV7()
  const categoryId = uuidV7()
  await sql`INSERT INTO groups (id, name, owner_user_id) VALUES (${groupId}, ${name}, ${owner})`
  await sql`
    INSERT INTO accounts (id, group_id, name, kind, currency, change_sequence)
    VALUES (${accountId}, ${groupId}, ${ACCOUNT}, 1, ${CURRENCY}, 1)
  `
  await sql`
    INSERT INTO categories (id, group_id, name, kind, icon, color, change_sequence)
    VALUES (${categoryId}, ${groupId}, ${CATEGORY}, 1, 'utensils', '#c2410c', 1)
  `
  let sequence = 1
  /** Adds a rule: live and making entries unless told otherwise. */
  const rule = async (
    options: { paused?: boolean; deletedAt?: string; updatedAt?: string } = {},
  ) => {
    const id = uuidV7()
    await sql`
      INSERT INTO recurring_rules (
        id, group_id, account_id, category_id, kind, amount, account_amount, currency, memo,
        rrule, start_date, paused_reason, change_sequence, updated_at, deleted_at
      ) VALUES (
        ${id}, ${groupId}, ${accountId}, ${categoryId}, 1, ${AMOUNT}, ${ACCOUNT_AMOUNT},
        ${CURRENCY}, ${MEMO}, ${RRULE}, '2026-01-06',
        ${options.paused ? RecurringPauseReason.CATEGORY_ARCHIVED : null}, ${sequence++},
        ${options.updatedAt ?? `2026-12-01T00:00:00Z`}::timestamptz,
        ${options.deletedAt ?? null}::timestamptz
      )
    `
    return id
  }
  /** Writes an expense on `date`: made by `ruleId` when given, else typed in; deleted when told. */
  const entry = async (date: string, ruleId: string | null = null, deleted = false) => {
    await sql`
      INSERT INTO transactions (
        id, group_id, account_id, category_id, kind, account_amount, amount, currency, memo, date,
        change_sequence, created_by_user_id, deleted_at, recurring_rule_id, occurrence_date
      ) VALUES (
        ${uuidV7()}, ${groupId}, ${accountId}, ${categoryId}, 1, ${-ACCOUNT_AMOUNT}, ${-AMOUNT},
        ${CURRENCY}, ${MEMO}, ${date}::date, ${sequence++}, ${owner},
        CASE WHEN ${deleted}::boolean THEN now() END,
        ${ruleId}, CASE WHEN ${ruleId}::uuid IS NOT NULL THEN ${date}::date END
      )
    `
  }
  return { groupId, rule, entry }
}

Deno.test("the operator's repeating entries read with no rules counts nothing and lists no household", async () => {
  await withSchema(async (sql) => {
    const quiet = await household(sql, "Quiet")
    await quiet.entry(`2026-12-01`)

    expect(await readAdminRecurring(sql)).toEqual({
      households: 0,
      rules: 0,
      paused: 0,
      made: 0,
      topHouseholds: [],
    })
  })
})

Deno.test("the operator's repeating entries read counts live rules, paused ones and live entries rules made, per household", async () => {
  await withSchema(async (sql) => {
    const home = await household(sql, "Home")
    const weekly = await home.rule()
    await home.rule({ paused: true })
    await home.rule()
    // A deleted rule counts as no rule, and a paused deleted one as nothing paused, but the live
    // entry it made still counts as made.
    const deleted = await home.rule({ paused: true, deletedAt: `2026-12-02T00:00:00Z` })
    await home.entry(`2026-12-01`, weekly)
    await home.entry(`2026-12-08`, weekly)
    // A deleted entry counts nowhere, and a typed-in one is not made by a rule.
    await home.entry(`2026-12-15`, weekly, true)
    await home.entry(`2026-12-16`)
    await home.entry(`2026-11-24`, deleted)
    // Another household's rule and entry count for it alone.
    const other = await household(sql, "Other")
    await other.entry(`2026-12-03`, await other.rule())
    // A household whose only rule is deleted is listed with no live rule, and not counted.
    const gone = await household(sql, "Gone")
    await gone.rule({ deletedAt: `2026-12-04T00:00:00Z` })

    const overview = await readAdminRecurring(sql)

    expect({ ...overview, topHouseholds: undefined }).toEqual({
      households: 2,
      rules: 4,
      paused: 1,
      made: 4,
      topHouseholds: undefined,
    })
    const row = (groupId: string) => overview.topHouseholds.find((row) => row.groupId === groupId)
    expect(row(home.groupId)).toMatchObject({ groupName: "Home", rules: 3, paused: 1, made: 3 })
    expect(row(other.groupId)).toMatchObject({ groupName: "Other", rules: 1, paused: 0, made: 1 })
    expect(row(gone.groupId)).toMatchObject({ groupName: "Gone", rules: 0, paused: 0, made: 0 })
  })
})

Deno.test("the operator's repeating entries read takes the latest change day in UTC, a delete included", async () => {
  await withSchema(async (sql) => {
    const home = await household(sql, "Home")
    await home.rule({ updatedAt: `2026-12-01T12:00:00Z` })
    await home.rule({ updatedAt: `2026-12-05T23:30:00Z` })
    const deletedLater = await household(sql, "Deleted later")
    await deletedLater.rule({ updatedAt: `2026-12-01T00:00:00Z` })
    await deletedLater.rule({
      updatedAt: `2026-11-01T00:00:00Z`,
      deletedAt: `2026-12-09T22:00:00Z`,
    })

    // A session far east of UTC: the days must still be UTC days.
    const east = await sql.reserve()
    await east`SET TIME ZONE 'Pacific/Kiritimati'`
    const { topHouseholds } = await readAdminRecurring(east).finally(() => east.release())

    const day = (groupId: string) =>
      topHouseholds.find((row) => row.groupId === groupId)?.lastChangeDate
    expect(day(home.groupId)).toBe(`2026-12-05`)
    expect(day(deletedLater.groupId)).toBe(`2026-12-09`)
  })
})

Deno.test("the operator's repeating entries API answers counts and days only: no amount, currency, memo, schedule, account or category", async () => {
  await withSchema(async (sql) => {
    const home = await household(sql, "Home")
    const rule = await home.rule()
    await home.rule({ paused: true })
    await home.entry(`2026-12-01`, rule)
    await home.entry(`2026-12-02`)

    const route = createAdminRecurringRoutes({
      limit: async (_c, next) => await next(),
      read: () => readAdminRecurring(sql),
    })
    const response = await route.request(`/recurring`)
    expect(response.status).toBe(200)
    const json = await response.text()

    expect(JSON.parse(json)).toEqual({
      households: 1,
      rules: 2,
      paused: 1,
      made: 1,
      topHouseholds: [{
        groupId: home.groupId,
        groupName: "Home",
        rules: 2,
        paused: 1,
        made: 1,
        lastChangeDate: `2026-12-01`,
      }],
    })
    for (
      const secret of [
        String(AMOUNT),
        String(ACCOUNT_AMOUNT),
        CURRENCY,
        MEMO,
        RRULE,
        `FREQ`,
        ACCOUNT,
        CATEGORY,
        rule,
      ]
    ) {
      expect(json).not.toContain(secret)
    }
  })
})

Deno.test("the operator's repeating entries read ranks households by live rules, then by id, and stops at the limit", async () => {
  await withSchema(async (sql) => {
    // Ids grow in the order the households are made, so an order by id alone would put the one
    // household too many first and the one with the most rules last.
    // The one household too many: its only rule is deleted, so it has the fewest live rules.
    const none = await household(sql, "None")
    await none.rule({ deletedAt: `2026-12-02T00:00:00Z` })
    const ones = []
    for (let i = 0; i < ADMIN_RECURRING_HOUSEHOLD_LIMIT - 1; i++) {
      const one = await household(sql, `One ${i}`)
      await one.rule()
      ones.push(one.groupId)
    }
    ones.sort()
    const two = await household(sql, "Two")
    await two.rule()
    await two.rule()

    const { households, topHouseholds } = await readAdminRecurring(sql)

    expect(households).toBe(ADMIN_RECURRING_HOUSEHOLD_LIMIT)
    expect(topHouseholds.map((row) => row.groupId)).toEqual([two.groupId, ...ones])
    expect(topHouseholds.map((row) => row.groupId)).not.toContain(none.groupId)
    expect(topHouseholds[0].rules).toBe(2)
  })
})
