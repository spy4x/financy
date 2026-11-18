/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { unzipSync } from "fflate"
import type postgres from "postgres"
import { AccountKind } from "@domain/accounts"
import { BudgetMonthQuery } from "@domain/budgets"
import { type CategoryIcon, CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import { UserMFAStatus } from "@domain/identity"
import { amountDecimals, ECB_BASE, RATE_SOURCES } from "@domain/money"
import { TransactionKind } from "@domain/transactions"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import {
  BUDGET_SPREADSHEET_MONTHS_MAX,
  budgetSpreadsheetPages,
} from "@server/budgets/budget-portable.ts"
import { PostgresBudgetRepository } from "@server/budgets/postgres-budget-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { PostgresGroupPorter } from "@server/groups/postgres-group-porter.ts"
import { PostgresGroupRepository } from "@server/groups/postgres-group-repository.ts"
import { PostgresHouseholdSettingsRepository } from "@server/money/postgres-household-settings-repository.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { csvField, parseCsv } from "@spy4x/platform/universal/csv"
import { moneyDecimalString } from "@spy4x/platform/universal/money"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { SecondFactorStatus } from "@spy4x/server/sign-in"
import { createBudgetMonthHandler } from "../../apps/api/features/budgets/handlers.ts"
import { PORTABLE_AGGREGATES } from "../../apps/api/services/db-base.ts"
import { insertUser, withSchema } from "./group-team.ts"

/**
 * `accounts.csv`, `categories.csv` and `budgets.csv` in a household's ZIP against a real Postgres.
 * Needs `DB_*` (recipe in docs/handoff.md); it fails when they are missing.
 */

/** Mid-March 2026: the budget rows run up to this month. */
const NOW = new Date(`2026-03-15T12:00:00Z`)

type Household = Awaited<ReturnType<typeof household>>

/** A household with one owner, and short ways to write what its spreadsheets read. */
async function household(sql: postgres.Sql, name = `Family`) {
  const owner = await insertUser(sql)
  const groupId = uuidV7()
  await new PostgresGroupRepository(sql).create({ id: groupId, name }, owner)
  const accounts = new PostgresAccountRepository(sql)
  const categories = new PostgresCategoryRepository(sql)
  return {
    owner,
    groupId,
    accounts,
    categories,
    async account(name: string, currency: string, startingBalance = 0, kind = AccountKind.BANK) {
      const id = uuidV7()
      await accounts.create(
        { groupId, id, name, kind, currency, startingBalance, allowance: null },
        owner,
      )
      return id
    },
    async category(
      name: string,
      parentId: string | null = null,
      kind: CategoryKind = CategoryKind.EXPENSE,
    ) {
      const id = uuidV7()
      await categories.create({
        groupId,
        id,
        name,
        kind,
        icon: `tag` as CategoryIcon,
        color: `#c2410c`,
        parentId,
        allowance: null,
      }, owner)
      return id
    },
    /** An entry in the account's own currency: below zero an expense, above it an income. */
    async entry(
      accountId: string,
      categoryId: string,
      amount: number,
      currency: string,
      date: string,
    ) {
      const kind = amount < 0 ? TransactionKind.EXPENSE : TransactionKind.INCOME
      await sql`
        INSERT INTO transactions (id, group_id, account_id, category_id, kind, account_amount,
          amount, currency, converted, memo, date, change_sequence, created_by_user_id,
          updated_by_user_id)
        VALUES (${uuidV7()}, ${groupId}, ${accountId}, ${categoryId}, ${kind}, ${amount},
          ${amount}, ${currency}, false, '', ${date}, 1, ${owner}, ${owner})
      `
    },
    async transfer(fromId: string, toId: string, amount: number, date: string) {
      await sql`
        INSERT INTO transfers (id, group_id, from_account_id, to_account_id, sent_amount,
          received_amount, converted, memo, date, change_sequence, created_by_user_id,
          updated_by_user_id)
        VALUES (${uuidV7()}, ${groupId}, ${fromId}, ${toId}, ${amount}, ${amount}, false, '',
          ${date}, 1, ${owner}, ${owner})
      `
    },
    /** A limit from `month` on; no amount removes it from that month. */
    async limit(categoryId: string, month: string, amount: number | null, currency: string | null) {
      await sql`
        INSERT INTO budgets (id, group_id, category_id, month, amount, currency, change_sequence,
          created_by_user_id, updated_by_user_id)
        VALUES (${uuidV7()}, ${groupId}, ${categoryId}, ${`${month}-01`}, ${amount}, ${currency}, 1,
          ${owner}, ${owner})
      `
    },
  }
}

/** How many of `quote` one euro buys, from before the months these tests read. */
async function euroRate(sql: postgres.Sql, quote: string, rate: string) {
  await sql`
    INSERT INTO exchange_rates (id, base, quote, rate, rate_date, source)
    VALUES (${uuidV7()}, ${ECB_BASE}, ${quote}, ${rate}, '2026-01-01', ${RATE_SOURCES.ecb})
  `
}

/** The household's ZIP as the owner downloads it: each spreadsheet's rows, by file name. */
async function sheets(sql: postgres.Sql, h: Household, language = `en`) {
  const porter = new PostgresGroupPorter(sql, PORTABLE_AGGREGATES)
  const file = await porter.exportGroup(h.groupId, h.owner, undefined, {
    format: `csv`,
    language,
  })
  const pieces: BlobPart[] = []
  for await (const piece of file.chunks) pieces.push(piece as BlobPart)
  const zip = unzipSync(new Uint8Array(await new Blob(pieces).arrayBuffer()))
  const decoder = new TextDecoder()
  const read = (name: string) => {
    const parsed = parseCsv(decoder.decode(zip[name]))
    if (!parsed.ok) throw new Error(`${name} is not a CSV file`)
    return parsed.value
  }
  return {
    names: Object.keys(zip).sort(),
    accounts: read(`accounts.csv`),
    categories: read(`categories.csv`),
    budgets: read(`budgets.csv`),
    transactions: read(`transactions.csv`),
    transfers: read(`transfers.csv`),
  }
}

/** An entry with every stored fact stated; a positive `accountAmount` is an income. */
async function storedEntry(sql: postgres.Sql, h: Household, entry: {
  accountId: string
  categoryId: string
  amount: number
  currency: string
  accountAmount: number
  date: string
  memo?: string
  createdBy?: number | null
}) {
  const kind = entry.amount < 0 ? TransactionKind.EXPENSE : TransactionKind.INCOME
  const createdBy = entry.createdBy === undefined ? h.owner : entry.createdBy
  await sql`
    INSERT INTO transactions (id, group_id, account_id, category_id, kind, account_amount, amount,
      currency, converted, memo, date, change_sequence, created_by_user_id, updated_by_user_id)
    VALUES (${uuidV7()}, ${h.groupId}, ${entry.accountId}, ${entry.categoryId}, ${kind},
      ${entry.accountAmount}, ${entry.amount}, ${entry.currency}, false, ${entry.memo ?? ``},
      ${entry.date}, 1, ${createdBy}, ${createdBy})
  `
}

/** A transfer whose two amounts may differ, between accounts of two currencies. */
async function storedTransfer(sql: postgres.Sql, h: Household, transfer: {
  fromId: string
  toId: string
  sent: number
  received: number
  date: string
  memo?: string
}) {
  await sql`
    INSERT INTO transfers (id, group_id, from_account_id, to_account_id, sent_amount,
      received_amount, converted, memo, date, change_sequence, created_by_user_id,
      updated_by_user_id)
    VALUES (${uuidV7()}, ${h.groupId}, ${transfer.fromId}, ${transfer.toId}, ${transfer.sent},
      ${transfer.received}, false, ${transfer.memo ?? ``}, ${transfer.date}, 1, ${h.owner},
      ${h.owner})
  `
}

/** The household's main currency, which a new household has as its default until it is set. */
async function baseCurrency(sql: postgres.Sql, h: Household, currency: string) {
  await sql`
    INSERT INTO household_settings (group_id, base_currency) VALUES (${h.groupId}, ${currency})
    ON CONFLICT (group_id) DO UPDATE SET base_currency = ${currency}
  `
}

/** Columns of `transactions.csv` that hold the conversion, by name. */
function conversion(row: string[]) {
  const [baseAmount, base, rate, rateDate, rateSource] = row.slice(8, 13)
  return { baseAmount, base, rate, rateDate, rateSource }
}

/** The rows of `budgets.csv` at `now`, as their cells read. */
async function budgetRows(sql: postgres.Sql, groupId: string, now = NOW) {
  const rows: string[][] = []
  for await (const page of budgetSpreadsheetPages(sql, groupId, now)) {
    for (const row of page) {
      rows.push([
        row.month,
        row.category,
        csvField(row.limit),
        row.currency,
        csvField(row.spent),
        row.leftOut,
      ])
    }
  }
  return rows
}

/** The Budgets screen's read of a month, through its own handler. */
function budgetsScreen(sql: postgres.Sql, h: Household, month: string) {
  const transactions = new PostgresTransactionRepository(sql)
  const read = createBudgetMonthHandler({
    budgets: new PostgresBudgetRepository(sql),
    groups: { roleOf: () => Promise.resolve(GroupRole.OWNER) },
    settings: new PostgresHouseholdSettingsRepository(sql),
    ledger: (groupId, currency, from, to) => transactions.ledger(groupId, currency, from, to),
    ledgerMonths: (groupId, currency, from, to) =>
      transactions.ledgerMonths(groupId, currency, from, to),
    rate: () => Promise.resolve(null),
    now: () => NOW,
  })
  return read(
    new BudgetMonthQuery({
      actor: {
        userId: h.owner,
        userMfa: UserMFAStatus.NOT_CONFIGURED,
        sessionSecondFactor: SecondFactorStatus.NotRequired,
      },
      groupId: h.groupId,
      month,
    }),
  )
}

/** Three months of limits in three currencies, with spending, a refund and a removed limit. */
async function budgetedHousehold(sql: postgres.Sql) {
  const h = await household(sql)
  const usd = await h.account(`Main`, `USD`)
  const jpy = await h.account(`Yen`, `JPY`)
  const bhd = await h.account(`Dinar`, `BHD`)
  const food = await h.category(`Food`)
  const groceries = await h.category(`Groceries`, food)
  const transport = await h.category(`Transport`)
  const trips = await h.category(`Trips`)
  await h.limit(food, `2026-01`, 50000, `USD`)
  await h.limit(groceries, `2026-02`, 1500, `BHD`)
  await h.limit(groceries, `2026-03`, null, null)
  await h.limit(transport, `2026-01`, 7000, `JPY`)
  // A limit that starts next month is not one yet.
  await h.limit(trips, `2026-04`, 90000, `USD`)
  await h.entry(usd, food, -1250, `USD`, `2026-01-10`)
  await h.entry(bhd, groceries, -750, `BHD`, `2026-02-11`)
  await h.entry(jpy, transport, -3000, `JPY`, `2026-02-12`)
  // A refund larger than the month's spending.
  await h.entry(usd, food, 200, `USD`, `2026-03-02`)
  return h
}

Deno.test(`the spreadsheets of a household are in the ZIP under headings in its language`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const { names, accounts, categories, budgets } = await sheets(sql, h, `ru`)
    expect(names).toEqual(expect.arrayContaining([
      `accounts.csv`,
      `budgets.csv`,
      `categories.csv`,
    ]))
    expect(accounts[0]).toEqual([
      `Название`,
      `Тип`,
      `Валюта`,
      `Начальный баланс`,
      `Баланс на сегодня`,
      `В архиве`,
    ])
    expect(categories[0]).toEqual([`Название`, `Тип`, `Родительская категория`, `В архиве`])
    expect(budgets[0]).toEqual([
      `Месяц`,
      `Категория`,
      `Лимит`,
      `Валюта лимита`,
      `Потрачено`,
      `Неучтённые валюты (нет курса)`,
    ])
  })
})

Deno.test(`the accounts spreadsheet writes each amount exactly, in its currency's decimals`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await h.account(`Bitcoin`, `BTC`, 12345, AccountKind.CRYPTO)
    await h.account(`Card debt`, `USD`, -1250, AccountKind.CARD)
    await h.account(`Dinar`, `BHD`, 1500)
    await h.account(`Yen`, `JPY`, 1500, AccountKind.CASH)
    const { accounts } = await sheets(sql, h)
    expect(accounts.slice(1)).toEqual([
      [`Bitcoin`, `Crypto`, `BTC`, `0.00012345`, `0.00012345`, `No`],
      [`Card debt`, `Card`, `USD`, `-12.50`, `-12.50`, `No`],
      [`Dinar`, `Bank`, `BHD`, `1.500`, `1.500`, `No`],
      [`Yen`, `Cash`, `JPY`, `1500`, `1500`, `No`],
    ])
  })
})

Deno.test(`the accounts spreadsheet's balance today is the one the accounts screen shows`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const main = await h.account(`Main`, `USD`, 100000)
    const savings = await h.account(`Savings`, `USD`)
    const food = await h.category(`Food`)
    await h.entry(main, food, -25000, `USD`, `2026-01-10`)
    await h.transfer(main, savings, 30000, `2026-01-11`)
    await h.transfer(savings, main, 5000, `2026-01-12`)
    // Dated after today, so neither the screen nor the spreadsheet counts it yet.
    await h.entry(main, food, -99900, `USD`, `2999-01-01`)

    const { accounts } = await sheets(sql, h)
    const screen = await h.accounts.list(h.groupId)
    expect(accounts.slice(1).map((row) => [row[0], row[4]])).toEqual(
      screen.map((account) => [account.name, moneyDecimalString(account.balance, 2)]),
    )
    expect(accounts.slice(1).map((row) => row[4])).toEqual([`500.00`, `250.00`])
  })
})

Deno.test(`the accounts spreadsheet leaves out a deleted account and says which are archived`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const closed = await h.account(`Closed`, `USD`)
    const gone = await h.account(`Gone`, `USD`)
    await h.accounts.archive(
      { groupId: h.groupId, id: closed, archived: true, expectedVersion: 1 },
      h.owner,
    )
    await h.accounts.delete({ groupId: h.groupId, id: gone, expectedVersion: 1 }, h.owner)
    const { accounts } = await sheets(sql, h)
    expect(accounts.slice(1).map((row) => [row[0], row[5]])).toEqual([[`Closed`, `Yes`]])
  })
})

Deno.test(`the accounts spreadsheet guards a name a spreadsheet would run as a formula`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await h.account(`=SUM(A1:A9)`, `USD`)
    const { accounts } = await sheets(sql, h)
    expect(accounts[1][0]).toBe(`'=SUM(A1:A9)`)
  })
})

Deno.test(`the accounts spreadsheet leaves a balance past the safe range empty and keeps the rest`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const huge = await h.account(`Huge`, `USD`)
    await h.account(`Small`, `USD`, 1250)
    const salary = await h.category(`Salary`, null, CategoryKind.INCOME)
    await h.entry(huge, salary, Number.MAX_SAFE_INTEGER, `USD`, `2026-01-10`)
    await h.entry(huge, salary, Number.MAX_SAFE_INTEGER, `USD`, `2026-01-11`)
    const { accounts } = await sheets(sql, h)
    expect(accounts.slice(1).map((row) => [row[0], row[4]])).toEqual([
      [`Huge`, ``],
      [`Small`, `12.50`],
    ])
  })
})

Deno.test(`the categories spreadsheet names each parent by its name`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const food = await h.category(`Food`)
    await h.category(`Groceries`, food)
    await h.category(`Auto`)
    const salary = await h.category(`Salary`, null, CategoryKind.INCOME)
    await h.categories.archive(
      { groupId: h.groupId, id: salary, archived: true, expectedVersion: 1, allowance: null },
      h.owner,
    )
    const { categories } = await sheets(sql, h)
    expect(categories.slice(1)).toEqual([
      [`Auto`, `Expense`, ``, `No`],
      [`Food`, `Expense`, ``, `No`],
      [`Groceries`, `Expense`, `Food`, `No`],
      [`Salary`, `Income`, ``, `Yes`],
    ])
  })
})

Deno.test(`the budgets spreadsheet has a row per category for each month a limit applies`, async () => {
  await withSchema(async (sql) => {
    const h = await budgetedHousehold(sql)
    expect(await budgetRows(sql, h.groupId)).toEqual([
      // No rates exist here, so each row names the month's entries in other currencies.
      [`2026-01`, `Food`, `500.00`, `USD`, `12.50`, ``],
      [`2026-01`, `Transport`, `7000`, `JPY`, `0`, `USD`],
      [`2026-02`, `Food`, `500.00`, `USD`, `0.00`, `BHD, JPY`],
      // Named with its parent; its limit is removed from March on.
      [`2026-02`, `Food / Groceries`, `1.500`, `BHD`, `0.750`, `JPY`],
      [`2026-02`, `Transport`, `7000`, `JPY`, `3000`, `BHD`],
      [`2026-03`, `Food`, `500.00`, `USD`, `-2.00`, ``],
      [`2026-03`, `Transport`, `7000`, `JPY`, `0`, `USD`],
    ])
  })
})

Deno.test(`the budgets spreadsheet shows each month's limit, spending and left-out currencies as the Budgets screen does`, async () => {
  await withSchema(async (sql) => {
    const h = await budgetedHousehold(sql)
    const decimal = (amount: number | null, currency: string) =>
      moneyDecimalString(amount!, amountDecimals(currency))
    const screen: string[][] = []
    for (const month of [`2026-01`, `2026-02`, `2026-03`]) {
      const { budgets } = await budgetsScreen(sql, h, month)
      for (const row of budgets.rows) {
        if (row.limit === null) continue
        screen.push([
          month,
          decimal(row.limit.amount, row.limit.currency),
          row.limit.currency,
          decimal(row.spending, row.limit.currency),
          row.leftOut.join(`, `),
        ])
      }
    }
    const rows = await budgetRows(sql, h.groupId)
    expect(rows.map(([month, _name, ...figures]) => [month, ...figures])).toEqual(screen)
  })
})

Deno.test(`the budgets spreadsheet gives a parent a row when its limit comes from its subcategories`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const main = await h.account(`Main`, `USD`)
    const home = await h.category(`Home`)
    const rent = await h.category(`Rent`, home)
    await h.limit(rent, `2026-03`, 30000, `USD`)
    await h.entry(main, rent, -1000, `USD`, `2026-03-02`)
    expect(await budgetRows(sql, h.groupId)).toEqual([
      [`2026-03`, `Home`, `300.00`, `USD`, `10.00`, ``],
      [`2026-03`, `Home / Rent`, `300.00`, `USD`, `10.00`, ``],
    ])
  })
})

Deno.test(`the budgets spreadsheet converts a parent's limit from subcategories in mixed currencies to the base currency`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await euroRate(sql, `USD`, `1.10`)
    const home = await h.category(`Home`)
    const rent = await h.category(`Rent`, home)
    const power = await h.category(`Power`, home)
    await h.limit(rent, `2026-03`, 100000, `EUR`)
    await h.limit(power, `2026-03`, 110000, `USD`)
    expect((await budgetRows(sql, h.groupId))[0]).toEqual(
      [`2026-03`, `Home`, `2000.00`, `EUR`, `0.00`, ``],
    )
  })
})

Deno.test(`the budgets spreadsheet names a subcategory's limit currency with no rate on its parent's row`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await euroRate(sql, `USD`, `1.10`)
    const home = await h.category(`Home`)
    const rent = await h.category(`Rent`, home)
    const power = await h.category(`Power`, home)
    const water = await h.category(`Water`, home)
    await h.limit(rent, `2026-03`, 100000, `EUR`)
    await h.limit(power, `2026-03`, 110000, `USD`)
    await h.limit(water, `2026-03`, 90000000, `VND`)
    expect((await budgetRows(sql, h.groupId))[0]).toEqual(
      [`2026-03`, `Home`, `2000.00`, `EUR`, `0.00`, `VND`],
    )
  })
})

Deno.test(`the budgets spreadsheet has no row for an archived category, past months included`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const food = await h.category(`Food`)
    const old = await h.category(`Old`)
    await h.limit(food, `2026-03`, 50000, `USD`)
    await h.limit(old, `2026-01`, 9000, `USD`)
    await h.categories.archive(
      { groupId: h.groupId, id: old, archived: true, expectedVersion: 1, allowance: null },
      h.owner,
    )
    expect(await budgetRows(sql, h.groupId)).toEqual([
      [`2026-03`, `Food`, `500.00`, `USD`, `0.00`, ``],
    ])
  })
})

Deno.test(`the budgets spreadsheet leaves spending in a currency with no rate out of spent and names that currency`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const usd = await h.account(`Main`, `USD`)
    const eur = await h.account(`Euro`, `EUR`)
    const vnd = await h.account(`Dong`, `VND`)
    const food = await h.category(`Food`)
    await h.limit(food, `2026-03`, 50000, `USD`)
    await h.entry(usd, food, -500, `USD`, `2026-03-02`)
    await h.entry(vnd, food, -2500000, `VND`, `2026-03-03`)
    await h.entry(eur, food, -900, `EUR`, `2026-03-04`)
    expect(await budgetRows(sql, h.groupId)).toEqual([
      [`2026-03`, `Food`, `500.00`, `USD`, `5.00`, `EUR, VND`],
    ])
  })
})

Deno.test(`the budgets spreadsheet ends at the household's current month in its time zone`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await h.limit(await h.category(`Food`), `2026-01`, 50000, `USD`)
    const monthsAt = async (timeZone: string, now: string) => {
      await sql`UPDATE groups SET time_zone = ${timeZone} WHERE id = ${h.groupId}`
      return (await budgetRows(sql, h.groupId, new Date(now))).map(([month]) => month)
    }
    // The same instant is already February in Tokyo and still January in Los Angeles.
    expect(await monthsAt(`Asia/Tokyo`, `2026-01-31T16:00:00Z`)).toEqual([`2026-01`, `2026-02`])
    expect(await monthsAt(`America/Los_Angeles`, `2026-01-31T16:00:00Z`)).toEqual([`2026-01`])
  })
})

Deno.test(`the budgets spreadsheet has no row for a limit that starts after the current month`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await h.limit(await h.category(`Trips`), `2026-04`, 50000, `USD`)
    expect(await budgetRows(sql, h.groupId)).toEqual([])

    // Nor once another category's limit has started the run.
    await h.limit(await h.category(`Food`), `2026-03`, 50000, `USD`)
    expect((await budgetRows(sql, h.groupId)).map(([month, name]) => [month, name])).toEqual([
      [`2026-03`, `Food`],
    ])
  })
})

Deno.test(`the budgets spreadsheet covers at most twenty years from an imported limit in the year 0001`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await h.limit(await h.category(`Food`), `0001-01`, 50000, `USD`)
    const months = (await budgetRows(sql, h.groupId)).map(([month]) => month)
    expect(months).toHaveLength(BUDGET_SPREADSHEET_MONTHS_MAX)
    expect(months[0]).toBe(`2006-04`)
    expect(months.at(-1)).toBe(`2026-03`)
  })
})

Deno.test(`the spreadsheets never show another household's rows`, async () => {
  await withSchema(async (sql) => {
    const theirs = await household(sql, `Theirs`)
    const account = await theirs.account(`Their account`, `USD`, 777)
    const category = await theirs.category(`Their category`)
    await theirs.limit(category, `2026-01`, 12300, `USD`)
    await theirs.entry(account, category, -500, `USD`, `2026-01-10`)

    const ours = await household(sql)
    await ours.account(`Our account`, `USD`)
    await ours.limit(await ours.category(`Our category`), `2026-01`, 50000, `USD`)

    const { accounts, categories } = await sheets(sql, ours)
    expect(accounts.slice(1).map(([name]) => name)).toEqual([`Our account`])
    expect(categories.slice(1).map(([name]) => name)).toEqual([`Our category`])
    const rows = await budgetRows(sql, ours.groupId)
    expect(new Set(rows.map(([_month, name]) => name))).toEqual(new Set([`Our category`]))
    expect(new Set(rows.map(([_month, _name, _limit, _currency, spent]) => spent)))
      .toEqual(new Set([`0.00`]))
  })
})

/** A stored rate from the euro on `date`, from `source`. */
async function storedRate(
  sql: postgres.Sql,
  quote: string,
  rate: string,
  date: string,
  source: string = RATE_SOURCES.ecb,
) {
  await sql`
    INSERT INTO exchange_rates (id, base, quote, rate, rate_date, source)
    VALUES (${uuidV7()}, ${ECB_BASE}, ${quote}, ${rate}, ${date}, ${source})
  `
}

/** Adds a person with `name` to the household; an empty name leaves them unnamed. */
async function member(sql: postgres.Sql, h: Household, firstName: string, lastName = ``) {
  const userId = await insertUser(sql)
  await sql`
    UPDATE users SET first_name = ${firstName || null}, last_name = ${lastName || null}
    WHERE id = ${userId}
  `
  await sql`
    INSERT INTO group_members (group_id, user_id, role, added_by_user_id)
    VALUES (${h.groupId}, ${userId}, ${GroupRole.EDITOR}, ${h.owner})
  `
  return userId
}

Deno.test(`the transactions spreadsheet shows a ¥1,500 expense from a yen account in a euro household`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await storedRate(sql, `JPY`, `160`, `2026-03-01`)
    const yen = await h.account(`Yen`, `JPY`)
    const food = await h.category(`Food`)
    const groceries = await h.category(`Groceries`, food)
    await storedEntry(sql, h, {
      accountId: yen,
      categoryId: groceries,
      amount: -1500,
      currency: `JPY`,
      accountAmount: -1500,
      date: `2026-03-02`,
      memo: `Market`,
    })
    const { transactions } = await sheets(sql, h)
    expect(transactions.slice(1)).toEqual([[
      `2026-03-02`,
      `Expense`,
      `Yen`,
      `Groceries`,
      `Food`,
      `Market`,
      `1500`,
      `JPY`,
      `9.38`,
      `EUR`,
      `0.00625`,
      `2026-03-01`,
      `ECB`,
      `1500`,
      `JPY`,
      `Unnamed member`,
    ]])
  })
})

Deno.test(`the transactions spreadsheet writes 0.00012345 BTC in full, never with an exponent`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const bitcoin = await h.account(`Bitcoin`, `BTC`, 0, AccountKind.CRYPTO)
    await storedEntry(sql, h, {
      accountId: bitcoin,
      categoryId: await h.category(`Food`),
      amount: -12345,
      currency: `BTC`,
      accountAmount: -12345,
      date: `2026-03-02`,
    })
    const { transactions } = await sheets(sql, h)
    expect(transactions[1][6]).toBe(`0.00012345`)
    expect(transactions[1][13]).toBe(`0.00012345`)
  })
})

Deno.test(`the transactions spreadsheet counts a yen entry paid from a euro account at the account's euros, with no rate`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await storedRate(sql, `JPY`, `160`, `2026-03-01`)
    await storedEntry(sql, h, {
      accountId: await h.account(`Euro`, `EUR`),
      categoryId: await h.category(`Food`),
      amount: -1500,
      currency: `JPY`,
      accountAmount: -1200,
      date: `2026-03-02`,
    })
    const { transactions } = await sheets(sql, h)
    expect(conversion(transactions[1])).toEqual({
      baseAmount: `12.00`,
      base: `EUR`,
      rate: ``,
      rateDate: ``,
      rateSource: ``,
    })
  })
})

Deno.test(`the transactions spreadsheet counts an entry typed in the main currency at the typed amount, with no rate`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await storedRate(sql, `USD`, `1.25`, `2026-03-01`)
    await storedEntry(sql, h, {
      accountId: await h.account(`Dollars`, `USD`),
      categoryId: await h.category(`Food`),
      amount: -1000,
      currency: `EUR`,
      accountAmount: -1300,
      date: `2026-03-02`,
    })
    const { transactions } = await sheets(sql, h)
    expect(conversion(transactions[1])).toEqual({
      baseAmount: `10.00`,
      base: `EUR`,
      rate: ``,
      rateDate: ``,
      rateSource: ``,
    })
  })
})

Deno.test(`the transactions spreadsheet converts a yen entry from a dollar account at the dollar's rate`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await storedRate(sql, `USD`, `1.25`, `2026-03-01`)
    // The typed yen would come to 9.38 euros at this rate; the ledger never uses it.
    await storedRate(sql, `JPY`, `160`, `2026-03-01`)
    await storedEntry(sql, h, {
      accountId: await h.account(`Dollars`, `USD`),
      categoryId: await h.category(`Food`),
      amount: -1500,
      currency: `JPY`,
      accountAmount: -1000,
      date: `2026-03-02`,
    })
    const { transactions } = await sheets(sql, h)
    expect(conversion(transactions[1])).toEqual({
      baseAmount: `8.00`,
      base: `EUR`,
      rate: `0.8`,
      rateDate: `2026-03-01`,
      rateSource: `ECB`,
    })
  })
})

Deno.test(`the transactions spreadsheet quotes the rate from the account's currency whichever way it is stored`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await baseCurrency(sql, h, `USD`)
    await storedRate(sql, `USD`, `1.25`, `2026-03-01`)
    await storedRate(sql, `GBP`, `0.5`, `2026-03-01`)
    const food = await h.category(`Food`)
    // Stored from the euro, as this pair is asked for.
    await storedEntry(sql, h, {
      accountId: await h.account(`Euro`, `EUR`),
      categoryId: food,
      amount: -1000,
      currency: `EUR`,
      accountAmount: -1000,
      date: `2026-03-02`,
    })
    // Derived through the euro: 1.25 / 0.5.
    await storedEntry(sql, h, {
      accountId: await h.account(`Pounds`, `GBP`),
      categoryId: food,
      amount: -1000,
      currency: `GBP`,
      accountAmount: -1000,
      date: `2026-03-03`,
    })
    const { transactions } = await sheets(sql, h)
    expect(transactions.slice(1).map((row) => [row[7], row[8], row[10]])).toEqual([
      [`EUR`, `12.50`, `1.25`],
      [`GBP`, `25.00`, `2.5`],
    ])
  })
})

Deno.test(`the transactions spreadsheet keeps an entry with no rate and leaves its conversion cells empty`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await storedEntry(sql, h, {
      accountId: await h.account(`Dong`, `VND`),
      categoryId: await h.category(`Food`),
      amount: -2500000,
      currency: `VND`,
      accountAmount: -2500000,
      date: `2026-03-02`,
    })
    const { transactions } = await sheets(sql, h)
    expect(transactions).toHaveLength(2)
    expect(transactions[1][6]).toBe(`2500000`)
    expect(conversion(transactions[1])).toEqual({
      baseAmount: ``,
      base: `EUR`,
      rate: ``,
      rateDate: ``,
      rateSource: ``,
    })
  })
})

Deno.test(`the transactions spreadsheet leaves a fallback rate's value out and keeps its amount, date and source`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await storedRate(sql, `VND`, `30000`, `2026-03-01`, RATE_SOURCES.fallback)
    await storedEntry(sql, h, {
      accountId: await h.account(`Dong`, `VND`),
      categoryId: await h.category(`Food`),
      amount: -3000000,
      currency: `VND`,
      accountAmount: -3000000,
      date: `2026-03-02`,
    })
    const { transactions } = await sheets(sql, h)
    expect(conversion(transactions[1])).toEqual({
      baseAmount: `100.00`,
      base: `EUR`,
      rate: ``,
      rateDate: `2026-03-01`,
      rateSource: `ExchangeRate-API`,
    })
  })
})

Deno.test(`the transactions spreadsheet names the demo's rates and shows any other source as stored`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await storedRate(sql, `USD`, `1.25`, `2026-03-01`, RATE_SOURCES.demo)
    await storedRate(sql, `GBP`, `0.5`, `2026-03-01`, `manual`)
    const food = await h.category(`Food`)
    for (const [name, currency, date] of [[`D`, `USD`, `2026-03-02`], [`P`, `GBP`, `2026-03-03`]]) {
      await storedEntry(sql, h, {
        accountId: await h.account(name, currency),
        categoryId: food,
        amount: -1000,
        currency,
        accountAmount: -1000,
        date,
      })
    }
    const { transactions } = await sheets(sql, h)
    expect(transactions.slice(1).map((row) => row[12])).toEqual([`Demo`, `manual`])
  })
})

Deno.test(`the transactions spreadsheet names who added an entry only while they are a member`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const named = await member(sql, h, `Ada`, `Lovelace`)
    const unnamed = await member(sql, h, ``)
    const removed = await member(sql, h, `Grace`, `Hopper`)
    await sql`DELETE FROM group_members WHERE group_id = ${h.groupId} AND user_id = ${removed}`
    const closed = await member(sql, h, `Alan`, `Turing`)
    await sql`UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${closed}`
    const account = await h.account(`Main`, `EUR`)
    const category = await h.category(`Food`)
    const creators = [named, unnamed, removed, closed, null]
    for (const [index, createdBy] of creators.entries()) {
      await storedEntry(sql, h, {
        accountId: account,
        categoryId: category,
        amount: -100,
        currency: `EUR`,
        accountAmount: -100,
        date: `2026-03-0${index + 1}`,
        createdBy,
      })
    }
    const { transactions } = await sheets(sql, h)
    expect(transactions.slice(1).map((row) => row[15])).toEqual([
      `Ada Lovelace`,
      `Unnamed member`,
      `Former member`,
      `Former member`,
      `Former member`,
    ])
  })
})

Deno.test(`the transactions spreadsheet guards a memo a spreadsheet would run as a formula`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await storedEntry(sql, h, {
      accountId: await h.account(`Main`, `EUR`),
      categoryId: await h.category(`Food`),
      amount: -100,
      currency: `EUR`,
      accountAmount: -100,
      date: `2026-03-02`,
      memo: `=HYPERLINK("http://example.com")`,
    })
    const { transactions } = await sheets(sql, h)
    expect(transactions[1][5]).toBe(`'=HYPERLINK("http://example.com")`)
  })
})

Deno.test(`the transactions spreadsheet words an income and its headings in the person's language`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await storedEntry(sql, h, {
      accountId: await h.account(`Main`, `EUR`),
      categoryId: await h.category(`Salary`, null, CategoryKind.INCOME),
      amount: 250000,
      currency: `EUR`,
      accountAmount: 250000,
      date: `2026-03-02`,
    })
    const { transactions, transfers } = await sheets(sql, h, `ru`)
    expect(transactions[0].slice(0, 3)).toEqual([`Дата`, `Тип`, `Счёт`])
    expect(transactions[0][8]).toBe(`Сумма в основной валюте`)
    expect(transfers[0][7]).toBe(`Расчётный курс (зачислено за 1 отправленную единицу)`)
    expect([transactions[1][1], transactions[1][6]]).toEqual([`Доход`, `2500.00`])
  })
})

Deno.test(`the transfers spreadsheet shows both amounts and the implied rate on one row`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const dollars = await h.account(`Dollars`, `USD`)
    const yen = await h.account(`Yen`, `JPY`)
    await storedTransfer(sql, h, {
      fromId: dollars,
      toId: yen,
      sent: 10000,
      received: 15000,
      date: `2026-03-02`,
      memo: `Trip`,
    })
    await storedTransfer(sql, h, {
      fromId: yen,
      toId: dollars,
      sent: 15000,
      received: 10000,
      date: `2026-03-03`,
    })
    const { transfers } = await sheets(sql, h)
    expect(transfers.slice(1)).toEqual([
      [`2026-03-02`, `Dollars`, `100.00`, `USD`, `Yen`, `15000`, `JPY`, `150`, `Trip`],
      [
        `2026-03-03`,
        `Yen`,
        `15000`,
        `JPY`,
        `Dollars`,
        `100.00`,
        `USD`,
        `0.0066666666666666666667`,
        ``,
      ],
    ])
  })
})

Deno.test(`the transfers spreadsheet leaves the implied rate empty between two accounts of one currency`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    await h.transfer(
      await h.account(`Main`, `EUR`),
      await h.account(`Savings`, `EUR`),
      5000,
      `2026-03-02`,
    )
    const { transfers } = await sheets(sql, h)
    expect(transfers.slice(1)).toEqual([
      [`2026-03-02`, `Main`, `50.00`, `EUR`, `Savings`, `50.00`, `EUR`, ``, ``],
    ])
  })
})

Deno.test(`the entry and transfer spreadsheets leave out deleted rows and other households`, async () => {
  await withSchema(async (sql) => {
    const theirs = await household(sql, `Theirs`)
    const theirMain = await theirs.account(`Their main`, `EUR`)
    await theirs.entry(theirMain, await theirs.category(`Their food`), -500, `EUR`, `2026-03-02`)
    await theirs.transfer(
      theirMain,
      await theirs.account(`Their savings`, `EUR`),
      500,
      `2026-03-02`,
    )

    const ours = await household(sql)
    const main = await ours.account(`Main`, `EUR`)
    const savings = await ours.account(`Savings`, `EUR`)
    const food = await ours.category(`Food`)
    await ours.entry(main, food, -100, `EUR`, `2026-03-02`)
    await ours.entry(main, food, -200, `EUR`, `2026-03-03`)
    await ours.transfer(main, savings, 300, `2026-03-02`)
    await ours.transfer(main, savings, 400, `2026-03-03`)
    await sql`
      UPDATE transactions SET deleted_at = CURRENT_TIMESTAMP
      WHERE group_id = ${ours.groupId} AND date = '2026-03-03'
    `
    await sql`
      UPDATE transfers SET deleted_at = CURRENT_TIMESTAMP
      WHERE group_id = ${ours.groupId} AND date = '2026-03-03'
    `

    const { transactions, transfers } = await sheets(sql, ours)
    expect(transactions.slice(1).map((row) => [row[2], row[6]])).toEqual([[`Main`, `1.00`]])
    expect(transfers.slice(1).map((row) => [row[1], row[2]])).toEqual([[`Main`, `3.00`]])
  })
})

Deno.test(`the entry and transfer spreadsheets lose and repeat no row past one page, oldest first`, async () => {
  await withSchema(async (sql) => {
    const h = await household(sql)
    const main = await h.account(`Main`, `EUR`)
    const savings = await h.account(`Savings`, `EUR`)
    const food = await h.category(`Food`)
    const count = 2_100
    // Three days, so a page boundary falls inside a day and the id must break the tie.
    const dateOf = (index: number) => `2026-03-0${(index % 3) + 1}`
    const common = {
      group_id: h.groupId,
      converted: false,
      change_sequence: 1,
      created_by_user_id: h.owner,
      updated_by_user_id: h.owner,
    }
    const entries = Array.from({ length: count }, (_, index) => ({
      ...common,
      id: uuidV7(),
      account_id: main,
      category_id: food,
      kind: TransactionKind.EXPENSE,
      account_amount: -100,
      amount: -100,
      currency: `EUR`,
      memo: `entry ${index}`,
      date: dateOf(index),
    }))
    const moves = Array.from({ length: count }, (_, index) => ({
      ...common,
      id: uuidV7(),
      from_account_id: main,
      to_account_id: savings,
      sent_amount: 100,
      received_amount: 100,
      memo: `transfer ${index}`,
      date: dateOf(index),
    }))
    for (let start = 0; start < count; start += 500) {
      await sql`INSERT INTO transactions ${sql(entries.slice(start, start + 500))}`
      await sql`INSERT INTO transfers ${sql(moves.slice(start, start + 500))}`
    }

    const { transactions, transfers } = await sheets(sql, h)
    const expected = (noun: string) =>
      Array.from({ length: count }, (_, index) => `${noun} ${index}`).sort()
    const entryRows = transactions.slice(1)
    expect(entryRows.map((row) => row[5]).sort()).toEqual(expected(`entry`))
    expect(entryRows.map((row) => row[0])).toEqual(entryRows.map((row) => row[0]).sort())
    const transferRows = transfers.slice(1)
    expect(transferRows.map((row) => row[8]).sort()).toEqual(expected(`transfer`))
    expect(transferRows.map((row) => row[0])).toEqual(transferRows.map((row) => row[0]).sort())
  })
})
