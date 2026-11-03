import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { ConnectionLostError, RealtimeRequestError } from "@spy4x/realtime"
import type { SelectedGroup } from "@domain/groups"
import { createSelectionStore, type SelectionCache } from "./selection.ts"

const USER = 7

/** A store over fakes. `server` is what the server holds; `reachable` switches the network. */
function harness(options: { server?: SelectedGroup; cache?: SelectionCache } = {}) {
  const server = { value: options.server ?? { groupId: "home", version: 1 } }
  const state = { reachable: true, refuse: false }
  const sent: string[] = []
  const cache = new Map<number, SelectionCache | null>()
  if (options.cache) cache.set(USER, options.cache)
  const store = createSelectionStore({
    fetch() {
      if (!state.reachable) return Promise.reject(new TypeError("Failed to fetch"))
      return Promise.resolve(server.value)
    },
    send(groupId) {
      sent.push(groupId)
      if (!state.reachable) return Promise.reject(new ConnectionLostError("the socket is not open"))
      if (state.refuse) {
        return Promise.reject(new RealtimeRequestError("not_found", "Group not found"))
      }
      server.value = { groupId, version: server.value.version + 1 }
      return Promise.resolve(server.value)
    },
    readCache: (userId) => cache.get(userId) ?? null,
    writeCache: (userId, value) => void cache.set(userId, value),
  })
  store.start(USER)
  return { store, server, state, sent, cache }
}

describe("selection store", () => {
  it("shows what the device cached until the server answers, then the server's group", async () => {
    const { store, cache } = harness({ cache: { groupId: "team", pending: false } })
    expect(store.groupId.value).toBe("team")

    await store.refresh()

    expect(store.groupId.value).toBe("home")
    expect(cache.get(USER)).toEqual({ groupId: "home", pending: false })
  })

  it("keeps a choice made before the store started, and caches it", async () => {
    const { store, cache } = harness({ cache: { groupId: "old", pending: false } })
    store.reset()
    const early = store.select("team")
    store.start(USER)
    await early

    expect(store.groupId.value).toBe("team")
    expect(cache.get(USER)).toEqual({ groupId: "team", pending: false })
  })

  it("shows a choice at once and stores it on the server", async () => {
    const { store, sent, server, cache } = harness()
    await store.refresh()

    const switching = store.select("team")
    expect(store.groupId.value).toBe("team")
    await switching

    expect(sent).toEqual(["team"])
    expect(server.value.groupId).toBe("team")
    expect(store.pending.value).toBe(false)
    expect(cache.get(USER)).toEqual({ groupId: "team", pending: false })
  })

  it("sends nothing when the group is already selected", async () => {
    const { store, sent } = harness()
    await store.refresh()

    await store.select("home")

    expect(sent).toEqual([])
  })

  it("keeps a choice made offline, and a read with no network does not undo it", async () => {
    const { store, state, cache } = harness()
    await store.refresh()
    state.reachable = false

    await store.select("team")
    await store.refresh()

    expect(store.groupId.value).toBe("team")
    expect(store.pending.value).toBe(true)
    expect(cache.get(USER)).toEqual({ groupId: "team", pending: true })
  })

  it("sends the offline choice first when the network is back, so the server's old group does not win", async () => {
    const { store, state, server, sent } = harness()
    await store.refresh()
    state.reachable = false
    await store.select("team")
    state.reachable = true

    await store.refresh()

    expect(sent).toEqual(["team", "team"])
    expect(server.value.groupId).toBe("team")
    expect(store.groupId.value).toBe("team")
    expect(store.pending.value).toBe(false)
  })

  it("falls back to the group the server picks when it refuses the choice", async () => {
    const { store, state, server } = harness()
    await store.refresh()
    state.refuse = true
    server.value = { groupId: "home", version: 5 }

    await store.select("gone")

    expect(store.groupId.value).toBe("home")
    expect(store.pending.value).toBe(false)
  })

  it("drops an offline choice the server refuses once the network is back", async () => {
    const { store, state } = harness()
    await store.refresh()
    state.reachable = false
    await store.select("gone")
    state.reachable = true
    state.refuse = true

    await store.refresh()

    expect(store.groupId.value).toBe("home")
    expect(store.pending.value).toBe(false)
  })

  it("rejects a read the server answered with an error", async () => {
    const failing = createSelectionStore({
      fetch: () => Promise.reject(new Error("boom")),
      send: () => Promise.reject(new Error("unused")),
      readCache: () => null,
      writeCache: () => {},
    })

    await expect(failing.refresh()).rejects.toThrow("boom")
  })

  it("forgets the person on sign-out, on screen and on the device", async () => {
    const { store, cache } = harness()
    await store.refresh()

    store.reset()

    expect(store.groupId.value).toBeNull()
    expect(cache.get(USER)).toBeNull()
  })

  describe("a read in flight while the person picks a group", () => {
    /** A store whose fetch and send answer only when told to. */
    function slow() {
      let answerFetch: (value: SelectedGroup) => void = () => {}
      let answerSend: (value: SelectedGroup) => void = () => {}
      const store = createSelectionStore({
        fetch: () => new Promise<SelectedGroup>((resolve) => (answerFetch = resolve)),
        send: () => new Promise<SelectedGroup>((resolve) => (answerSend = resolve)),
        readCache: () => null,
        writeCache: () => {},
      })
      store.start(USER)
      return {
        store,
        answerFetch: (value: SelectedGroup) => answerFetch(value),
        answerSend: (value: SelectedGroup) => answerSend(value),
      }
    }
    const old = { groupId: "home", version: 1 }
    const picked = { groupId: "team", version: 2 }

    for (const order of ["the read answers first", "the pick answers first"]) {
      it(`ends showing the picked group when ${order}`, async () => {
        const { store, answerFetch, answerSend } = slow()
        const read = store.refresh()
        const pick = store.select("team")
        await new Promise((resolve) => setTimeout(resolve, 0))

        if (order === "the read answers first") {
          answerFetch(old)
          await read
          answerSend(picked)
        } else {
          answerSend(picked)
          await pick
          answerFetch(old)
        }
        await Promise.all([read, pick])

        expect(store.groupId.value).toBe("team")
        expect(store.pending.value).toBe(false)
      })
    }
  })
})
