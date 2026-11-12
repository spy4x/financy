import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { drainMicrotasks, FakeClock, FakeSocket } from "@spy4x/realtime/testing"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { PRO_PLAN_ID } from "@domain/billing"
import { BudgetBand, BudgetLimitSource, BudgetMonthQuery, BudgetSetCommand } from "@domain/budgets"
import { CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import { TransactionKind } from "@domain/transactions"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { createSessionGate } from "../../cqrs/session-gate.ts"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { buildAuthData } from "../../_testing/fake-auth.ts"
import { type MemoryBudgetCategory, MemoryBudgetRepository } from "../../_testing/memory-budgets.ts"
import { MemoryTransactionRepository } from "../../_testing/memory-transactions.ts"
import {
  API_URL,
  mountRoute,
  sameOriginHeaders,
  WEB_APP_URL,
} from "../../_testing/mutation-requests.ts"
import { checkedError } from "../../_testing/api-error.ts"
import { createCallRoute } from "../../routes/call.ts"
import { Realtime, toRequestError } from "../../services/realtime.ts"
import { TEST_PLANS, testUsage } from "../../../../libs/domain/billing/test-plans.ts"
import { createBudgetMonthHandler, createBudgetSetHandler } from "./handlers.ts"
import { createBudgetOperations } from "./operations.ts"

/**
 * Budgets over every transport, as the API wires them: one pair of buses, the gates and the real
 * handlers over in-memory budgets and entries. The socket and the call route are two adapters of
 * one operations table, so every scenario runs through both and expects the same answer. The race
 * with a member's removal and the SQL need Postgres and are in `tests/integration/`.
 */

const groupId = uuidV7()
const otherGroupId = uuidV7()
const usdAccount = uuidV7()
const food = uuidV7()
const groceries = uuidV7()
const salary = uuidV7()
const old = uuidV7()
const otherCategory = uuidV7()
const OWNER = 1
const VIEWER = 2
const EDITOR = 3
const STRANGER = 9
/** 16:30 UTC on 30 November: already 1 December in Singapore, the household's zone. */
const NOW = new Date("2026-11-30T16:30:00.000Z")

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
  const categories = new Map<string, MemoryBudgetCategory>([
    [food, { groupId, kind: CategoryKind.EXPENSE }],
    [groceries, { groupId, kind: CategoryKind.EXPENSE, parentId: food }],
    [salary, { groupId, kind: CategoryKind.INCOME }],
    [old, { groupId, kind: CategoryKind.EXPENSE, archived: true }],
    [otherCategory, { groupId: otherGroupId, kind: CategoryKind.EXPENSE }],
  ])
  const timeZones = new Map([[groupId, "Asia/Singapore"]])
  const budgets = new MemoryBudgetRepository(categories, timeZones)
  const transactions = new MemoryTransactionRepository({
    accounts: new Map([[usdAccount, { groupId, currency: "USD" }]]),
    categories,
    timeZones,
    rates: () => Promise.resolve(null),
  })
  const dependencies = {
    budgets,
    groups,
    settings: { get: () => Promise.resolve({ baseCurrency: "USD" }) },
    ledger: (group: string, currency: string, from: string, to: string) =>
      transactions.ledger(group, currency, from, to),
    rate: () => Promise.resolve(null),
    now: () => NOW,
  }
  const commands = new CommandBus()
  commands.use(createSessionGate([]))
  commands.use(createEntitlementGate({
    billingEnabled: true,
    plans: TEST_PLANS,
    planOf: () => Promise.resolve(PRO_PLAN_ID),
    roleOf: (group, user) => groups.roleOf(group, user),
    usage: testUsage({}),
  }, ENTITLEMENT_NEEDS))
  commands.register(BudgetSetCommand, createBudgetSetHandler(dependencies))
  const queries = new QueryBus()
  queries.use(createSessionGate([]))
  queries.register(BudgetMonthQuery, createBudgetMonthHandler(dependencies))
  const operations = createBudgetOperations({
    set: (command) => commands.execute(command),
    month: (query) => queries.execute(query),
  })
  /** Takes the member out of the household, as the owner's removal does. */
  const remove = (group: string, user: number) => delete memberships[`${group}:${user}`]
  /** An expense of `amount` cents in a category, written straight into the entries. */
  const spend = async (categoryId: string, amount: number, date: string) => {
    await transactions.create({
      groupId,
      id: uuidV7(),
      accountId: usdAccount,
      categoryId,
      kind: amount < 0 ? TransactionKind.INCOME : TransactionKind.EXPENSE,
      amount: Math.abs(amount),
      currency: "USD",
      date,
      memo: "",
      allowance: null,
    }, OWNER)
  }
  return { budgets, operations, remove, spend }
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
    if (!answer) throw new Error(`No answer to ${String(frame.name)} on the socket`)
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

/** A 500.00 limit on food from November, as a person first sets it. */
const limit = (overrides: Record<string, unknown> = {}) => ({
  groupId,
  categoryId: food,
  month: "2026-11",
  amount: 50000,
  expectedVersion: null,
  ...overrides,
})

const refused = (status: string, code: string) => ({
  kind: "server.error",
  code: status,
  details: { code },
})

interface MonthPayload {
  budgets: {
    month: string
    from: string
    to: string
    rows: { categoryId: string; limit: unknown; source: unknown; spending: number }[]
  }
}

const monthOf = (answer: Answer) => (answer as { payload: MonthPayload }).payload.budgets

/** The bar of one category in a month's answer. */
const rowOf = (answer: Answer, categoryId: string) =>
  monthOf(answer).rows.find((row) => row.categoryId === categoryId)

for (const [via, open] of TRANSPORTS) {
  describe(`budgets over ${via}`, () => {
    it("sets a limit in the household's base currency and shows it with the month's spending (R12)", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      await s.spend(food, 12000, "2026-11-05")
      await s.spend(groceries, 30000, "2026-11-06")

      const set = await as.command("budget.set", limit())
      const month = await as.query("budget.month", { groupId, month: "2026-11" })

      expect(set).toMatchObject({
        kind: "server.result",
        payload: {
          budget: {
            groupId,
            categoryId: food,
            month: "2026-11",
            amount: 50000,
            currency: "USD",
            version: 1,
            createdByUserId: EDITOR,
          },
        },
      })
      expect(rowOf(month, food)).toEqual({
        categoryId: food,
        parentId: null,
        limit: { amount: 50000, currency: "USD" },
        source: BudgetLimitSource.OWN,
        spending: 42000,
        currency: "USD",
        band: BudgetBand.YELLOW,
        percent: 84,
        leftOut: [],
      })
      expect(rowOf(month, groceries)).toMatchObject({ limit: null, spending: 30000, band: null })
      expect(monthOf(month).rows.map((row) => row.categoryId)).toEqual([food, groceries])
      as.shutdown()
    })

    it("takes a limit in another currency as sent", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const set = await as.command("budget.set", limit({ currency: "EUR" }))

      expect(set).toMatchObject({ payload: { budget: { amount: 50000, currency: "EUR" } } })
      as.shutdown()
    })

    it("shows the current month in the household's time zone when no month is named (R14)", async () => {
      const s = stack()
      const as = open(s, VIEWER)

      const month = await as.query("budget.month", { groupId })

      expect(monthOf(month)).toMatchObject({
        month: "2026-12",
        from: "2026-12-01",
        to: "2026-12-31",
      })
      as.shutdown()
    })

    it("keeps a limit for the months after it, without carrying the unspent part over", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      await as.command("budget.set", limit())
      await s.spend(food, 10000, "2026-11-05")
      await s.spend(food, 7000, "2026-12-05")

      const december = await as.query("budget.month", { groupId, month: "2026-12" })

      expect(rowOf(december, food)).toMatchObject({
        limit: { amount: 50000, currency: "USD" },
        spending: 7000,
        percent: 14,
      })
      as.shutdown()
    })

    it("changes a month's limit without touching the month before it", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      await as.command("budget.set", limit({ month: "2026-10", amount: 40000 }))

      const november = await as.command("budget.set", limit({ amount: 60000 }))
      const october = await as.query("budget.month", { groupId, month: "2026-10" })
      const january = await as.query("budget.month", { groupId, month: "2027-01" })

      expect(november).toMatchObject({ payload: { budget: { amount: 60000, version: 1 } } })
      expect(rowOf(october, food)).toMatchObject({ limit: { amount: 40000, currency: "USD" } })
      expect(rowOf(january, food)).toMatchObject({ limit: { amount: 60000, currency: "USD" } })
      as.shutdown()
    })

    it("removes a limit from a month on, which an archived category allows", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      await as.command("budget.set", limit())

      const removed = await as.command(
        "budget.set",
        limit({ month: "2026-12", amount: null }),
      )
      const archived = await as.command(
        "budget.set",
        limit({ categoryId: old, month: "2026-12", amount: null }),
      )
      const december = await as.query("budget.month", { groupId, month: "2026-12" })
      const november = await as.query("budget.month", { groupId, month: "2026-11" })

      expect(removed).toMatchObject({ payload: { budget: { amount: null, currency: null } } })
      expect(archived).toMatchObject({ payload: { budget: { categoryId: old, amount: null } } })
      expect(rowOf(december, food)).toMatchObject({ limit: null, band: null })
      expect(rowOf(november, food)).toMatchObject({ limit: { amount: 50000 } })
      as.shutdown()
    })

    it("compares a parent without its own limit with its children's limits (R13)", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      await as.command("budget.set", limit({ categoryId: groceries, amount: 20000 }))
      await s.spend(groceries, 5000, "2026-11-06")

      const month = await as.query("budget.month", { groupId, month: "2026-11" })

      expect(rowOf(month, food)).toMatchObject({
        limit: { amount: 20000, currency: "USD" },
        source: BudgetLimitSource.CHILDREN,
        spending: 5000,
      })
      as.shutdown()
    })

    it("refuses a set at a version the month's row no longer has, with the current one", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      await as.command("budget.set", limit())

      const stale = await as.command("budget.set", limit({ amount: 70000 }))
      const fresh = await as.command("budget.set", limit({ amount: 70000, expectedVersion: 1 }))

      expect(stale).toMatchObject({
        kind: "server.error",
        code: "conflict",
        details: { code: "VERSION_CONFLICT", currentVersion: 1 },
      })
      expect(fresh).toMatchObject({ payload: { budget: { amount: 70000, version: 2 } } })
      as.shutdown()
    })

    it("refuses an income, an archived, another household's or an unknown category (R12, R17)", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const answers = [
        await as.command("budget.set", limit({ categoryId: salary })),
        await as.command("budget.set", limit({ categoryId: old })),
        await as.command("budget.set", limit({ categoryId: otherCategory })),
        await as.command("budget.set", limit({ categoryId: uuidV7() })),
      ]

      expect(answers).toMatchObject([
        refused("bad_request", "BUDGET_INCOME_CATEGORY"),
        refused("conflict", "CATEGORY_ARCHIVED"),
        refused("not_found", "CATEGORY_NOT_FOUND"),
        refused("not_found", "CATEGORY_NOT_FOUND"),
      ])
      expect(s.budgets.writes).toBe(0)
      as.shutdown()
    })

    it("refuses a malformed payload before it reaches the budgets", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const answers = [
        await as.command("budget.set", limit({ amount: null, currency: "USD" })),
        await as.command("budget.set", limit({ amount: 0 })),
        await as.command("budget.set", limit({ amount: 12.5 })),
        await as.command("budget.set", limit({ month: "2026-13" })),
        await as.command("budget.set", limit({ currency: "XBT1" })),
        await as.command("budget.set", limit({ version: 1 })),
        await as.query("budget.month", { groupId, month: "2026-11-01" }),
      ]

      expect(answers).toMatchObject(
        Array(7).fill(refused("bad_request", "INVALID_REQUEST")),
      )
      expect(s.budgets.writes).toBe(0)
      as.shutdown()
    })

    it("lets a viewer read the month but not change a limit (R16)", async () => {
      const s = stack()
      const as = open(s, VIEWER)

      const set = await as.command("budget.set", limit())
      const removal = await as.command("budget.set", limit({ amount: null }))
      const month = await as.query("budget.month", { groupId, month: "2026-11" })

      expect(set).toMatchObject(refused("forbidden", "ROLE_INSUFFICIENT"))
      expect(removal).toMatchObject(refused("forbidden", "ROLE_INSUFFICIENT"))
      expect(month).toMatchObject({ kind: "server.result" })
      expect(s.budgets.writes).toBe(0)
      as.shutdown()
    })

    it("answers a stranger and a removed member as if the household did not exist (R16)", async () => {
      const s = stack()
      const stranger = open(s, STRANGER)
      const editor = open(s, EDITOR)
      s.remove(groupId, EDITOR)

      const answers = [
        await stranger.command("budget.set", limit()),
        await stranger.query("budget.month", { groupId }),
        await editor.command("budget.set", limit()),
        await editor.query("budget.month", { groupId }),
      ]

      expect(answers).toMatchObject(Array(4).fill(refused("not_found", "GROUP_NOT_FOUND")))
      expect(s.budgets.writes).toBe(0)
      stranger.shutdown()
      editor.shutdown()
    })
  })
}
