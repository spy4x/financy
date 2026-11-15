/** The palette's lists: a store holding the household answers, else the device's copy. */
import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { signal } from "@preact/signals"
import type { AccountItem } from "./accounts.ts"
import { createPaletteData, type DeviceLists, type HeldList } from "./palette-data.ts"

const HOME = `0190a000-0000-7000-8000-000000000001`
const STUDIO = `0190a000-0000-7000-8000-000000000002`

const account = (name: string) => ({ id: name, name }) as AccountItem

/** A store's list for `groupId`, ready unless told otherwise. */
function held<T>(value: T, groupId: string | null = null, ready = true) {
  const list = { groupId: signal(groupId), value: signal(value), isReady: signal(ready) }
  const port: HeldList<T> = { ...list, ready: () => list.isReady.value }
  return { list, port }
}

function lists(accounts: string[]): DeviceLists {
  return {
    transactions: [],
    accounts: accounts.map(account),
    categories: [],
    budgets: null,
    tags: [],
  }
}

/** A device whose reads wait until `answer` is called for them. */
function device() {
  const reads: { groupId: string; answer: (value: DeviceLists) => void }[] = []
  const readDevice = (groupId: string) =>
    new Promise<DeviceLists>((answer) => reads.push({ groupId, answer }))
  return { reads, readDevice }
}

function setup() {
  const groupId = signal<string | null>(HOME)
  const accounts = held<readonly AccountItem[]>([])
  const { reads, readDevice } = device()
  const deviceChanged = signal(0)
  const data = createPaletteData({
    groupId,
    stores: {
      transactions: held<DeviceLists[`transactions`]>([]).port,
      accounts: accounts.port,
      categories: held<DeviceLists[`categories`]>([]).port,
      budgets: held<DeviceLists[`budgets`]>(null).port,
      tags: held<DeviceLists[`tags`]>([]).port,
    },
    readDevice,
    deviceChanged,
  })
  return { groupId, accounts: accounts.list, reads, deviceChanged, data }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
const names = (list: readonly AccountItem[]) => list.map((item) => item.name)

describe(`createPaletteData`, () => {
  it(`answers from the device's copy while no store holds the household`, async () => {
    const { reads, data } = setup()
    const stop = data.watch()
    expect(reads.map((read) => read.groupId)).toEqual([HOME])
    expect(data.accounts.value).toEqual([])
    reads[0].answer(lists([`Wallet`]))
    await settle()
    expect(names(data.accounts.value)).toEqual([`Wallet`])
    stop()
  })

  it(`answers from the store once it holds the household and its list is ready`, async () => {
    const { reads, accounts, data } = setup()
    const stop = data.watch()
    reads[0].answer(lists([`Wallet`]))
    await settle()

    accounts.groupId.value = HOME
    accounts.isReady.value = false
    expect(names(data.accounts.value)).toEqual([`Wallet`])
    accounts.value.value = [account(`Wallet`), account(`Card`)]
    accounts.isReady.value = true
    expect(names(data.accounts.value)).toEqual([`Wallet`, `Card`])
    stop()
  })

  it(`ignores a store that holds another household`, async () => {
    const { reads, accounts, data } = setup()
    const stop = data.watch()
    accounts.groupId.value = STUDIO
    accounts.value.value = [account(`Studio card`)]
    reads[0].answer(lists([`Wallet`]))
    await settle()
    expect(names(data.accounts.value)).toEqual([`Wallet`])
    stop()
  })

  it(`reads the new household's copy on a switch and drops the old one's late answer`, async () => {
    const { groupId, reads, data } = setup()
    const stop = data.watch()
    groupId.value = STUDIO
    expect(reads.map((read) => read.groupId)).toEqual([HOME, STUDIO])
    reads[0].answer(lists([`Home wallet`]))
    await settle()
    expect(data.accounts.value).toEqual([])
    reads[1].answer(lists([`Studio card`]))
    await settle()
    expect(names(data.accounts.value)).toEqual([`Studio card`])
    stop()
  })

  it(`lists nothing and reads nothing with no household selected`, () => {
    const { groupId, reads, data } = setup()
    groupId.value = null
    const stop = data.watch()
    expect(reads).toEqual([])
    expect(data.accounts.value).toEqual([])
    expect(data.budgets.value).toBeNull()
    stop()
  })

  it(`reads the copy again when the device's copy opens, and stops reading once stopped`, () => {
    const { reads, deviceChanged, data } = setup()
    const stop = data.watch()
    deviceChanged.value++
    expect(reads.map((read) => read.groupId)).toEqual([HOME, HOME])
    stop()
    deviceChanged.value++
    expect(reads.length).toBe(2)
  })
})
