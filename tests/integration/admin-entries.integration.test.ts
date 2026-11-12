/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { ADMIN_ENTRIES_HOUSEHOLD_LIMIT } from "@domain/transactions"
import { readAdminEntries } from "@server/transactions/admin-entries.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { createAdminEntriesRoutes } from "../../apps/api/routes/admin/entries.ts"
import { insertUser, withSchema } from "./group-team.ts"

/**
 * The operator's entries read against a real Postgres built from schema.sql: counts by month and
 * household, deleted entries left out, the household order and limit, and no amount or memo in
 * the answer. The route's 404 for anyone below operator is in `apps/api/routes/admin/`. Needs
 * `DB_*` (recipe in docs/handoff.md); it fails when they are missing rather than skipping.
 */

const TODAY = `2026-11-13`
const MONTHS = [`2026-06`, `2026-07`, `2026-08`, `2026-09`, `2026-10`, `2026-11`]
const MEMO = `SECRET-MEMO-197`
const AMOUNT = 987654321

/** A household with one account and one category, written straight to the tables. */
async function household(sql: postgres.Sql, name: string) {
  const owner = await insertUser(sql)
  const groupId = uuidV7()
  const accountId = uuidV7()
  const categoryId = uuidV7()
  await sql`INSERT INTO groups (id, name, owner_user_id) VALUES (${groupId}, ${name}, ${owner})`
  await sql`
    INSERT INTO accounts (id, group_id, name, kind, currency, change_sequence)
    VALUES (${accountId}, ${groupId}, 'Main', 1, 'USD', 1)
  `
  await sql`
    INSERT INTO categories (id, group_id, name, kind, icon, color, change_sequence)
    VALUES (${categoryId}, ${groupId}, 'Therapy', 1, 'utensils', '#c2410c', 1)
  `
  /** Writes `count` expenses dated `date`, deleted ones when told so. */
  const entries = async (date: string, count = 1, deleted = false) => {
    await sql`
      INSERT INTO transactions (
        id, group_id, account_id, category_id, kind, account_amount, amount, currency, memo, date,
        change_sequence, created_by_user_id, deleted_at
      )
      SELECT
        uuidv7(), ${groupId}, ${accountId}, ${categoryId}, 1, ${-AMOUNT},
        ${-AMOUNT}, 'USD', ${MEMO}, ${date}::date, n, ${owner},
        CASE WHEN ${deleted}::boolean THEN now() END
      FROM generate_series(1, ${count}::int) AS n
    `
  }
  return { groupId, accountId, categoryId, owner, entries }
}

Deno.test("the operator's entries read of an empty ledger has six zero months, no household and no last entry", async () => {
  await withSchema(async (sql) => {
    await household(sql, "Quiet")

    expect(await readAdminEntries(sql, TODAY)).toEqual({
      entries: 0,
      households: 0,
      lastEntryDate: null,
      months: MONTHS.map((month) => ({ month, entries: 0, households: 0 })),
      topHouseholds: [],
    })
  })
})

Deno.test("the operator's entries read counts live entries by month and household, and carries no amount, memo or reference", async () => {
  await withSchema(async (sql) => {
    const home = await household(sql, "Home")
    await home.entries(`2026-11-05`)
    await home.entries(`2026-11-20`)
    await home.entries(`2026-09-01`, 3)
    // Deleted entries count nowhere, not even as the latest day.
    await home.entries(`2026-11-30`, 2, true)
    await home.entries(`2026-07-15`, 1, true)
    // A household whose entries all lie before the six months still shows, with zero months.
    const old = await household(sql, "Old")
    await old.entries(`2026-01-15`, 4)
    await old.entries(`2026-11-02`, 1, true)

    const overview = await readAdminEntries(sql, TODAY)

    expect(overview).toEqual({
      entries: 9,
      households: 2,
      lastEntryDate: `2026-11-20`,
      months: MONTHS.map((month) => ({
        month,
        entries: { "2026-09": 3, "2026-11": 2 }[month] ?? 0,
        households: month === `2026-09` || month === `2026-11` ? 1 : 0,
      })),
      topHouseholds: [
        {
          groupId: home.groupId,
          groupName: "Home",
          entries: 5,
          months: [0, 0, 0, 3, 0, 2],
          lastEntryDate: `2026-11-20`,
        },
        {
          groupId: old.groupId,
          groupName: "Old",
          entries: 4,
          months: [0, 0, 0, 0, 0, 0],
          lastEntryDate: `2026-01-15`,
        },
      ],
    })
    const route = createAdminEntriesRoutes({
      limit: async (_c, next) => await next(),
      read: () => readAdminEntries(sql, TODAY),
    })
    const response = await route.request(`/entries`)
    expect(response.status).toBe(200)
    const json = await response.text()
    expect(JSON.parse(json)).toEqual(overview)
    for (const text of [JSON.stringify(overview), json]) {
      expect(text).not.toContain(MEMO)
      expect(text).not.toContain(String(AMOUNT))
      expect(text).not.toContain(`USD`)
      expect(text).not.toContain(`Therapy`)
      for (const { accountId, categoryId } of [home, old]) {
        expect(text).not.toContain(accountId)
        expect(text).not.toContain(categoryId)
      }
    }
  })
})

Deno.test("the operator's entries read ranks households by entries in the six months, then in total, then by id, and stops at the limit", async () => {
  await withSchema(async (sql) => {
    const three = await household(sql, "Three")
    await three.entries(`2026-10-01`, 3)
    const threeAndOld = await household(sql, "Three and old")
    await threeAndOld.entries(`2026-06-01`, 3)
    await threeAndOld.entries(`2026-05-31`, 2)
    const twins = [await household(sql, "Twin"), await household(sql, "Twin")]
    for (const twin of twins) await twin.entries(`2026-11-13`, 2)
    // One more household than fits, each with one entry: the one with the largest id is cut.
    const ones = []
    for (let i = 0; i < ADMIN_ENTRIES_HOUSEHOLD_LIMIT - 3; i++) {
      const one = await household(sql, `One ${i}`)
      await one.entries(`2026-08-08`)
      ones.push(one.groupId)
    }
    ones.sort()
    const [lowTwin, highTwin] = twins.map((twin) => twin.groupId).sort()

    const { households, topHouseholds } = await readAdminEntries(sql, TODAY)

    expect(households).toBe(ADMIN_ENTRIES_HOUSEHOLD_LIMIT + 1)
    expect(topHouseholds.map((row) => row.groupId)).toEqual([
      threeAndOld.groupId,
      three.groupId,
      lowTwin,
      highTwin,
      ...ones.slice(0, -1),
    ])
    expect(topHouseholds[0]).toMatchObject({ entries: 5, months: [3, 0, 0, 0, 0, 0] })
  })
})
