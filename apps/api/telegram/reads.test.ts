import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { SecondFactorStatus } from "@spy4x/server/sign-in"
import { formatMoney } from "@spy4x/platform/universal/money-core"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { type Account, AccountKind, AccountWidgetQuery } from "@domain/accounts"
import { type Category, CategoryKind, CategoryListQuery } from "@domain/categories"
import { GroupError, GroupGetQuery, GroupRole, GroupSelectedQuery } from "@domain/groups"
import { DEFAULT_PREFERENCES, LANGUAGES, UserMFAStatus } from "@domain/identity"
import { defaultHouseholdSettings, type RateLookup } from "@domain/money"
import { TransactionKind, TransactionLedgerQuery } from "@domain/transactions"
import { translatorFor } from "@server/telegram/words.ts"
import { MemoryAccountRepository } from "../_testing/memory-accounts.ts"
import { MemoryCategoryRepository } from "../_testing/memory-categories.ts"
import { MemoryTransactionRepository } from "../_testing/memory-transactions.ts"
import { createSessionGate } from "../cqrs/session-gate.ts"
import { PreferencesGetQuery } from "../cqrs/queries.ts"
import { createAccountWidgetHandler } from "../features/accounts/handlers.ts"
import { createCategoryListHandler } from "../features/categories/handlers.ts"
import { createTransactionLedgerHandler } from "../features/transactions/handlers.ts"
import { createSeedBot, type TelegramLinkService } from "./bot.ts"
import { createTelegramProduct } from "./commands.ts"
import { fakeTelegram, TELEGRAM_USER_ID, textUpdate } from "./fake-telegram.ts"
import { PICK_MAX } from "./entries.ts"
import { LEFT_OUT_NAMED, MESSAGE_MAX } from "./reads.ts"

/**
 * `/balance` and `/month` on the fake Telegram API, over the real account, category and ledger
 * handlers on in-memory repositories. Only Seed's group and preference reads are stand-ins here,
 * answering from the same memberships. That a transfer never reaches the ledger is proven against
 * Postgres in `tests/integration/money-overview.integration.test.ts`.
 */

const OWNER = 1
const VIEWER = 2
const TG_VIEWER = TELEGRAM_USER_ID + 1
const HOME = uuidV7()
const OTHER = uuidV7()
const AT = new Date(`2026-11-02T10:00:00.000Z`)
/** The day every stored rate carries, and how the English replies write it. */
const RATE_DATE = `2026-11-10`
const RATE_DATE_TEXT = `Nov 10, 2026`
const COIN_DATE = `2026-11-09`
const COIN_DATE_TEXT = `Nov 9, 2026`
/** What one unit of a currency buys in dollars, the household's base. */
const RATES: Record<string, string> = { JPY: `0.0065`, EUR: `1.25` }
const EN = translatorFor(`en`)
/** A value as the bot isolates it inside a message: between FSI and PDI. */
const iso = (value: string) => `⁨${value}⁩`
const usd = (amount: number) => iso(formatMoney(amount, `USD`, `en`, { decimals: 2 }))

function account(name: string, currency: string, more: Partial<Account> = {}): Account {
  return {
    id: uuidV7(),
    groupId: HOME,
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

function category(name: string, kind: CategoryKind, more: Partial<Category> = {}): Category {
  return {
    id: uuidV7(),
    groupId: HOME,
    name,
    kind,
    icon: `tag`,
    color: `#c2410c`,
    parentId: null,
    aliases: [],
    archivedAt: null,
    version: 1,
    changeSequence: `1`,
    createdByUserId: OWNER,
    updatedByUserId: OWNER,
    createdAt: AT,
    updatedAt: AT,
    ...more,
  }
}

interface Options {
  now?: Date
  timeZone?: string
  accounts?: Account[]
  categories?: Category[]
  /** The household's name. */
  name?: string
  /** The owner's selected household, read as it is stored. */
  selection?: string | null
  /** The owner's region format preference. */
  locale?: string | null
  /** Runs right after the household's name was read, before any money is. */
  afterGroupRead?: () => void
  /** Runs right after the selection was read. */
  afterSelection?: () => void
}

/** The bot over the buses, an owner, a viewer and a fake Telegram. */
function readBot(options: Options = {}) {
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
  const held = options.accounts ?? []
  for (const one of held) accounts.accounts.set(one.id, one)
  const categories = new MemoryCategoryRepository()
  for (const one of options.categories ?? []) categories.categories.set(one.id, one)
  const ledgerRates = (base: string, quote: string): Promise<ExchangeRate | null> => {
    const rate = quote === `USD` ? RATES[base] : undefined
    return Promise.resolve(
      rate ? { base, quote, rate, date: RATE_DATE, source: `test` } : null,
    )
  }
  const transactions = new MemoryTransactionRepository({
    accounts: new Map(
      held.map((one) => [one.id, { groupId: one.groupId, currency: one.currency }]),
    ),
    categories: new Map(
      (options.categories ?? []).map((one) => [one.id, {
        groupId: one.groupId,
        kind: one.kind,
        parentId: one.parentId,
      }]),
    ),
    timeZones: new Map([[HOME, options.timeZone ?? `UTC`]]),
    rates: ledgerRates,
  })
  const settings = {
    get: (groupId: string) =>
      Promise.resolve({ ...defaultHouseholdSettings(groupId), baseCurrency: `USD` }),
  }
  const rates = {
    lookup: async (base: string, quote: string): Promise<RateLookup> => {
      const rate = await ledgerRates(base, quote)
      return rate ? { found: true, rate } : { found: false, reason: `no-rate` }
    },
    coinPrices: () => Promise.resolve([{ coin: `BTC`, price: `60000`, date: COIN_DATE }]),
  }
  const now = () => options.now ?? AT

  const queryBus = new QueryBus()
  queryBus.use(createSessionGate([]))
  queryBus.register(
    AccountWidgetQuery,
    createAccountWidgetHandler({ accounts, groups, settings, rates, today: () => RATE_DATE }),
  )
  queryBus.register(CategoryListQuery, createCategoryListHandler({ categories, groups }))
  queryBus.register(
    TransactionLedgerQuery,
    createTransactionLedgerHandler({ transactions, groups, settings, now }),
  )
  queryBus.register(GroupSelectedQuery, ({ data }) => {
    const stored = data.actor.userId === OWNER && options.selection !== undefined
      ? options.selection
      : [...memberships.keys()].find((key) => key.endsWith(`:${data.actor.userId}`))?.split(`:`)[0]
    options.afterSelection?.()
    return Promise.resolve({ groupId: stored ?? null, version: 1 })
  })
  queryBus.register(GroupGetQuery, ({ data }) => {
    if (!memberships.has(`${data.groupId}:${data.actor.userId}`)) {
      throw new GroupError(`GROUP_NOT_FOUND`, `Group not found`)
    }
    options.afterGroupRead?.()
    return Promise.resolve({
      group: {
        id: data.groupId,
        name: data.groupId === HOME ? options.name ?? `Home` : `Other`,
        timeZone: options.timeZone ?? `UTC`,
      },
    }) as never
  })
  queryBus.register(PreferencesGetQuery, () =>
    Promise.resolve({
      version: 1,
      value: { ...DEFAULT_PREFERENCES, locale: options.locale ?? null },
    }) as never)

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
  const values = new Map<string, string>()
  const store = {
    get: (key: string) => Promise.resolve(values.get(key) ?? null),
    set: (key: string, value: string) => (values.set(key, value), Promise.resolve()),
    del: (key: string) => (values.delete(key), Promise.resolve()),
  }
  const bot = createSeedBot({
    client: telegram.client,
    username: `financy_bot`,
    store,
    webAppUrl: `https://app.example.com`,
    links,
    product: createTelegramProduct({ queryBus, commandBus: new CommandBus(), store, now }),
  })

  return {
    queryBus,
    /** Takes `userId` out of the household, as the owner's removal does. */
    remove: (groupId: string, userId: number) => memberships.delete(`${groupId}:${userId}`),
    /** Stores one entry on `date`; an income in an expense category is a refund. */
    entry: async (
      into: Account,
      to: Category,
      kind: TransactionKind,
      amount: number,
      date = `2026-11-05`,
    ) => {
      await transactions.create({
        groupId: into.groupId,
        id: uuidV7(),
        accountId: into.id,
        categoryId: to.id,
        kind,
        amount,
        currency: into.currency,
        memo: ``,
        date,
        allowance: null,
      }, OWNER)
    },
    /** Sends `text` and answers with the one message the bot sent for it. */
    ask: async (text: string, from = TELEGRAM_USER_ID, language?: string) => {
      const before = telegram.sent().length
      await bot.handleUpdate(textUpdate(text, { from, language }))
      const replies = telegram.sent().slice(before)
      expect(replies.length).toBe(1)
      return replies[0] as string
    },
  }
}

const cash = () => account(`Cash`, `USD`, { startingBalance: 10_000 })
const food = () => category(`Food`, CategoryKind.EXPENSE)
const salary = () => category(`Salary`, CategoryKind.INCOME)

describe(`/balance in the Telegram bot`, () => {
  it(`starts with the household's name and lists each open account in its own currency`, async () => {
    const bot = readBot({
      accounts: [cash(), account(`Wallet`, `JPY`, { startingBalance: 5000 })],
    })

    const reply = await bot.ask(`/balance`)

    expect(reply.split(`\n`)[0]).toBe(iso(`Home`))
    expect(reply).toContain(`${iso(`Cash`)}: ${usd(10_000)}`)
    expect(reply).toContain(`${iso(`Wallet`)}: ${iso(`¥5,000`)}`)
  })

  it(`says the total is about, with the rate date, when a rate was used`, async () => {
    const bot = readBot({
      accounts: [cash(), account(`Wallet`, `JPY`, { startingBalance: 10_000 })],
    })

    const reply = await bot.ask(`/balance`)

    expect(reply).toContain(`Total: about ${usd(10_000 + 6_500)}`)
    expect(reply).toContain(`At the exchange rates of ${iso(RATE_DATE_TEXT)}`)
  })

  it(`names the coin price date apart from the rate date when a coin was valued`, async () => {
    const bot = readBot({
      accounts: [cash(), account(`Coins`, `BTC`, { kind: AccountKind.CRYPTO })],
    })

    const reply = await bot.ask(`/balance`)

    expect(reply).toContain(`Coin prices of ${iso(COIN_DATE_TEXT)}. Data provided by CoinGecko.`)
    expect(reply).toContain(`At the exchange rates of ${iso(RATE_DATE_TEXT)}`)
  })

  it(`says neither about nor a date when no account needed a rate`, async () => {
    const bot = readBot({ accounts: [cash()] })

    const reply = await bot.ask(`/balance`)

    expect(reply).toContain(`Total: ${usd(10_000)}`)
    expect(reply).not.toContain(`about`)
    expect(reply).not.toContain(`exchange rates of`)
  })

  it(`names a currency with no rate and keeps its amount out of the total (R8)`, async () => {
    const bot = readBot({
      accounts: [cash(), account(`Baht`, `THB`, { startingBalance: 99_900 })],
    })

    const reply = await bot.ask(`/balance`)

    expect(reply).toContain(`Total: ${usd(10_000)}`)
    expect(reply).toContain(`Leaves out 1 account: no exchange rate for ${iso(`THB`)} yet.`)
  })

  it(`gives no number when no account could be converted`, async () => {
    const bot = readBot({ accounts: [account(`Baht`, `THB`, { startingBalance: 99_900 })] })

    const reply = await bot.ask(`/balance`)

    expect(reply).toContain(EN.t(`TelegramBot.noTotal`))
    expect(reply).not.toContain(`Total:`)
  })

  it(`gives no number for a total too large to be exact`, async () => {
    const bot = readBot({
      accounts: [
        account(`Vault`, `USD`, { startingBalance: Number.MAX_SAFE_INTEGER }),
        account(`Safe`, `USD`, { startingBalance: Number.MAX_SAFE_INTEGER }),
      ],
    })

    const reply = await bot.ask(`/balance`)

    expect(reply).toContain(EN.t(`AccountsTotal.tooLarge`))
    expect(reply).not.toContain(`Total:`)
  })

  it(`counts an archived account in the total and does not list it`, async () => {
    const bot = readBot({
      accounts: [cash(), account(`Old`, `USD`, { startingBalance: 2_500, archivedAt: AT })],
    })

    const reply = await bot.ask(`/balance`)

    expect(reply).toContain(`Total: ${usd(12_500)}`)
    expect(reply).toContain(EN.t(`AccountWidgets.archived`, { count: 1 }))
    expect(reply).not.toContain(iso(`Old`))
  })

  it(`lists at most ${PICK_MAX} accounts and counts the rest`, async () => {
    const many = Array.from({ length: PICK_MAX + 5 }, (_, at) => account(`A${at}`, `USD`))
    const bot = readBot({ accounts: many })

    const lines = (await bot.ask(`/balance`)).split(`\n`)

    expect(lines.filter((line) => line.startsWith(iso(`A`).slice(0, 2))).length).toBe(PICK_MAX)
    expect(lines.at(-1)).toBe(EN.t(`TelegramBot.moreAccounts`, { count: 5 }))
  })

  it(`names at most ${LEFT_OUT_NAMED} left-out currencies and counts the rest`, async () => {
    const codes = Intl.supportedValuesOf(`currency`)
      .filter((code) => !RATES[code] && code !== `USD`)
      .slice(0, LEFT_OUT_NAMED + 4)
    const bot = readBot({ accounts: [cash(), ...codes.map((code) => account(code, code))] })

    const reply = await bot.ask(`/balance`)

    expect(reply).toContain(`Leaves out ${codes.length} accounts`)
    expect(reply).toContain(iso(codes[LEFT_OUT_NAMED - 1]))
    expect(reply).not.toContain(`for ${iso(codes[LEFT_OUT_NAMED])}`)
    expect(reply).toContain(EN.t(`TelegramBot.moreCurrencies`, { count: 4 }))
  })

  it(`shows the total and the count alone when every account is archived`, async () => {
    const bot = readBot({
      accounts: [account(`Old`, `USD`, { startingBalance: 2_500, archivedAt: AT })],
    })

    const reply = await bot.ask(`/balance`)

    expect(reply.split(`\n`)).toEqual([
      iso(`Home`),
      `Total: ${usd(2_500)}`,
      EN.t(`AccountWidgets.archived`, { count: 1 }),
    ])
  })

  it(`writes amounts in the person's region format, else in Telegram's language`, async () => {
    const german = iso(formatMoney(10_000, `USD`, `de`, { decimals: 2 }))

    const saved = await readBot({ accounts: [cash()], locale: `de` }).ask(`/balance`)
    const reported = await readBot({ accounts: [cash()] })
      .ask(`/balance`, TELEGRAM_USER_ID, `de`)

    expect(saved).toContain(`Total: ${german}`)
    expect(reported).toContain(german)
  })

  it(`says the household has no account when it has none`, async () => {
    const bot = readBot()

    expect(await bot.ask(`/balance`)).toBe(EN.t(`TelegramBot.noAccount`))
  })
})

describe(`/month in the Telegram bot`, () => {
  it(`equals the ledger read's converted figure for USD and JPY expenses (R8)`, async () => {
    const dollars = cash()
    const yen = account(`Wallet`, `JPY`)
    const groceries = food()
    const bot = readBot({ accounts: [dollars, yen], categories: [groceries] })
    await bot.entry(dollars, groceries, TransactionKind.EXPENSE, 1_000)
    await bot.entry(yen, groceries, TransactionKind.EXPENSE, 1_000)

    const reply = await bot.ask(`/month`)

    const { ledger } = await bot.queryBus.execute(
      new TransactionLedgerQuery({
        actor: {
          userId: OWNER,
          userMfa: UserMFAStatus.NOT_CONFIGURED,
          sessionSecondFactor: SecondFactorStatus.Completed,
        },
        groupId: HOME,
        from: `2026-11-01`,
        to: `2026-11-30`,
      }),
    )
    expect(ledger.spending).toBe(1_650)
    expect(reply).toContain(`Spending: about ${usd(ledger.spending!)}`)
    expect(reply).toContain(`Net: about ${usd(ledger.net!)}`)
  })

  it(`names a currency with no rate and keeps its amount out of the sum (R8)`, async () => {
    const dollars = cash()
    const baht = account(`Baht`, `THB`)
    const groceries = food()
    const bot = readBot({ accounts: [dollars, baht], categories: [groceries] })
    await bot.entry(dollars, groceries, TransactionKind.EXPENSE, 1_000)
    await bot.entry(baht, groceries, TransactionKind.EXPENSE, 77_700)

    const reply = await bot.ask(`/month`)

    expect(reply).toContain(`Spending: ${usd(1_000)}`)
    expect(reply).toContain(`Leaves out spending in ${iso(`THB`)}: no exchange rate for it yet.`)
  })

  it(`shows no figure for a side made only of entries with no rate`, async () => {
    const baht = account(`Baht`, `THB`)
    const groceries = food()
    const bot = readBot({ accounts: [baht], categories: [groceries] })
    await bot.entry(baht, groceries, TransactionKind.EXPENSE, 77_700)

    const reply = await bot.ask(`/month`)

    expect(reply).not.toContain(`Spending:`)
    expect(reply).not.toContain(`Net:`)
    expect(reply).toContain(`Leaves out spending in ${iso(`THB`)}`)
    expect(reply).toContain(`Leaves out income and spending in ${iso(`THB`)}`)
  })

  it(`says about with each side's own rate date only on the side that used a rate`, async () => {
    const dollars = cash()
    const yen = account(`Wallet`, `JPY`)
    const groceries = food()
    const pay = salary()
    const bot = readBot({ accounts: [dollars, yen], categories: [groceries, pay] })
    await bot.entry(dollars, pay, TransactionKind.INCOME, 5_000)
    await bot.entry(yen, groceries, TransactionKind.EXPENSE, 1_000)

    const lines = (await bot.ask(`/month`)).split(`\n`)

    const rates = `Converted at each day's exchange rate, the latest from ${iso(RATE_DATE_TEXT)}`
    expect(lines[lines.indexOf(`Income: ${usd(5_000)}`) + 1]).not.toBe(rates)
    expect(lines[lines.indexOf(`Spending: about ${usd(650)}`) + 1]).toBe(rates)
    expect(lines).toContain(`Net: about ${usd(4_350)}`)
  })

  it(`says neither about nor a date when nothing needed a rate`, async () => {
    const dollars = cash()
    const groceries = food()
    const bot = readBot({ accounts: [dollars], categories: [groceries] })
    await bot.entry(dollars, groceries, TransactionKind.EXPENSE, 1_000)

    const reply = await bot.ask(`/month`)

    expect(reply).toContain(`Spending: ${usd(1_000)}`)
    expect(reply).not.toContain(`about`)
    expect(reply).not.toContain(`exchange rate`)
  })

  it(`takes this month in the household's zone, not in UTC`, async () => {
    const dollars = cash()
    const groceries = food()
    const bot = readBot({
      // Still November in UTC, already December in Tokyo.
      now: new Date(`2026-11-30T20:00:00.000Z`),
      timeZone: `Asia/Tokyo`,
      accounts: [dollars],
      categories: [groceries],
    })
    await bot.entry(dollars, groceries, TransactionKind.EXPENSE, 1_000, `2026-11-30`)
    await bot.entry(dollars, groceries, TransactionKind.EXPENSE, 2_500, `2026-12-01`)

    const reply = await bot.ask(`/month`)

    expect(reply.split(`\n`)[0]).toBe(`${iso(`Home`)} · ${iso(`December 2026`)}`)
    expect(reply).toContain(`Spending: ${usd(2_500)}`)
  })

  it(`lowers spending by a refund and does not count it as income`, async () => {
    const dollars = cash()
    const groceries = food()
    const bot = readBot({ accounts: [dollars], categories: [groceries] })
    await bot.entry(dollars, groceries, TransactionKind.EXPENSE, 4_000)
    await bot.entry(dollars, groceries, TransactionKind.INCOME, 1_500)

    const reply = await bot.ask(`/month`)

    expect(reply).toContain(`Income: ${usd(0)}`)
    expect(reply).toContain(`Spending: ${usd(2_500)}`)
    expect(reply).toContain(`Net: ${usd(-2_500)}`)
  })

  it(`ranks top-level categories as the overview does, a child inside its parent`, async () => {
    const dollars = cash()
    const parent = food()
    const child = category(`Groceries`, CategoryKind.EXPENSE, { parentId: parent.id })
    const bot = readBot({ accounts: [dollars], categories: [parent, child] })
    await bot.entry(dollars, child, TransactionKind.EXPENSE, 3_000)

    const reply = await bot.ask(`/month`)

    expect(reply).toContain(`${iso(`Food`)}: ${usd(3_000)}`)
    expect(reply).not.toContain(iso(`Groceries`))
  })

  it(`names the top five categories and counts the rest`, async () => {
    const dollars = cash()
    const many = Array.from(
      { length: 7 },
      (_, at) => category(`Category ${at + 1}`, CategoryKind.EXPENSE),
    )
    const bot = readBot({ accounts: [dollars], categories: many })
    for (const [at, one] of many.entries()) {
      await bot.entry(dollars, one, TransactionKind.EXPENSE, 1_000 * (at + 1))
    }

    const reply = await bot.ask(`/month`)

    expect(reply).toContain(iso(`Category 7`))
    expect(reply).toContain(iso(`Category 3`))
    expect(reply).not.toContain(iso(`Category 2`))
    expect(reply).toContain(EN.t(`MoneyWidgets.categoriesMore`, { count: 2 }))
  })

  it(`gives no number for a month too large to be exact`, async () => {
    const dollars = cash()
    const groceries = food()
    const pay = salary()
    const bot = readBot({ accounts: [dollars], categories: [groceries, pay] })
    await bot.entry(dollars, pay, TransactionKind.INCOME, Number.MAX_SAFE_INTEGER)
    await bot.entry(dollars, pay, TransactionKind.INCOME, Number.MAX_SAFE_INTEGER)
    await bot.entry(dollars, groceries, TransactionKind.EXPENSE, 1_000)

    const reply = await bot.ask(`/month`)

    expect(reply).toContain(EN.t(`MoneyWidgets.incomeTooLarge`))
    expect(reply).toContain(EN.t(`MoneyWidgets.spendingTooLarge`))
    expect(reply).toContain(EN.t(`MoneyWidgets.netTooLarge`))
    expect(reply).not.toMatch(/\$/)
  })
})

describe(`/month when only the ranking is too large`, () => {
  it(`keeps the figures and lists no category`, async () => {
    const dollars = cash()
    const first = category(`First`, CategoryKind.EXPENSE)
    const second = category(`Second`, CategoryKind.EXPENSE)
    const refunded = category(`Refunded`, CategoryKind.EXPENSE)
    const bot = readBot({ accounts: [dollars], categories: [first, second, refunded] })
    await bot.entry(dollars, first, TransactionKind.EXPENSE, Number.MAX_SAFE_INTEGER)
    await bot.entry(dollars, second, TransactionKind.EXPENSE, Number.MAX_SAFE_INTEGER)
    await bot.entry(dollars, refunded, TransactionKind.INCOME, Number.MAX_SAFE_INTEGER)

    const reply = await bot.ask(`/month`)

    expect(reply).toContain(`Spending: ${usd(Number.MAX_SAFE_INTEGER)}`)
    expect(reply).toContain(EN.t(`MoneyWidgets.spendingTooLarge`))
    expect(reply).not.toContain(iso(`First`))
  })
})

describe(`who may read a household`, () => {
  it(`answers a viewer's /balance and /month`, async () => {
    const dollars = cash()
    const groceries = food()
    const bot = readBot({ accounts: [dollars], categories: [groceries] })
    await bot.entry(dollars, groceries, TransactionKind.EXPENSE, 1_000)

    expect(await bot.ask(`/balance`, TG_VIEWER)).toContain(`Total: ${usd(10_000)}`)
    expect(await bot.ask(`/month`, TG_VIEWER)).toContain(`Spending: ${usd(1_000)}`)
  })

  for (const command of [`/balance`, `/month`]) {
    it(`${command} says there is no household once a removed member's selection falls away`, async () => {
      const bot = readBot({ accounts: [cash()] })
      bot.remove(HOME, VIEWER)

      expect(await bot.ask(command, TG_VIEWER)).toBe(EN.t(`TelegramBot.noHousehold`))
    })

    it(`${command} gives no figures when membership ends right after the selection is read`, async () => {
      const bot = readBot({
        accounts: [cash()],
        afterSelection: () => bot.remove(HOME, OWNER),
      })

      expect(await bot.ask(command)).toBe(EN.t(`TelegramBot.notMember`))
    })

    it(`${command} gives no figures when membership ends right before the money is read`, async () => {
      const bot = readBot({
        accounts: [cash()],
        afterGroupRead: () => bot.remove(HOME, OWNER),
      })

      expect(await bot.ask(command)).toBe(EN.t(`TelegramBot.notMember`))
    })

    it(`${command} never reads a household the person is not in`, async () => {
      const theirs = account(`Theirs`, `USD`, { groupId: OTHER, startingBalance: 123_456 })
      const bot = readBot({ accounts: [theirs], selection: OTHER })
      bot.remove(OTHER, OWNER)

      const reply = await bot.ask(command)

      expect(reply).toBe(EN.t(`TelegramBot.notMember`))
    })

    it(`${command} does not call another failure a lost membership`, async () => {
      const bot = readBot({
        accounts: [cash()],
        afterSelection: () => {
          throw new GroupError(`ROLE_INSUFFICIENT`, `Not allowed`)
        },
      })

      await expect(bot.ask(command)).rejects.toThrow(`Not allowed`)
    })
  }

  it(`names the household it read, so a person in several knows which one answered`, async () => {
    const bot = readBot({ accounts: [cash()], selection: OTHER })

    expect((await bot.ask(`/month`)).split(`\n`)[0]).toContain(iso(`Other`))
  })
})

describe(`every language`, () => {
  for (const language of LANGUAGES) {
    it(`answers /balance and /month in ${language} with no missing word`, async () => {
      const dollars = cash()
      const yen = account(`Wallet`, `JPY`, { startingBalance: 1_000 })
      const baht = account(`Baht`, `THB`, { startingBalance: 1_000 })
      const groceries = food()
      const pay = salary()
      const bot = readBot({
        accounts: [dollars, yen, baht, account(`Old`, `USD`, { archivedAt: AT })],
        categories: [groceries, pay],
      })
      await bot.entry(dollars, pay, TransactionKind.INCOME, 5_000)
      await bot.entry(yen, groceries, TransactionKind.EXPENSE, 1_000)
      await bot.entry(baht, groceries, TransactionKind.EXPENSE, 1_000)
      const t = translatorFor(language)

      const balance = await bot.ask(`/balance`, TELEGRAM_USER_ID, language)
      const month = await bot.ask(`/month`, TELEGRAM_USER_ID, language)

      expect(balance).toContain(t.t(`AccountsTotal.title`))
      expect(month).toContain(t.t(`MoneyWidgets.spendingTitle`))
      for (const reply of [balance, month]) {
        expect(reply).not.toMatch(/TelegramBot\.|AccountsTotal\.|MoneyWidgets\.|\{\w+\}/)
      }
    })
  }

  it(`answers in English when Telegram reports a language code nobody knows`, async () => {
    const bot = readBot({ accounts: [cash()] })

    const reply = await bot.ask(`/balance`, TELEGRAM_USER_ID, `x`.repeat(10_000))

    expect(reply).toContain(`Total: ${usd(10_000)}`)
  })
})

describe(`Telegram's message limit`, () => {
  /** A name of 60 characters that each take two UTF-16 units, the longest the app accepts. */
  const LONG_NAME = `𝒜`.repeat(60)
  const CODES = Intl.supportedValuesOf(`currency`).filter((code) => !RATES[code] && code !== `USD`)

  /** The largest household the app allows, every name at its longest, no currency with a rate. */
  function worstCase() {
    const accounts = CODES.slice(0, 100).map((code) =>
      account(LONG_NAME, code, { startingBalance: 1_000_000_000_000 })
    )
    const categories = Array.from(
      { length: 8 },
      (_, at) => category(`${at}${`𝒜`.repeat(59)}`, CategoryKind.EXPENSE),
    )
    const dated = [
      account(LONG_NAME, `JPY`, { startingBalance: 1_000_000_000_000 }),
      account(LONG_NAME, `BTC`, { kind: AccountKind.CRYPTO, startingBalance: 100_000_000 }),
      account(LONG_NAME, `USD`, { archivedAt: AT }),
    ]
    return { accounts: [cash(), ...dated, ...accounts], categories, name: `𝒜`.repeat(100) }
  }

  for (const language of LANGUAGES) {
    it(`keeps /balance within the limit in ${language} and says how many it left out`, async () => {
      const bot = readBot(worstCase())

      const reply = await bot.ask(`/balance`, TELEGRAM_USER_ID, language)

      expect(reply.length).toBeLessThanOrEqual(MESSAGE_MAX)
      expect(reply).toContain(iso(LONG_NAME))
      expect(reply.split(`\n`).at(-1)).toMatch(/\d/)
    })

    it(`keeps /month within the limit in ${language}`, async () => {
      const worst = worstCase()
      const bot = readBot(worst)
      for (const [at, into] of worst.accounts.entries()) {
        const to = worst.categories[at % worst.categories.length]
        await bot.entry(into, to, TransactionKind.EXPENSE, 1_000)
        await bot.entry(into, to, TransactionKind.INCOME, 500)
      }

      const reply = await bot.ask(`/month`, TELEGRAM_USER_ID, language)

      expect(reply.length).toBeLessThanOrEqual(MESSAGE_MAX)
    })
  }
})
