import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { drainMicrotasks, FakeClock, FakeSocket } from "@spy4x/realtime/testing"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { FREE_PLAN_ID } from "@domain/billing"
import { CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import { TransactionKind } from "@domain/transactions"
import {
  RecurringRuleCreateCommand,
  RecurringRuleDeleteCommand,
  RecurringRuleGetQuery,
  RecurringRuleListQuery,
  RecurringRuleRestoreCommand,
  RecurringRuleSkipCommand,
  RecurringRuleUpdateCommand,
} from "@domain/recurring"
import { createSessionGate } from "../../cqrs/session-gate.ts"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { buildAuthData } from "../../_testing/fake-auth.ts"
import { MemoryRecurringRuleRepository } from "../../_testing/memory-recurring-rules.ts"
import {
  API_URL,
  mountRoute,
  sameOriginHeaders,
  WEB_APP_URL,
} from "../../_testing/mutation-requests.ts"
import { createCallRoute } from "../../routes/call.ts"
import { Realtime, toRequestError } from "../../services/realtime.ts"
import {
  createRecurringRuleCreateHandler,
  createRecurringRuleDeleteHandler,
  createRecurringRuleGetHandler,
  createRecurringRuleListHandler,
  createRecurringRuleRestoreHandler,
  createRecurringRuleSkipHandler,
  createRecurringRuleUpdateHandler,
} from "./handlers.ts"
import { createRecurringRuleOperations } from "./operations.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { checkedError } from "../../_testing/api-error.ts"
import { TEST_PLANS, testUsage } from "../../../../libs/domain/billing/test-plans.ts"

/**
 * Repeating rules over every transport, as the API wires them: one pair of buses, the gates and
 * the real handlers over an in-memory repository. The socket and the call route are two adapters
 * of one operations table, so every scenario runs through both and expects the same answer. The
 * race between a write and a member's demotion, the plan cap under the lock and the purge need
 * Postgres and are in `tests/integration/recurring-rules.integration.test.ts`.
 */

const groupId = uuidV7()
const otherGroupId = uuidV7()
const usdAccount = uuidV7()
const otherAccount = uuidV7()
const rent = uuidV7()
const otherCategory = uuidV7()
const OWNER = 1
const VIEWER = 2
const EDITOR = 3
const STRANGER = 9

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
  const rules = new MemoryRecurringRuleRepository({
    accounts: new Map([
      [usdAccount, { groupId, currency: `USD` }],
      [otherAccount, { groupId: otherGroupId, currency: `USD` }],
    ]),
    categories: new Map([
      [rent, { groupId, kind: CategoryKind.EXPENSE }],
      [otherCategory, { groupId: otherGroupId, kind: CategoryKind.EXPENSE }],
    ]),
  })
  const dependencies = { rules, groups }
  const commands = new CommandBus()
  commands.use(createSessionGate([]))
  commands.use(createEntitlementGate({
    billingEnabled: true,
    plans: TEST_PLANS,
    planOf: () => Promise.resolve(FREE_PLAN_ID),
    roleOf: (group, user) => groups.roleOf(group, user),
    usage: testUsage({ maxRecurringRules: (group) => rules.count(group) }),
  }, ENTITLEMENT_NEEDS))
  commands.register(RecurringRuleCreateCommand, createRecurringRuleCreateHandler(dependencies))
  commands.register(RecurringRuleUpdateCommand, createRecurringRuleUpdateHandler(dependencies))
  commands.register(RecurringRuleDeleteCommand, createRecurringRuleDeleteHandler(dependencies))
  commands.register(RecurringRuleRestoreCommand, createRecurringRuleRestoreHandler(dependencies))
  commands.register(RecurringRuleSkipCommand, createRecurringRuleSkipHandler(dependencies))
  const queries = new QueryBus()
  queries.use(createSessionGate([]))
  queries.register(RecurringRuleGetQuery, createRecurringRuleGetHandler(dependencies))
  queries.register(RecurringRuleListQuery, createRecurringRuleListHandler(dependencies))
  const operations = createRecurringRuleOperations({
    create: (command) => commands.execute(command),
    update: (command) => commands.execute(command),
    delete: (command) => commands.execute(command),
    restore: (command) => commands.execute(command),
    skip: (command) => commands.execute(command),
    get: (query) => queries.execute(query),
    list: (query) => queries.execute(query),
  })
  return { rules, operations }
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

const TRANSPORTS = [[`the socket`, socket], [`the call route`, callRoute]] as const

/** A monthly 1200 USD rent on the 1st, as a person sets it. */
const rentRule = (overrides: Record<string, unknown> = {}) => ({
  groupId,
  id: uuidV7(),
  accountId: usdAccount,
  categoryId: rent,
  kind: TransactionKind.EXPENSE,
  amount: 120000,
  currency: `USD`,
  rrule: `FREQ=MONTHLY;BYMONTHDAY=1`,
  startDate: `2026-12-01`,
  ...overrides,
})

/** A rule written straight into the repository, as the household's owner. */
async function existing(s: Stack, overrides: Record<string, unknown> = {}) {
  const { rule } = await s.rules.create(
    {
      ...rentRule(overrides),
      rrule: `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1`,
      memo: ``,
      accountAmount: null,
      endDate: null,
      count: null,
      allowance: null,
    } as Parameters<Stack[`rules`][`create`]>[0],
    OWNER,
  )
  s.rules.writes = 0
  return rule
}

/** Every write an editor can send about the rule at version 1. */
function writes(id: string, group = groupId): [string, Record<string, unknown>][] {
  return [
    [`recurring.create`, rentRule({ groupId: group })],
    [`recurring.update`, rentRule({ groupId: group, id, memo: `edited`, version: 1 })],
    [`recurring.skip`, { groupId: group, id, date: `2027-01-01` }],
    [`recurring.delete`, { groupId: group, id, version: 1 }],
    [`recurring.restore`, { groupId: group, id }],
  ]
}

const refused = (status: string, code: string) => ({
  kind: `server.error`,
  code: status,
  details: { code },
})

const payloadOf = (answer: Answer) => (answer as { payload: Record<string, unknown> }).payload

for (const [via, open] of TRANSPORTS) {
  describe(`repeating rules over ${via}`, () => {
    it(`stores a rule with its repeat as the server writes it and the author it knows`, async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const answer = await as.command(`recurring.create`, rentRule({ memo: `  Rent  `, count: 12 }))

      expect(answer).toMatchObject({
        kind: `server.result`,
        payload: {
          created: true,
          rule: {
            groupId,
            amount: 120000,
            accountAmount: null,
            memo: `Rent`,
            rrule: `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1`,
            startDate: `2026-12-01`,
            endDate: null,
            count: 12,
            skippedDates: [],
            madeThrough: null,
            pausedReason: null,
            createdByUserId: EDITOR,
            version: 1,
          },
        },
      })
      expect(await as.query(`recurring.list`, { groupId })).toMatchObject({
        kind: `server.result`,
        payload: { rules: [{ memo: `Rent` }] },
      })
      as.shutdown()
    })

    it(`refuses a day 31, an end date with a count and a field the job sets, naming the field`, async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const day31 = await as.command(
        `recurring.create`,
        rentRule({ rrule: `FREQ=MONTHLY;BYMONTHDAY=31` }),
      )
      const both = await as.command(
        `recurring.create`,
        rentRule({ endDate: `2027-12-01`, count: 3 }),
      )
      const jobField = await as.command(`recurring.create`, rentRule({ madeThrough: `2026-12-01` }))

      expect(day31).toMatchObject(refused(`bad_request`, `INVALID_REQUEST`))
      expect(both).toMatchObject(refused(`bad_request`, `INVALID_REQUEST`))
      expect(jobField).toMatchObject(refused(`bad_request`, `INVALID_REQUEST`))
      expect(s.rules.writes).toBe(0)
      as.shutdown()
    })

    it(`skips an occurrence once however often it is sent, and refuses a date off the repeat`, async () => {
      const s = stack()
      const rule = await existing(s)
      const as = open(s, EDITOR)

      const first = await as.command(`recurring.skip`, { groupId, id: rule.id, date: `2027-01-01` })
      const again = await as.command(`recurring.skip`, { groupId, id: rule.id, date: `2027-01-01` })
      const off = await as.command(`recurring.skip`, { groupId, id: rule.id, date: `2027-01-02` })

      expect(payloadOf(first)).toMatchObject({ rule: { skippedDates: [`2027-01-01`], version: 2 } })
      expect(payloadOf(again)).toMatchObject({ rule: { skippedDates: [`2027-01-01`], version: 2 } })
      expect(off).toMatchObject(refused(`bad_request`, `INVALID_REQUEST`))
      expect(s.rules.writes).toBe(1)
      as.shutdown()
    })

    it(`answers another household's account, category or rule as not found (R17)`, async () => {
      const s = stack()
      const foreign = await existing(s, {
        groupId: otherGroupId,
        accountId: otherAccount,
        categoryId: otherCategory,
      })
      const as = open(s, OWNER)

      expect(await as.command(`recurring.create`, rentRule({ accountId: otherAccount })))
        .toMatchObject(refused(`not_found`, `ACCOUNT_NOT_FOUND`))
      expect(await as.command(`recurring.create`, rentRule({ categoryId: otherCategory })))
        .toMatchObject(refused(`not_found`, `CATEGORY_NOT_FOUND`))
      expect(await as.query(`recurring.get`, { groupId, id: foreign.id })).toMatchObject(
        refused(`not_found`, `RECURRING_RULE_NOT_FOUND`),
      )
      for (const [name, payload] of writes(foreign.id).slice(1)) {
        expect(await as.command(name, payload)).toMatchObject(
          refused(`not_found`, `RECURRING_RULE_NOT_FOUND`),
        )
      }
      expect(s.rules.writes).toBe(0)
      expect(s.rules.rules.get(foreign.id)).toMatchObject({
        groupId: otherGroupId,
        version: 1,
        deletedAt: null,
      })
      as.shutdown()
    })

    it(`refuses every write of a viewer as forbidden and lets them read (R16)`, async () => {
      const s = stack()
      const rule = await existing(s)
      const as = open(s, VIEWER)

      for (const [name, payload] of writes(rule.id)) {
        expect(await as.command(name, payload)).toMatchObject(
          refused(`forbidden`, `ROLE_INSUFFICIENT`),
        )
      }
      expect(s.rules.writes).toBe(0)
      expect(await as.query(`recurring.get`, { groupId, id: rule.id })).toMatchObject({
        kind: `server.result`,
        payload: { rule: { id: rule.id } },
      })
      expect(await as.query(`recurring.list`, { groupId })).toMatchObject({
        kind: `server.result`,
        payload: { rules: [{ id: rule.id }] },
      })
      as.shutdown()
    })

    it(`tells a stranger the household does not exist, for reads and writes`, async () => {
      const s = stack()
      const rule = await existing(s)
      const as = open(s, STRANGER)

      const answers = [
        await as.query(`recurring.get`, { groupId, id: rule.id }),
        await as.query(`recurring.list`, { groupId }),
        ...await Promise.all(writes(rule.id).map(([name, payload]) => as.command(name, payload))),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject(refused(`not_found`, `GROUP_NOT_FOUND`))
      }
      expect(s.rules.writes).toBe(0)
      as.shutdown()
    })
  })
}
