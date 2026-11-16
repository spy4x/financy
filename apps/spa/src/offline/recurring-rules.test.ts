import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { signal } from "@preact/signals"
import { IDBFactory } from "fake-indexeddb"
import { RealtimeRequestError } from "@spy4x/realtime"
import { deviceCopy, openChangesCopy } from "./device-copy.ts"
import { offlineRecurring } from "./recurring-rules.ts"
import { createPull } from "../state/pull.ts"
import {
  createRecurringStore,
  type RecurringDependencies,
  type RecurringRuleItem,
} from "../state/recurring.ts"

const USER = 7
const groupId = "g-1"
const fields = {
  accountId: "a-1",
  categoryId: "c-1",
  kind: 1 as const,
  amount: 120000,
  currency: "EUR",
  memo: "Rent",
  rrule: "FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1",
  startDate: "2026-12-01",
}

/**
 * One household's server, as far as the rules go: the live rules with the sequence each was last
 * written at, the deleted ones as tombstones, and the hint every write sends to the open devices.
 */
function server() {
  let sequence = 0
  let clock = 0
  const live = new Map<string, RecurringRuleItem>()
  const gone: { id: string; sequence: number }[] = []
  const hints: ((gap: { groupId: string }) => Promise<void>)[] = []
  const write = async (rule: RecurringRuleItem) => {
    live.set(rule.id, rule)
    await Promise.all(hints.map((hint) => hint({ groupId })))
    return { rule }
  }
  const stamp = () => `2026-11-16T09:00:${String(clock++).padStart(2, "0")}.000Z`
  const online: RecurringDependencies = {
    fetchList: () => Promise.resolve([...live.values()]),
    create(input) {
      const at = stamp()
      const rule: RecurringRuleItem = {
        ...fields,
        ...input,
        accountAmount: null,
        memo: input.memo ?? "",
        endDate: null,
        count: null,
        skippedDates: [],
        madeThrough: null,
        pausedReason: null,
        version: 1,
        changeSequence: String(++sequence),
        createdByUserId: USER,
        updatedByUserId: USER,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
      }
      return write(rule).then(({ rule }) => ({ rule, created: true }))
    },
    update: () => Promise.reject(new Error("not used")),
    async delete(input) {
      const rule = live.get(input.id)!
      live.delete(input.id)
      gone.push({ id: input.id, sequence: ++sequence })
      await Promise.all(hints.map((hint) => hint({ groupId })))
      return { rule: { ...rule, version: rule.version + 1, deletedAt: stamp() } }
    },
    restore: () => Promise.reject(new Error("not used")),
    skip(input) {
      const rule = live.get(input.id)!
      return write({
        ...rule,
        skippedDates: [...rule.skippedDates, input.date],
        version: rule.version + 1,
        changeSequence: String(++sequence),
      })
    },
    newId: (() => {
      let next = 0
      return () => `0190a000-0000-7000-8000-00000000000${next++}`
    })(),
  }
  /** `group.changes` after `after`, on one page. */
  const changes = (after: number) =>
    Promise.resolve({
      status: "changes",
      after,
      through: sequence,
      current: sequence,
      more: false,
      upserts: {
        recurring_rules: [...live.values()].filter((rule) => Number(rule.changeSequence) > after),
      },
      tombstones: gone.filter((tomb) => tomb.sequence > after)
        .map((tomb) => ({ kind: "recurring_rules", id: tomb.id })),
    })
  return { online, changes, hints }
}

/**
 * One open device of user 7: its own IndexedDB copy, the store over it, and the pull its socket's
 * hint runs. `network.up = false` makes every pull fail as an unreachable server does;
 * `network.refused` answers it as the server refusing a person who left the household.
 */
function device(shared: ReturnType<typeof server>) {
  const network = { up: true, refused: false }
  const copy = deviceCopy({
    copy: openChangesCopy(USER, new IDBFactory() as unknown as globalThis.IDBFactory),
    fetch(_group, after) {
      if (network.refused) return Promise.reject(new RealtimeRequestError("not_found", "gone"))
      return network.up ? shared.changes(after) : Promise.reject(new TypeError("Failed to fetch"))
    },
  })
  /** A store over the same copy, as the page opens after a reload. */
  const reload = () => createRecurringStore(offlineRecurring(shared.online, () => ({ copy })))
  const store = reload()
  const idle = { groupId: signal(null), refresh: () => Promise.resolve() }
  const pull = createPull({
    userId: USER,
    flushOutbox: () => Promise.resolve(),
    profile: idle,
    selection: idle,
    groups: { groups: signal([{ id: groupId }]), refresh: () => Promise.resolve() },
    notes: idle,
    members: idle,
    notifications: idle,
    recurring: store,
  })
  shared.hints.push(pull)
  return { store, copy, network, reload }
}

const ids = (rules: readonly RecurringRuleItem[]) => rules.map((rule) => rule.id)

describe("a household's repeating rules on two open devices", () => {
  it("shows a rule made on one device on the other without a reload", async () => {
    const shared = server()
    const a = device(shared)
    const b = device(shared)
    await a.store.open(groupId)
    await b.store.open(groupId)

    const rule = await a.store.create({ groupId, ...fields })

    expect(ids(a.store.rules.value)).toEqual([rule.id])
    expect(ids(b.store.rules.value)).toEqual([rule.id])
    expect(ids(await b.copy.recurringRules.readRules(groupId))).toEqual([rule.id])
  })

  it("reads the rules from the device copy while the network is off", async () => {
    const shared = server()
    const a = device(shared)
    await a.store.open(groupId)
    const first = await a.store.create({ groupId, ...fields })
    const second = await a.store.create({ groupId, ...fields, memo: "Gym" })
    await a.store.skip({ groupId, id: first.id, date: "2027-01-01" })

    a.network.up = false
    const reopened = a.reload()
    await reopened.open(groupId)

    expect(reopened.error.value).toBeNull()
    expect(ids(reopened.rules.value)).toEqual([first.id, second.id])
    expect(reopened.rules.value[0].skippedDates).toEqual(["2027-01-01"])
  })

  it("takes a rule deleted on one device off the other through its tombstone", async () => {
    const shared = server()
    const a = device(shared)
    const b = device(shared)
    await a.store.open(groupId)
    await b.store.open(groupId)
    const kept = await a.store.create({ groupId, ...fields })
    const deleted = await a.store.create({ groupId, ...fields, memo: "Gym" })
    expect(ids(b.store.rules.value)).toEqual([kept.id, deleted.id])

    await a.store.delete({ groupId, id: deleted.id, version: deleted.version })

    expect(ids(a.store.rules.value)).toEqual([kept.id])
    expect(ids(b.store.rules.value)).toEqual([kept.id])
    expect(ids(await b.copy.recurringRules.readRules(groupId))).toEqual([kept.id])
  })
})

describe("the rules store over the device copy", () => {
  it("keeps the rule a write answered with in the copy, and drops the one it deleted, before any pull", async () => {
    const shared = server()
    const a = device(shared)
    // No hint reaches this device: only the write's own answer can change its copy.
    shared.hints.length = 0
    await a.store.open(groupId)

    const kept = await a.store.create({ groupId, ...fields })
    const deleted = await a.store.create({ groupId, ...fields, memo: "Gym" })
    expect(ids(await a.copy.recurringRules.readRules(groupId))).toEqual([kept.id, deleted.id])
    await a.store.delete({ groupId, id: deleted.id, version: deleted.version })

    expect(ids(await a.copy.recurringRules.readRules(groupId))).toEqual([kept.id])
  })

  it("changes neither the list nor the copy when the server refuses a write", async () => {
    const shared = server()
    const a = device(shared)
    await a.store.open(groupId)
    const rule = await a.store.create({ groupId, ...fields })
    shared.online.skip = () => Promise.reject(new RealtimeRequestError("forbidden", "no"))

    await expect(a.store.skip({ groupId, id: rule.id, date: "2027-01-01" })).rejects.toThrow("no")

    expect(a.store.rules.value[0].skippedDates).toEqual([])
    expect((await a.copy.recurringRules.readRules(groupId))[0].skippedDates).toEqual([])
  })

  it("shows a refusal of the read, and drops the group's copy, instead of the saved rules", async () => {
    const shared = server()
    const a = device(shared)
    await a.store.open(groupId)
    await a.store.create({ groupId, ...fields })

    a.network.refused = true
    const store = a.reload()
    await store.open(groupId)

    expect(store.error.value).toBeInstanceOf(RealtimeRequestError)
    expect(store.rules.value).toEqual([])
    expect(await a.copy.recurringRules.readRules(groupId)).toEqual([])
  })

  it("reads and writes through the server alone while the local-data module is off", async () => {
    const shared = server()
    const store = createRecurringStore(offlineRecurring(shared.online, () => null))
    await store.open(groupId)

    const rule = await store.create({ groupId, ...fields })
    await store.refresh()

    expect(store.error.value).toBeNull()
    expect(ids(store.rules.value)).toEqual([rule.id])
  })
})
