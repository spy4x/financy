import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { drainMicrotasks, FakeClock, FakeSocket } from "@spy4x/realtime/testing"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { FREE_PLAN_ID } from "@domain/billing"
import { AccountError } from "@domain/accounts"
import { CategoryError, CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import {
  TransactionCreateCommand,
  TransactionDeleteCommand,
  TransactionGetQuery,
  TransactionKind,
  TransactionLedgerQuery,
  TransactionRestoreCommand,
  TransactionUpdateCommand,
} from "@domain/transactions"
import { createSessionGate } from "../../cqrs/session-gate.ts"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { buildAuthData } from "../../_testing/fake-auth.ts"
import { MemoryTransactionRepository } from "../../_testing/memory-transactions.ts"
import {
  API_URL,
  mountRoute,
  sameOriginHeaders,
  WEB_APP_URL,
} from "../../_testing/mutation-requests.ts"
import { createCallRoute } from "../../routes/call.ts"
import { Realtime, toRequestError } from "../../services/realtime.ts"
import {
  createTransactionCreateHandler,
  createTransactionDeleteHandler,
  createTransactionGetHandler,
  createTransactionLedgerHandler,
  createTransactionRestoreHandler,
  createTransactionUpdateHandler,
} from "./handlers.ts"
import { createTransactionOperations } from "./operations.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { checkedError } from "../../_testing/api-error.ts"
import { TEST_PLANS, testUsage } from "../../../../libs/domain/billing/test-plans.ts"

/**
 * Entries over every transport, as the API wires them: one pair of buses, the gates and the real
 * handlers over an in-memory repository that derives amounts with the domain's own functions. The
 * socket and the call route are two adapters of one operations table, so every scenario runs
 * through both and expects the same answer. The race between a write and a member's removal, the
 * currency and kind locks and the ledger's SQL need Postgres and are in `tests/integration/`.
 */

const groupId = uuidV7()
const otherGroupId = uuidV7()
const usdAccount = uuidV7()
const btcAccount = uuidV7()
const otherAccount = uuidV7()
const food = uuidV7()
const salary = uuidV7()
const otherCategory = uuidV7()
const OWNER = 1
const VIEWER = 2
const EDITOR = 3
const STRANGER = 9
/** 16:30 UTC on 30 November: already 1 December in Singapore. */
const NOW = new Date("2026-11-30T16:30:00.000Z")

function rate(base: string, quote: string, value: string, date: string): ExchangeRate {
  return { base, quote, rate: value, date, source: "test" }
}

function stack() {
  const memberships: Record<string, GroupRole> = {
    [`${groupId}:${OWNER}`]: GroupRole.OWNER,
    [`${groupId}:${VIEWER}`]: GroupRole.VIEWER,
    [`${groupId}:${EDITOR}`]: GroupRole.EDITOR,
    [`${otherGroupId}:${OWNER}`]: GroupRole.OWNER,
  }
  const groups = {
    roleOf: (group: string, user: number) =>
      Promise.resolve(memberships[`${group}:${user}`] ?? null),
  }
  const rates: Record<string, string> = { "JPY:USD:2026-11-05": "0.0066423" }
  const transactions = new MemoryTransactionRepository({
    accounts: new Map([
      [usdAccount, { groupId, currency: "USD" }],
      [btcAccount, { groupId, currency: "BTC" }],
      [otherAccount, { groupId: otherGroupId, currency: "USD" }],
    ]),
    categories: new Map([
      [food, { groupId, kind: CategoryKind.EXPENSE }],
      [salary, { groupId, kind: CategoryKind.INCOME }],
      [otherCategory, { groupId: otherGroupId, kind: CategoryKind.EXPENSE }],
    ]),
    timeZones: new Map([[groupId, "Asia/Singapore"]]),
    rates: (base, quote, date) => {
      const value = rates[`${base}:${quote}:${date}`]
      return Promise.resolve(value === undefined ? null : rate(base, quote, value, date))
    },
  })
  const dependencies = { transactions, groups, now: () => NOW }
  const commands = new CommandBus()
  commands.use(createSessionGate([]))
  commands.use(createEntitlementGate({
    billingEnabled: true,
    plans: TEST_PLANS,
    planOf: () => Promise.resolve(FREE_PLAN_ID),
    roleOf: (group, user) => groups.roleOf(group, user),
    usage: testUsage({ maxTransactions: (group) => transactions.count(group) }),
  }, ENTITLEMENT_NEEDS))
  commands.register(TransactionCreateCommand, createTransactionCreateHandler(dependencies))
  commands.register(TransactionUpdateCommand, createTransactionUpdateHandler(dependencies))
  commands.register(TransactionDeleteCommand, createTransactionDeleteHandler(dependencies))
  commands.register(TransactionRestoreCommand, createTransactionRestoreHandler(dependencies))
  const queries = new QueryBus()
  queries.use(createSessionGate([]))
  queries.register(TransactionGetQuery, createTransactionGetHandler(dependencies))
  queries.register(
    TransactionLedgerQuery,
    createTransactionLedgerHandler({
      ...dependencies,
      settings: { get: () => Promise.resolve({ baseCurrency: "USD" }) },
    }),
  )
  const operations = createTransactionOperations({
    create: (command) => commands.execute(command),
    update: (command) => commands.execute(command),
    delete: (command) => commands.execute(command),
    restore: (command) => commands.execute(command),
    get: (query) => queries.execute(query),
    ledger: (query) => queries.execute(query),
  })
  /** Takes the member out of the household, as the owner's removal does. */
  const remove = (group: string, user: number) => delete memberships[`${group}:${user}`]
  return { transactions, operations, remove }
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

/** A 12.34 USD lunch, as a person types it: a positive amount and the kind. */
const lunch = (overrides: Record<string, unknown> = {}) => ({
  groupId,
  id: uuidV7(),
  accountId: usdAccount,
  categoryId: food,
  kind: TransactionKind.EXPENSE,
  amount: 1234,
  currency: "USD",
  date: "2026-11-05",
  ...overrides,
})

/** An entry written straight into the repository, as the household's owner. */
async function existing(s: Stack, overrides: Record<string, unknown> = {}) {
  const { transaction } = await s.transactions.create(
    { memo: "", ...lunch(overrides), allowance: null } as Parameters<
      Stack["transactions"]["create"]
    >[0],
    OWNER,
  )
  s.transactions.writes = 0
  return transaction
}

/** Every write an editor can send about the entry at version 1. */
function writes(id: string, group = groupId): [string, Record<string, unknown>][] {
  return [
    ["transaction.create", lunch({ groupId: group })],
    ["transaction.update", lunch({ groupId: group, id, memo: "edited", version: 1 })],
    ["transaction.delete", { groupId: group, id, version: 1 }],
    ["transaction.restore", { groupId: group, id }],
  ]
}

const refused = (status: string, code: string) => ({
  kind: "server.error",
  code: status,
  details: { code },
})

const payloadOf = (answer: Answer) => (answer as { payload: Record<string, unknown> }).payload

for (const [via, open] of TRANSPORTS) {
  describe(`transactions over ${via}`, () => {
    it("stores an expense negative and an income positive, with the author the server knows (R5, R18)", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const expense = await as.command("transaction.create", lunch({ memo: "  Lunch  " }))
      const income = await as.command(
        "transaction.create",
        lunch({ kind: TransactionKind.INCOME, categoryId: salary, amount: 500000 }),
      )

      expect(expense).toMatchObject({
        kind: "server.result",
        payload: {
          created: true,
          transaction: {
            groupId,
            amount: -1234,
            accountAmount: -1234,
            converted: false,
            memo: "Lunch",
            createdByUserId: EDITOR,
            version: 1,
          },
        },
      })
      expect(payloadOf(income)).toMatchObject({
        transaction: { amount: 500000, accountAmount: 500000 },
      })
      as.shutdown()
    })

    it("refuses a negative, a fractional or a too large amount, and every field the server sets (R1, R3, R18)", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const answers = [
        await as.command("transaction.create", lunch({ amount: -1234 })),
        await as.command("transaction.create", lunch({ amount: 12.34 })),
        await as.command("transaction.create", lunch({ amount: Number.MAX_SAFE_INTEGER + 2 })),
        await as.command("transaction.create", lunch({ converted: true })),
        await as.command("transaction.create", lunch({ createdByUserId: OWNER })),
        await as.command("transaction.create", lunch({ accountAmount: -1 })),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject(refused("bad_request", "INVALID_REQUEST"))
      }
      expect(s.transactions.writes).toBe(0)
      as.shutdown()
    })

    it("fills a missing account amount from the rate of the entry's date and marks it converted (R4, R6)", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const converted = await as.command(
        "transaction.create",
        lunch({ amount: 5000, currency: "JPY" }),
      )
      const manual = await as.command(
        "transaction.create",
        lunch({ amount: 5000, currency: "JPY", accountAmount: 3300 }),
      )

      expect(payloadOf(converted)).toMatchObject({
        transaction: { amount: -5000, currency: "JPY", accountAmount: -3321, converted: true },
      })
      expect(payloadOf(manual)).toMatchObject({
        transaction: { amount: -5000, currency: "JPY", accountAmount: -3300, converted: false },
      })
      as.shutdown()
    })

    it("answers NO_RATE for a currency with no rate on the date, and stores nothing (R8)", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const answer = await as.command(
        "transaction.create",
        lunch({ amount: 5000, currency: "JPY", date: "2026-11-04" }),
      )

      expect(answer).toMatchObject(refused("conflict", "NO_RATE"))
      expect(s.transactions.writes).toBe(0)
      as.shutdown()
    })

    it("keeps 0.5 BTC as 50000000 in a crypto account, and answers NO_RATE for a coin with no price", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const inCoin = await as.command(
        "transaction.create",
        lunch({ accountId: btcAccount, amount: 50_000_000, currency: "BTC" }),
      )
      const noPrice = await as.command(
        "transaction.create",
        lunch({ amount: 50_000_000, currency: "BTC" }),
      )
      const manual = await as.command(
        "transaction.create",
        lunch({ amount: 50_000_000, currency: "BTC", accountAmount: 3_000_000 }),
      )

      expect(payloadOf(inCoin)).toMatchObject({
        transaction: { amount: -50_000_000, currency: "BTC", accountAmount: -50_000_000 },
      })
      expect(noPrice).toMatchObject(refused("conflict", "NO_RATE"))
      expect(payloadOf(manual)).toMatchObject({
        transaction: { amount: -50_000_000, accountAmount: -3_000_000, converted: false },
      })
      as.shutdown()
    })

    it("refuses an edit without its memo or its date, and leaves the entry as it was", async () => {
      const s = stack()
      const entry = await existing(s, { memo: "Lunch" })
      const as = open(s, EDITOR)

      const { date: _date, ...noDate } = { ...lunch({ id: entry.id }), memo: "Lunch", version: 1 }
      const noMemo = { ...lunch({ id: entry.id }), version: 1 }
      for (const payload of [noMemo, noDate]) {
        expect(await as.command("transaction.update", payload)).toMatchObject(
          refused("bad_request", "INVALID_REQUEST"),
        )
      }
      expect(s.transactions.writes).toBe(0)
      expect(payloadOf(await as.query("transaction.get", { groupId, id: entry.id })))
        .toMatchObject({ transaction: { memo: "Lunch", date: "2026-11-05", version: 1 } })
      as.shutdown()
    })

    it("dates an entry sent without a date today in the household's time zone (R14)", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const { date: _date, ...undated } = lunch()
      const answer = await as.command("transaction.create", undated)

      // 16:30 UTC on 30 November is 00:30 on 1 December in Singapore.
      expect(payloadOf(answer)).toMatchObject({ transaction: { date: "2026-12-01" } })
      as.shutdown()
    })

    it("refuses an expense in an income category and takes a refund in an expense category (R12)", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      expect(await as.command("transaction.create", lunch({ categoryId: salary })))
        .toMatchObject(refused("bad_request", "CATEGORY_KIND_MISMATCH"))
      expect(
        await as.command("transaction.create", lunch({ kind: TransactionKind.INCOME })),
      ).toMatchObject({ kind: "server.result", payload: { transaction: { amount: 1234 } } })
      as.shutdown()
    })

    it("answers another household's account, category or entry as not found (R17)", async () => {
      const s = stack()
      const foreign = await existing(s, {
        groupId: otherGroupId,
        accountId: otherAccount,
        categoryId: otherCategory,
      })
      const as = open(s, OWNER)

      expect(await as.command("transaction.create", lunch({ accountId: otherAccount })))
        .toMatchObject(refused("not_found", "ACCOUNT_NOT_FOUND"))
      expect(await as.command("transaction.create", lunch({ categoryId: otherCategory })))
        .toMatchObject(refused("not_found", "CATEGORY_NOT_FOUND"))
      expect(await as.query("transaction.get", { groupId, id: foreign.id })).toMatchObject(
        refused("not_found", "TRANSACTION_NOT_FOUND"),
      )
      for (const [name, payload] of writes(foreign.id).slice(1)) {
        expect(await as.command(name, payload)).toMatchObject(
          refused("not_found", "TRANSACTION_NOT_FOUND"),
        )
      }
      expect(s.transactions.writes).toBe(0)
      expect(s.transactions.transactions.get(foreign.id)).toMatchObject({
        groupId: otherGroupId,
        version: 1,
        deletedAt: null,
      })
      as.shutdown()
    })

    it("refuses every write of a viewer and lets them read (R16)", async () => {
      const s = stack()
      const entry = await existing(s)
      const as = open(s, VIEWER)

      for (const [name, payload] of writes(entry.id)) {
        expect(await as.command(name, payload)).toMatchObject(
          refused("forbidden", "ROLE_INSUFFICIENT"),
        )
      }
      expect(s.transactions.writes).toBe(0)
      expect(await as.query("transaction.get", { groupId, id: entry.id })).toMatchObject({
        kind: "server.result",
        payload: { transaction: { id: entry.id } },
      })
      expect(
        await as.query("transaction.ledger", { groupId, from: "2026-11-01", to: "2026-11-30" }),
      ).toMatchObject({ kind: "server.result", payload: { ledger: { spending: 1234 } } })
      as.shutdown()
    })

    it("tells a stranger the household does not exist, for reads and writes", async () => {
      const s = stack()
      const entry = await existing(s)
      const as = open(s, STRANGER)

      const answers = [
        await as.query("transaction.get", { groupId, id: entry.id }),
        await as.query("transaction.ledger", { groupId, from: "2026-11-01", to: "2026-11-30" }),
        ...await Promise.all(writes(entry.id).map(([name, payload]) => as.command(name, payload))),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject(refused("not_found", "GROUP_NOT_FOUND"))
      }
      expect(s.transactions.writes).toBe(0)
      as.shutdown()
    })

    it("refuses a removed member at once, though the same session wrote a moment before (R16)", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      expect(await as.command("transaction.create", lunch())).toMatchObject({
        kind: "server.result",
      })
      s.remove(groupId, EDITOR)
      s.transactions.writes = 0

      const entry = [...s.transactions.transactions.values()][0]
      for (const [name, payload] of writes(entry.id)) {
        expect(await as.command(name, payload)).toMatchObject(
          refused("not_found", "GROUP_NOT_FOUND"),
        )
      }
      expect(s.transactions.writes).toBe(0)
      as.shutdown()
    })

    it("edits, deletes and restores an entry, and answers a stale version with the current one", async () => {
      const s = stack()
      const entry = await existing(s)
      const as = open(s, EDITOR)

      expect(
        await as.command("transaction.update", {
          ...lunch({ id: entry.id }),
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
          await as.command("transaction.update", {
            ...lunch({ id: entry.id }),
            memo: "Dinner",
            version: 1,
          }),
        ),
      ).toMatchObject({ transaction: { memo: "Dinner", version: 2, updatedByUserId: EDITOR } })
      expect(
        payloadOf(await as.command("transaction.delete", { groupId, id: entry.id, version: 2 })),
      ).toMatchObject({ transaction: { version: 3 } })
      expect(await as.query("transaction.get", { groupId, id: entry.id })).toMatchObject(
        refused("not_found", "TRANSACTION_NOT_FOUND"),
      )
      expect(
        payloadOf(await as.command("transaction.restore", { groupId, id: entry.id })),
      ).toMatchObject({ transaction: { version: 4, deletedAt: null } })
      expect(await as.command("transaction.restore", { groupId, id: entry.id })).toMatchObject(
        refused("not_found", "TRANSACTION_NOT_FOUND"),
      )
      as.shutdown()
    })

    it("answers a retried create with the first entry, and a reused id with a conflict", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      const first = lunch()

      await as.command("transaction.create", first)
      const again = await as.command("transaction.create", first)
      const reused = await as.command("transaction.create", { ...first, amount: 999 })

      expect(again).toMatchObject({
        kind: "server.result",
        payload: { created: false, transaction: { id: first.id, version: 1 } },
      })
      expect(reused).toMatchObject(refused("conflict", "ID_ALREADY_EXISTS"))
      expect(s.transactions.transactions.size).toBe(1)
      as.shutdown()
    })

    it("refuses a ledger period that runs backwards or spans more than a year", async () => {
      const s = stack()
      const as = open(s, VIEWER)

      for (const [from, to] of [["2026-11-30", "2026-11-01"], ["2026-01-01", "2027-01-02"]]) {
        expect(await as.query("transaction.ledger", { groupId, from, to })).toMatchObject(
          refused("bad_request", "INVALID_REQUEST"),
        )
      }
      as.shutdown()
    })
  })
}

describe("the locks entries put on accounts and categories", () => {
  it("answers a locked currency, a locked kind and an account with entries as conflicts on both transports", () => {
    const answers = [
      new AccountError("CURRENCY_LOCKED", "locked"),
      new AccountError("ACCOUNT_HAS_TRANSACTIONS", "has entries"),
      new CategoryError("KIND_LOCKED", "locked"),
    ].map((error) => toRequestError(error))

    expect(answers.map((answer) => answer?.code)).toEqual(["conflict", "conflict", "conflict"])
  })
})
