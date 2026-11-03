import { expect } from "@std/expect"
import { afterEach, describe, it } from "@std/testing/bdd"
import { RealtimeRequestError } from "@spy4x/realtime"
import type { User, UserPushTokenPublic } from "@domain/identity"
import { createProfileStore } from "./profile.ts"
import { sessionState } from "./session.ts"

const user = (firstName: string) => ({ id: 7, firstName, lastName: "Lovelace" }) as User
const device = (deviceId: string) => ({ id: 1, userId: 7, deviceId }) as UserPushTokenPublic
const subscription = {
  endpoint: "https://push.example/endpoint",
  expirationTime: null,
  keys: { auth: "auth-key", p256dh: "p256dh-key" },
}

/** A fake socket: answers queries from `answers` and records every command. */
function harness(
  answers: { user?: User; devices?: UserPushTokenPublic[] } = {},
) {
  const commands: { name: string; payload: unknown }[] = []
  let failWith: unknown = null
  const store = createProfileStore({
    query: (name) =>
      Promise.resolve(
        name === "profile.get"
          ? { user: answers.user ?? user("Ada") }
          : { devices: answers.devices ?? [] },
      ) as Promise<never>,
    command: (name, payload) => {
      commands.push({ name, payload })
      if (failWith) return Promise.reject(failWith)
      return Promise.resolve(name === "profile.update" ? { user: user("Grace") } : {}) as Promise<
        never
      >
    },
  })
  return { store, commands, failNextWith: (error: unknown) => (failWith = error) }
}

describe("profile store", () => {
  afterEach(() => {
    sessionState.value = { ...sessionState.value, user: null }
  })

  it("reads the profile and the push devices again, as a hint from another tab asks", async () => {
    const { store } = harness({ user: user("Edited elsewhere"), devices: [device("phone")] })

    await store.refresh()

    expect(sessionState.value.user?.firstName).toBe("Edited elsewhere")
    expect(store.pushDevices.value.map((d) => d.deviceId)).toEqual(["phone"])
  })

  it("saves the profile as a profile.update command and shows the saved name", async () => {
    const { store, commands } = harness()

    const result = await store.saveProfile("Grace", "Lovelace")

    expect(result).toEqual({ ok: true })
    expect(commands).toEqual([
      { name: "profile.update", payload: { firstName: "Grace", lastName: "Lovelace" } },
    ])
    expect(sessionState.value.user?.firstName).toBe("Grace")
  })

  it("passes on the server's message when saving is refused, and leaves the name alone", async () => {
    const { store, failNextWith } = harness()
    sessionState.value = { ...sessionState.value, user: user("Ada") }
    failNextWith(new RealtimeRequestError("bad_request", "First name is too long"))

    const result = await store.saveProfile("x", "y")

    expect(result).toEqual({ ok: false, error: "First name is too long" })
    expect(sessionState.value.user?.firstName).toBe("Ada")
  })

  it("answers an empty message when the call got no answer, so the page uses its own wording", async () => {
    const { store, failNextWith } = harness()
    failNextWith(new Error("socket dropped"))

    expect(await store.saveProfile("x", "y")).toEqual({ ok: false, error: "" })
  })

  it("registers a device with a push.register command, then reads the list", async () => {
    const { store, commands } = harness({ devices: [device("phone")] })

    const result = await store.registerPush("phone", subscription)

    expect(result).toEqual({ ok: true })
    expect(commands).toEqual([
      { name: "push.register", payload: { deviceId: "phone", subscription } },
    ])
    expect(store.pushDevices.value.map((d) => d.deviceId)).toEqual(["phone"])
  })

  it("removes a device with a push.remove command, then reads the list", async () => {
    const answers = { devices: [device("phone")] }
    const { store, commands } = harness(answers)
    await store.refresh()
    answers.devices = []

    const result = await store.removePush("phone")

    expect(result).toEqual({ ok: true })
    expect(commands).toEqual([{ name: "push.remove", payload: { deviceId: "phone" } }])
    expect(store.pushDevices.value).toEqual([])
  })

  it("keeps the device list when a removal fails", async () => {
    const { store, failNextWith } = harness({ devices: [device("phone")] })
    await store.refresh()
    failNextWith(new RealtimeRequestError("forbidden", "Not yours"))

    const result = await store.removePush("phone")

    expect(result).toEqual({ ok: false, error: "Not yours" })
    expect(store.pushDevices.value.map((d) => d.deviceId)).toEqual(["phone"])
  })

  it("reads again when the socket opens after a drop, and not at the first open", async () => {
    const answers = { user: user("Before"), devices: [] as UserPushTokenPublic[] }
    const { store } = harness(answers)
    store.onSocketStatus("connecting")
    store.onSocketStatus("open")
    await new Promise((r) => setTimeout(r, 0))
    expect(sessionState.value.user).toBe(null)

    store.onSocketStatus("closed")
    answers.user = user("Missed while down")
    answers.devices = [device("phone")]
    store.onSocketStatus("connecting")
    store.onSocketStatus("open")
    await new Promise((r) => setTimeout(r, 0))

    expect(sessionState.value.user?.firstName).toBe("Missed while down")
    expect(store.pushDevices.value.map((d) => d.deviceId)).toEqual(["phone"])
  })

  it("forgets the devices on reset", async () => {
    const { store } = harness({ devices: [device("phone")] })
    await store.refresh()

    store.reset()

    expect(store.pushDevices.value).toEqual([])
  })
})
