import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { type Account, AccountGetQuery, AccountKind, AccountListQuery } from "@domain/accounts"
import { FREE_PLAN_ID } from "@domain/billing"
import {
  type Category,
  CategoryGetQuery,
  CategoryKind,
  CategoryListQuery,
} from "@domain/categories"
import {
  GroupError,
  GroupListQuery,
  GroupRole,
  GroupSelectCommand,
  GroupSelectedQuery,
} from "@domain/groups"
import { DEFAULT_PREFERENCES, UserMFAStatus } from "@domain/identity"
import {
  type Transaction,
  TransactionCreateCommand,
  TransactionKind,
  TransactionLatestQuery,
} from "@domain/transactions"
import { TEST_FREE_PLAN, TEST_PLANS, testUsage } from "../../../libs/domain/billing/test-plans.ts"
import { MemoryAccountRepository } from "../_testing/memory-accounts.ts"
import { MemoryCategoryRepository } from "../_testing/memory-categories.ts"
import { MemoryTransactionRepository } from "../_testing/memory-transactions.ts"
import { createSessionGate } from "../cqrs/session-gate.ts"
import { createEntitlementGate } from "../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../cqrs/entitlement-needs.ts"
import { PreferencesGetQuery } from "../cqrs/queries.ts"
import { createAccountGetHandler, createAccountListHandler } from "../features/accounts/handlers.ts"
import {
  createCategoryGetHandler,
  createCategoryListHandler,
} from "../features/categories/handlers.ts"
import {
  createTransactionCreateHandler,
  createTransactionLatestHandler,
} from "../features/transactions/handlers.ts"
import { botText, createSeedBot, type TelegramLinkService } from "./bot.ts"
import { createTelegramProduct } from "./commands.ts"
import { AMOUNT_TEXT_MAX, ENTRY_CALLBACK, entryText, PICK_MAX } from "./entries.ts"
import { callbackUpdate, fakeTelegram, TELEGRAM_USER_ID, textUpdate } from "./fake-telegram.ts"

/**
 * `/expense` and `/income` on the fake Telegram API, over one pair of buses with the session and
 * entitlement gates and the real account, category and entry handlers on in-memory repositories.
 * Only Seed's group and preference reads are stand-ins here, answering from the same memberships.
 * That the bot's entry reaches the partner's screen (its outbox row) is proven against Postgres in
 * `tests/integration/telegram-entries.integration.test.ts`.
 */

const OWNER = 1
const VIEWER = 2
const PARTNER = 3
const TG_VIEWER = TELEGRAM_USER_ID + 1
const TG_PARTNER = TELEGRAM_USER_ID + 2
const HOME = uuidV7()
const OTHER = uuidV7()
const AT = new Date(`2026-11-02T10:00:00.000Z`)
const EN = entryText(`en`)
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

function category(
  groupId: string,
  name: string,
  kind: CategoryKind,
  more: Partial<Category> = {},
): Category {
  return {
    id: uuidV7(),
    groupId,
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

/** The households, their accounts and categories every test starts from. */
function fixtures() {
  return {
    cash: account(HOME, `Cash`, `USD`, { isDefault: true }),
    wallet: account(HOME, `Wallet`, `JPY`),
    bank: account(HOME, `Bank`, `BHD`),
    old: account(HOME, `Old`, `EUR`, { archivedAt: AT }),
    otherAccount: account(OTHER, `Theirs`, `USD`, { isDefault: true }),
    groceries: category(HOME, `Groceries`, CategoryKind.EXPENSE),
    salary: category(HOME, `Salary`, CategoryKind.INCOME),
    gone: category(HOME, `Gone`, CategoryKind.EXPENSE, { archivedAt: AT }),
    otherCategory: category(OTHER, `Their food`, CategoryKind.EXPENSE),
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
  /** Each household's time zone. */
  timeZone?: string
  /** The owner's region format preference. */
  locale?: string | null
  /** The owner's selected household; version 0 means never chosen. */
  ownerSelection?: { groupId: string; version: number }
  /** The free plan's cap on stored entries; none when left out, as in the test catalog. */
  maxTransactions?: number
}

/** The bot over the buses, three linked people and a fake Telegram. */
function entryBot(options: Options = {}) {
  const f = fixtures()
  const memberships = new Map<string, GroupRole>([
    [`${HOME}:${OWNER}`, GroupRole.OWNER],
    [`${HOME}:${VIEWER}`, GroupRole.VIEWER],
    [`${HOME}:${PARTNER}`, GroupRole.EDITOR],
    [`${OTHER}:${OWNER}`, GroupRole.OWNER],
  ])
  const groups = {
    roleOf: (groupId: string, userId: number) =>
      Promise.resolve(memberships.get(`${groupId}:${userId}`) ?? null),
  }
  const accounts = new MemoryAccountRepository()
  for (const one of [f.cash, f.wallet, f.bank, f.old, f.otherAccount]) {
    accounts.accounts.set(one.id, one)
  }
  const categories = new MemoryCategoryRepository()
  for (const one of [f.groceries, f.salary, f.gone, f.otherCategory]) {
    categories.categories.set(one.id, one)
  }
  const transactions = new MemoryTransactionRepository({
    accounts: new Map(
      [...accounts.accounts.values()].map((one) => [one.id, {
        groupId: one.groupId,
        currency: one.currency,
      }]),
    ),
    categories: new Map(
      [...categories.categories.values()].map((one) => [one.id, {
        groupId: one.groupId,
        kind: one.kind,
      }]),
    ),
    timeZones: new Map([[HOME, options.timeZone ?? `UTC`], [OTHER, `UTC`]]),
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

  const dependencies = { transactions, groups, now: () => options.now ?? AT }
  const commandBus = new CommandBus()
  commandBus.use(createSessionGate([]))
  commandBus.use(createEntitlementGate({
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
    usage: testUsage({ maxTransactions: (group) => transactions.count(group) }),
  }, ENTITLEMENT_NEEDS))
  commandBus.register(TransactionCreateCommand, createTransactionCreateHandler(dependencies))
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
  queryBus.register(CategoryListQuery, createCategoryListHandler({ categories, groups }))
  queryBus.register(CategoryGetQuery, createCategoryGetHandler({ categories, groups }))
  queryBus.register(TransactionLatestQuery, createTransactionLatestHandler(dependencies))
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

  const linked = new Map([[TELEGRAM_USER_ID, OWNER], [TG_VIEWER, VIEWER], [TG_PARTNER, PARTNER]])
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
    product: createTelegramProduct({ queryBus, commandBus, store }),
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
  const entries = () => [...transactions.transactions.values()]

  return {
    f,
    ...telegram,
    store,
    accounts,
    transactions,
    entries,
    selected,
    buttons,
    data,
    shown,
    /** Takes `userId` out of the household, as the owner's removal does. */
    remove: (groupId: string, userId: number) => memberships.delete(`${groupId}:${userId}`),
    /** An entry `userId` made earlier, so the defaults follow it. */
    earlier: async (
      userId: number,
      accountId: string,
      categoryId: string,
      kind = TransactionKind.EXPENSE,
    ) => {
      const into = accounts.accounts.get(accountId)!
      await transactions.create({
        groupId: into.groupId,
        id: uuidV7(),
        accountId,
        categoryId,
        kind,
        amount: 100,
        currency: into.currency,
        memo: ``,
        date: `2026-11-01`,
        allowance: null,
      }, userId)
    },
    send: (text: string, from = TELEGRAM_USER_ID, chat?: string, language?: string) =>
      bot.handleUpdate(textUpdate(text, { from, chat, language })),
    press: (callback: string, from = TELEGRAM_USER_ID) =>
      bot.handleUpdate(callbackUpdate(callback, { from })),
  }
}

type EntryBot = ReturnType<typeof entryBot>

/** `/expense`, the typed amount and Save, with the owner's last expense in `accountId`. */
async function typedExpense(bot: EntryBot, accountId: string, typed: string) {
  await bot.earlier(OWNER, accountId, bot.f.groceries.id)
  const before = new Set(bot.entries().map((entry) => entry.id))
  await bot.send(`/expense`)
  await bot.send(typed)
  await bot.press(bot.data(EN.save))
  return bot.entries().filter((entry) => !before.has(entry.id))
}

describe(`/expense and /income in the Telegram bot`, () => {
  describe(`amounts by the account currency's decimals (R1, R2)`, () => {
    it(`stores 500 for "500" typed into a JPY account`, async () => {
      const bot = entryBot()
      const [entry] = await typedExpense(bot, bot.f.wallet.id, `500`)
      expect(entry).toMatchObject({ amount: -500, currency: `JPY`, accountId: bot.f.wallet.id })
    })

    it(`stores 1250 for "12.50" typed into a USD account`, async () => {
      const bot = entryBot()
      const [entry] = await typedExpense(bot, bot.f.cash.id, `12.50`)
      expect(entry).toMatchObject({ amount: -1250, currency: `USD` })
    })

    it(`stores 1234 for "1.234" typed into a BHD account`, async () => {
      const bot = entryBot()
      const [entry] = await typedExpense(bot, bot.f.bank.id, `1.234`)
      expect(entry).toMatchObject({ amount: -1234, currency: `BHD` })
    })

    it(`reads "12,50" as 1250 for a person whose region format is German`, async () => {
      const bot = entryBot({ locale: `de` })
      const [entry] = await typedExpense(bot, bot.f.cash.id, `12,50`)
      expect(entry).toMatchObject({ amount: -1250, currency: `USD` })
    })

    it(`reads the amount in Telegram's language when the person set no region format`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)

      await bot.send(`/expense 12,50`, TELEGRAM_USER_ID, `private`, `de`)

      expect(bot.entries().map((entry) => entry.amount)).toEqual([-100, -1250])
    })

    it(`refuses text that is no amount above zero with the reason and the question again, and saves nothing`, async () => {
      const cases: [string, string][] = [
        [`abc`, EN.notAmount],
        [`1`.repeat(AMOUNT_TEXT_MAX + 1), EN.notAmount],
        [`0`, EN.notPositive],
        [`-5`, EN.notPositive],
        [`1.005`, EN.tooManyDecimals(`USD`)],
        [`9`.repeat(AMOUNT_TEXT_MAX), EN.tooLarge],
      ]
      for (const [typed, reason] of cases) {
        const bot = entryBot()
        await bot.send(`/expense`)

        await bot.send(typed)

        expect(bot.shown().at(-1)).toBe(`${reason} ${EN.askAmount(`USD`, `Cash`)}`)
        expect(bot.entries()).toEqual([])
      }
    })
  })

  describe(`defaults`, () => {
    it(`asks for the amount naming the default account and its currency when the person has no expense yet`, async () => {
      const bot = entryBot()

      await bot.send(`/expense`)

      expect(bot.sent()).toEqual([`How much? In USD, from ${iso(`Cash`)}.`])
    })

    it(`saves /expense 12.50 at once in the account and category of the person's last expense`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)

      await bot.send(`/expense 12.50`)

      const saved = bot.entries().at(-1)!
      expect(saved).toMatchObject({
        accountId: bot.f.cash.id,
        categoryId: bot.f.groceries.id,
        kind: TransactionKind.EXPENSE,
        amount: -1250,
        createdByUserId: OWNER,
      })
      expect(bot.sent()).toEqual([
        `Expense: $12.50 · ${iso(`Cash`)} · ${iso(`Groceries`)} · today\n${EN.saved}`,
      ])
    })

    it(`follows only the person's own last entry of the command's kind`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.wallet.id, bot.f.salary.id, TransactionKind.INCOME)
      await bot.earlier(PARTNER, bot.f.bank.id, bot.f.groceries.id)

      await bot.send(`/expense`)

      expect(bot.sent()).toEqual([EN.askAmount(`USD`, `Cash`)])
    })

    it(`starts in the default account when the last entry's account is archived`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.old.id, bot.f.groceries.id)

      await bot.send(`/expense 3`)

      expect(bot.entries()).toHaveLength(1)
      expect(bot.sent().at(-1)).toBe(
        `Expense: $3.00 · ${iso(`Cash`)} · ${EN.noCategory} · today\n${EN.needCategory}`,
      )
    })

    it(`leaves out a last category that was archived since`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.gone.id)

      await bot.send(`/expense 3`)

      expect(bot.entries()).toHaveLength(1)
      expect(bot.sent().at(-1)).toContain(EN.noCategory)
    })

    it(`asks for a category on Save when the entry has none, listing live categories of its kind only`, async () => {
      const bot = entryBot()
      await bot.send(`/expense 3`)

      await bot.press(bot.data(EN.save))

      expect(bot.entries()).toEqual([])
      expect(bot.shown().at(-1)).toBe(EN.needCategory)
      expect(bot.buttons().map((one) => one.text)).toEqual([`Groceries`, EN.back])
      await bot.press(bot.data(`Groceries`))
      await bot.press(bot.data(EN.save))
      expect(bot.entries()).toMatchObject([{ amount: -300, categoryId: bot.f.groceries.id }])
    })

    it(`says so when the household has no category of the entry's kind`, async () => {
      const bot = entryBot()
      bot.f.salary.archivedAt = AT
      await bot.send(`/income 3`)

      await bot.press(bot.data(EN.category))

      expect(bot.shown().at(-1)).toBe(EN.noCategories)
    })

    it(`lists income categories alone for /income`, async () => {
      const bot = entryBot()
      await bot.send(`/income 3`)

      await bot.press(bot.data(EN.category))

      expect(bot.buttons().map((one) => one.text)).toEqual([`Salary`, EN.back])
    })

    it(`says so, and saves nothing, when the household has no open account`, async () => {
      const bot = entryBot()
      for (const one of [bot.f.cash, bot.f.wallet, bot.f.bank]) one.archivedAt = AT

      await bot.send(`/expense 3`)

      expect(bot.sent()).toEqual([EN.noAccount])
      expect(bot.entries()).toEqual([])
    })
  })

  describe(`the summary's buttons`, () => {
    it(`lists open accounts with the entry's own first, and returns to the summary on a pick`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`)
      await bot.send(`12`)

      await bot.press(bot.data(EN.account))

      expect(bot.buttons().map((one) => one.text)).toEqual([
        `Cash · USD`,
        `Bank · BHD`,
        `Wallet · JPY`,
        EN.back,
      ])
      await bot.press(bot.data(`Bank · BHD`))
      expect(bot.shown().at(-1)).toBe(
        `Expense: BHD\u00a012.000 · ${iso(`Bank`)} · ${iso(`Groceries`)} · today`,
      )
      await bot.press(bot.data(EN.save))
      expect(bot.entries().at(-1)).toMatchObject({ amount: -12000, accountId: bot.f.bank.id })
    })

    it(`asks for the amount again in the new currency when the typed one does not fit it`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`)
      await bot.send(`12.50`)
      await bot.press(bot.data(EN.account))

      await bot.press(bot.data(`Wallet · JPY`))

      expect(bot.sent().at(-1)).toBe(
        `${EN.tooManyDecimals(`JPY`)} ${EN.askAmount(`JPY`, `Wallet`)}`,
      )
      await bot.send(`1250`)
      await bot.press(bot.data(EN.save))
      expect(bot.entries().at(-1)).toMatchObject({ amount: -1250, accountId: bot.f.wallet.id })
    })

    it(`goes back to the summary unchanged from a list`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`)
      await bot.send(`12`)
      const summary = bot.sent().at(-1)
      await bot.press(bot.data(EN.category))

      await bot.press(bot.data(EN.back))

      expect(bot.shown().at(-1)).toBe(summary)
    })

    it(`cancels: the summary says so and Save no longer saves`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`)
      await bot.send(`12`)
      const save = bot.data(EN.save)

      await bot.press(bot.data(EN.cancel))
      await bot.press(save)

      expect(bot.shown().slice(-2)).toEqual([EN.cancelled, EN.stale])
      expect(bot.entries()).toHaveLength(1)
    })

    it(`answers a button of an older talk as stale and saves nothing, while a newer talk runs`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`)
      await bot.send(`12`)
      const old = bot.data(EN.save)
      await bot.send(`/expense`)
      await bot.send(`7`)

      await bot.press(old)

      expect(bot.shown().at(-1)).toBe(EN.stale)
      expect(bot.entries()).toHaveLength(1)
    })

    it(`answers a button with malformed data as stale`, async () => {
      for (const tail of [`save`, `a:zzzzzzzz:x`, `save:0000000g`, `a:00000000:${uuidV7()}x`]) {
        const bot = entryBot()
        await bot.press(`${ENTRY_CALLBACK}:${tail}`)
        expect(bot.shown()).toEqual([EN.stale])
      }
    })

    it(`keeps every button's data within Telegram's 64 bytes`, async () => {
      const bot = entryBot({ ownerSelection: { groupId: HOME, version: 0 } })
      await bot.send(`/expense 1`)
      const all = [...bot.buttons()]
      await bot.press(bot.data(`Home`))
      all.push(...bot.buttons())
      await bot.press(bot.data(EN.account))
      all.push(...bot.buttons())

      expect(all.length).toBeGreaterThan(5)
      for (const one of all) {
        expect(new TextEncoder().encode(one.callback_data).length).toBeLessThanOrEqual(64)
      }
    })

    it(`offers at most ${PICK_MAX} accounts in one list`, async () => {
      const bot = entryBot()
      for (let i = 0; i < PICK_MAX + 5; i++) {
        const more = account(HOME, `Extra ${i}`, `USD`)
        bot.accounts.accounts.set(more.id, more)
      }
      await bot.send(`/expense 1`)

      await bot.press(bot.data(EN.account))

      const listed = bot.buttons().map((one) => one.text)
      expect(listed).toHaveLength(PICK_MAX + 1)
      expect(listed.at(0)).toBe(`Cash · USD`)
      expect(listed.at(-1)).toBe(EN.back)
    })
  })

  describe(`which household`, () => {
    it(`asks which household first when the person never chose and has several, then selects it`, async () => {
      const bot = entryBot({ ownerSelection: { groupId: HOME, version: 0 } })

      await bot.send(`/expense`)
      expect(bot.sent()).toEqual([EN.pickHousehold])
      await bot.press(bot.data(`Other`))

      expect(bot.selected).toEqual([{ groupId: OTHER, userId: OWNER }])
      expect(bot.sent().at(-1)).toBe(EN.askAmount(`USD`, `Theirs`))
    })

    it(`does not ask which household when the person chose one before`, async () => {
      const bot = entryBot({ ownerSelection: { groupId: OTHER, version: 3 } })

      await bot.send(`/expense`)

      expect(bot.sent()).toEqual([EN.askAmount(`USD`, `Theirs`)])
    })

    it(`refuses a household button naming a household the person is not in`, async () => {
      const bot = entryBot({ ownerSelection: { groupId: HOME, version: 0 } })
      await bot.send(`/expense`)
      const other = bot.data(`Other`)
      bot.remove(OTHER, OWNER)
      bot.remove(HOME, OWNER)

      await bot.press(other)

      expect(bot.sent().at(-1)).toBe(EN.notMember)
      expect(bot.selected).toEqual([])
    })

    it(`says so when the person is in no household`, async () => {
      const bot = entryBot()
      bot.remove(HOME, OWNER)
      bot.remove(OTHER, OWNER)

      await bot.send(`/expense 3`)

      expect(bot.sent()).toEqual([EN.noHousehold])
    })
  })

  describe(`the household's today (R14)`, () => {
    it(`dates an entry sent at 23:30 on the 31st in the household's zone on the 31st`, async () => {
      // 23:30 on 31 January in New York is 04:30 on 1 February in UTC.
      const bot = entryBot({
        now: new Date(`2026-02-01T04:30:00.000Z`),
        timeZone: `America/New_York`,
      })
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)

      await bot.send(`/expense 4.20`)

      expect(bot.entries().at(-1)).toMatchObject({ amount: -420, date: `2026-01-31` })
    })
  })

  describe(`refusals (R16, R17)`, () => {
    it(`refuses a viewer's /expense with the reason and writes nothing`, async () => {
      const bot = entryBot()
      await bot.earlier(VIEWER, bot.f.cash.id, bot.f.groceries.id)
      const before = bot.entries().length

      await bot.send(`/expense 12.50`, TG_VIEWER)

      expect(bot.sent()).toEqual([EN.viewer])
      expect(bot.entries()).toHaveLength(before)
    })

    it(`refuses Save when the person was removed after the summary, and writes nothing`, async () => {
      const bot = entryBot()
      await bot.earlier(PARTNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`, TG_PARTNER)
      await bot.send(`12.50`, TG_PARTNER)
      const save = bot.data(EN.save)
      bot.remove(HOME, PARTNER)

      await bot.press(save, TG_PARTNER)

      expect(bot.sent().at(-1)).toBe(EN.notMember)
      expect(bot.entries()).toHaveLength(1)
    })

    it(`gives a removed member nothing from the household they left`, async () => {
      const bot = entryBot()
      await bot.earlier(PARTNER, bot.f.cash.id, bot.f.groceries.id)
      bot.remove(HOME, PARTNER)

      await bot.send(`/expense 12.50`, TG_PARTNER)

      expect(bot.sent()).toEqual([EN.noHousehold])
      expect(bot.entries()).toHaveLength(1)
    })

    it(`refuses an account button naming another household's account, and keeps the entry's own`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`)
      await bot.send(`12.50`)
      const save = bot.data(EN.save)
      const tag = save.split(`:`)[2]

      await bot.press(`${ENTRY_CALLBACK}:a:${tag}:${bot.f.otherAccount.id}`)
      await bot.press(save)

      expect(bot.sent().at(-1)).toBe(EN.unavailable)
      expect(bot.entries().at(-1)).toMatchObject({ amount: -1250, accountId: bot.f.cash.id })
    })

    it(`refuses a category button naming another household's category, an archived one or one of the other kind`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`)
      await bot.send(`12.50`)
      const save = bot.data(EN.save)
      const tag = save.split(`:`)[2]

      for (const id of [bot.f.otherCategory.id, bot.f.gone.id, bot.f.salary.id]) {
        const replies = bot.sent().length
        await bot.press(`${ENTRY_CALLBACK}:c:${tag}:${id}`)
        expect(bot.sent().slice(replies)).toEqual([EN.unavailable])
      }
      await bot.press(save)
      expect(bot.entries().at(-1)).toMatchObject({ categoryId: bot.f.groceries.id })
    })

    it(`refuses an archived account's button`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`)
      await bot.send(`12.50`)
      const tag = bot.data(EN.save).split(`:`)[2]

      await bot.press(`${ENTRY_CALLBACK}:a:${tag}:${bot.f.old.id}`)

      expect(bot.sent().at(-1)).toBe(EN.unavailable)
    })

    it(`tells the person when the household's plan has no room, and writes nothing`, async () => {
      const bot = entryBot({ maxTransactions: 1 })
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)

      await bot.send(`/expense 1`)

      expect(bot.sent()).toEqual([EN.planFull])
      expect(bot.entries()).toHaveLength(1)
    })

    it(`runs nothing for /expense sent in a group chat`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)

      await bot.send(`/expense 12.50`, TELEGRAM_USER_ID, `group`)

      expect(bot.sent()).toEqual([botText(`en`).privateOnly])
      expect(bot.entries()).toHaveLength(1)
      expect(bot.store.values.size).toBe(0)
    })
  })

  describe(`saving once`, () => {
    it(`saves once when Save is pressed twice at the same moment`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`)
      await bot.send(`12.50`)
      const save = bot.data(EN.save)

      await Promise.all([bot.press(save), bot.press(save)])

      expect(bot.entries()).toHaveLength(2)
      expect(bot.shown().filter((text) => text.endsWith(EN.saved))).toHaveLength(2)
    })

    it(`answers a second Save after the first as stale, and saves once`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`)
      await bot.send(`12.50`)
      const save = bot.data(EN.save)

      await bot.press(save)
      await bot.press(save)

      expect(bot.entries()).toHaveLength(2)
      expect(bot.shown().at(-1)).toBe(EN.stale)
    })

    it(`takes the buttons off the summary once saved`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.groceries.id)
      await bot.send(`/expense`)
      await bot.send(`12.50`)

      await bot.press(bot.data(EN.save))

      const edit = bot.calls.filter((call) => call.method === `editMessageText`).at(-1)!
      expect(edit.params.text).toBe(
        `Expense: $12.50 · ${iso(`Cash`)} · ${iso(`Groceries`)} · today\n${EN.saved}`,
      )
      expect(edit.params.reply_markup).toBeUndefined()
    })

    it(`stores an income from /income with an income category`, async () => {
      const bot = entryBot()
      await bot.earlier(OWNER, bot.f.cash.id, bot.f.salary.id, TransactionKind.INCOME)

      await bot.send(`/income 100`)

      expect(bot.entries().at(-1)).toMatchObject(
        {
          kind: TransactionKind.INCOME,
          amount: 10000,
          categoryId: bot.f.salary.id,
        } satisfies Partial<Transaction>,
      )
    })
  })
})
