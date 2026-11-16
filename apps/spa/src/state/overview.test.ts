import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import type { LocalReads } from "@spy4x/realtime/read-cache"
import { NOTE_WIDGETS } from "@domain/notes"
import { createOverviewStore } from "./overview.ts"

const [total, added] = NOTE_WIDGETS
const october = {
  groupId: "g-1",
  range: { from: "2026-10-01", to: "2026-10-21" },
  timeZone: "Europe/Berlin",
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

/** Lets every answer that is already settled reach the store. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("overview store", () => {
  it("asks each widget's operation for the group, the days and the zone", async () => {
    const asked: [string, unknown][] = []
    const store = createOverviewStore({
      query: (name, payload) => {
        asked.push([name, payload])
        return Promise.resolve({ current: 1, previous: null } as never)
      },
    })

    store.open(october, [total, added])
    await settle()

    expect(asked).toEqual([
      ["note.widget.total", {
        groupId: "g-1",
        from: "2026-10-01",
        to: "2026-10-21",
        timeZone: "Europe/Berlin",
      }],
      ["note.widget.added", {
        groupId: "g-1",
        from: "2026-10-01",
        to: "2026-10-21",
        timeZone: "Europe/Berlin",
      }],
    ])
    expect(store.loads.value[total.id]).toEqual({
      status: "ready",
      data: { current: 1, previous: null },
      savedAt: null,
    })
  })

  it("shows one widget's failure without holding the other back, and reads it again on retry", async () => {
    let fail = true
    const store = createOverviewStore({
      query: (name) =>
        name === added.operation && fail
          ? Promise.reject(new Error("offline"))
          : Promise.resolve({ current: 2, previous: 1 } as never),
    })

    store.open(october, [total, added])
    await settle()
    expect(store.loads.value[total.id].status).toBe("ready")
    expect(store.loads.value[added.id]).toEqual({ status: "error" })

    fail = false
    store.retry(added.id)
    expect(store.loads.value[added.id]).toEqual({ status: "loading" })
    await settle()
    expect(store.loads.value[added.id].status).toBe("ready")
  })

  it("drops an answer for a range the page has moved on from", async () => {
    const first = deferred<never>()
    let calls = 0
    const store = createOverviewStore({
      query: () =>
        ++calls === 1 ? first.promise : Promise.resolve({ current: 7, previous: 5 } as never),
    })

    store.open(october, [total])
    store.open({ ...october, range: { from: "2026-10-15", to: "2026-10-21" } }, [total])
    await settle()
    first.resolve({ current: 99, previous: 0 } as never)
    await settle()

    expect(store.loads.value[total.id]).toEqual({
      status: "ready",
      data: { current: 7, previous: 5 },
      savedAt: null,
    })
  })

  it("reads only a widget shown again when the request has not changed", async () => {
    const asked: string[] = []
    const store = createOverviewStore({
      query: (name) => {
        asked.push(name)
        return Promise.resolve({ current: 1, previous: 1 } as never)
      },
    })

    store.open(october, [total])
    await settle()
    store.open(october, [total, added])
    await settle()

    expect(asked).toEqual([total.operation, added.operation])
  })

  it("reads every shown widget again on refresh, keeping the old answer on screen until the new one arrives", async () => {
    const answers: ReturnType<typeof deferred<never>>[] = []
    const asked: string[] = []
    const store = createOverviewStore({
      query: (name) => {
        asked.push(name)
        if (asked.length <= 2) return Promise.resolve({ current: 1, previous: 0 } as never)
        const answer = deferred<never>()
        answers.push(answer)
        return answer.promise
      },
    })
    store.open(october, [total, added])
    await settle()

    const done = store.refresh()
    await settle()
    expect(asked).toEqual([total.operation, added.operation, total.operation, added.operation])
    expect(store.loads.value[total.id]).toEqual({
      status: `ready`,
      data: { current: 1, previous: 0 },
      savedAt: null,
    })

    for (const answer of answers) answer.resolve({ current: 2, previous: 1 } as never)
    await done
    expect(store.loads.value[total.id]).toEqual({
      status: `ready`,
      data: { current: 2, previous: 1 },
      savedAt: null,
    })
  })

  it("keeps a widget's answer when its refresh fails, and shows loading for one with no answer", async () => {
    let fail = false
    const store = createOverviewStore({
      query: (name) =>
        fail || name === added.operation
          ? Promise.reject(new Error(`offline`))
          : Promise.resolve({ current: 1, previous: 0 } as never),
    })
    store.open(october, [total, added])
    await settle()
    expect(store.loads.value[added.id]).toEqual({ status: `error` })

    fail = true
    const done = store.refresh()
    expect(store.loads.value[added.id]).toEqual({ status: `loading` })
    await done

    expect(store.loads.value[total.id].status).toBe(`ready`)
    expect(store.loads.value[added.id]).toEqual({ status: `error` })
  })

  it("runs one more round for a burst of refreshes during a round, and resolves each after it", async () => {
    const pending: ReturnType<typeof deferred<never>>[] = []
    const store = createOverviewStore({
      query: () => {
        const answer = deferred<never>()
        pending.push(answer)
        return answer.promise
      },
    })
    store.open(october, [total])
    pending.shift()!.resolve({ current: 1, previous: 0 } as never)
    await settle()

    const first = store.refresh()
    const burst = [store.refresh(), store.refresh(), store.refresh()]
    await settle()
    expect(pending.length).toBe(1)
    pending.shift()!.resolve({ current: 2, previous: 0 } as never)
    await first
    await settle()
    expect(pending.length).toBe(1)
    pending.shift()!.resolve({ current: 3, previous: 0 } as never)
    await Promise.all(burst)

    expect(pending.length).toBe(0)
    expect(store.loads.value[total.id]).toEqual({
      status: `ready`,
      data: { current: 3, previous: 0 },
      savedAt: null,
    })
  })

  it("names the open group while the page is open, and reads nothing on refresh once it closed", async () => {
    let calls = 0
    const store = createOverviewStore({
      query: () => Promise.resolve(void calls++ as never),
    })
    expect(store.groupId.value).toBe(null)
    store.open(october, [total])
    await settle()
    expect(store.groupId.value).toBe(`g-1`)

    store.close()
    await store.refresh()

    expect(store.groupId.value).toBe(null)
    expect(calls).toBe(1)
  })

  it("reads every shown widget again, old answers kept, when the same request opens after a close", async () => {
    let calls = 0
    const store = createOverviewStore({
      query: () => Promise.resolve({ current: ++calls, previous: 0 } as never),
    })
    store.open(october, [total])
    await settle()
    store.close()

    store.open(october, [total])
    expect(store.loads.value[total.id].status).toBe(`ready`)
    await settle()

    expect(calls).toBe(2)
    expect(store.loads.value[total.id]).toEqual({
      status: `ready`,
      data: { current: 2, previous: 0 },
      savedAt: null,
    })
  })

  it("drops a refresh's answer for a range the page has moved on from", async () => {
    const pending: ReturnType<typeof deferred<never>>[] = []
    let calls = 0
    const store = createOverviewStore({
      query: () => {
        if (++calls !== 2) return Promise.resolve({ current: calls, previous: 0 } as never)
        const answer = deferred<never>()
        pending.push(answer)
        return answer.promise
      },
    })
    store.open(october, [total])
    await settle()

    const done = store.refresh()
    store.open({ ...october, range: { from: `2026-10-15`, to: `2026-10-21` } }, [total])
    await settle()
    pending[0].resolve({ current: 99, previous: 0 } as never)
    await done

    expect(store.loads.value[total.id]).toEqual({
      status: `ready`,
      data: { current: 3, previous: 0 },
      savedAt: null,
    })
  })

  it("shows the device's copy with the time it was saved when the server cannot be reached", async () => {
    const keys: string[] = []
    const device: LocalReads = {
      through<T>(key: string) {
        keys.push(key)
        return Promise.resolve({
          value: { current: 4, previous: 3 } as T,
          fresh: false,
          savedAt: 1234,
        })
      },
      copy: () => Promise.resolve(undefined),
    }
    const store = createOverviewStore({ query: () => Promise.reject(new Error("offline")) }, device)

    store.open(october, [total])
    await settle()

    expect(store.loads.value[total.id]).toEqual({
      status: "ready",
      data: { current: 4, previous: 3 },
      savedAt: 1234,
    })
    expect(keys).toEqual(["overview:g-1:notes.total:2026-10-01:2026-10-21:Europe/Berlin"])
  })
})
