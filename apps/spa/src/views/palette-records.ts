/**
 * Financy's records as the search palette finds them (`PaletteRecord` in `@ui/search-palette.tsx`):
 * transactions, accounts, categories, budgets and tags, mapped from what the stores and the device
 * hold. The palette matches them on the device only; nothing here reads the network.
 *
 * @module
 */
import { computed } from "@preact/signals"
import type { Translator } from "@spy4x/platform/universal/i18n"
import { formatMoney } from "@spy4x/platform/universal/money-core"
import { isolate } from "@spy4x/preact-ui/bdi"
import { relativeDayLabel } from "@spy4x/time/locale"
import type { BudgetMonth } from "@domain/budgets"
import { amountDecimals } from "@domain/money"
import {
  ACCOUNT_PATHS,
  BUDGET_PATHS,
  CATEGORY_PATHS,
  TAG_PATHS,
  TRANSACTION_PATHS,
} from "@ui/progressive.tsx"
import type { PaletteRecord, PaletteRecordSource } from "@ui/search-palette.tsx"
import type { AccountItem } from "../state/accounts.ts"
import type { CategoryItem } from "../state/categories.ts"
import type { PaletteData } from "../state/palette-data.ts"
import type { TagItem } from "../state/tags.ts"
import type { TransactionItem } from "../state/transactions.ts"

/** What the rows' text is written with: the language, the region format and the household's day. */
export interface RecordText {
  t: Translator<string>
  locale: string
  /** `YYYY-MM-DD` in the household's time zone, so a date reads "Today" as on the list. */
  today: string
}

/** An entry's amount as the transactions list draws it: "+" on income, "−" on an expense. */
function signedMoney(amount: number, currency: string, locale: string): string {
  return formatMoney(amount, currency, locale, {
    decimals: amountDecimals(currency),
    signDisplay: `exceptZero`,
  })
}

/**
 * Each entry as a row: the memo, or its category's name when the memo is empty; the amount, the
 * day and the account under it, as the transactions list writes them; the category's name also
 * finds it. An account or category the device does not know reads "Unknown", as on the list.
 */
export function transactionRecords(
  entries: readonly TransactionItem[],
  accounts: readonly AccountItem[],
  categories: readonly CategoryItem[],
  text: RecordText,
): PaletteRecord[] {
  const accountName = new Map(accounts.map((account) => [account.id, account.name]))
  const categoryName = new Map(categories.map((category) => [category.id, category.name]))
  const unknown = text.t.t(`Transactions.unknown`)
  // Many entries share a day, and naming one costs a date formatter's work.
  const days = new Map<string, string>()
  const day = (date: string) => {
    let label = days.get(date)
    if (label === undefined) days.set(date, label = relativeDayLabel(date, text.today, text.locale))
    return label
  }
  return entries.map((entry) => {
    const category = categoryName.get(entry.categoryId)
    const memo = entry.memo.trim()
    return {
      id: entry.id,
      label: memo || category || unknown,
      detail: [
        signedMoney(entry.amount, entry.currency, text.locale),
        day(entry.date),
        isolate(accountName.get(entry.accountId) ?? unknown),
      ].join(` · `),
      aliases: memo && category ? [category] : undefined,
      href: TRANSACTION_PATHS.transaction(entry.id),
    }
  })
}

/**
 * Each account as a row opening its page; an archived one says so. Its aliases let search find it
 * by the person's own words for it.
 */
export function accountRecords(
  accounts: readonly AccountItem[],
  text: RecordText,
): PaletteRecord[] {
  const archived = text.t.t(`Accounts.archivedBadge`)
  return accounts.map((account) => ({
    id: account.id,
    label: account.name,
    detail: account.archivedAt === null ? undefined : archived,
    href: ACCOUNT_PATHS.account(account.id),
    aliases: account.aliases?.length ? account.aliases : undefined,
  }))
}

/**
 * Each category as a row opening its page: a subcategory names its parent under it, and an
 * archived one says so. Its aliases let search find it by the person's own words for it.
 */
export function categoryRecords(
  categories: readonly CategoryItem[],
  text: RecordText,
): PaletteRecord[] {
  const name = new Map(categories.map((category) => [category.id, category.name]))
  const archived = text.t.t(`Categories.archivedBadge`)
  return categories.map((category) => {
    const parent = category.parentId === null ? undefined : name.get(category.parentId)
    const detail = [parent, category.archivedAt === null ? undefined : archived]
      .filter((part) => part !== undefined)
    return {
      id: category.id,
      label: category.name,
      detail: detail.length > 0 ? detail.join(` · `) : undefined,
      href: CATEGORY_PATHS.category(category.id),
      aliases: category.aliases?.length ? category.aliases : undefined,
    }
  })
}

/**
 * Each category with a limit in the month held, as a row opening the budgets page: its name, and
 * the limit under it. A row whose category the device does not know has no name to find it by, so
 * it is left out.
 */
export function budgetRecords(
  month: BudgetMonth | null,
  categories: readonly CategoryItem[],
  text: RecordText,
): PaletteRecord[] {
  if (month === null) return []
  const name = new Map(categories.map((category) => [category.id, category.name]))
  return month.rows.flatMap((row) => {
    const label = name.get(row.categoryId)
    if (row.limit === null || label === undefined) return []
    return [{
      id: row.categoryId,
      label,
      detail: formatMoney(row.limit.amount, row.limit.currency, text.locale, {
        decimals: amountDecimals(row.limit.currency),
      }),
      href: BUDGET_PATHS.list,
    }]
  })
}

/** Each tag as a row opening its page. */
export function tagRecords(tags: readonly TagItem[]): PaletteRecord[] {
  return tags.map((tag) => ({ id: tag.id, label: tag.name, href: TAG_PATHS.tag(tag.id) }))
}

/**
 * The palette's record sources over `data`, each under its page's title. Each source's records are
 * mapped again only when a list they read changes, so `records()` answers from memory and returns
 * the same objects while nothing changed, as the palette asks. The tags are listed only when
 * `tags` is on: their pages belong to the notes example.
 */
export function recordSources(
  data: PaletteData,
  text: RecordText,
  tags: boolean,
): PaletteRecordSource[] {
  const t = text.t
  const transactions = computed(() =>
    transactionRecords(data.transactions.value, data.accounts.value, data.categories.value, text)
  )
  const accounts = computed(() => accountRecords(data.accounts.value, text))
  const categories = computed(() => categoryRecords(data.categories.value, text))
  const budgets = computed(() => budgetRecords(data.budgets.value, data.categories.value, text))
  const sources: PaletteRecordSource[] = [
    { heading: t.t(`Transactions.title`), records: () => transactions.value },
    { heading: t.t(`Accounts.title`), records: () => accounts.value },
    { heading: t.t(`Categories.title`), records: () => categories.value },
    { heading: t.t(`Budgets.title`), records: () => budgets.value },
  ]
  if (!tags) return sources
  const tagRows = computed(() => tagRecords(data.tags.value))
  return [...sources, { heading: t.t(`Tags.title`), records: () => tagRows.value }]
}
