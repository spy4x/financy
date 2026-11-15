/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { AccountKind, AccountTotalQuery } from "@domain/accounts"
import { type Actor, UserMFAStatus } from "@domain/identity"
import { RATE_SOURCES } from "@domain/money"
import { SecondFactorStatus } from "@spy4x/server/sign-in"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { createAccountTotalHandler } from "../../apps/api/features/accounts/handlers.ts"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresGroupRepository } from "@server/groups/postgres-group-repository.ts"
import { storeCoinPrice } from "@server/money/coin-prices.ts"
import { PostgresHouseholdSettingsRepository } from "@server/money/postgres-household-settings-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { team, withSchema } from "./group-team.ts"

/**
 * The household total with a crypto account against a real Postgres built from schema.sql: the
 * total's handler on the accounts, household settings, rates and coin prices tables. A coin is
 * valued at its stored price of today and the total names the price date (R6); a coin with no
 * price is named and never counted as 0 (R8). Needs `DB_HOST`, `DB_USER`, `DB_PASS` and `DB_NAME`
 * (recipe in docs/handoff.md); it fails when they are missing rather than skipping.
 */

const TODAY = "2026-11-06"

/** The household's total as a viewer reads it, through the handler the API registers. */
async function totalOf(sql: postgres.Sql, groupId: string, viewer: number) {
  const groups = new PostgresGroupRepository(sql)
  const handler = createAccountTotalHandler({
    accounts: new PostgresAccountRepository(sql),
    groups: {
      roleOf: async (group, user) => (await groups.getForMember(group, user))?.role ?? null,
    },
    settings: new PostgresHouseholdSettingsRepository(sql),
    rates: new PostgresRateRepository(sql),
    today: () => TODAY,
  })
  const actor: Actor = {
    userId: viewer,
    userMfa: UserMFAStatus.NOT_CONFIGURED,
    sessionSecondFactor: SecondFactorStatus.NotRequired,
  }
  const query = new AccountTotalQuery({ actor, groupId })
  return (await handler(query)).total
}

/**
 * A household in `base` with 0.5 BTC in a crypto account and 100.00 of `base` in a bank account, so
 * only the coin needs the euro's rate.
 */
async function household(sql: postgres.Sql, base = "EUR") {
  const members = await team(sql)
  const accounts = new PostgresAccountRepository(sql)
  const add = (kind: AccountKind, currency: string, startingBalance: number) =>
    accounts.create({
      groupId: members.groupId,
      id: uuidV7(),
      name: currency,
      kind,
      currency,
      startingBalance,
      allowance: null,
    }, members.owner)
  // 0.5 BTC is 50,000,000 satoshi.
  await add(AccountKind.CRYPTO, "BTC", 50_000_000)
  await add(AccountKind.BANK, base, 10_000)
  if (base !== "EUR") {
    await sql`
      INSERT INTO household_settings (group_id, base_currency) VALUES (${members.groupId}, ${base})
    `
  }
  return members
}

Deno.test("crypto total: a household in euros values 0.5 BTC at the stored price and names the price date (R6)", async () => {
  await withSchema(async (sql) => {
    const { groupId, viewer } = await household(sql)
    await storeCoinPrice(sql, { coin: "BTC", price: "60000.5", date: "2026-11-05" }, new Date())

    // 0.5 × €60,000.50 = €30,000.25, plus the bank's €100.00.
    expect(await totalOf(sql, groupId, viewer)).toEqual({
      amount: 3_000_025 + 10_000,
      currency: "EUR",
      rateDate: null,
      coinPriceDate: "2026-11-05",
      leftOut: [],
      tooLarge: false,
    })
  })
})

Deno.test("crypto total: a household in dollars crosses the coin's euro price with the euro's rate (R6)", async () => {
  await withSchema(async (sql) => {
    const { groupId, viewer } = await household(sql, "USD")
    await storeCoinPrice(sql, { coin: "BTC", price: "60000.5", date: "2026-11-05" }, new Date())
    await new PostgresRateRepository(sql).insert(
      [{ base: "EUR", quote: "USD", rate: "1.25", date: "2026-11-04", source: RATE_SOURCES.ecb }],
      new Date(),
      (_rate, problem) => {
        throw new Error(problem)
      },
    )

    // €30,000.25 × 1.25 = $37,500.3125, so 3,750,031 cents, plus the bank's $100.00. The rate
    // date is the euro leg's, which only the coin needed.
    expect(await totalOf(sql, groupId, viewer)).toEqual({
      amount: 3_750_031 + 10_000,
      currency: "USD",
      rateDate: "2026-11-04",
      coinPriceDate: "2026-11-05",
      leftOut: [],
      tooLarge: false,
    })
  })
})

Deno.test("crypto total: a coin with no stored price is left out and named, never counted as 0 (R8)", async () => {
  await withSchema(async (sql) => {
    const { groupId, viewer } = await household(sql)

    expect(await totalOf(sql, groupId, viewer)).toEqual({
      amount: 10_000,
      currency: "EUR",
      rateDate: null,
      coinPriceDate: null,
      leftOut: [{ currency: "BTC", accounts: 1 }],
      tooLarge: false,
    })
  })
})
