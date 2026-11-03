import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import type { ApiResult } from "@spy4x/platform/api"
import type { EmailStatus } from "@domain/identity"
import { createEmailStore, type EmailFetch } from "./email.ts"

const UNPROVEN: EmailStatus = { email: "ann@example.com", proven: false, pending: null }
const PROVEN: EmailStatus = { ...UNPROVEN, proven: true }

/** A fake API: `GET /api/auth/email` answers `status`, posts answer `posts[path]`, all recorded. */
function harness(posts: Record<string, ApiResult<unknown>> = {}) {
  const calls: { url: string; body: unknown }[] = []
  let status: EmailStatus = UNPROVEN
  let offline = false
  const fetch = ((url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) })
    if (offline) return Promise.reject(new TypeError("Failed to fetch"))
    if (url === "/api/auth/email") return Promise.resolve({ ok: true, status: 200, data: status })
    return Promise.resolve(posts[url])
  }) as EmailFetch
  return {
    store: createEmailStore(fetch),
    calls,
    setStatus: (next: EmailStatus) => (status = next),
    goOffline: () => (offline = true),
    goOnline: () => (offline = false),
  }
}

const ok = (message?: string): ApiResult<unknown> => ({
  ok: true,
  status: 200,
  data: { success: true, message },
})
const refused = (message: string): ApiResult<unknown> => ({
  ok: false,
  status: 400,
  error: { status: 400, message },
})

describe("email store", () => {
  it("reads the status, and keeps it when the API is out of reach", async () => {
    const { store, goOffline } = harness()

    await store.refresh()
    goOffline()
    await store.refresh()

    expect(store.status.value).toEqual(UNPROVEN)
  })

  it("posts the code and reads the status again, so the banner goes", async () => {
    const { store, calls, setStatus } = harness({ "/api/auth/email/verify": ok() })
    await store.refresh()
    setStatus(PROVEN)

    expect(await store.verify("Ab3_x-9Q")).toEqual({ ok: true, message: "" })

    expect(calls.map(({ url, body }) => [url, body])).toEqual([
      ["/api/auth/email", undefined],
      ["/api/auth/email/verify", { code: "Ab3_x-9Q" }],
      ["/api/auth/email", undefined],
    ])
    expect(store.status.value).toEqual(PROVEN)
  })

  it("hands the form the API's message for a refused code", async () => {
    const { store } = harness({ "/api/auth/email/verify": refused("This code is wrong") })

    expect(await store.verify("nope")).toEqual({ ok: false, error: "This code is wrong" })
  })

  it("asks to change the address and shows the new one as waiting", async () => {
    const pending = { ...PROVEN, pending: "new@example.com" }
    const { store, calls, setStatus } = harness({
      "/api/auth/email/change": ok("A code is on its way"),
    })
    setStatus(pending)

    const outcome = await store.change("new@example.com", "Passw0rd!")

    expect(outcome).toEqual({ ok: true, message: "A code is on its way" })
    expect(calls[0].body).toEqual({ email: "new@example.com", password: "Passw0rd!" })
    expect(store.status.value).toEqual(pending)
  })

  it("answers a call that never reached the API with an empty error, for the page's wording", async () => {
    const { store, goOffline } = harness()
    goOffline()

    expect(await store.send()).toEqual({ ok: false, error: "" })
  })

  it("flags a first read that never reached the API, and clears the flag when a retry reads it", async () => {
    const { store, goOffline, goOnline } = harness()
    goOffline()

    await store.refresh()
    expect(store.loadFailed.value).toBe(true)
    expect(store.status.value).toBe(null)

    goOnline()
    await store.refresh()
    expect(store.loadFailed.value).toBe(false)
    expect(store.status.value).toEqual(UNPROVEN)
  })

  it("forgets the status on sign-out", async () => {
    const { store } = harness()
    await store.refresh()

    store.reset()

    expect(store.status.value).toBe(null)
  })
})
