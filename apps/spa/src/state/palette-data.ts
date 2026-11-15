/**
 * What the search palette finds Financy's records in: for the selected household, each list as its
 * store holds it, or, before its page has loaded it, as the device holds it. Nothing here asks the
 * server: a list the device has never kept is empty until its page is opened.
 *
 * @module
 */
import { computed, effect, type ReadonlySignal, signal } from "@preact/signals"
import { currentPeriod, PeriodUnit } from "@spy4x/time/period"
import type { BudgetMonth } from "@domain/budgets"
import { groupTimeZone } from "@domain/groups"
import { deviceCopyChanged, deviceEntries, localReads } from "../modules.ts"
import { type AccountItem, accountsStore } from "./accounts.ts"
import { budgetsStore } from "./budgets.ts"
import { categoriesStore, type CategoryItem } from "./categories.ts"
import { groupsStore } from "./groups.ts"
import { READ_KEYS } from "./read-keys.ts"
import { selectionStore } from "./selection.ts"
import { type TagItem, tagsStore } from "./tags.ts"
import { type TransactionItem, transactionsStore } from "./transactions.ts"

/** The selected household's lists the palette maps, each as a signal of what is held now. */
export interface PaletteData {
  transactions: ReadonlySignal<readonly TransactionItem[]>
  accounts: ReadonlySignal<readonly AccountItem[]>
  categories: ReadonlySignal<readonly CategoryItem[]>
  /** The month the device holds, or `null` when it holds none. */
  budgets: ReadonlySignal<BudgetMonth | null>
  tags: ReadonlySignal<readonly TagItem[]>
}

/** Each list of one household as the device holds it. */
export interface DeviceLists {
  transactions: readonly TransactionItem[]
  accounts: readonly AccountItem[]
  categories: readonly CategoryItem[]
  budgets: BudgetMonth | null
  tags: readonly TagItem[]
}

/** One store's list, with the household it holds. */
export interface HeldList<T> {
  groupId: ReadonlySignal<string | null>
  value: ReadonlySignal<T>
  /** Whether the list is the household's, rather than the empty start of a read in flight. */
  ready: () => boolean
}

/** What {@link createPaletteData} reads. */
export interface PaletteDataDependencies {
  /** The selected household. */
  groupId: ReadonlySignal<string | null>
  stores: { [K in keyof DeviceLists]: HeldList<DeviceLists[K]> }
  /** The household's lists as the device holds them, with no server call. Never rejects. */
  readDevice: (groupId: string) => Promise<DeviceLists>
  /** Changes when the device's copy opens or closes, so the lists are read from it again. */
  deviceChanged: ReadonlySignal<unknown>
}

const NOTHING: DeviceLists = {
  transactions: [],
  accounts: [],
  categories: [],
  budgets: null,
  tags: [],
}

/**
 * The palette's lists of the selected household. A store that holds that household answers;
 * otherwise the device's copy, read again by {@link watch} whenever the household or the copy
 * changes. A list stays the same object while nothing it reads changed.
 */
export function createPaletteData(
  dependencies: PaletteDataDependencies,
): PaletteData & { watch: () => () => void } {
  const copy = signal<{ groupId: string; lists: DeviceLists } | null>(null)

  function list<K extends keyof DeviceLists>(key: K): ReadonlySignal<DeviceLists[K]> {
    const store = dependencies.stores[key]
    return computed(() => {
      const groupId = dependencies.groupId.value
      if (groupId === null) return NOTHING[key]
      if (store.groupId.value === groupId && store.ready()) return store.value.value
      const held = copy.value
      return held?.groupId === groupId ? held.lists[key] : NOTHING[key]
    })
  }

  /** Reads the device's copy of the selected household now and on each change; returns the stop. */
  function watch(): () => void {
    return effect(() => {
      const groupId = dependencies.groupId.value
      void dependencies.deviceChanged.value
      if (groupId === null) return
      let current = true
      void dependencies.readDevice(groupId).then((lists) => {
        if (current) copy.value = { groupId, lists }
      })
      return () => {
        current = false
      }
    })
  }

  return {
    transactions: list(`transactions`),
    accounts: list(`accounts`),
    categories: list(`categories`),
    budgets: list(`budgets`),
    tags: list(`tags`),
    watch,
  }
}

/** The household's lists from the device: the entries and tags, and the read copies of the rest. */
async function readDevice(groupId: string): Promise<DeviceLists> {
  const membership = groupsStore.groups.value.find((group) => group.id === groupId)
  const timeZone = groupTimeZone(membership ?? {})
  const month = currentPeriod(PeriodUnit.Month, { now: new Date(), timeZone }).from.slice(0, 7)
  const [entries, accounts, categories, budgets] = await Promise.all([
    deviceEntries(groupId),
    localReads.copy<AccountItem[]>(READ_KEYS.accounts(groupId)),
    localReads.copy<CategoryItem[]>(READ_KEYS.categories(groupId)),
    localReads.copy<BudgetMonth>(READ_KEYS.budgets(groupId, month)),
  ])
  return {
    transactions: entries.transactions,
    accounts: accounts?.value ?? [],
    categories: categories?.value ?? [],
    budgets: budgets?.value ?? null,
    tags: entries.tags,
  }
}

/** The palette's lists over the app's own stores and device copy. */
export const paletteData = createPaletteData({
  groupId: selectionStore.groupId,
  stores: {
    transactions: {
      groupId: transactionsStore.groupId,
      value: transactionsStore.transactions,
      ready: () => transactionsStore.loaded.value,
    },
    accounts: {
      groupId: accountsStore.groupId,
      value: accountsStore.accounts,
      ready: () => !accountsStore.loading.value || accountsStore.accounts.value.length > 0,
    },
    categories: {
      groupId: categoriesStore.groupId,
      value: categoriesStore.categories,
      ready: () => !categoriesStore.loading.value || categoriesStore.categories.value.length > 0,
    },
    budgets: {
      groupId: budgetsStore.groupId,
      value: budgetsStore.budgets,
      ready: () => budgetsStore.budgets.value !== null,
    },
    tags: {
      groupId: tagsStore.groupId,
      value: tagsStore.tags,
      ready: () => !tagsStore.loading.value || tagsStore.tags.value.length > 0,
    },
  },
  readDevice,
  deviceChanged: deviceCopyChanged,
})
