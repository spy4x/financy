import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import type { NotificationRow } from "@ui/notifications-screen.tsx"
import {
  createNotificationsStore,
  type NotificationDependencies,
  type NotificationPageResult,
} from "./notifications.ts"

function row(id: number, read = false): NotificationRow {
  return {
    id: String(id),
    kind: "group.removed",
    payload: { groupName: "Family" },
    link: "/groups",
    readAt: read ? "2026-10-01T10:00:00.000Z" : null,
    createdAt: "2026-10-01T09:00:00.000Z",
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function dependencies(overrides: Partial<NotificationDependencies> = {}): NotificationDependencies {
  return {
    list: () => Promise.resolve({ notifications: [], nextCursor: null, unreadCount: 0 }),
    unreadCount: () => Promise.resolve(0),
    markRead: () => Promise.resolve(0),
    markAllRead: () => Promise.resolve(0),
    ...overrides,
  }
}

describe("notifications store", () => {
  it("shows the first page, then adds the next one under it, once each", async () => {
    const asked: (string | null)[] = []
    const store = createNotificationsStore(dependencies({
      list: ({ cursor }) => {
        asked.push(cursor)
        return Promise.resolve(
          cursor === null
            ? { notifications: [row(3), row(2)], nextCursor: "c1", unreadCount: 3 }
            : { notifications: [row(2), row(1)], nextCursor: null, unreadCount: 3 },
        )
      },
    }))
    await store.open()
    expect(store.notifications.value.map((n) => n.id)).toEqual(["3", "2"])
    expect(store.unreadCount.value).toBe(3)

    await store.loadMore()
    expect(store.notifications.value.map((n) => n.id)).toEqual(["3", "2", "1"])
    expect(asked).toEqual([null, "c1"])

    await store.loadMore()
    expect(asked.length).toBe(2)
  })

  it("reads only the count while the page is closed, and the first page while it is open", async () => {
    const calls: string[] = []
    const store = createNotificationsStore(dependencies({
      unreadCount: () => {
        calls.push("count")
        return Promise.resolve(4)
      },
      list: () => {
        calls.push("list")
        return Promise.resolve({ notifications: [row(1)], nextCursor: null, unreadCount: 5 })
      },
    }))
    await store.refresh()
    expect(calls).toEqual(["count"])
    expect(store.unreadCount.value).toBe(4)
    expect(store.notifications.value).toEqual([])

    await store.open()
    await store.refresh()
    expect(calls).toEqual(["count", "list", "list"])
    expect(store.unreadCount.value).toBe(5)

    store.close()
    await store.refresh()
    expect(calls[calls.length - 1]).toBe("count")
  })

  it("shows a notification as read at once and takes the server's count for the bell", async () => {
    const answer = deferred<number>()
    const store = createNotificationsStore(dependencies({
      list: () =>
        Promise.resolve({ notifications: [row(2), row(1)], nextCursor: null, unreadCount: 2 }),
      markRead: () => answer.promise,
    }))
    await store.open()

    const marking = store.markRead("2")
    expect(store.notifications.value.find((n) => n.id === "2")?.readAt).not.toBeNull()
    expect(store.notifications.value.find((n) => n.id === "1")?.readAt).toBeNull()
    answer.resolve(1)
    await marking
    expect(store.unreadCount.value).toBe(1)
  })

  it("keeps a notification shown as read when a page asked for earlier answers after it", async () => {
    const stale = deferred<NotificationPageResult>()
    let reads = 0
    const store = createNotificationsStore(dependencies({
      list: () =>
        ++reads === 1
          ? Promise.resolve({ notifications: [row(2), row(1)], nextCursor: null, unreadCount: 2 })
          : stale.promise,
      markRead: () => Promise.resolve(1),
    }))
    await store.open()

    const refreshing = store.refresh()
    await store.markRead("2")
    stale.resolve({ notifications: [row(2), row(1)], nextCursor: null, unreadCount: 2 })
    await refreshing

    expect(store.notifications.value.find((n) => n.id === "2")?.readAt).not.toBeNull()
    expect(store.unreadCount.value).toBe(1)
    expect(store.loading.value).toBe(false)
  })

  it("still shows the list when every notification is marked read while it first loads", async () => {
    const first = deferred<NotificationPageResult>()
    let reads = 0
    const store = createNotificationsStore(dependencies({
      list: () =>
        ++reads === 1
          ? first.promise
          : Promise.resolve({ notifications: [row(2), row(1)], nextCursor: "c", unreadCount: 0 }),
      markAllRead: () => Promise.resolve(0),
    }))
    const opening = store.open()

    await store.markAllRead()
    first.resolve({ notifications: [row(2), row(1)], nextCursor: "c", unreadCount: 2 })
    await opening

    expect(store.notifications.value.map((n) => n.id)).toEqual(["2", "1"])
    expect(store.nextCursor.value).toBe("c")
  })

  it("puts a notification back to unread and says why when the server refuses to mark it", async () => {
    const store = createNotificationsStore(dependencies({
      list: () => Promise.resolve({ notifications: [row(1)], nextCursor: null, unreadCount: 1 }),
      markRead: () => Promise.reject(new Error("Notification not found")),
    }))
    await store.open()

    await store.markRead("1")

    expect(store.notifications.value[0].readAt).toBeNull()
    expect(store.unreadCount.value).toBe(1)
    expect(store.error.value).toBe("Notification not found")
  })

  it("marks every notification read and zeroes the bell", async () => {
    const store = createNotificationsStore(dependencies({
      list: () =>
        Promise.resolve({ notifications: [row(2), row(1)], nextCursor: null, unreadCount: 2 }),
    }))
    await store.open()

    await store.markAllRead()

    expect(store.notifications.value.every((n) => n.readAt !== null)).toBe(true)
    expect(store.unreadCount.value).toBe(0)
  })

  it("drops a page that answers after the person signed out", async () => {
    const late = deferred<NotificationPageResult>()
    const store = createNotificationsStore(dependencies({ list: () => late.promise }))
    const opening = store.open()

    store.reset()
    late.resolve({ notifications: [row(1)], nextCursor: null, unreadCount: 1 })
    await opening

    expect(store.notifications.value).toEqual([])
    expect(store.unreadCount.value).toBe(0)
  })
})
