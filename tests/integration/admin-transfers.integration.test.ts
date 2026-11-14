/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { ADMIN_TRANSFERS_HOUSEHOLD_LIMIT } from "@domain/transfers"
import { readAdminTransfers } from "@server/transfers/admin-transfers.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { createAdminTransfersRoutes } from "../../apps/api/routes/admin/transfers.ts"
import { insertUser, withSchema } from "./group-team.ts"

/**
 * The operator's transfers read against a real Postgres built from schema.sql: counts by month and
 * household, deleted transfers left out, the household order and limit, and no amount, memo or
 * account in the answer. The route's 404 for anyone below operator is in `apps/api/routes/admin/`.
 * Needs `DB_*` (recipe in docs/handoff.md); it fails when they are missing rather than skipping.
 */

// Not the day the test runs, and its six months cross a new year.
const TODAY = `2027-01-13`
const MONTHS = [`2026-08`, `2026-09`, `2026-10`, `2026-11`, `2026-12`, `2027-01`]
const MEMO = `SECRET-MEMO-249`
const SENT = 987654321
const RECEIVED = 123456789

/** A household with two accounts of its own, its transfers written straight to the table. */
async function household(sql: postgres.Sql, name: string) {
  const owner = await insertUser(sql)
  const groupId = uuidV7()
  const fromAccountId = uuidV7()
  const toAccountId = uuidV7()
  await sql`INSERT INTO groups (id, name, owner_user_id) VALUES (${groupId}, ${name}, ${owner})`
  await sql`
    INSERT INTO accounts (id, group_id, name, kind, currency, change_sequence) VALUES
      (${fromAccountId}, ${groupId}, 'Checking', 1, 'USD', 1),
      (${toAccountId}, ${groupId}, 'Savings', 1, 'EUR', 2)
  `
  /** Writes `count` transfers dated `date`, deleted ones when told so. */
  const transfers = async (date: string, count = 1, deleted = false) => {
    await sql`
      INSERT INTO transfers (
        id, group_id, from_account_id, to_account_id, sent_amount, received_amount, converted,
        memo, date, change_sequence, created_by_user_id, deleted_at
      )
      SELECT
        uuidv7(), ${groupId}, ${fromAccountId}, ${toAccountId}, ${SENT}, ${RECEIVED}, true,
        ${MEMO}, ${date}::date, n, ${owner}, CASE WHEN ${deleted}::boolean THEN now() END
      FROM generate_series(1, ${count}::int) AS n
    `
  }
  return { groupId, fromAccountId, toAccountId, owner, transfers }
}

Deno.test("the operator's transfers read with no transfers has six zero months, no household and no last transfer", async () => {
  await withSchema(async (sql) => {
    await household(sql, "Quiet")

    expect(await readAdminTransfers(sql, TODAY)).toEqual({
      transfers: 0,
      households: 0,
      lastTransferDate: null,
      months: MONTHS.map((month) => ({ month, transfers: 0, households: 0 })),
      topHouseholds: [],
    })
  })
})

Deno.test("the operator's transfers read counts live transfers by month and household, and carries no amount, memo or account", async () => {
  await withSchema(async (sql) => {
    const home = await household(sql, "Home")
    await home.transfers(`2027-01-05`)
    await home.transfers(`2027-01-10`)
    await home.transfers(`2026-10-01`, 3)
    // Deleted transfers count nowhere, not even as the latest day.
    await home.transfers(`2027-01-12`, 2, true)
    await home.transfers(`2026-09-15`, 1, true)
    // A household whose transfers all lie before the six months still shows, with zero months.
    const old = await household(sql, "Old")
    await old.transfers(`2026-03-15`, 3)
    await old.transfers(`2026-07-31`)
    await old.transfers(`2027-01-02`, 1, true)

    const overview = await readAdminTransfers(sql, TODAY)

    expect(overview).toEqual({
      transfers: 9,
      households: 2,
      lastTransferDate: `2027-01-10`,
      months: MONTHS.map((month) => ({
        month,
        transfers: { "2026-10": 3, "2027-01": 2 }[month] ?? 0,
        households: month === `2026-10` || month === `2027-01` ? 1 : 0,
      })),
      topHouseholds: [
        {
          groupId: home.groupId,
          groupName: "Home",
          transfers: 5,
          months: [0, 0, 3, 0, 0, 2],
          lastTransferDate: `2027-01-10`,
        },
        {
          groupId: old.groupId,
          groupName: "Old",
          transfers: 4,
          months: [0, 0, 0, 0, 0, 0],
          lastTransferDate: `2026-07-31`,
        },
      ],
    })
    const route = createAdminTransfersRoutes({
      limit: async (_c, next) => await next(),
      read: () => readAdminTransfers(sql, TODAY),
    })
    const response = await route.request(`/transfers`)
    expect(response.status).toBe(200)
    const json = await response.text()
    expect(JSON.parse(json)).toEqual(overview)
    for (const text of [JSON.stringify(overview), json]) {
      expect(text).not.toContain(MEMO)
      expect(text).not.toContain(String(SENT))
      expect(text).not.toContain(String(RECEIVED))
      expect(text).not.toContain(`USD`)
      expect(text).not.toContain(`Savings`)
      for (const { fromAccountId, toAccountId } of [home, old]) {
        expect(text).not.toContain(fromAccountId)
        expect(text).not.toContain(toAccountId)
      }
    }
  })
})

Deno.test("the operator's transfers read ranks households by transfers in the six months, then in total, then by id, and stops at the limit", async () => {
  await withSchema(async (sql) => {
    const three = await household(sql, "Three")
    await three.transfers(`2026-12-01`, 3)
    // The first day of the six months is in; the day before is not.
    const threeAndOld = await household(sql, "Three and old")
    await threeAndOld.transfers(`2026-08-01`, 3)
    await threeAndOld.transfers(`2026-07-31`, 2)
    const twins = [await household(sql, "Twin"), await household(sql, "Twin")]
    for (const twin of twins) await twin.transfers(`2027-01-13`, 2)
    const ones = []
    for (let i = 0; i < ADMIN_TRANSFERS_HOUSEHOLD_LIMIT - 4; i++) {
      const one = await household(sql, `One ${i}`)
      await one.transfers(`2026-10-08`)
      ones.push(one.groupId)
    }
    ones.sort()
    // The one household too many: more transfers in total than most, none in the six months.
    const old = await household(sql, "Old")
    await old.transfers(`2026-01-01`, 4)
    const [lowTwin, highTwin] = twins.map((twin) => twin.groupId).sort()

    const { households, topHouseholds } = await readAdminTransfers(sql, TODAY)

    expect(households).toBe(ADMIN_TRANSFERS_HOUSEHOLD_LIMIT + 1)
    expect(topHouseholds.map((row) => row.groupId)).toEqual([
      threeAndOld.groupId,
      three.groupId,
      lowTwin,
      highTwin,
      ...ones,
    ])
    expect(topHouseholds.map((row) => row.groupId)).not.toContain(old.groupId)
    expect(topHouseholds[0]).toMatchObject({ transfers: 5, months: [3, 0, 0, 0, 0, 0] })
  })
})
