/** Financy's records in the search palette: what each row says, finds and opens. */
import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { signal } from "@preact/signals"
import { searchEntries } from "@spy4x/platform/universal/text"
import { AccountKind } from "@domain/accounts"
import { BudgetLimitSource, type BudgetMonth, type BudgetRow } from "@domain/budgets"
import { CategoryKind } from "@domain/categories"
import { TransactionKind } from "@domain/transactions"
import { createTranslator } from "@spy4x/platform/universal/i18n"
import app from "@i18n/app/en.ts"
import appRu from "@i18n/app/ru.ts"
import { ENGLISH } from "@ui/i18n-testing.ts"
import type { AccountItem } from "../state/accounts.ts"
import type { CategoryItem } from "../state/categories.ts"
import type { PaletteData } from "../state/palette-data.ts"
import type { TagItem } from "../state/tags.ts"
import type { TransactionItem } from "../state/transactions.ts"
import {
  accountRecords,
  budgetRecords,
  categoryRecords,
  recordSources,
  tagRecords,
  transactionRecords,
} from "./palette-records.ts"

const GROUP = `0190a000-0000-7000-8000-000000000001`
const WALLET = `0190a000-0000-7000-8000-000000000011`
const FOOD = `0190a000-0000-7000-8000-000000000021`
const GROCERIES = `0190a000-0000-7000-8000-000000000022`
const ENTRY = `0190a000-0000-7000-8000-000000000031`
const TEXT = { t: ENGLISH, locale: `en`, today: `2026-11-15` }
const RUSSIAN_TEXT = {
  t: createTranslator({ language: `ru`, catalogs: [{ source: app, translation: appRu }] }),
  locale: `ru`,
  today: `2026-11-15`,
}
/** The marks `isolate` puts around a name inside a line, so it keeps its own direction. */
const name = (value: string) => `⁨${value}⁩`

function account(overrides: Partial<AccountItem> = {}): AccountItem {
  return {
    id: WALLET,
    groupId: GROUP,
    name: `Wallet`,
    kind: AccountKind.CASH,
    currency: `EUR`,
    startingBalance: 0,
    archivedAt: null,
    isDefault: true,
    version: 1,
    changeSequence: `1`,
    createdAt: `2026-11-01T00:00:00Z`,
    updatedAt: `2026-11-01T00:00:00Z`,
    deletedAt: null,
    ...overrides,
  }
}

function category(overrides: Partial<CategoryItem> = {}): CategoryItem {
  return {
    id: GROCERIES,
    groupId: GROUP,
    parentId: null,
    name: `Groceries`,
    kind: CategoryKind.EXPENSE,
    icon: `shopping-cart`,
    color: `#16a34a`,
    archivedAt: null,
    version: 1,
    changeSequence: `1`,
    createdAt: `2026-11-01T00:00:00Z`,
    updatedAt: `2026-11-01T00:00:00Z`,
    ...overrides,
  } as CategoryItem
}

function entry(overrides: Partial<TransactionItem> = {}): TransactionItem {
  return {
    id: ENTRY,
    groupId: GROUP,
    accountId: WALLET,
    categoryId: GROCERIES,
    kind: TransactionKind.EXPENSE,
    accountAmount: -1234,
    amount: -1234,
    currency: `EUR`,
    converted: false,
    memo: `Пятёрочка`,
    date: `2026-11-15`,
    version: 1,
    changeSequence: `1`,
    createdByUserId: 1,
    updatedByUserId: 1,
    createdAt: `2026-11-15T10:00:00Z`,
    updatedAt: `2026-11-15T10:00:00Z`,
    ...overrides,
  }
}

function budgetRow(overrides: Partial<BudgetRow> = {}): BudgetRow {
  return {
    categoryId: GROCERIES,
    parentId: null,
    limit: { amount: 40000, currency: `EUR` },
    source: BudgetLimitSource.OWN,
    spending: 1234,
    currency: `EUR`,
    band: null,
    percent: 3,
    leftOut: [],
    ...overrides,
  }
}

function month(rows: BudgetRow[]): BudgetMonth {
  return {
    month: `2026-11`,
    from: `2026-11-01`,
    to: `2026-11-30`,
    baseCurrency: `EUR`,
    rows,
    method: 1,
    methodVersion: null,
  } as BudgetMonth
}

function tag(id: string, tagName: string): TagItem {
  return {
    id,
    groupId: GROUP,
    name: tagName,
    color: `blue`,
    version: 1,
    changeSequence: `1`,
    createdByUserId: 1,
    updatedByUserId: 1,
    createdAt: `2026-11-01T00:00:00Z`,
    updatedAt: `2026-11-01T00:00:00Z`,
  } as TagItem
}

/** The labels `query` finds among `records`, best first, as the palette ranks them. */
function found(query: string, records: Parameters<typeof searchEntries>[1]): string[] {
  return searchEntries(query, records).filter((match) => match.score > 0)
    .map((match) => match.entry.label)
}

describe(`transactionRecords`, () => {
  it(`labels an entry with its memo, writes amount, day and account under it, and opens its page`, () => {
    const [row] = transactionRecords([entry()], [account()], [category()], TEXT)
    expect(row).toEqual({
      id: ENTRY,
      label: `Пятёрочка`,
      detail: `-€12.34 · Today · ${name(`Wallet`)}`,
      aliases: [`Groceries`],
      href: `/transactions/${ENTRY}`,
    })
  })

  it(`marks income with a plus, as the list does`, () => {
    const [row] = transactionRecords(
      [entry({ kind: TransactionKind.INCOME, amount: 5000, date: `2026-11-14` })],
      [account()],
      [category()],
      TEXT,
    )
    expect(row.detail).toBe(`+€50.00 · Yesterday · ${name(`Wallet`)}`)
  })

  it(`labels an entry with no memo with its category's name, with no alias repeating it`, () => {
    const [row] = transactionRecords([entry({ memo: `  ` })], [account()], [category()], TEXT)
    expect(row.label).toBe(`Groceries`)
    expect(row.aliases).toBeUndefined()
  })

  it(`labels an entry with no memo and an unknown category "Unknown"`, () => {
    const [row] = transactionRecords([entry({ memo: `` })], [account()], [], TEXT)
    expect(row.label).toBe(`Unknown`)
    expect(row.aliases).toBeUndefined()
  })

  it(`keeps the memo and drops the alias when the category is unknown`, () => {
    const [row] = transactionRecords([entry()], [account()], [], TEXT)
    expect(row.label).toBe(`Пятёрочка`)
    expect(row.aliases).toBeUndefined()
  })

  it(`names an unknown account "Unknown"`, () => {
    const [row] = transactionRecords([entry()], [], [category()], TEXT)
    expect(row.detail).toBe(`-€12.34 · Today · ${name(`Unknown`)}`)
  })

  it(`maps no entries to no rows`, () => {
    expect(transactionRecords([], [account()], [category()], TEXT)).toEqual([])
  })

  it(`finds a Cyrillic memo typed misspelled, in Latin letters or in the wrong layout`, () => {
    const rows = transactionRecords(
      [entry(), entry({ id: `other`, memo: `Rent` })],
      [account()],
      [category()],
      TEXT,
    )
    expect(found(`пятерочка`, rows)).toEqual([`Пятёрочка`])
    expect(found(`пятерачка`, rows)).toEqual([`Пятёрочка`])
    expect(found(`pyaterochka`, rows)).toEqual([`Пятёрочка`])
    expect(found(`gznthjxrf`, rows)).toEqual([`Пятёрочка`])
  })

  it(`finds an entry by its category's name`, () => {
    const rows = transactionRecords(
      [entry(), entry({ id: `other`, memo: `Rent`, categoryId: FOOD })],
      [account()],
      [category()],
      TEXT,
    )
    expect(found(`groceries`, rows)).toEqual([`Пятёрочка`])
  })
})

describe(`accountRecords`, () => {
  it(`lists each account by name, opening its page, and says when one is archived`, () => {
    const rows = accountRecords([
      account(),
      account({ id: `old`, name: `Old card`, archivedAt: `2026-10-01T00:00:00Z` }),
    ], TEXT)
    expect(rows.map(({ aliases: _, ...row }) => row)).toEqual([
      { id: WALLET, label: `Wallet`, detail: undefined, href: `/accounts/${WALLET}` },
      { id: `old`, label: `Old card`, detail: `Archived`, href: `/accounts/old` },
    ])
  })

  it(`finds an account by "switch to" and its name, in English and in the person's language`, () => {
    const rows = [
      ...accountRecords([account(), account({ id: `bank`, name: `Bank` })], TEXT),
      ...accountRecords([account({ id: `cash`, name: `Наличные` })], RUSSIAN_TEXT),
    ]
    expect(found(`switch to wallet`, rows)).toEqual([`Wallet`])
    expect(found(`switch to наличные`, rows)).toEqual([`Наличные`])
    expect(found(`перейти в наличные`, rows)).toEqual([`Наличные`])
  })

  it(`passes an account's own aliases for search to match, and none of its own for one without any`, () => {
    const rows = accountRecords([
      account({ aliases: [`Card`, `Наличка`] }),
      account({ id: `bank`, name: `Bank`, aliases: [] }),
      account({ id: `old`, name: `Old card` }),
    ], TEXT)

    const own = rows.map((row) => row.aliases?.filter((alias) => !alias.includes(row.label)))
    expect(own).toEqual([[`Card`, `Наличка`], [], []])
  })
})

describe(`categoryRecords`, () => {
  it(`lists each category opening its page, naming a subcategory's parent and an archived one`, () => {
    const rows = categoryRecords([
      category({ id: FOOD, name: `Food` }),
      category({ parentId: FOOD }),
      category({ id: `gone`, name: `Snacks`, parentId: FOOD, archivedAt: `2026-10-01T00:00:00Z` }),
      category({ id: `orphan`, name: `Tea`, parentId: `missing` }),
    ], TEXT)
    expect(rows).toEqual([
      { id: FOOD, label: `Food`, detail: undefined, href: `/categories/${FOOD}` },
      { id: GROCERIES, label: `Groceries`, detail: `Food`, href: `/categories/${GROCERIES}` },
      { id: `gone`, label: `Snacks`, detail: `Food · Archived`, href: `/categories/gone` },
      { id: `orphan`, label: `Tea`, detail: undefined, href: `/categories/orphan` },
    ])
  })

  it(`passes a category's aliases for search to match, and none for a category without any`, () => {
    const rows = categoryRecords([
      category({ aliases: [`Lidl`, `Пятёрочка`] }),
      category({ id: FOOD, name: `Food`, aliases: [] }),
      category({ id: `old`, name: `Tea` }),
    ], TEXT)

    expect(rows.map((row) => row.aliases)).toEqual([[`Lidl`, `Пятёрочка`], undefined, undefined])
  })
})

describe(`budgetRecords`, () => {
  it(`lists each category with a limit by name, the limit under it, opening the budgets page`, () => {
    const rows = budgetRecords(
      month([
        budgetRow(),
        budgetRow({ categoryId: FOOD, limit: null, source: null }),
        budgetRow({ categoryId: `unknown` }),
      ]),
      [category(), category({ id: FOOD, name: `Food` })],
      TEXT,
    )
    expect(rows).toEqual([
      { id: GROCERIES, label: `Groceries`, detail: `€400.00`, href: `/budgets` },
    ])
  })

  it(`lists nothing when the device holds no month`, () => {
    expect(budgetRecords(null, [category()], TEXT)).toEqual([])
  })
})

describe(`tagRecords`, () => {
  it(`lists each tag by name, opening its page`, () => {
    expect(tagRecords([tag(`t1`, `Trips`)])).toEqual([
      { id: `t1`, label: `Trips`, href: `/tags/t1` },
    ])
  })
})

describe(`recordSources`, () => {
  function data(): PaletteData {
    return {
      transactions: signal<readonly TransactionItem[]>([entry()]),
      accounts: signal<readonly AccountItem[]>([account()]),
      categories: signal<readonly CategoryItem[]>([category()]),
      budgets: signal<BudgetMonth | null>(month([budgetRow()])),
      tags: signal<readonly TagItem[]>([tag(`t1`, `Trips`)]),
    }
  }

  it(`lists each kind under its page's title, the tags only while they are on`, () => {
    expect(recordSources(data(), TEXT, true).map((source) => source.heading)).toEqual([
      `Transactions`,
      `Accounts`,
      `Categories`,
      `Budgets`,
      `Tags`,
    ])
    expect(recordSources(data(), TEXT, false).map((source) => source.heading)).toEqual([
      `Transactions`,
      `Accounts`,
      `Categories`,
      `Budgets`,
    ])
  })

  it(`answers with the same records until a list they read changes`, () => {
    const lists = data()
    const [transactions, accounts] = recordSources(lists, TEXT, false)
    const first = transactions.records()
    expect(transactions.records()).toBe(first)
    expect(accounts.records()).toBe(accounts.records())
    ;(lists.accounts as ReturnType<typeof signal<readonly AccountItem[]>>).value = [
      account({ name: `Purse` }),
    ]
    const second = transactions.records()
    expect(second).not.toBe(first)
    expect(second[0].detail).toBe(`-€12.34 · Today · ${name(`Purse`)}`)
  })
})
