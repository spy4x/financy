/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import {
  AccountKind,
  AccountListQuery,
  AccountTotalQuery,
  AccountWidgetQuery,
} from "@domain/accounts"
import { type CategoryIcon, CategoryKind } from "@domain/categories"
import { type Actor, UserMFAStatus } from "@domain/identity"
import { RATE_SOURCES } from "@domain/money"
import { TransactionKind, TransactionWidgetQuery } from "@domain/transactions"
import { SecondFactorStatus } from "@spy4x/server/sign-in"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import {
  createAccountListHandler,
  createAccountTotalHandler,
  createAccountWidgetHandler,
} from "../../apps/api/features/accounts/handlers.ts"
import { createTransactionWidgetHandler } from "../../apps/api/features/transactions/handlers.ts"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { PostgresGroupRepository } from "@server/groups/postgres-group-repository.ts"
import { storeCoinPrice } from "@server/money/coin-prices.ts"
import { PostgresHouseholdSettingsRepository } from "@server/money/postgres-household-settings-repository.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { PostgresTransferRepository } from "@server/transfers/postgres-transfer-repository.ts"
import { team, withSchema } from "./group-team.ts"

/**
 * "How much do we have?" against a real Postgres built from schema.sql: the widget's balances are
 * `account.list`'s and its total is `account.total`'s for the same household, a transfer moves two
 * balances and no income, spending or net figure (R11), another household's accounts never count,
 * and a stranger is told the household does not exist. The drawing is in
 * `libs/ui/account-widgets.test.tsx`. Needs `DB_HOST`, `DB_USER`, `DB_PASS` and `DB_NAME` (recipe
 * in docs/handoff.md); it fails when they are missing rather than skipping.
 */

const TODAY = "2026-11-06"
const NOVEMBER = { from: "2026-11-01", to: "2026-11-30", timeZone: "UTC" }

Deno.test(`"How much do we have?" read against Postgres`, async (t) => {
  await withSchema(async (sql) => {
    const accounts = new PostgresAccountRepository(sql)
    const transactions = new PostgresTransactionRepository(sql)
    const transfers = new PostgresTransferRepository(sql)
    const categories = new PostgresCategoryRepository(sql)
    const groups = new PostgresGroupRepository(sql)
    const roles = {
      roleOf: async (group: string, user: number) =>
        (await groups.getForMember(group, user))?.role ?? null,
    }
    const totalDependencies = {
      accounts,
      groups: roles,
      settings: new PostgresHouseholdSettingsRepository(sql),
      rates: new PostgresRateRepository(sql),
      today: () => TODAY,
    }
    const widget = createAccountWidgetHandler(totalDependencies)
    const total = createAccountTotalHandler(totalDependencies)
    const list = createAccountListHandler({ accounts, groups: roles })
    const money = createTransactionWidgetHandler({
      transactions,
      groups: roles,
      settings: new PostgresHouseholdSettingsRepository(sql),
      now: () => new Date(`${TODAY}T12:00:00.000Z`),
    })
    // 5 November: a euro is 1.10 dollars; no rate for the lari. A bitcoin is €60,000.
    await new PostgresRateRepository(sql).insert(
      [{ base: "EUR", quote: "USD", rate: "1.1", date: "2026-11-05", source: RATE_SOURCES.ecb }],
      new Date(),
      (_rate, problem) => {
        throw new Error(problem)
      },
    )
    await storeCoinPrice(sql, { coin: "BTC", price: "60000", date: "2026-11-05" }, new Date())

    const actor = (userId: number): Actor => ({
      userId,
      userMfa: UserMFAStatus.NOT_CONFIGURED,
      sessionSecondFactor: SecondFactorStatus.NotRequired,
    })

    /** A household in euros with two euro accounts, a dollar one, a coin and a lari one. */
    async function household() {
      const members = await team(sql)
      const account = async (name: string, currency: string, startingBalance: number) =>
        (await accounts.create({
          groupId: members.groupId,
          id: uuidV7(),
          name,
          kind: currency === "BTC" ? AccountKind.CRYPTO : AccountKind.BANK,
          currency,
          startingBalance,
          allowance: null,
        }, members.owner)).account
      const main = await account("Main", "EUR", 100_00)
      const pot = await account("Pot", "EUR", 0)
      const usd = await account("Dollars", "USD", 55_00)
      // 0.5 BTC is 50,000,000 satoshi.
      const btc = await account("Wallet", "BTC", 50_000_000)
      const gel = await account("Tbilisi", "GEL", 99_00)
      const food = (await categories.create({
        groupId: members.groupId,
        id: uuidV7(),
        name: "Food",
        kind: CategoryKind.EXPENSE,
        icon: "utensils" as CategoryIcon,
        color: "#c2410c",
        parentId: null,
        allowance: null,
      }, members.owner)).category
      const asked = { groupId: members.groupId }
      const read = (userId = members.viewer) =>
        widget(new AccountWidgetQuery({ actor: actor(userId), ...asked }))
      const totalOf = async () =>
        (await total(new AccountTotalQuery({ actor: actor(members.viewer), ...asked }))).total
      const listOf = async () =>
        (await list(new AccountListQuery({ actor: actor(members.viewer), ...asked }))).accounts
      const ledger = async () =>
        (await money(
          new TransactionWidgetQuery({ actor: actor(members.viewer), ...asked, ...NOVEMBER }),
        )).current
      return { ...members, main, pot, usd, btc, gel, food, read, totalOf, listOf, ledger }
    }

    await t.step(
      "answers account.list's balances and account.total's total, with a dollar, a coin and a lari left out",
      async () => {
        const h = await household()
        await transactions.create(
          {
            groupId: h.groupId,
            id: uuidV7(),
            accountId: h.main.id,
            categoryId: h.food.id,
            kind: TransactionKind.EXPENSE,
            amount: 12_00,
            currency: "EUR",
            memo: "",
            date: "2026-11-05",
            allowance: null,
          } as Parameters<typeof transactions.create>[0],
          h.owner,
        )

        const result = await h.read()
        const listed = await h.listOf()

        expect(result.total).toEqual(await h.totalOf())
        // €88.00 + 55.00 USD at 1.1 (€50.00) + 0.5 BTC at €60,000 (€30,000.00); the lari is named.
        expect(result.total).toMatchObject({
          amount: 88_00 + 50_00 + 30_000_00,
          currency: "EUR",
          rateDate: "2026-11-05",
          coinPriceDate: "2026-11-05",
          leftOut: [{ currency: "GEL", accounts: 1 }],
          tooLarge: false,
        })
        expect(result.accounts).toEqual(listed.map((account) => ({
          id: account.id,
          name: account.name,
          kind: account.kind,
          currency: account.currency,
          balance: account.balance,
          archived: false,
        })))
        expect(result.accounts.find((account) => account.id === h.main.id)?.balance).toBe(88_00)
      },
    )

    await t.step(
      "moves two balances on a transfer and changes no income, spending or net figure (R11)",
      async () => {
        const h = await household()
        const before = await h.read()
        const ledgerBefore = await h.ledger()

        await transfers.create(
          {
            groupId: h.groupId,
            id: uuidV7(),
            fromAccountId: h.main.id,
            toAccountId: h.pot.id,
            sentAmount: 30_00,
            memo: "",
            date: "2026-11-05",
            allowance: null,
          } as Parameters<typeof transfers.create>[0],
          h.owner,
        )
        const after = await h.read()
        const ledgerAfter = await h.ledger()

        const balance = (result: typeof before, id: string) =>
          result.accounts.find((account) => account.id === id)?.balance
        expect([balance(before, h.main.id), balance(before, h.pot.id)]).toEqual([100_00, 0])
        expect([balance(after, h.main.id), balance(after, h.pot.id)]).toEqual([70_00, 30_00])
        expect(after.total).toEqual(before.total)
        expect(after.total).toEqual(await h.totalOf())
        expect([ledgerAfter.income, ledgerAfter.spending, ledgerAfter.net]).toEqual([0, 0, 0])
        expect(ledgerAfter).toEqual(ledgerBefore)
      },
    )

    await t.step("lists an archived account and keeps it in the total", async () => {
      const h = await household()
      await accounts.archive(
        {
          groupId: h.groupId,
          id: h.pot.id,
          archived: true,
          expectedVersion: h.pot.version,
        } as Parameters<typeof accounts.archive>[0],
        h.owner,
      )

      const result = await h.read()

      expect(result.accounts.find((account) => account.id === h.pot.id)?.archived).toBe(true)
      expect(result.total).toEqual(await h.totalOf())
    })

    await t.step("never lists or counts another household's accounts", async () => {
      const h = await household()
      const other = await household()
      await accounts.create({
        groupId: other.groupId,
        id: uuidV7(),
        name: "Elsewhere",
        kind: AccountKind.BANK,
        currency: "EUR",
        startingBalance: 999_999_00,
        allowance: null,
      }, other.owner)

      const result = await h.read()

      expect(result.accounts.map((account) => account.id).sort()).toEqual(
        [h.main.id, h.pot.id, h.usd.id, h.btc.id, h.gel.id].sort(),
      )
      expect(result.total.amount).toBe(100_00 + 50_00 + 30_000_00)
    })

    await t.step("tells a stranger the household does not exist", async () => {
      const h = await household()
      const refusal = await h.read(h.stranger).then(() => null, (error) => error)
      expect(refusal).toMatchObject({ code: "GROUP_NOT_FOUND" })
    })
  })
})
