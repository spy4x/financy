import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { drainMicrotasks, FakeClock, FakeSocket } from "@spy4x/realtime/testing"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { GroupRole } from "@domain/groups"
import { HouseholdSettingsQuery, HouseholdUpdateSettingsCommand } from "@domain/money"
import type { GroupRoleLookup } from "@domain/notes"
import { createSessionGate } from "../../cqrs/session-gate.ts"
import { buildAuthData } from "../../_testing/fake-auth.ts"
import { MemoryHouseholdSettings, memoryRates } from "../../_testing/memory-household.ts"
import {
  API_URL,
  mountRoute,
  sameOriginHeaders,
  WEB_APP_URL,
} from "../../_testing/mutation-requests.ts"
import { checkedError } from "../../_testing/api-error.ts"
import { createCallRoute } from "../../routes/call.ts"
import { Realtime, toRequestError } from "../../services/realtime.ts"
import { createHouseholdSettingsHandler, createHouseholdUpdateSettingsHandler } from "./handlers.ts"
import { createHouseholdOperations } from "./operations.ts"

/**
 * The household settings over the socket and `POST /api/call/<name>`, as the API wires them: one
 * pair of buses, the session gate and the real handlers over in-memory repositories. Every
 * scenario runs through both transports and expects the same answer.
 */

const groupId = "7b6d8d6c-1af5-4f04-8ae4-b1ee5d111002"
const OWNER = 1
const ADMIN = 2
const EDITOR = 3
const VIEWER = 4
const STRANGER = 9

const ECB_USD = {
  base: "EUR",
  quote: "USD",
  rate: "1.1172",
  date: "2026-10-30",
  source: "frankfurter:ECB",
}

function stack() {
  const members = new Map<string, GroupRole>([
    [`${groupId}:${OWNER}`, GroupRole.OWNER],
    [`${groupId}:${ADMIN}`, GroupRole.ADMIN],
    [`${groupId}:${EDITOR}`, GroupRole.EDITOR],
    [`${groupId}:${VIEWER}`, GroupRole.VIEWER],
  ])
  const groups: GroupRoleLookup = {
    roleOf: (group, user) => Promise.resolve(members.get(`${group}:${user}`) ?? null),
  }
  /** The handler's role check; a test removes a member after it to stand in for a race. */
  let afterHandlerCheck = () => {}
  const handlerGroups: GroupRoleLookup = {
    roleOf: async (group, user) => {
      const role = await groups.roleOf(group, user)
      afterHandlerCheck()
      return role
    },
  }
  const settings = new MemoryHouseholdSettings(groups)
  // VND is rated by the fallback only: its code is listed, its rate never sent.
  const rates = memoryRates([ECB_USD], ["EUR", "USD", "VND"])
  const dependencies = { settings, rates, groups: handlerGroups }
  const commands = new CommandBus()
  commands.use(createSessionGate([]))
  commands.register(
    HouseholdUpdateSettingsCommand,
    createHouseholdUpdateSettingsHandler(dependencies),
  )
  const queries = new QueryBus()
  queries.use(createSessionGate([]))
  queries.register(HouseholdSettingsQuery, createHouseholdSettingsHandler(dependencies))
  const operations = createHouseholdOperations({
    updateSettings: (command) => commands.execute(command),
    settings: (query) => queries.execute(query),
  })
  return {
    settings,
    operations,
    members,
    raceRemoval: (user: number) => {
      afterHandlerCheck = () => members.delete(`${groupId}:${user}`)
    },
  }
}

type Stack = ReturnType<typeof stack>

type Answer =
  | { kind: "server.result"; payload: unknown }
  | { kind: "server.error"; code: string; message: string; details?: unknown }
  | undefined

interface Transport {
  command(name: string, payload: unknown): Promise<Answer>
  query(name: string, payload: unknown): Promise<Answer>
  shutdown(): void
}

function socket(stack: Stack, userId: number): Transport {
  const auth = buildAuthData({ user: { id: userId }, session: { id: userId * 10, userId } })
  const realtime = new Realtime({
    clock: new FakeClock(),
    entitledSession: () => Promise.resolve(auth),
    memberUserIds: () => Promise.resolve([]),
    operations: stack.operations,
    log: () => {},
  })
  const ws = new FakeSocket("wss://app.example.com/api/ws")
  ws.openFromPeer()
  realtime.attach(ws, auth)
  let sent = 0
  const send = async (frame: Record<string, unknown>) => {
    const id = `request-${++sent}`
    ws.receive(JSON.stringify({ ...frame, id }))
    let answer: Record<string, unknown> | undefined
    for (let drains = 0; !answer && drains < 10; drains++) {
      await drainMicrotasks()
      answer = ws.frames().find((candidate) =>
        (candidate as { requestId?: string }).requestId === id
      ) as Record<string, unknown> | undefined
    }
    if (!answer) return undefined
    const { requestId: _requestId, ...rest } = answer
    return rest as Answer
  }
  return {
    command: (name, payload) =>
      send({ kind: "client.command", name, payload, idempotencyKey: `key-${sent}` }),
    query: (name, payload) => send({ kind: "client.query", name, payload }),
    shutdown: () => realtime.shutdown(),
  }
}

function callRoute(stack: Stack, userId: number): Transport {
  const app = mountRoute(
    "/call",
    createCallRoute({
      operations: stack.operations,
      mapError: toRequestError,
      log: () => {},
      expectedOrigin: WEB_APP_URL,
    }),
    buildAuthData({ user: { id: userId }, session: { id: userId * 10, userId } }),
  )
  let sent = 0
  const send = async (name: string, payload: unknown, headers: Record<string, string>) => {
    const response = await app.request(`${API_URL}/call/${name}`, {
      method: "POST",
      headers: { ...sameOriginHeaders, "x-realtime-user": String(userId), ...headers },
      body: JSON.stringify(payload),
    })
    const body = await response.json()
    if (response.ok) return { kind: "server.result", payload: body.result } as Answer
    return { kind: "server.error", ...checkedError(body) } as Answer
  }
  return {
    command: (name, payload) => send(name, payload, { "idempotency-key": `key-${++sent}` }),
    query: (name, payload) => send(name, payload, {}),
    shutdown: () => {},
  }
}

const TRANSPORTS = [["the socket", socket], ["the call route", callRoute]] as const
const save = { groupId, baseCurrency: "JPY", version: 0 }

for (const [via, open] of TRANSPORTS) {
  describe(`household settings over ${via}`, () => {
    it("refuses a viewer's and an editor's save and changes nothing", async () => {
      const s = stack()
      for (const user of [VIEWER, EDITOR]) {
        const as = open(s, user)
        expect(await as.command("household.updateSettings", save)).toMatchObject({
          kind: "server.error",
          code: "forbidden",
          details: { code: "ROLE_INSUFFICIENT" },
        })
        as.shutdown()
      }
      expect(s.settings.writes).toBe(0)
    })

    it("tells a stranger, or a member removed before the save, that the group does not exist", async () => {
      const s = stack()
      s.members.delete(`${groupId}:${ADMIN}`)
      for (const user of [STRANGER, ADMIN]) {
        const as = open(s, user)
        expect(await as.command("household.updateSettings", save)).toMatchObject({
          kind: "server.error",
          code: "not_found",
          details: { code: "GROUP_NOT_FOUND" },
        })
        as.shutdown()
      }
      expect(s.settings.writes).toBe(0)
    })

    it("refuses an admin removed after the handler's check, by the write's own check", async () => {
      const s = stack()
      s.raceRemoval(ADMIN)
      const as = open(s, ADMIN)
      expect(await as.command("household.updateSettings", save)).toMatchObject({
        kind: "server.error",
        code: "not_found",
        details: { code: "GROUP_NOT_FOUND" },
      })
      expect(s.settings.writes).toBe(0)
      as.shutdown()
    })

    it("lets an admin save, and answers a stale save with the settings as they are", async () => {
      const s = stack()
      const admin = open(s, ADMIN)
      expect(await admin.command("household.updateSettings", save)).toMatchObject({
        kind: "server.result",
        payload: { settings: { baseCurrency: "JPY", version: 1, chosen: true } },
      })
      const owner = open(s, OWNER)
      expect(
        await owner.command("household.updateSettings", { ...save, baseCurrency: "USD" }),
      ).toMatchObject({
        kind: "server.error",
        code: "conflict",
        details: { code: "VERSION_CONFLICT", current: { baseCurrency: "JPY", version: 1 } },
      })
      admin.shutdown()
      owner.shutdown()
    })

    it("refuses a code outside ISO 4217", async () => {
      const s = stack()
      const as = open(s, OWNER)
      expect(await as.command("household.updateSettings", { ...save, baseCurrency: "XYZ" }))
        .toMatchObject({ kind: "server.error", code: "bad_request" })
      as.shutdown()
    })

    it("lets a viewer read the settings with ECB rates only, and fallback currencies by code", async () => {
      const s = stack()
      const as = open(s, VIEWER)
      expect(await as.query("household.settings", { groupId })).toEqual({
        kind: "server.result",
        payload: {
          settings: { groupId, baseCurrency: "EUR", version: 0, chosen: false, updatedAt: null },
          rates: [ECB_USD],
          ratedCurrencies: ["EUR", "USD", "VND"],
        },
      })
      as.shutdown()
    })
  })
}
