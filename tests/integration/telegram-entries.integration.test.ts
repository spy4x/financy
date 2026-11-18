/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import {
  AccountGetQuery,
  AccountKind,
  AccountListQuery,
  AccountWidgetQuery,
} from "@domain/accounts"
import { type CategoryIcon, CategoryKind } from "@domain/categories"
import { CategoryGetQuery, CategoryListQuery } from "@domain/categories"
import { GroupGetQuery, GroupListQuery, GroupSelectedQuery } from "@domain/groups"
import { DEFAULT_PREFERENCES, UserMFAStatus } from "@domain/identity"
import { defaultHouseholdSettings } from "@domain/money"
import {
  TransactionCreateCommand,
  TransactionKind,
  TransactionLatestQuery,
  TransactionLedgerQuery,
} from "@domain/transactions"
import { TransferCreateCommand } from "@domain/transfers"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { PostgresGroupRepository } from "@server/groups/postgres-group-repository.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { PostgresTransferRepository } from "@server/transfers/postgres-transfer-repository.ts"
import { createSessionGate } from "../../apps/api/cqrs/session-gate.ts"
import { createEntitlementGate } from "../../apps/api/cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../apps/api/cqrs/entitlement-needs.ts"
import { testUsage } from "../../libs/domain/billing/test-plans.ts"
import { PreferencesGetQuery } from "../../apps/api/cqrs/queries.ts"
import {
  createAccountGetHandler,
  createAccountListHandler,
  createAccountWidgetHandler,
} from "../../apps/api/features/accounts/handlers.ts"
import {
  createCategoryGetHandler,
  createCategoryListHandler,
} from "../../apps/api/features/categories/handlers.ts"
import {
  createTransactionCreateHandler,
  createTransactionLatestHandler,
  createTransactionLedgerHandler,
} from "../../apps/api/features/transactions/handlers.ts"
import { createTransferCreateHandler } from "../../apps/api/features/transfers/handlers.ts"
import { createSeedBot, type TelegramLinkService } from "../../apps/api/telegram/bot.ts"
import { createTelegramProduct } from "../../apps/api/telegram/commands.ts"
import {
  callbackUpdate,
  fakeTelegram,
  TELEGRAM_USER_ID,
  textUpdate,
} from "../../apps/api/telegram/fake-telegram.ts"
import { team, withSchema } from "./group-team.ts"

/**
 * `/expense` over the real Postgres repositories: the bot's entry leaves the same
 * `transaction.created` outbox row as the app's, which is what reaches the other members' screens
 * and pushes, and the latest-entry read the bot's defaults come from. `/month` stays the same when
 * money moves between accounts, and `/transfer` across currencies stores both amounts and moves
 * both balances. The bot's branches are in `apps/api/telegram/entries.test.ts`,
 * `apps/api/telegram/transfers.test.ts` and `apps/api/telegram/reads.test.ts`. Needs `DB_HOST`,
 * `DB_USER`, `DB_PASS` and `DB_NAME` (recipe in docs/handoff.md); it fails when they are missing
 * rather than skipping.
 */

Deno.test("Telegram entries against Postgres", async (t) => {
  await withSchema(async (sql) => {
    const accounts = new PostgresAccountRepository(sql)
    const categories = new PostgresCategoryRepository(sql)
    const transactions = new PostgresTransactionRepository(sql)
    const groupRepository = new PostgresGroupRepository(sql)
    const roleOf = async (groupId: string, userId: number) =>
      (await groupRepository.getForMember(groupId, userId))?.role ?? null
    const groups = { roleOf }
    const members = await team(sql)
    const account = (await accounts.create({
      groupId: members.groupId,
      id: uuidV7(),
      name: "Main",
      kind: AccountKind.BANK,
      currency: "USD",
      startingBalance: 0,
      allowance: null,
    }, members.owner)).account
    const category = async (name: string, kind: CategoryKind) =>
      (await categories.create({
        groupId: members.groupId,
        id: uuidV7(),
        name,
        kind,
        icon: "utensils" as CategoryIcon,
        color: "#c2410c",
        parentId: null,
        allowance: null,
      }, members.owner)).category.id
    const food = await category("Food", CategoryKind.EXPENSE)
    const salary = await category("Salary", CategoryKind.INCOME)
    const entry = async (actor: number, kind = TransactionKind.EXPENSE, categoryId = food) =>
      (await transactions.create({
        groupId: members.groupId,
        id: uuidV7(),
        accountId: account.id,
        categoryId,
        kind,
        amount: 100,
        currency: "USD",
        memo: "",
        date: "2026-11-05",
        allowance: null,
      }, actor)).transaction

    await t.step("the latest entry is the person's own newest live one of the kind", async () => {
      const older = await entry(members.editor)
      const newest = await entry(members.editor)
      await entry(members.editor, TransactionKind.INCOME, salary)
      await entry(members.owner)
      const deleted = await entry(members.editor)
      await sql`UPDATE transactions SET deleted_at = now() WHERE id = ${deleted.id}`

      const latest = await transactions.latest(
        members.groupId,
        members.editor,
        TransactionKind.EXPENSE,
      )

      expect(latest?.id).toBe(newest.id)
      expect(latest?.id).not.toBe(older.id)
      expect(await transactions.latest(members.groupId, members.viewer, TransactionKind.EXPENSE))
        .toBeNull()
    })

    await t.step(
      "the bot's /expense leaves the same transaction.created row as the app",
      async () => {
        const dependencies = { transactions, groups, now: () => new Date() }
        const commandBus = new CommandBus()
        commandBus.use(createSessionGate([]))
        commandBus.use(createEntitlementGate({
          billingEnabled: false,
          planOf: () => Promise.reject(new Error("billing is off")),
          roleOf,
          usage: testUsage(),
        }, ENTITLEMENT_NEEDS))
        commandBus.register(TransactionCreateCommand, createTransactionCreateHandler(dependencies))
        const queryBus = new QueryBus()
        queryBus.use(createSessionGate([]))
        queryBus.register(AccountListQuery, createAccountListHandler({ accounts, groups }))
        queryBus.register(AccountGetQuery, createAccountGetHandler({ accounts, groups }))
        queryBus.register(CategoryListQuery, createCategoryListHandler({ categories, groups }))
        queryBus.register(CategoryGetQuery, createCategoryGetHandler({ categories, groups }))
        queryBus.register(TransactionLatestQuery, createTransactionLatestHandler(dependencies))
        queryBus.register(
          GroupSelectedQuery,
          () => Promise.resolve({ groupId: members.groupId, version: 1 }),
        )
        queryBus.register(
          GroupListQuery,
          () => Promise.reject(new Error("a chosen household needs no list")),
        )
        queryBus.register(
          PreferencesGetQuery,
          () => Promise.resolve({ version: 1, value: DEFAULT_PREFERENCES }) as never,
        )
        const links: TelegramLinkService = {
          account: (telegramUserId) =>
            Promise.resolve(
              telegramUserId === TELEGRAM_USER_ID
                ? { userId: members.editor, firstName: "", mfa: UserMFAStatus.NOT_CONFIGURED }
                : null,
            ),
          prepare: () => Promise.resolve(null),
          spend: () => Promise.resolve(),
          link: () => Promise.resolve("stale"),
          unlink: () => Promise.resolve(false),
        }
        const values = new Map<string, string>()
        const store = {
          get: (key: string) => Promise.resolve(values.get(key) ?? null),
          set: (key: string, value: string) => (values.set(key, value), Promise.resolve()),
          del: (key: string) => (values.delete(key), Promise.resolve()),
        }
        const telegram = fakeTelegram()
        const bot = createSeedBot({
          client: telegram.client,
          username: "financy_bot",
          store,
          webAppUrl: "https://app.example.com",
          links,
          product: createTelegramProduct({ queryBus, commandBus, store }),
        })
        const app = await entry(members.editor)

        await bot.handleUpdate(textUpdate("/expense 12.50", { from: TELEGRAM_USER_ID }))

        // The outbox row names the household and its change sequence, which the entry keeps.
        const [saved] = await sql<{ id: string; amount: string; sequence: string }[]>`
          SELECT id, amount::text, change_sequence::text AS sequence FROM transactions
          WHERE group_id = ${members.groupId} AND created_by_user_id = ${members.editor}
          ORDER BY created_at DESC, id DESC LIMIT 1
        `
        expect(saved.id).not.toBe(app.id)
        expect(saved.amount).toBe("-1250")
        expect(telegram.sent().at(-1)).toContain("Saved.")
        const rows = await sql<{ sequence: string; row: string }[]>`
          SELECT aggregate_version::text AS sequence,
            concat_ws(' ', event_kind, aggregate_type, aggregate_id, actor_user_id) AS row
          FROM outbox_events
          WHERE group_id = ${members.groupId}
            AND aggregate_version IN (${app.changeSequence}::bigint, ${saved.sequence}::bigint)
          ORDER BY aggregate_version
        `
        expect(rows.map(({ sequence }) => sequence)).toEqual([app.changeSequence, saved.sequence])
        expect(rows[1].row).toBe(rows[0].row)
        expect(rows[1].row).toMatch(/^transaction\.created /)
      },
    )

    await t.step("the bot's /month does not move when money is transferred", async () => {
      const savings = (await accounts.create({
        groupId: members.groupId,
        id: uuidV7(),
        name: "Savings",
        kind: AccountKind.BANK,
        currency: "USD",
        startingBalance: 0,
        allowance: null,
      }, members.owner)).account
      const now = () => new Date("2026-11-20T12:00:00.000Z")
      const queryBus = new QueryBus()
      queryBus.use(createSessionGate([]))
      queryBus.register(
        TransactionLedgerQuery,
        createTransactionLedgerHandler({
          transactions,
          groups,
          now,
          settings: {
            get: (groupId) =>
              Promise.resolve({ ...defaultHouseholdSettings(groupId), baseCurrency: "USD" }),
          },
        }),
      )
      queryBus.register(CategoryListQuery, createCategoryListHandler({ categories, groups }))
      queryBus.register(
        GroupSelectedQuery,
        () => Promise.resolve({ groupId: members.groupId, version: 1 }),
      )
      queryBus.register(
        GroupGetQuery,
        ({ data }) =>
          Promise.resolve({
            group: { id: data.groupId, name: "Home", timeZone: "UTC" },
          }) as never,
      )
      queryBus.register(
        PreferencesGetQuery,
        () => Promise.resolve({ version: 1, value: DEFAULT_PREFERENCES }) as never,
      )
      const telegram = fakeTelegram()
      const values = new Map<string, string>()
      const bot = createSeedBot({
        client: telegram.client,
        username: "financy_bot",
        store: {
          get: (key) => Promise.resolve(values.get(key) ?? null),
          set: (key, value) => (values.set(key, value), Promise.resolve()),
          del: (key) => (values.delete(key), Promise.resolve()),
        },
        webAppUrl: "https://app.example.com",
        links: {
          account: () =>
            Promise.resolve({
              userId: members.editor,
              firstName: "",
              mfa: UserMFAStatus.NOT_CONFIGURED,
            }),
          prepare: () => Promise.resolve(null),
          spend: () => Promise.resolve(),
          link: () => Promise.resolve("stale"),
          unlink: () => Promise.resolve(false),
        },
        product: createTelegramProduct({
          queryBus,
          commandBus: new CommandBus(),
          store: { get: () => Promise.resolve(null), set: async () => {}, del: async () => {} },
          now,
        }),
      })
      const month = async () => {
        await bot.handleUpdate(textUpdate("/month", { from: TELEGRAM_USER_ID }))
        return telegram.sent().at(-1) as string
      }
      const before = await month()

      await new PostgresTransferRepository(sql).create(
        {
          groupId: members.groupId,
          id: uuidV7(),
          fromAccountId: account.id,
          toAccountId: savings.id,
          sentAmount: 7_700,
          memo: "",
          date: "2026-11-06",
          allowance: null,
        } as Parameters<PostgresTransferRepository["create"]>[0],
        members.owner,
      )

      expect(before).toContain("Spending:")
      expect(await month()).toBe(before)
    })

    await t.step(
      "the bot's /transfer across currencies stores both amounts, moves both balances and leaves /month alone",
      async () => {
        const open = async (name: string, currency: string) =>
          (await accounts.create({
            groupId: members.groupId,
            id: uuidV7(),
            name,
            kind: AccountKind.BANK,
            currency,
            startingBalance: 100_000,
            allowance: null,
          }, members.owner)).account
        const dollars = await open("Dollars", "USD")
        const yen = await open("Yen", "JPY")
        // A past day: an account's balance counts only what is dated up to the real today.
        const now = () => new Date("2026-11-06T12:00:00.000Z")
        const settings = {
          get: (groupId: string) =>
            Promise.resolve({ ...defaultHouseholdSettings(groupId), baseCurrency: "USD" }),
        }
        const commandBus = new CommandBus()
        commandBus.use(createSessionGate([]))
        commandBus.use(createEntitlementGate({
          billingEnabled: false,
          planOf: () => Promise.reject(new Error("billing is off")),
          roleOf,
          usage: testUsage(),
        }, ENTITLEMENT_NEEDS))
        commandBus.register(
          TransferCreateCommand,
          createTransferCreateHandler({
            transfers: new PostgresTransferRepository(sql),
            groups,
            now,
          }),
        )
        const queryBus = new QueryBus()
        queryBus.use(createSessionGate([]))
        queryBus.register(AccountListQuery, createAccountListHandler({ accounts, groups }))
        queryBus.register(AccountGetQuery, createAccountGetHandler({ accounts, groups }))
        queryBus.register(
          AccountWidgetQuery,
          createAccountWidgetHandler({
            accounts,
            groups,
            settings,
            rates: {
              lookup: () => Promise.resolve({ found: false, reason: "no-rate" }),
              coinPrices: () => Promise.resolve([]),
            },
            today: () => "2026-11-06",
          }),
        )
        queryBus.register(
          TransactionLedgerQuery,
          createTransactionLedgerHandler({ transactions, groups, now, settings }),
        )
        queryBus.register(CategoryListQuery, createCategoryListHandler({ categories, groups }))
        queryBus.register(
          GroupSelectedQuery,
          () => Promise.resolve({ groupId: members.groupId, version: 1 }),
        )
        queryBus.register(
          GroupGetQuery,
          ({ data }) =>
            Promise.resolve({
              group: { id: data.groupId, name: "Home", timeZone: "UTC" },
            }) as never,
        )
        queryBus.register(
          PreferencesGetQuery,
          () => Promise.resolve({ version: 1, value: DEFAULT_PREFERENCES }) as never,
        )
        const values = new Map<string, string>()
        const store = {
          get: (key: string) => Promise.resolve(values.get(key) ?? null),
          set: (key: string, value: string) => (values.set(key, value), Promise.resolve()),
          del: (key: string) => (values.delete(key), Promise.resolve()),
        }
        const telegram = fakeTelegram()
        const bot = createSeedBot({
          client: telegram.client,
          username: "financy_bot",
          store,
          webAppUrl: "https://app.example.com",
          links: {
            account: () =>
              Promise.resolve({
                userId: members.editor,
                firstName: "",
                mfa: UserMFAStatus.NOT_CONFIGURED,
              }),
            prepare: () => Promise.resolve(null),
            spend: () => Promise.resolve(),
            link: () => Promise.resolve("stale"),
            unlink: () => Promise.resolve(false),
          },
          product: createTelegramProduct({ queryBus, commandBus, store, now }),
        })
        const send = async (text: string) => {
          await bot.handleUpdate(textUpdate(text, { from: TELEGRAM_USER_ID }))
          return telegram.sent().at(-1) as string
        }
        const press = async (text: string) => {
          const markup = telegram.calls.filter((call) => call.params.reply_markup).at(-1)?.params
            .reply_markup as { inline_keyboard: { text: string; callback_data: string }[][] }
          const button = markup.inline_keyboard.flat().find((one) => one.text === text)
          if (!button) throw new Error(`No button "${text}"`)
          await bot.handleUpdate(callbackUpdate(button.callback_data, { from: TELEGRAM_USER_ID }))
        }
        const balanceBefore = await send("/balance")
        const monthBefore = await send("/month")

        await send("/transfer")
        await press("Dollars · USD")
        await press("Yen · JPY")
        await send("77.00")
        await send("11500")
        await press("Save")

        const rows = await sql<{ sent: string; received: string; converted: boolean }[]>`
          SELECT sent_amount::text AS sent, received_amount::text AS received, converted
          FROM transfers
          WHERE group_id = ${members.groupId} AND from_account_id = ${dollars.id}
            AND to_account_id = ${yen.id}
        `
        expect(rows).toEqual([{ sent: "7700", received: "11500", converted: false }])
        expect(balanceBefore).toContain("$1,000.00")
        expect(balanceBefore).toContain("¥100,000")
        const balanceAfter = await send("/balance")
        expect(balanceAfter).toContain("$923.00")
        expect(balanceAfter).toContain("¥111,500")
        expect(monthBefore).toContain("Spending:")
        expect(await send("/month")).toBe(monthBefore)
      },
    )
  })
})
