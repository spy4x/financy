import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { createIdempotencyMiddleware, MemoryIdempotencyStore } from "@spy4x/server/idempotency"
import {
  type Account,
  AccountError,
  AccountGetQuery,
  AccountKind,
  AccountListQuery,
  AccountWidgetQuery,
} from "@domain/accounts"
import { FREE_PLAN_ID, PlanError } from "@domain/billing"
import { CategoryListQuery } from "@domain/categories"
import {
  GroupError,
  GroupGetQuery,
  GroupListQuery,
  GroupRole,
  GroupSelectCommand,
  GroupSelectedQuery,
} from "@domain/groups"
import { DEFAULT_PREFERENCES, UserMFAStatus } from "@domain/identity"
import { defaultHouseholdSettings } from "@domain/money"
import {
  TransactionCreateCommand,
  TransactionLatestQuery,
  TransactionLedgerQuery,
} from "@domain/transactions"
import {
  TransferCreateCommand,
  type TransferCreatePayload,
  TransferError,
  type TransferErrorCode,
  TransferGetQuery,
} from "@domain/transfers"
import { TEST_FREE_PLAN, TEST_PLANS, testUsage } from "../../../libs/domain/billing/test-plans.ts"
import { MemoryAccountRepository } from "../_testing/memory-accounts.ts"
import { MemoryCategoryRepository } from "../_testing/memory-categories.ts"
import { MemoryTransactionRepository } from "../_testing/memory-transactions.ts"
import { MemoryTransferRepository } from "../_testing/memory-transfers.ts"
import { useCommandMiddleware } from "../cqrs/command-middleware.ts"
import { createEntitlementGate } from "../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../cqrs/entitlement-needs.ts"
import { PreferencesGetQuery } from "../cqrs/queries.ts"
import { createSessionGate } from "../cqrs/session-gate.ts"
import { createAccountGetHandler, createAccountListHandler } from "../features/accounts/handlers.ts"
import { createCategoryListHandler } from "../features/categories/handlers.ts"
import {
  createTransactionCreateHandler,
  createTransactionLatestHandler,
  createTransactionLedgerHandler,
} from "../features/transactions/handlers.ts"
import {
  createTransferCreateHandler,
  createTransferGetHandler,
} from "../features/transfers/handlers.ts"
import { createSeedBot, type TelegramLinkService } from "./bot.ts"
import { createTelegramProduct } from "./commands.ts"
import { ENTRY_CALLBACK, entryText, PICK_MAX, refusalOf } from "./entries.ts"
import { callbackUpdate, fakeTelegram, TELEGRAM_USER_ID, textUpdate } from "./fake-telegram.ts"
import { TRANSFER_CALLBACK, transferText } from "./transfers.ts"

/**
 * `/transfer` on the fake Telegram API, over one pair of buses with the session and entitlement
 * gates and the real account and transfer handlers on in-memory repositories. Only Seed's group and
 * preference reads are stand-ins, answering from the same memberships. That the stored transfer
 * moves the balances and leaves the month alone is proven against Postgres in
 * `tests/integration/telegram-entries.integration.test.ts`.
 */

const OWNER = 1
const VIEWER = 2
const TG_VIEWER = TELEGRAM_USER_ID + 1
const HOME = uuidV7()
const OTHER = uuidV7()
const AT = new Date(`2026-11-02T10:00:00.000Z`)
const EN = transferText(`en`)
/** A value as the bot isolates it inside a message: between FSI and PDI. */
const iso = (value: string) => `⁨${value}⁩`

function account(
  groupId: string,
  name: string,
  currency: string,
  more: Partial<Account> = {},
): Account {
  return {
    id: uuidV7(),
    groupId,
    name,
    kind: AccountKind.CASH,
    currency,
    startingBalance: 0,
    aliases: [],
    archivedAt: null,
    isDefault: false,
    version: 1,
    changeSequence: `1`,
    createdByUserId: OWNER,
    updatedByUserId: OWNER,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...more,
  }
}

/** The accounts every test starts from. */
function fixtures() {
  return {
    cash: account(HOME, `Cash`, `USD`, { isDefault: true }),
    savings: account(HOME, `Savings`, `USD`),
    wallet: account(HOME, `Wallet`, `JPY`),
    bank: account(HOME, `Bank`, `BHD`),
    old: account(HOME, `Old`, `EUR`, { archivedAt: AT }),
    theirs: account(OTHER, `Theirs`, `USD`, { isDefault: true }),
  }
}

/** A string store with the get, set and delete Valkey gives the bot. */
function memoryStore() {
  const values = new Map<string, string>()
  return {
    values,
    get: (key: string) => Promise.resolve(values.get(key) ?? null),
    set: (key: string, value: string) => (values.set(key, value), Promise.resolve()),
    del: (key: string) => (values.delete(key), Promise.resolve()),
  }
}

interface Options {
  /** The instant the server's clock reads. */
  now?: Date
  /** The home household's time zone. */
  timeZone?: string
  /** The owner's region format preference. */
  locale?: string | null
  /** The owner's selected household; version 0 means never chosen. */
  ownerSelection?: { groupId: string; version: number }
  /** The free plan's cap on stored entries and transfers; none when left out. */
  maxTransactions?: number
  /** The day's rate between any two currencies; `null` for no rate. */
  rate?: string | null
  /** Runs the API's idempotency middleware in front of the entitlement gate. */
  idempotent?: boolean
  /** More open USD accounts in the home household. */
  extraAccounts?: number
}

/** The bot over the buses, two linked people and a fake Telegram. */
function transferBot(options: Options = {}) {
  const f = fixtures()
  const memberships = new Map<string, GroupRole>([
    [`${HOME}:${OWNER}`, GroupRole.OWNER],
    [`${HOME}:${VIEWER}`, GroupRole.VIEWER],
    [`${OTHER}:${OWNER}`, GroupRole.OWNER],
  ])
  const groups = {
    roleOf: (groupId: string, userId: number) =>
      Promise.resolve(memberships.get(`${groupId}:${userId}`) ?? null),
  }
  const accounts = new MemoryAccountRepository()
  const extras = Array.from(
    { length: options.extraAccounts ?? 0 },
    (_, index) => account(HOME, `Extra ${index}`, `USD`),
  )
  for (const one of [...Object.values(f), ...extras]) accounts.accounts.set(one.id, one)
  const held = new Map(
    [...accounts.accounts.values()].map((one) => [one.id, {
      groupId: one.groupId,
      currency: one.currency,
    }]),
  )
  const timeZones = new Map([[HOME, options.timeZone ?? `UTC`], [OTHER, `UTC`]])
  const day = { rate: options.rate ?? null }
  const rates = (base: string, quote: string, date: string) =>
    Promise.resolve(
      day.rate === null ? null : {
        base,
        quote,
        rate: day.rate,
        date,
        source: `test`,
      },
    )
  const transfers = new MemoryTransferRepository({
    accounts: held,
    timeZones,
    rates,
    roleOf: groups.roleOf,
  })
  const categories = new MemoryCategoryRepository()
  const transactions = new MemoryTransactionRepository({
    accounts: held,
    categories: new Map(),
    timeZones,
    rates: () => Promise.resolve(null),
  })
  const selections = new Map<number, { groupId: string; version: number }>([
    [OWNER, options.ownerSelection ?? { groupId: HOME, version: 1 }],
  ])
  const selected: { groupId: string; userId: number }[] = []
  /** Seed's selection read: the stored household while the person is in it, else their first. */
  const selectionOf = (userId: number) => {
    const stored = selections.get(userId)
    if (stored && memberships.has(`${stored.groupId}:${userId}`)) return stored
    const first = [...memberships.keys()].find((key) => key.endsWith(`:${userId}`))
    return { groupId: first ? first.split(`:`)[0] : null, version: 0 }
  }

  const now = () => options.now ?? AT
  const commandBus = new CommandBus()
  commandBus.use(createSessionGate([]))
  const entitlements = createEntitlementGate({
    billingEnabled: true,
    plans: options.maxTransactions === undefined ? TEST_PLANS : [{
      ...TEST_FREE_PLAN,
      entitlements: {
        ...TEST_FREE_PLAN.entitlements,
        limits: { ...TEST_FREE_PLAN.entitlements.limits, maxTransactions: options.maxTransactions },
      },
    }],
    planOf: () => Promise.resolve(FREE_PLAN_ID),
    roleOf: (group, user) => groups.roleOf(group, user),
    usage: testUsage({ maxTransactions: (group) => transfers.count(group) }),
  }, ENTITLEMENT_NEEDS)
  if (options.idempotent) {
    useCommandMiddleware(commandBus, {
      idempotency: createIdempotencyMiddleware({ store: new MemoryIdempotencyStore({}) }),
      entitlements,
    })
  } else commandBus.use(entitlements)
  commandBus.register(
    TransferCreateCommand,
    createTransferCreateHandler({ transfers, groups, now }),
  )
  commandBus.register(
    TransactionCreateCommand,
    createTransactionCreateHandler({ transactions, groups, now }),
  )
  commandBus.register(GroupSelectCommand, ({ data }) => {
    if (!memberships.has(`${data.groupId}:${data.actor.userId}`)) {
      throw new GroupError(`GROUP_NOT_FOUND`, `Group not found`)
    }
    selected.push({ groupId: data.groupId, userId: data.actor.userId })
    const next = { groupId: data.groupId, version: 2 }
    selections.set(data.actor.userId, next)
    return Promise.resolve(next)
  })
  const queryBus = new QueryBus()
  queryBus.use(createSessionGate([]))
  queryBus.register(AccountListQuery, createAccountListHandler({ accounts, groups }))
  queryBus.register(AccountGetQuery, createAccountGetHandler({ accounts, groups }))
  queryBus.register(TransferGetQuery, createTransferGetHandler({ transfers, groups, now }))
  queryBus.register(CategoryListQuery, createCategoryListHandler({ categories, groups }))
  queryBus.register(
    TransactionLatestQuery,
    createTransactionLatestHandler({ transactions, groups, now }),
  )
  queryBus.register(
    TransactionLedgerQuery,
    createTransactionLedgerHandler({
      transactions,
      groups,
      now,
      settings: {
        get: (groupId) =>
          Promise.resolve({ ...defaultHouseholdSettings(groupId), baseCurrency: `USD` }),
      },
    }),
  )
  // Only what `/balance` needs to answer in the middle of a talk; its figures are in reads.test.ts.
  queryBus.register(AccountWidgetQuery, () =>
    Promise.resolve({
      accounts: [],
      total: {
        amount: 0,
        currency: `USD`,
        rateDate: null,
        coinPriceDate: null,
        leftOut: [],
        tooLarge: false,
      },
    }))
  queryBus.register(GroupGetQuery, ({ data }) =>
    Promise.resolve({
      group: { id: data.groupId, name: `Home`, timeZone: `UTC` },
    }) as never)
  queryBus.register(
    GroupSelectedQuery,
    ({ data }) => Promise.resolve(selectionOf(data.actor.userId)),
  )
  queryBus.register(GroupListQuery, ({ data }) =>
    Promise.resolve({
      groups: [HOME, OTHER]
        .filter((groupId) => memberships.has(`${groupId}:${data.actor.userId}`))
        .map((id) => ({ id, name: id === HOME ? `Home` : `Other` })),
      nextPageKey: null,
    }) as never)
  queryBus.register(PreferencesGetQuery, ({ data }) =>
    Promise.resolve({
      version: 1,
      value: {
        ...DEFAULT_PREFERENCES,
        locale: data.actor.userId === OWNER ? options.locale ?? null : null,
      },
    }) as never)

  /** Every transfer command the bot dispatched, and a failure the next one meets. */
  const commands: TransferCreatePayload[] = []
  const failure: { next: Error | null } = { next: null }
  const recordingBus = {
    execute: ((command: unknown) => {
      if (command instanceof TransferCreateCommand) {
        commands.push(command.data)
        if (failure.next) {
          const error = failure.next
          failure.next = null
          return Promise.reject(error)
        }
      }
      return commandBus.execute(command as never)
    }) as CommandBus[`execute`],
  }

  const linked = new Map([[TELEGRAM_USER_ID, OWNER], [TG_VIEWER, VIEWER]])
  const links: TelegramLinkService = {
    account: (telegramUserId) => {
      const userId = linked.get(telegramUserId)
      return Promise.resolve(
        userId ? { userId, firstName: ``, mfa: UserMFAStatus.NOT_CONFIGURED } : null,
      )
    },
    prepare: () => Promise.resolve(null),
    spend: () => Promise.resolve(),
    link: () => Promise.resolve(`stale`),
    unlink: () => Promise.resolve(false),
  }
  const telegram = fakeTelegram()
  const store = memoryStore()
  const bot = createSeedBot({
    client: telegram.client,
    username: `financy_bot`,
    store,
    webAppUrl: `https://app.example.com`,
    links,
    product: createTelegramProduct({ queryBus, commandBus: recordingBus, store }),
  })

  /** The buttons of the last message the bot sent or edited with buttons. */
  const buttons = () => {
    const last = telegram.calls.filter((call) => call.params.reply_markup).at(-1)
    const markup = last?.params.reply_markup as
      | { inline_keyboard: { text: string; callback_data: string }[][] }
      | undefined
    return (markup?.inline_keyboard ?? []).flat()
  }
  /** The data of the button labelled `text` in the last message with buttons. */
  const data = (text: string) => {
    const found = buttons().find((one) => one.text === text)
    if (!found) throw new Error(`No button "${text}" in ${JSON.stringify(buttons())}`)
    return found.callback_data
  }
  /** Every text the bot showed, sent or edited in, in order. */
  const shown = () =>
    telegram.calls
      .filter((call) => call.method === `sendMessage` || call.method === `editMessageText`)
      .map((call) => call.params.text as string)
  const draftKey = `financy:telegram:entry:${TELEGRAM_USER_ID}:${OWNER}`

  return {
    f,
    ...telegram,
    store,
    accounts,
    transfers,
    transactions,
    commands,
    failure,
    day,
    selected,
    buttons,
    data,
    shown,
    draftKey,
    /** The owner's stored draft, parsed. */
    draft: () => JSON.parse(store.values.get(draftKey) ?? `null`),
    /** Puts `patch` over the owner's stored draft. */
    patchDraft: (patch: Record<string, unknown>) =>
      store.values.set(
        draftKey,
        JSON.stringify({ ...JSON.parse(store.values.get(draftKey)!), ...patch }),
      ),
    stored: () => [...transfers.transfers.values()],
    /** Archives an account, as the app does while the talk waits. */
    archive: (id: string) =>
      accounts.accounts.set(id, { ...accounts.accounts.get(id)!, archivedAt: AT }),
    /** Takes `userId` out of the household, as the owner's removal does. */
    remove: (groupId: string, userId: number) => memberships.delete(`${groupId}:${userId}`),
    send: (text: string, from = TELEGRAM_USER_ID) => bot.handleUpdate(textUpdate(text, { from })),
    press: (callback: string, from = TELEGRAM_USER_ID) =>
      bot.handleUpdate(callbackUpdate(callback, { from })),
  }
}

type TransferBot = ReturnType<typeof transferBot>

/** The button label of an account. */
const label = (one: Account) => `${one.name} · ${one.currency}`

/** `/transfer` and both picks, so the bot waits for the sent amount. */
async function picked(bot: TransferBot, from: Account, to: Account, sender = TELEGRAM_USER_ID) {
  await bot.send(`/transfer`, sender)
  await bot.press(bot.data(label(from)), sender)
  await bot.press(bot.data(label(to)), sender)
}

/** A USD to JPY talk up to its summary, with 10.00 sent and the day's rate pressed. */
async function atRateSummary(bot: TransferBot) {
  await picked(bot, bot.f.cash, bot.f.wallet)
  await bot.send(`10.00`)
  await bot.press(bot.data(EN.useRate))
}

describe(`/transfer in the Telegram bot`, () => {
  describe(`the command`, () => {
    it(`is listed with the other commands of the bot`, () => {
      const product = createTelegramProduct({
        queryBus: new QueryBus(),
        commandBus: new CommandBus(),
        store: memoryStore(),
      })

      expect(product.commands.map((command) => command.name)).toEqual([
        `expense`,
        `income`,
        `transfer`,
        `balance`,
        `month`,
      ])
      expect(Object.keys(product.callbacks!)).toEqual([ENTRY_CALLBACK, TRANSFER_CALLBACK])
      expect(Object.keys(product.conversations!)).toEqual([`entry`, `transfer`])
    })

    it(`ignores the arguments after /transfer`, async () => {
      const bot = transferBot()

      await bot.send(`/transfer 50 to savings`)

      expect(bot.shown().at(-1)).toBe(EN.pickFrom)
      expect(bot.draft().sentAmount).toBeNull()
    })
  })

  describe(`saving`, () => {
    it(`stores one currency without a received amount in the command`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)

      expect(bot.shown().at(-1)).toBe(
        EN.transferSummary({
          sent: iso(`$12.50`),
          from: iso(`Cash`),
          received: iso(`$12.50`),
          to: iso(`Savings`),
        }),
      )
      await bot.press(bot.data(EN.save))

      expect(`receivedAmount` in bot.commands[0]).toBe(false)
      expect(bot.stored()).toHaveLength(1)
      expect(bot.stored()[0]).toMatchObject({
        fromAccountId: bot.f.cash.id,
        toAccountId: bot.f.savings.id,
        sentAmount: 1250,
        receivedAmount: 1250,
        converted: false,
      })
    })

    it(`sends the typed received amount across currencies and stores both amounts`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.wallet)
      await bot.send(`10.00`)

      expect(bot.shown().at(-1)).toBe(EN.askReceived(`JPY`, `Wallet`))
      await bot.send(`1500`)
      expect(bot.shown().at(-1)).toBe(
        EN.transferSummary({
          sent: iso(`$10.00`),
          from: iso(`Cash`),
          received: iso(`¥1,500`),
          to: iso(`Wallet`),
        }),
      )
      await bot.press(bot.data(EN.save))

      expect(bot.commands[0].receivedAmount).toBe(1500)
      expect(bot.stored()[0]).toMatchObject({
        sentAmount: 1000,
        receivedAmount: 1500,
        converted: false,
      })
    })

    it(`says the day's rate is used, states no invented figure and reports what was stored`, async () => {
      const bot = transferBot({ rate: `150` })
      await atRateSummary(bot)

      const summary = EN.summaryRate({
        sent: iso(`$10.00`),
        from: iso(`Cash`),
        to: iso(`Wallet`),
      })
      expect(bot.shown().at(-1)).toBe(summary)
      expect(summary).not.toContain(`¥`)
      await bot.press(bot.data(EN.save))

      expect(`receivedAmount` in bot.commands[0]).toBe(false)
      expect(bot.stored()[0]).toMatchObject({ receivedAmount: 1500, converted: true })
      expect(bot.shown().at(-1)).toBe(
        `${
          EN.stored({
            sent: iso(`$10.00`),
            from: iso(`Cash`),
            received: iso(`¥1,500`),
            to: iso(`Wallet`),
          })
        }\n${EN.converted}`,
      )
    })

    it(`takes the buttons off the message that reports the transfer`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)
      await bot.press(bot.data(EN.save))

      const last = bot.calls.filter((call) => call.method === `editMessageText`).at(-1)!
      expect(last.params.reply_markup).toBeUndefined()
      expect(last.params.text).toBe(
        EN.stored({
          sent: iso(`$12.50`),
          from: iso(`Cash`),
          received: iso(`$12.50`),
          to: iso(`Savings`),
        }),
      )
      expect(bot.draft()).toBeNull()
    })

    it(`dispatches the draft's id as the id and the idempotency key, with no date and no memo`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)
      const { id } = bot.draft()

      await bot.press(bot.data(EN.save))

      expect(bot.commands[0]).toMatchObject({ groupId: HOME, id, idempotencyKey: id })
      expect(bot.commands[0].actor.userId).toBe(OWNER)
      expect(`date` in bot.commands[0]).toBe(false)
      expect(`memo` in bot.commands[0]).toBe(false)
    })

    it(`dates the transfer today in the household's time zone`, async () => {
      const bot = transferBot({
        now: new Date(`2026-11-02T20:00:00.000Z`),
        timeZone: `Asia/Tokyo`,
      })
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)

      await bot.press(bot.data(EN.save))

      expect(bot.stored()[0].date).toBe(`2026-11-03`)
    })
  })

  describe(`amounts by each currency's decimals`, () => {
    it(`reads "500" yen as 500 and "3.00" dollars as 300`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.wallet, bot.f.cash)
      await bot.send(`500`)
      await bot.send(`3.00`)
      await bot.press(bot.data(EN.save))

      expect(bot.stored()[0]).toMatchObject({ sentAmount: 500, receivedAmount: 300 })
    })

    it(`reads "1.234" dinars as 1234`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.bank, bot.f.cash)
      await bot.send(`1.234`)
      await bot.send(`3.00`)
      await bot.press(bot.data(EN.save))

      expect(bot.stored()[0].sentAmount).toBe(1234)
    })

    it(`reads "12,50" as 1250 for a person whose region format is German`, async () => {
      const bot = transferBot({ locale: `de` })
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12,50`)
      await bot.press(bot.data(EN.save))

      expect(bot.stored()[0].sentAmount).toBe(1250)
    })

    it(`refuses text that is no amount with the reason and the question again`, async () => {
      const refusals: [string, string][] = [
        [`abc`, EN.notAmount],
        [`1`.repeat(33), EN.notAmount],
        [`0`, EN.notPositive],
        [`-5`, EN.notPositive],
        [`1.005`, EN.tooManyDecimals(`USD`)],
        [`9`.repeat(32), EN.tooLarge],
      ]
      for (const [typed, reason] of refusals) {
        const bot = transferBot()
        await picked(bot, bot.f.cash, bot.f.wallet)

        await bot.send(typed)

        expect(bot.shown().at(-1)).toBe(`${reason} ${EN.askSent(`USD`, `Cash`)}`)
        expect(bot.draft().step).toBe(`sent`)
        expect(bot.commands).toEqual([])
      }
    })

    it(`refuses a bad received amount with the question in the to account's currency`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.wallet)
      await bot.send(`10.00`)

      await bot.send(`1.5`)

      expect(bot.shown().at(-1)).toBe(
        `${EN.tooManyDecimals(`JPY`)} ${EN.askReceived(`JPY`, `Wallet`)}`,
      )
      expect(bot.buttons().map((one) => one.text)).toEqual([EN.useRate, EN.cancel])
      expect(bot.draft().step).toBe(`received`)
    })
  })

  describe(`the household`, () => {
    it(`tells a person without a household to create one`, async () => {
      const bot = transferBot()
      bot.remove(HOME, VIEWER)

      await bot.send(`/transfer`, TG_VIEWER)

      expect(bot.shown()).toEqual([EN.noHousehold])
    })

    it(`asks a person who never chose among several, selects the pick and goes on`, async () => {
      const bot = transferBot({ ownerSelection: { groupId: HOME, version: 0 } })

      await bot.send(`/transfer`)
      expect(bot.shown().at(-1)).toBe(EN.pickHousehold)
      await bot.press(bot.data(`Home`))

      expect(bot.selected).toEqual([{ groupId: HOME, userId: OWNER }])
      expect(bot.shown().at(-1)).toBe(EN.pickFrom)
      expect(bot.draft()).toMatchObject({ groupId: HOME, step: `from` })
    })

    it(`refuses a household button of a household the person left`, async () => {
      const bot = transferBot({ ownerSelection: { groupId: HOME, version: 0 } })
      await bot.send(`/transfer`)
      const other = bot.data(`Other`)
      bot.remove(OTHER, OWNER)

      await bot.press(other)

      expect(bot.shown().at(-1)).toBe(EN.notMember)
      expect(bot.selected).toEqual([])
      expect(bot.draft().step).toBe(`household`)
    })

    it(`says a transfer needs two open accounts when the household has one`, async () => {
      const bot = transferBot({ ownerSelection: { groupId: OTHER, version: 1 } })

      await bot.send(`/transfer`)

      expect(bot.shown()).toEqual([EN.needsTwo])
      expect(bot.buttons()).toEqual([])
      expect(bot.draft()).toBeNull()
    })

    it(`does not count archived accounts as open`, async () => {
      const bot = transferBot()
      bot.archive(bot.f.savings.id)
      bot.archive(bot.f.wallet.id)
      bot.archive(bot.f.bank.id)

      await bot.send(`/transfer`)

      expect(bot.shown()).toEqual([EN.needsTwo])
    })

    it(`ends the talk when no other open account is left after the from pick`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)
      const cash = bot.data(label(bot.f.cash))
      bot.archive(bot.f.savings.id)
      bot.archive(bot.f.wallet.id)
      bot.archive(bot.f.bank.id)

      await bot.press(cash)

      expect(bot.shown().at(-1)).toBe(EN.needsTwo)
      expect(bot.draft()).toBeNull()
    })
  })

  describe(`the account lists`, () => {
    it(`offers open accounts labelled by name and currency, with Cancel`, async () => {
      const bot = transferBot()

      await bot.send(`/transfer`)

      expect(bot.buttons().map((one) => one.text)).toEqual([
        `Bank · BHD`,
        `Cash · USD`,
        `Savings · USD`,
        `Wallet · JPY`,
        EN.cancel,
      ])
    })

    it(`does not offer the from account as the to account`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)

      await bot.press(bot.data(label(bot.f.cash)))

      expect(bot.shown().at(-1)).toBe(EN.pickTo)
      expect(bot.buttons().map((one) => one.text)).toEqual([
        `Bank · BHD`,
        `Savings · USD`,
        `Wallet · JPY`,
        EN.cancel,
      ])
    })

    it(`caps both lists at the most one list offers`, async () => {
      const bot = transferBot({ extraAccounts: PICK_MAX + 5 })

      await bot.send(`/transfer`)
      expect(bot.buttons()).toHaveLength(PICK_MAX + 1)

      await bot.press(bot.data(label(bot.f.cash)))
      expect(bot.buttons()).toHaveLength(PICK_MAX + 1)
    })

    it(`keeps every button's data within Telegram's 64 bytes`, async () => {
      const bot = transferBot({ ownerSelection: { groupId: HOME, version: 0 } })
      const sizes: number[] = []
      const measure = () =>
        sizes.push(
          ...bot.buttons().map((one) => new TextEncoder().encode(one.callback_data).length),
        )

      await bot.send(`/transfer`)
      measure()
      await bot.press(bot.data(`Home`))
      measure()
      await bot.press(bot.data(label(bot.f.cash)))
      measure()
      await bot.press(bot.data(label(bot.f.wallet)))
      measure()
      await bot.send(`10.00`)
      measure()
      await bot.press(bot.data(EN.useRate))
      measure()

      expect(Math.max(...sizes)).toBe(`${TRANSFER_CALLBACK}:f:12345678:${HOME}`.length)
      expect(Math.max(...sizes)).toBeLessThanOrEqual(64)
    })
  })

  describe(`Cancel`, () => {
    it(`ends the talk at every step and saves nothing`, async () => {
      const steps: ((bot: TransferBot) => Promise<unknown>)[] = [
        (bot) => bot.send(`/transfer`),
        async (bot) => {
          await bot.send(`/transfer`)
          await bot.press(bot.data(label(bot.f.cash)))
        },
        (bot) => picked(bot, bot.f.cash, bot.f.wallet),
        async (bot) => {
          await picked(bot, bot.f.cash, bot.f.wallet)
          await bot.send(`10.00`)
        },
        (bot) => atRateSummary(bot),
      ]
      for (const reach of steps) {
        const bot = transferBot()
        await reach(bot)

        await bot.press(bot.data(EN.cancel))

        expect(bot.shown().at(-1)).toBe(EN.cancelled)
        expect(bot.draft()).toBeNull()
        expect(bot.stored()).toEqual([])

        // The talk no longer waits for an amount: typed text goes nowhere.
        const before = bot.shown().length
        await bot.send(`10.00`)
        expect(bot.shown().length).toBe(before)
      }
    })
  })

  describe(`refusals`, () => {
    it(`refuses a viewer at Save and writes nothing`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings, TG_VIEWER)
      await bot.send(`12.50`, TG_VIEWER)

      await bot.press(bot.data(EN.save), TG_VIEWER)

      expect(bot.shown().at(-1)).toBe(EN.viewer)
      expect(bot.stored()).toEqual([])
      expect(bot.transfers.writes).toBe(0)
    })

    it(`tells a household whose plan is full and writes nothing`, async () => {
      const bot = transferBot({ maxTransactions: 0 })
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)

      await bot.press(bot.data(EN.save))

      expect(bot.shown().at(-1)).toBe(EN.planFull)
      expect(bot.stored()).toEqual([])
    })

    it(`tells a person removed from the household in the middle of the talk`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)
      bot.remove(HOME, OWNER)

      await bot.press(bot.data(EN.save))

      expect(bot.shown().at(-1)).toBe(EN.notMember)
      expect(bot.stored()).toEqual([])
    })

    it(`refuses an archived account picked as the from account`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)
      const cash = bot.data(label(bot.f.cash))
      bot.archive(bot.f.cash.id)

      await bot.press(cash)

      expect(bot.shown().at(-1)).toBe(EN.unavailable)
      expect(bot.draft()).toMatchObject({ step: `from`, fromAccountId: null })
    })

    it(`refuses an archived account picked as the to account`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)
      await bot.press(bot.data(label(bot.f.cash)))
      const savings = bot.data(label(bot.f.savings))
      bot.archive(bot.f.savings.id)

      await bot.press(savings)

      expect(bot.shown().at(-1)).toBe(EN.unavailable)
      expect(bot.draft()).toMatchObject({ step: `to`, toAccountId: null })
    })

    it(`refuses the from account picked again as the to account`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)
      await bot.press(bot.data(label(bot.f.cash)))
      const tag = bot.draft().id.slice(-8)

      await bot.press(`${TRANSFER_CALLBACK}:t:${tag}:${bot.f.cash.id}`)

      expect(bot.shown().at(-1)).toBe(EN.unavailable)
      expect(bot.draft()).toMatchObject({ step: `to`, toAccountId: null })
    })

    it(`refuses a button naming another household's account at both picks`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)
      const tag = bot.draft().id.slice(-8)

      await bot.press(`${TRANSFER_CALLBACK}:f:${tag}:${bot.f.theirs.id}`)
      expect(bot.shown().at(-1)).toBe(EN.unavailable)
      expect(bot.draft().fromAccountId).toBeNull()

      await bot.press(bot.data(label(bot.f.cash)))
      await bot.press(`${TRANSFER_CALLBACK}:t:${tag}:${bot.f.theirs.id}`)
      expect(bot.shown().at(-1)).toBe(EN.unavailable)
      expect(bot.draft().toAccountId).toBeNull()
      expect(bot.stored()).toEqual([])
    })

    it(`refuses an account archived after it was picked, at the typed amount and at Save`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)
      bot.archive(bot.f.savings.id)

      await bot.press(bot.data(EN.save))

      expect(bot.shown().at(-1)).toBe(EN.unavailable)
      expect(bot.commands).toEqual([])

      const typed = transferBot()
      await picked(typed, typed.f.cash, typed.f.savings)
      typed.archive(typed.f.cash.id)

      await typed.send(`12.50`)

      expect(typed.shown().at(-1)).toBe(EN.unavailable)
      expect(typed.draft().sentAmount).toBeNull()
    })

    it(`refuses a stored draft that names one account twice and writes nothing`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)
      bot.patchDraft({ toAccountId: bot.f.cash.id })

      await bot.press(bot.data(EN.save))

      expect(bot.shown().at(-1)).toBe(EN.unavailable)
      expect(bot.stored()).toEqual([])
    })

    it(`maps every transfer refusal to its line and leaves the rest to the caller`, () => {
      const lines: [TransferErrorCode, string | null][] = [
        [`ROLE_INSUFFICIENT`, EN.viewer],
        [`GROUP_NOT_FOUND`, EN.notMember],
        [`ACCOUNT_NOT_FOUND`, EN.unavailable],
        [`TRANSFER_SAME_ACCOUNT`, EN.unavailable],
        [`NO_RATE`, null],
        [`INVALID_REQUEST`, null],
        [`ID_ALREADY_EXISTS`, null],
        [`TRANSFER_NOT_FOUND`, null],
        [`VERSION_CONFLICT`, null],
      ]
      for (const [code, line] of lines) {
        expect(refusalOf(new TransferError(code, code), EN)).toBe(line)
      }
      const full = new PlanError(`PLAN_LIMIT_REACHED`, `maxTransactions`, 0, true, `full`)
      expect(refusalOf(full, EN)).toBe(EN.planFull)
      expect(refusalOf(new AccountError(`ACCOUNT_NOT_FOUND`, `gone`), EN)).toBe(EN.unavailable)
      expect(refusalOf(new Error(`boom`), EN)).toBeNull()
    })

    it(`keeps the entry lines for entries while a transfer words them for itself`, () => {
      const entry = entryText(`en`)

      expect(EN.viewer).not.toBe(entry.viewer)
      expect(EN.unavailable).not.toBe(entry.unavailable)
      expect(EN.stale).not.toBe(entry.stale)
      expect(`${EN.viewer} ${EN.unavailable} ${EN.stale}`).not.toMatch(/category|\/expense/i)
      expect(EN.cancelled).toBe(entry.cancelled)
    })
  })

  describe(`no usable rate at Save`, () => {
    it(`keeps the talk, says so in a new line and asks for the received amount by hand`, async () => {
      const bot = transferBot()
      await atRateSummary(bot)
      const sent = bot.sent().length

      await bot.press(bot.data(EN.save))

      expect(bot.sent().length).toBe(sent + 1)
      expect(bot.sent().at(-1)).toBe(`${EN.noRate} ${EN.askReceived(`JPY`, `Wallet`)}`)
      expect(bot.buttons().map((one) => one.text)).toEqual([EN.cancel])
      expect(bot.draft()).toMatchObject({ step: `received`, useRate: false, sentAmount: 1000 })
      expect(bot.stored()).toEqual([])

      await bot.send(`1500`)
      await bot.press(bot.data(EN.save))

      expect(bot.stored()[0]).toMatchObject({ sentAmount: 1000, receivedAmount: 1500 })
    })

    it(`asks by hand when the conversion rounds to zero`, async () => {
      const bot = transferBot({ rate: `0.00001` })
      await picked(bot, bot.f.wallet, bot.f.cash)
      await bot.send(`1`)
      await bot.press(bot.data(EN.useRate))

      await bot.press(bot.data(EN.save))

      expect(bot.sent().at(-1)).toBe(`${EN.noRate} ${EN.askReceived(`USD`, `Cash`)}`)
      expect(bot.draft().step).toBe(`received`)
      expect(bot.stored()).toEqual([])
    })

    it(`tells a person whose converted amount is too large, and writes nothing`, async () => {
      const bot = transferBot({ rate: `1000000000000` })
      await picked(bot, bot.f.cash, bot.f.wallet)
      await bot.send(`90000000000.00`)
      await bot.press(bot.data(EN.useRate))

      await bot.press(bot.data(EN.save))

      expect(bot.shown().at(-1)).toBe(EN.tooLarge)
      expect(bot.stored()).toEqual([])
    })

    it(`rethrows any other failure of the save`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)
      const save = bot.data(EN.save)
      const failures = [new TransferError(`VERSION_CONFLICT`, `moved`), new Error(`boom`)]

      for (const failure of failures) {
        bot.failure.next = failure
        await expect(bot.press(save)).rejects.toThrow(failure.message)
      }
      expect(bot.draft().step).toBe(`summary`)
    })

    it(`saves under the same key after a refused first try, through the idempotency middleware`, async () => {
      const bot = transferBot({ idempotent: true })
      await atRateSummary(bot)
      await bot.press(bot.data(EN.save))

      await bot.send(`1500`)
      await bot.press(bot.data(EN.save))

      expect(bot.commands.map((one) => one.idempotencyKey)).toEqual([
        bot.commands[0].id,
        bot.commands[0].id,
      ])
      expect(bot.stored()[0]).toMatchObject({ sentAmount: 1000, receivedAmount: 1500 })
    })
  })

  describe(`a second Save`, () => {
    it(`stores one transfer and reports the first one's amounts on a retry`, async () => {
      const bot = transferBot({ rate: `150` })
      await atRateSummary(bot)
      const save = bot.data(EN.save)
      const draft = bot.store.values.get(bot.draftKey)!
      await bot.press(save)
      const reported = bot.shown().at(-1)

      bot.day.rate = `200`
      bot.store.values.set(bot.draftKey, draft)
      await bot.press(save)

      expect(bot.stored()).toHaveLength(1)
      expect(bot.transfers.writes).toBe(1)
      expect(bot.stored()[0].receivedAmount).toBe(1500)
      expect(bot.shown().at(-1)).toBe(reported)
    })

    it(`replays the first result through the idempotency middleware`, async () => {
      const bot = transferBot({ rate: `150`, idempotent: true })
      await atRateSummary(bot)
      const save = bot.data(EN.save)
      const draft = bot.store.values.get(bot.draftKey)!
      await bot.press(save)
      const reported = bot.shown().at(-1)

      bot.store.values.set(bot.draftKey, draft)
      await bot.press(save)

      expect(bot.transfers.writes).toBe(1)
      expect(bot.shown().at(-1)).toBe(reported)
    })

    it(`reports what was stored when the id already holds a different transfer`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)
      const save = bot.data(EN.save)
      const draft = JSON.parse(bot.store.values.get(bot.draftKey)!)
      await bot.press(save)

      bot.store.values.set(bot.draftKey, JSON.stringify({ ...draft, sentAmount: 9900 }))
      await bot.press(save)

      expect(bot.stored()).toHaveLength(1)
      expect(bot.shown().at(-1)).toBe(
        EN.stored({
          sent: iso(`$12.50`),
          from: iso(`Cash`),
          received: iso(`$12.50`),
          to: iso(`Savings`),
        }),
      )
      expect(bot.draft()).toBeNull()
    })

    it(`answers a Save pressed after the talk ended as stale and stores nothing more`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)
      const save = bot.data(EN.save)
      await bot.press(save)

      await bot.press(save)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.stored()).toHaveLength(1)
    })
  })

  describe(`buttons that no longer apply`, () => {
    it(`answers a button of an older talk as stale and changes nothing`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)
      const older = bot.data(label(bot.f.cash))
      await bot.send(`/transfer`)
      const draft = bot.draft()

      await bot.press(older)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.draft()).toEqual(draft)
    })

    it(`answers a from pick after the from account is set as stale`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)
      const cash = bot.data(label(bot.f.cash))
      const savings = bot.data(label(bot.f.savings))
      await bot.press(cash)
      const draft = bot.draft()

      await bot.press(savings)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.draft()).toEqual(draft)
    })

    it(`answers a to pick after the to account is set as stale`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)
      await bot.press(bot.data(label(bot.f.cash)))
      const savings = bot.data(label(bot.f.savings))
      const wallet = bot.data(label(bot.f.wallet))
      await bot.press(savings)
      const draft = bot.draft()

      await bot.press(wallet)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.draft()).toEqual(draft)
    })

    it(`answers a household pick after the household is set as stale`, async () => {
      const bot = transferBot({ ownerSelection: { groupId: HOME, version: 0 } })
      await bot.send(`/transfer`)
      const home = bot.data(`Home`)
      await bot.press(home)

      await bot.press(home)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.selected).toHaveLength(1)
    })

    it(`answers a rate press before the sent amount is typed as stale`, async () => {
      const bot = transferBot({ rate: `150` })
      await picked(bot, bot.f.cash, bot.f.wallet)
      const tag = bot.draft().id.slice(-8)
      const draft = bot.draft()

      await bot.press(`${TRANSFER_CALLBACK}:r:${tag}`)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.draft()).toEqual(draft)
    })

    it(`answers a Save before the summary as stale and writes nothing`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      const tag = bot.draft().id.slice(-8)

      await bot.press(`${TRANSFER_CALLBACK}:s:${tag}`)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.commands).toEqual([])
    })

    it(`answers a Save on a stored draft that lost a field as stale and writes nothing`, async () => {
      const patches: Record<string, unknown>[] = [
        { sentAmount: null },
        { toAccountId: null },
        { useRate: true, receivedAmount: 1 },
      ]
      for (const patch of patches) {
        const bot = transferBot()
        await picked(bot, bot.f.cash, bot.f.wallet)
        await bot.send(`10.00`)
        await bot.send(`1500`)
        const save = bot.data(EN.save)
        bot.patchDraft(patch)

        await bot.press(save)

        expect(bot.shown().at(-1)).toBe(EN.stale)
        expect(bot.commands).toEqual([])
      }
    })

    it(`answers a Save across currencies with no received amount and no rate as stale`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.wallet)
      await bot.send(`10.00`)
      await bot.send(`1500`)
      const save = bot.data(EN.save)
      bot.patchDraft({ receivedAmount: null })

      await bot.press(save)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.commands).toEqual([])
    })

    it(`answers a Save in one currency that carries a received amount as stale`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      await bot.send(`12.50`)
      const save = bot.data(EN.save)
      bot.patchDraft({ receivedAmount: 1250 })

      await bot.press(save)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.commands).toEqual([])
    })

    it(`answers malformed button data as stale`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)
      const tag = bot.draft().id.slice(-8)
      const draft = bot.draft()
      const malformed = [
        TRANSFER_CALLBACK,
        `${TRANSFER_CALLBACK}:z:${tag}`,
        `${TRANSFER_CALLBACK}:f:${tag}`,
        `${TRANSFER_CALLBACK}:f:${tag}:not-a-uuid`,
        `${TRANSFER_CALLBACK}:x:${tag}:${bot.f.cash.id}`,
        `${TRANSFER_CALLBACK}:f:XXXXXXXX:${bot.f.cash.id}`,
      ]

      for (const callback of malformed) {
        const before = bot.shown().length
        await bot.press(callback)

        expect(bot.shown().length).toBe(before + 1)
        expect(bot.shown().at(-1)).toBe(EN.stale)
        expect(bot.draft()).toEqual(draft)
      }
    })

    it(`answers typed text as stale when the stored draft is gone`, async () => {
      const bot = transferBot()
      await picked(bot, bot.f.cash, bot.f.savings)
      bot.store.values.delete(bot.draftKey)

      await bot.send(`12.50`)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.commands).toEqual([])
    })

    it(`treats unreadable stored text as no draft`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)
      const cash = bot.data(label(bot.f.cash))
      bot.store.values.set(bot.draftKey, `{not json`)

      await bot.press(cash)

      expect(bot.shown().at(-1)).toBe(EN.stale)
    })
  })

  describe(`one talk per person`, () => {
    it(`makes a running /expense button stale when /transfer starts`, async () => {
      const bot = transferBot()
      await bot.send(`/expense 12.50`)
      const entrySave = bot.data(EN.save)
      expect(entrySave.startsWith(`${ENTRY_CALLBACK}:`)).toBe(true)

      await bot.send(`/transfer`)
      const draft = bot.draft()
      await bot.press(entrySave)

      expect(bot.shown().at(-1)).toBe(entryText(`en`).stale)
      expect(bot.draft()).toEqual(draft)
      expect([...bot.transactions.transactions.values()]).toEqual([])
    })

    it(`makes a running /transfer button stale when /expense starts`, async () => {
      const bot = transferBot()
      await bot.send(`/transfer`)
      const cash = bot.data(label(bot.f.cash))

      await bot.send(`/expense 12.50`)
      const draft = bot.draft()
      await bot.press(cash)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.draft()).toEqual(draft)
    })

    it(`keeps typed text out of the talk /transfer replaced`, async () => {
      const bot = transferBot()
      await bot.send(`/expense`)

      await bot.send(`/transfer`)
      await bot.send(`12.50`)

      expect(bot.shown().at(-1)).toBe(EN.pickFrom)
      expect([...bot.transactions.transactions.values()]).toEqual([])
    })
  })

  describe(`a read command in the middle of a talk`, () => {
    for (const command of [`/balance`, `/month`]) {
      it(`answers ${command} and the talk goes on with its draft`, async () => {
        const bot = transferBot()
        await picked(bot, bot.f.cash, bot.f.savings)
        const talk = [...bot.store.values.entries()]
        const before = bot.sent().length

        await bot.send(command)

        expect(bot.sent().length).toBe(before + 1)
        expect(bot.sent().at(-1)).not.toContain(EN.notAmount)
        expect([...bot.store.values.entries()]).toEqual(talk)

        await bot.send(`12.50`)
        await bot.press(bot.data(EN.save))

        expect(bot.stored()[0].sentAmount).toBe(1250)
      })
    }
  })
})
