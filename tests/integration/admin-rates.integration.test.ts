/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { RATE_SOURCES } from "@domain/money"
import { JOB_AGGREGATE } from "@server/jobs/jobs.ts"
import { RATES_FETCH_JOB } from "@server/jobs/exchange-rates.ts"
import { readAdminRates } from "@server/money/admin-rates.ts"
import { PostgresHouseholdSettingsRepository } from "@server/money/postgres-household-settings-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { team, withSchema } from "./group-team.ts"

/**
 * The admin's Exchange rates page against a real Postgres built from schema.sql: an empty server,
 * the daily job's last run, the currencies in use with no rate on the latest ECB day, the
 * fallback's calls against its cap, and the last 7 days with the weekend left empty. Needs
 * "DB_HOST", "DB_USER", "DB_PASS" and "DB_NAME" (recipe in docs/handoff.md); it fails when they
 * are missing.
 */

/** A Monday: the 7 days back to Tuesday 2026-10-27 hold a weekend. */
const MONDAY = new Date(`2026-11-02T10:00:00Z`)
const FETCHED = new Date(`2026-10-30T16:02:00Z`)

const DAYS = [
  `2026-11-02`,
  `2026-11-01`,
  `2026-10-31`,
  `2026-10-30`,
  `2026-10-29`,
  `2026-10-28`,
  `2026-10-27`,
]

async function store(sql: postgres.Sql, quote: string, date: string, source: string) {
  await new PostgresRateRepository(sql).insert(
    [{ base: `EUR`, quote, rate: `1.5`, date, source }],
    FETCHED,
    () => {
      throw new Error(`a test rate was refused`)
    },
  )
}

Deno.test("admin rates: a server with no rates and no fallback shows seven empty days", async () => {
  await withSchema(async (sql) => {
    expect(await readAdminRates(sql, MONDAY, null)).toEqual({
      lastRun: null,
      fetches: [],
      missing: { date: `2026-11-02`, currencies: [] },
      fallback: null,
      days: DAYS.map((date) => ({ date, rows: [] })),
    })
  })
})

Deno.test("admin rates: the page shows the last run, each source's fetch, the currency with no rate and the fallback's calls", async () => {
  await withSchema(async (sql) => {
    const { groupId, admin } = await team(sql)
    await new PostgresHouseholdSettingsRepository(sql).update(
      { groupId, baseCurrency: `VND`, expectedVersion: 0 },
      admin,
    )
    await store(sql, `USD`, `2026-10-29`, RATE_SOURCES.ecb)
    await store(sql, `USD`, `2026-10-30`, RATE_SOURCES.ecb)
    await store(sql, `GBP`, `2026-10-30`, RATE_SOURCES.ecb)
    // The fallback had VND on Thursday only: Friday, the latest ECB day, has none.
    await store(sql, `VND`, `2026-10-29`, RATE_SOURCES.fallback)
    const rates = new PostgresRateRepository(sql)
    await rates.reserveCall(RATE_SOURCES.fallback, `2026-11-01`, 10)
    await rates.reserveCall(RATE_SOURCES.fallback, `2026-11-01`, 10)
    await rates.reserveCall(RATE_SOURCES.fallback, `2026-10-01`, 10)
    await sql`
      INSERT INTO outbox_events
        (id, event_kind, aggregate_type, aggregate_id, aggregate_version, processed_at,
          last_error_code)
      VALUES
        (${uuidV7()}, ${RATES_FETCH_JOB}, ${JOB_AGGREGATE}, ${uuidV7()}, 1, ${FETCHED}, NULL),
        (${uuidV7()}, ${RATES_FETCH_JOB}, ${JOB_AGGREGATE}, ${uuidV7()}, 1,
          ${new Date(`2026-11-01T16:00:00Z`)}, 'RatesFetchError')
    `

    const page = await readAdminRates(sql, MONDAY, 10)
    expect(page.lastRun).toEqual({ at: `2026-11-01T16:00:00.000Z`, failed: true })
    expect(page.fetches.toSorted((a, b) => a.source.localeCompare(b.source))).toEqual([
      { source: RATE_SOURCES.fallback, fetchedAt: FETCHED.toISOString(), count: 1 },
      { source: RATE_SOURCES.ecb, fetchedAt: FETCHED.toISOString(), count: 3 },
    ])
    expect(page.missing).toEqual({ date: `2026-10-30`, currencies: [`VND`] })
    expect(page.fallback).toEqual({ used: 2, cap: 10, resetsOn: `2026-12-01` })
    expect(page.days.map((day) => [day.date, day.rows.map((row) => row.currencies)])).toEqual([
      [`2026-11-02`, []],
      [`2026-11-01`, []],
      [`2026-10-31`, []],
      [`2026-10-30`, [2]],
      [`2026-10-29`, [1, 1]],
      [`2026-10-28`, []],
      [`2026-10-27`, []],
    ])
    expect(page.days[4].rows.map((row) => row.source).toSorted()).toEqual(
      [RATE_SOURCES.ecb, RATE_SOURCES.fallback].toSorted(),
    )
  })
})
