import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { drainMicrotasks, FakeClock, FakeSocket } from "@spy4x/realtime/testing"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { FREE_PLAN_ID } from "@domain/billing"
import { GroupRole } from "@domain/groups"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import {
  TransferCreateCommand,
  TransferDeleteCommand,
  TransferError,
  TransferGetQuery,
  TransferRestoreCommand,
  TransferUpdateCommand,
} from "@domain/transfers"
import { createSessionGate } from "../../cqrs/session-gate.ts"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { buildAuthData } from "../../_testing/fake-auth.ts"
import { MemoryTransferRepository } from "../../_testing/memory-transfers.ts"
import {
  API_URL,
  mountRoute,
  sameOriginHeaders,
  WEB_APP_URL,
} from "../../_testing/mutation-requests.ts"
import { createCallRoute } from "../../routes/call.ts"
import { Realtime, toRequestError } from "../../services/realtime.ts"
import {
  createTransferCreateHandler,
  createTransferDeleteHandler,
  createTransferGetHandler,
  createTransferRestoreHandler,
  createTransferUpdateHandler,
} from "./handlers.ts"
import { createTransferOperations } from "./operations.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { checkedError } from "../../_testing/api-error.ts"
import {
  TEST_FREE_PLAN,
  TEST_PLANS,
  testLimits,
  testUsage,
} from "../../../../libs/domain/billing/test-plans.ts"

/**
 * Transfers over every transport, as the API wires them: one pair of buses, the gates and the real
 * handlers over an in-memory repository that derives amounts with the domain's own functions and
 * reads the role again at the write. The socket and the call route are two adapters of one
 * operations table, so every scenario runs through both and expects the same answer. Balances, the
 * composite keys and the race on the database lock need Postgres and are in `tests/integration/`.
 */

const groupId = uuidV7()
const otherGroupId = uuidV7()
const usd = uuidV7()
const savings = uuidV7()
const jpy = uuidV7()
const eur = uuidV7()
const closed = uuidV7()
const otherAccount = uuidV7()
const OWNER = 1
const VIEWER = 2
const EDITOR = 3
const STRANGER = 9
/** 16:30 UTC on 30 November: already 1 December in Singapore. */
const NOW = new Date("2026-11-30T16:30:00.000Z")
/** Entries the household already holds, counted against the same plan cap as transfers. */
const ENTRIES = 1

function rate(base: string, quote: string, value: string, date: string): ExchangeRate {
  return { base, quote, rate: value, date, source: "test" }
}

/**
 * The API's transfer stack over memory. `race` makes the handler's role check pass and then lands
 * the member's removal before the repository writes, as a removal committing in between would.
 */
function stack({ cap = null as number | null, race = false } = {}) {
  const memberships: Record<string, GroupRole> = {
    [`${groupId}:${OWNER}`]: GroupRole.OWNER,
    [`${groupId}:${VIEWER}`]: GroupRole.VIEWER,
    [`${groupId}:${EDITOR}`]: GroupRole.EDITOR,
    [`${otherGroupId}:${OWNER}`]: GroupRole.OWNER,
  }
  const remove = (group: string, user: number) => delete memberships[`${group}:${user}`]
  const roleNow = (group: string, user: number) =>
    Promise.resolve(memberships[`${group}:${user}`] ?? null)
  const groups = {
    roleOf: async (group: string, user: number) => {
      const role = await roleNow(group, user)
      if (race && user === EDITOR) remove(group, user)
      return role
    },
  }
  const rates: Record<string, string> = { "USD:JPY:2026-11-05": "150" }
  const transfers = new MemoryTransferRepository({
    accounts: new Map([
      [usd, { groupId, currency: "USD" }],
      [savings, { groupId, currency: "USD" }],
      [jpy, { groupId, currency: "JPY" }],
      [eur, { groupId, currency: "EUR" }],
      [closed, { groupId, currency: "USD", deleted: true }],
      [otherAccount, { groupId: otherGroupId, currency: "USD" }],
    ]),
    timeZones: new Map([[groupId, "Asia/Singapore"]]),
    rates: (base, quote, date) => {
      const value = rates[`${base}:${quote}:${date}`]
      return Promise.resolve(value === undefined ? null : rate(base, quote, value, date))
    },
    roleOf: roleNow,
  })
  const plans = cap === null ? TEST_PLANS : [
    {
      ...TEST_FREE_PLAN,
      entitlements: {
        ...TEST_FREE_PLAN.entitlements,
        limits: testLimits(null, { maxTransactions: cap }),
      },
    },
  ]
  const dependencies = { transfers, groups, now: () => NOW }
  const commands = new CommandBus()
  commands.use(createSessionGate([]))
  commands.use(createEntitlementGate({
    billingEnabled: true,
    plans,
    planOf: () => Promise.resolve(FREE_PLAN_ID),
    roleOf: roleNow,
    usage: testUsage({
      maxTransactions: async (group) => ENTRIES + await transfers.count(group),
    }),
  }, ENTITLEMENT_NEEDS))
  commands.register(TransferCreateCommand, createTransferCreateHandler(dependencies))
  commands.register(TransferUpdateCommand, createTransferUpdateHandler(dependencies))
  commands.register(TransferDeleteCommand, createTransferDeleteHandler(dependencies))
  commands.register(TransferRestoreCommand, createTransferRestoreHandler(dependencies))
  const queries = new QueryBus()
  queries.use(createSessionGate([]))
  queries.register(TransferGetQuery, createTransferGetHandler(dependencies))
  const operations = createTransferOperations({
    create: (command) => commands.execute(command),
    update: (command) => commands.execute(command),
    delete: (command) => commands.execute(command),
    restore: (command) => commands.execute(command),
    get: (query) => queries.execute(query),
  })
  return { transfers, operations, remove }
}

type Stack = ReturnType<typeof stack>

/** An answer in the socket's frame shape, whichever adapter carried the call. */
type Answer =
  | { kind: "server.result"; payload: unknown }
  | { kind: "server.error"; code: string; message: string; details?: unknown }
  | undefined

/** One adapter of the operations table, signed in as one user. */
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
      send({ kind: "client.command", name, payload, idempotencyKey: `key-${name}-${sent}` }),
    query: (name, payload) => send({ kind: "client.query", name, payload }),
    shutdown: () => realtime.shutdown(),
  }
}

/** `POST /api/call/<name>`, as the page's HTTP calls module sends it. */
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
    command: (name, payload) => send(name, payload, { "idempotency-key": `key-${name}-${++sent}` }),
    query: (name, payload) => send(name, payload, {}),
    shutdown: () => {},
  }
}

const TRANSPORTS = [["the socket", socket], ["the call route", callRoute]] as const

/** 100 USD moved from checking to savings on 5 November. */
const move = (overrides: Record<string, unknown> = {}) => ({
  groupId,
  id: uuidV7(),
  fromAccountId: usd,
  toAccountId: savings,
  sentAmount: 10000,
  date: "2026-11-05",
  ...overrides,
})

/** A transfer written straight into the repository, as the household's owner. */
async function existing(s: Stack, overrides: Record<string, unknown> = {}) {
  const { transfer } = await s.transfers.create(
    { memo: "", ...move(overrides), allowance: null } as Parameters<
      Stack["transfers"]["create"]
    >[0],
    OWNER,
  )
  s.transfers.writes = 0
  return transfer
}

/** Every write an editor can send about the transfer at version 1. */
function writes(id: string, group = groupId): [string, Record<string, unknown>][] {
  return [
    ["transfer.create", move({ groupId: group })],
    ["transfer.update", move({ groupId: group, id, memo: "edited", version: 1 })],
    ["transfer.delete", { groupId: group, id, version: 1 }],
    ["transfer.restore", { groupId: group, id }],
  ]
}

const refused = (status: string, code: string) => ({
  kind: "server.error",
  code: status,
  details: { code },
})

const payloadOf = (answer: Answer) => (answer as { payload: Record<string, unknown> }).payload

for (const [via, open] of TRANSPORTS) {
  describe(`transfers over ${via}`, () => {
    it("moves the sent amount unchanged in one currency, dated today in the household and signed by the server", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const answer = await as.command("transfer.create", {
        ...move({ memo: "  Rainy day  " }),
        date: undefined,
      })

      expect(answer).toMatchObject({
        kind: "server.result",
        payload: {
          created: true,
          transfer: {
            groupId,
            fromAccountId: usd,
            toAccountId: savings,
            sentAmount: 10000,
            receivedAmount: 10000,
            converted: false,
            memo: "Rainy day",
            date: "2026-12-01",
            createdByUserId: EDITOR,
            version: 1,
          },
        },
      })
      as.shutdown()
    })

    it("fills the received amount from the rate of the transfer's date and keeps a stated one (R6)", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const converted = await as.command("transfer.create", move({ toAccountId: jpy }))
      const stated = await as.command(
        "transfer.create",
        move({ toAccountId: jpy, receivedAmount: 14800 }),
      )

      expect(payloadOf(converted)).toMatchObject({
        transfer: { sentAmount: 10000, receivedAmount: 15000, converted: true },
      })
      expect(payloadOf(stated)).toMatchObject({
        transfer: { receivedAmount: 14800, converted: false },
      })
      as.shutdown()
    })

    it("recomputes the received amount when an edit changes the sent amount, so 100 to 200 USD never stores ¥200", async () => {
      const s = stack()
      const transfer = await existing(s, { toAccountId: jpy })
      const as = open(s, EDITOR)

      const answer = await as.command("transfer.update", {
        ...move({ id: transfer.id, toAccountId: jpy, sentAmount: 20000 }),
        memo: "",
        version: 1,
      })

      expect(payloadOf(answer)).toMatchObject({
        transfer: { sentAmount: 20000, receivedAmount: 30000, converted: true, version: 2 },
      })
      as.shutdown()
    })

    it("answers NO_RATE when no rate covers the two currencies on that date", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      expect(await as.command("transfer.create", move({ toAccountId: eur }))).toMatchObject(
        refused("conflict", "NO_RATE"),
      )
      expect(s.transfers.writes).toBe(0)
      as.shutdown()
    })

    it("refuses a bad amount and every field the server sets, a received amount in one currency included (R18)", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const answers = [
        await as.command("transfer.create", move({ sentAmount: 0 })),
        await as.command("transfer.create", move({ sentAmount: -100 })),
        await as.command("transfer.create", move({ sentAmount: 12.5 })),
        await as.command("transfer.create", move({ sentAmount: Number.MAX_SAFE_INTEGER + 2 })),
        await as.command("transfer.create", move({ receivedAmount: 9999 })),
        await as.command("transfer.create", move({ converted: true })),
        await as.command("transfer.create", move({ createdByUserId: OWNER })),
        await as.command("transfer.create", move({ version: 4 })),
        await as.command("transfer.create", move({ categoryId: uuidV7() })),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject(refused("bad_request", "INVALID_REQUEST"))
      }
      expect(s.transfers.writes).toBe(0)
      as.shutdown()
    })

    it("refuses a transfer from an account to itself", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      expect(await as.command("transfer.create", move({ toAccountId: usd }))).toMatchObject(
        refused("bad_request", "TRANSFER_SAME_ACCOUNT"),
      )
      expect(s.transfers.writes).toBe(0)
      as.shutdown()
    })

    it("answers ACCOUNT_NOT_FOUND for another household's account or a deleted one, on either side (R17)", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const answers = [
        await as.command("transfer.create", move({ fromAccountId: otherAccount })),
        await as.command("transfer.create", move({ toAccountId: otherAccount })),
        await as.command("transfer.create", move({ toAccountId: closed })),
        await as.command("transfer.create", move({ fromAccountId: uuidV7() })),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject(refused("not_found", "ACCOUNT_NOT_FOUND"))
      }
      expect(s.transfers.writes).toBe(0)
      as.shutdown()
    })

    it("answers TRANSFER_NOT_FOUND for another household's transfer and leaves it alone", async () => {
      const s = stack()
      // The twin holds one foreign account, so the other household's transfer is moved there.
      const created = await existing(s)
      const foreign = { ...created, groupId: otherGroupId }
      s.transfers.transfers.set(foreign.id, foreign)
      const as = open(s, EDITOR)

      for (const [name, payload] of writes(foreign.id).slice(1)) {
        expect(await as.command(name, payload)).toMatchObject(
          refused("not_found", "TRANSFER_NOT_FOUND"),
        )
      }
      expect(await as.query("transfer.get", { groupId, id: foreign.id })).toMatchObject(
        refused("not_found", "TRANSFER_NOT_FOUND"),
      )
      expect(s.transfers.writes).toBe(0)
      expect(s.transfers.transfers.get(foreign.id)).toEqual(foreign)
      as.shutdown()
    })

    it("refuses every write of a viewer and lets them read (R16)", async () => {
      const s = stack()
      const transfer = await existing(s)
      const as = open(s, VIEWER)

      for (const [name, payload] of writes(transfer.id)) {
        expect(await as.command(name, payload)).toMatchObject(
          refused("forbidden", "ROLE_INSUFFICIENT"),
        )
      }
      expect(s.transfers.writes).toBe(0)
      expect(await as.query("transfer.get", { groupId, id: transfer.id })).toMatchObject({
        kind: "server.result",
        payload: { transfer: { id: transfer.id } },
      })
      as.shutdown()
    })

    it("tells a stranger the household does not exist, for reads and writes", async () => {
      const s = stack()
      const transfer = await existing(s)
      const as = open(s, STRANGER)

      const answers = [
        await as.query("transfer.get", { groupId, id: transfer.id }),
        ...await Promise.all(
          writes(transfer.id).map(([name, payload]) => as.command(name, payload)),
        ),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject(refused("not_found", "GROUP_NOT_FOUND"))
      }
      expect(s.transfers.writes).toBe(0)
      as.shutdown()
    })

    it("refuses a removed member at once, though the same session wrote a moment before (R16)", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      expect(await as.command("transfer.create", move())).toMatchObject({
        kind: "server.result",
      })
      s.remove(groupId, EDITOR)
      s.transfers.writes = 0

      const transfer = [...s.transfers.transfers.values()][0]
      for (const [name, payload] of writes(transfer.id)) {
        expect(await as.command(name, payload)).toMatchObject(
          refused("not_found", "GROUP_NOT_FOUND"),
        )
      }
      expect(s.transfers.writes).toBe(0)
      as.shutdown()
    })

    it("refuses a write whose member is removed after the handler's check and before the write", async () => {
      for (const index of [0, 1, 2, 3]) {
        const s = stack({ race: true })
        const transfer = await existing(s)
        if (index === 3) {
          s.transfers.transfers.set(transfer.id, { ...transfer, deletedAt: new Date() })
        }
        const as = open(s, EDITOR)

        const [name, payload] = writes(transfer.id)[index]
        expect(await as.command(name, payload)).toMatchObject(
          refused("not_found", "GROUP_NOT_FOUND"),
        )
        expect(s.transfers.writes).toBe(0)
        as.shutdown()
      }
    })

    it("edits, deletes and restores a transfer, and answers a stale version with the current one", async () => {
      const s = stack()
      const transfer = await existing(s)
      const as = open(s, EDITOR)

      expect(
        await as.command("transfer.update", {
          ...move({ id: transfer.id }),
          memo: "x",
          version: 5,
        }),
      ).toMatchObject({
        kind: "server.error",
        code: "conflict",
        details: { code: "VERSION_CONFLICT", currentVersion: 1 },
      })
      expect(
        payloadOf(
          await as.command("transfer.update", {
            ...move({ id: transfer.id }),
            memo: "Savings",
            version: 1,
          }),
        ),
      ).toMatchObject({ transfer: { memo: "Savings", version: 2, updatedByUserId: EDITOR } })
      expect(
        payloadOf(await as.command("transfer.delete", { groupId, id: transfer.id, version: 2 })),
      ).toMatchObject({ transfer: { version: 3 } })
      expect(await as.query("transfer.get", { groupId, id: transfer.id })).toMatchObject(
        refused("not_found", "TRANSFER_NOT_FOUND"),
      )
      expect(
        payloadOf(await as.command("transfer.restore", { groupId, id: transfer.id })),
      ).toMatchObject({ transfer: { version: 4, deletedAt: null } })
      expect(await as.command("transfer.restore", { groupId, id: transfer.id })).toMatchObject(
        refused("not_found", "TRANSFER_NOT_FOUND"),
      )
      as.shutdown()
    })

    it("answers a retried create with the first transfer, and a reused id with a conflict", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      const first = move()

      await as.command("transfer.create", first)
      const again = await as.command("transfer.create", first)
      const reused = await as.command("transfer.create", { ...first, sentAmount: 999 })

      expect(again).toMatchObject({
        kind: "server.result",
        payload: { created: false, transfer: { id: first.id, version: 1 } },
      })
      expect(reused).toMatchObject(refused("conflict", "ID_ALREADY_EXISTS"))
      expect(s.transfers.transfers.size).toBe(1)
      as.shutdown()
    })

    it("counts transfers with entries against the plan's cap on adds and restores", async () => {
      const s = stack({ cap: ENTRIES + 1 })
      const as = open(s, EDITOR)

      const first = await as.command("transfer.create", move())
      const second = await as.command("transfer.create", move())

      expect(first).toMatchObject({ kind: "server.result" })
      expect(second).toMatchObject({
        kind: "server.error",
        code: "forbidden",
        details: { code: "PLAN_LIMIT_REACHED", entitlement: "maxTransactions" },
      })
      const { transfer } = payloadOf(first) as { transfer: { id: string } }
      await as.command("transfer.delete", { groupId, id: transfer.id, version: 1 })
      await as.command("transfer.create", move())
      expect(await as.command("transfer.restore", { groupId, id: transfer.id })).toMatchObject({
        kind: "server.error",
        code: "forbidden",
        details: { code: "PLAN_LIMIT_REACHED", entitlement: "maxTransactions" },
      })
      as.shutdown()
    })
  })
}

describe("transfer refusals on the wire", () => {
  it("maps every transfer error code to a request error status", () => {
    const statuses = (
      [
        ["ACCOUNT_NOT_FOUND", "not_found"],
        ["GROUP_NOT_FOUND", "not_found"],
        ["ID_ALREADY_EXISTS", "conflict"],
        ["INVALID_REQUEST", "bad_request"],
        ["NO_RATE", "conflict"],
        ["ROLE_INSUFFICIENT", "forbidden"],
        ["TRANSFER_NOT_FOUND", "not_found"],
        ["TRANSFER_SAME_ACCOUNT", "bad_request"],
        ["VERSION_CONFLICT", "conflict"],
      ] as const
    ).map(([code, status]) => [toRequestError(new TransferError(code, code))?.code, status])

    for (const [actual, expected] of statuses) expect(actual).toBe(expected)
  })
})
