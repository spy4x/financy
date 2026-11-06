import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { Hono } from "hono"
import { drainMicrotasks, FakeClock, FakeSocket } from "@spy4x/realtime/testing"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { FREE_PLAN_ID } from "@domain/billing"
import { GroupRole } from "@domain/groups"
import {
  ACCOUNT_MAX_PER_GROUP,
  AccountArchiveCommand,
  AccountCreateCommand,
  AccountDeleteCommand,
  AccountGetQuery,
  AccountKind,
  AccountListQuery,
  AccountRestoreCommand,
  AccountSetDefaultCommand,
  AccountUpdateCommand,
} from "@domain/accounts"
import { createSessionGate } from "../../cqrs/session-gate.ts"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { buildAuthData } from "../../_testing/fake-auth.ts"
import { MemoryAccountRepository } from "../../_testing/memory-accounts.ts"
import type { APIContext } from "../../_types.ts"
import {
  API_URL,
  mountRoute,
  sameOriginHeaders,
  WEB_APP_URL,
} from "../../_testing/mutation-requests.ts"
import { createCallRoute } from "../../routes/call.ts"
import { createAccountsRoute } from "../../routes/accounts.ts"
import { Realtime, toRequestError } from "../../services/realtime.ts"
import {
  createAccountArchiveHandler,
  createAccountCreateHandler,
  createAccountDeleteHandler,
  createAccountGetHandler,
  createAccountListHandler,
  createAccountRestoreHandler,
  createAccountSetDefaultHandler,
  createAccountUpdateHandler,
} from "./handlers.ts"
import { createAccountOperations } from "./operations.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { checkedError } from "../../_testing/api-error.ts"
import { TEST_PLANS } from "../../../../libs/domain/billing/test-plans.ts"

/**
 * Accounts over every transport, as the API wires them: one pair of buses, the gates and the real
 * handlers over an in-memory repository. The socket and the call route are two adapters of one
 * operations table, so every scenario runs through both and expects the same answer; the REST
 * route keeps the list. The race between a write and a member's removal needs Postgres and is in
 * `tests/integration/group-write-race.integration.test.ts`.
 */

const groupId = uuidV7()
const otherGroupId = uuidV7()
const accountId = uuidV7()
const secondAccountId = uuidV7()
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
  const accounts = new MemoryAccountRepository()
  const dependencies = { accounts, groups }
  const commands = new CommandBus()
  commands.use(createSessionGate([]))
  commands.use(createEntitlementGate({
    billingEnabled: true,
    plans: TEST_PLANS,
    planOf: () => Promise.resolve(FREE_PLAN_ID),
    roleOf: (group, user) => groups.roleOf(group, user),
    usage: {
      maxNotes: () => Promise.resolve(0),
      maxMembers: () => Promise.reject(new Error("not part of this test")),
    },
  }, ENTITLEMENT_NEEDS))
  commands.register(AccountCreateCommand, createAccountCreateHandler(dependencies))
  commands.register(AccountUpdateCommand, createAccountUpdateHandler(dependencies))
  commands.register(AccountArchiveCommand, createAccountArchiveHandler(dependencies))
  commands.register(AccountSetDefaultCommand, createAccountSetDefaultHandler(dependencies))
  commands.register(AccountDeleteCommand, createAccountDeleteHandler(dependencies))
  commands.register(AccountRestoreCommand, createAccountRestoreHandler(dependencies))
  const queries = new QueryBus()
  queries.use(createSessionGate([]))
  queries.register(AccountListQuery, createAccountListHandler(dependencies))
  queries.register(AccountGetQuery, createAccountGetHandler(dependencies))
  const operations = createAccountOperations({
    create: (command) => commands.execute(command),
    update: (command) => commands.execute(command),
    archive: (command) => commands.execute(command),
    setDefault: (command) => commands.execute(command),
    delete: (command) => commands.execute(command),
    restore: (command) => commands.execute(command),
    list: (query) => queries.execute(query),
    get: (query) => queries.execute(query),
  })
  /** Takes the member out of the household, as the owner's removal does. */
  const remove = (group: string, user: number) => delete memberships[`${group}:${user}`]
  return { accounts, operations, queries, remove }
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
      send({ kind: "client.command", name, payload, idempotencyKey: `key-${name}` }),
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
    command: (name, payload) => send(name, payload, { "idempotency-key": `key-${name}` }),
    query: (name, payload) => send(name, payload, {}),
    shutdown: () => {},
  }
}

const TRANSPORTS = [["the socket", socket], ["the call route", callRoute]] as const

const fields = {
  name: "Main account",
  kind: AccountKind.BANK,
  currency: "USD",
  startingBalance: 1234,
}
const create = { groupId, id: accountId, ...fields }

/** Every write an editor can send about the account at version 1. */
function writes(id = accountId, group = groupId): [string, Record<string, unknown>][] {
  return [
    ["account.create", { ...create, groupId: group, id: secondAccountId, name: "Wallet" }],
    ["account.update", { ...create, groupId: group, id, name: "Renamed", version: 1 }],
    ["account.archive", { groupId: group, id, archived: true, version: 1 }],
    ["account.setDefault", { groupId: group, id, isDefault: true, version: 1 }],
    ["account.delete", { groupId: group, id, version: 1 }],
    ["account.restore", { groupId: group, id }],
  ]
}

for (const [via, open] of TRANSPORTS) {
  describe(`accounts over ${via}`, () => {
    it("refuses every write of a viewer and changes nothing (R16)", async () => {
      const s = stack()
      await s.accounts.create(create, OWNER)
      s.accounts.writes = 0
      const as = open(s, VIEWER)

      for (const [name, payload] of writes()) {
        expect(await as.command(name, payload)).toMatchObject({
          kind: "server.error",
          code: "forbidden",
          details: { code: "ROLE_INSUFFICIENT" },
        })
      }
      expect(s.accounts.writes).toBe(0)
      as.shutdown()
    })

    it("lets a viewer list the household's accounts by name, each with its balance", async () => {
      const s = stack()
      await s.accounts.create(create, OWNER)
      await s.accounts.create({
        ...create,
        id: secondAccountId,
        name: "Cash",
        startingBalance: 500,
        currency: "JPY",
      }, OWNER)
      await s.accounts.create(
        { ...create, groupId: otherGroupId, id: uuidV7(), name: "Other" },
        OWNER,
      )
      const as = open(s, VIEWER)

      const answer = await as.query("account.list", { groupId })

      expect(answer).toMatchObject({ kind: "server.result" })
      const listed = (answer as { payload: { accounts: { name: string; balance: number }[] } })
        .payload.accounts
      expect(listed.map(({ name, balance }) => [name, balance])).toEqual([
        ["Cash", 500],
        ["Main account", 1234],
      ])
      as.shutdown()
    })

    it("tells a stranger the household does not exist, for reads and writes", async () => {
      const s = stack()
      await s.accounts.create(create, OWNER)
      s.accounts.writes = 0
      const as = open(s, STRANGER)

      const answers = [
        await as.query("account.list", { groupId }),
        await as.query("account.get", { groupId, id: accountId }),
        ...await Promise.all(writes().map(([name, payload]) => as.command(name, payload))),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject({
          kind: "server.error",
          code: "not_found",
          details: { code: "GROUP_NOT_FOUND" },
        })
      }
      expect(s.accounts.writes).toBe(0)
      as.shutdown()
    })

    it("refuses a removed member at once, though the same session wrote a moment before (R16)", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      expect(await as.command("account.create", create)).toMatchObject({ kind: "server.result" })
      s.remove(groupId, EDITOR)
      s.accounts.writes = 0

      const answers = [
        await as.query("account.list", { groupId }),
        ...await Promise.all(writes().map(([name, payload]) => as.command(name, payload))),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject({
          kind: "server.error",
          code: "not_found",
          details: { code: "GROUP_NOT_FOUND" },
        })
      }
      expect(s.accounts.writes).toBe(0)
      as.shutdown()
    })

    it("answers another household's account id as not found, the same as an unknown id (R17)", async () => {
      const s = stack()
      const foreign = uuidV7()
      await s.accounts.create({ ...create, groupId: otherGroupId, id: foreign }, OWNER)
      s.accounts.writes = 0
      const as = open(s, OWNER)

      for (const id of [foreign, uuidV7()]) {
        expect(await as.query("account.get", { groupId, id })).toMatchObject({
          kind: "server.error",
          code: "not_found",
          details: { code: "ACCOUNT_NOT_FOUND" },
        })
        for (const [name, payload] of writes(id).slice(1)) {
          expect(await as.command(name, payload)).toMatchObject({
            kind: "server.error",
            code: "not_found",
            details: { code: "ACCOUNT_NOT_FOUND" },
          })
        }
      }
      expect(s.accounts.writes).toBe(0)
      expect(s.accounts.accounts.get(foreign)).toMatchObject({
        name: "Main account",
        isDefault: false,
        archivedAt: null,
        deletedAt: null,
      })
      as.shutdown()
    })

    it("lets an editor create, edit, archive and unarchive an account", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      const created = await as.command("account.create", create)
      const updated = await as.command("account.update", {
        ...create,
        name: "Bills",
        kind: AccountKind.LIABILITY,
        startingBalance: -120000,
        version: 1,
      })
      const archived = await as.command("account.archive", {
        groupId,
        id: accountId,
        archived: true,
        version: 2,
      })
      const unarchived = await as.command("account.archive", {
        groupId,
        id: accountId,
        archived: false,
        version: 3,
      })

      expect(created).toMatchObject({
        kind: "server.result",
        payload: {
          created: true,
          account: { ...fields, version: 1, isDefault: false, archivedAt: null },
        },
      })
      expect(updated).toMatchObject({
        kind: "server.result",
        payload: {
          account: {
            name: "Bills",
            kind: AccountKind.LIABILITY,
            startingBalance: -120000,
            version: 2,
          },
        },
      })
      expect(
        (archived as { payload: { account: { archivedAt: unknown } } }).payload.account.archivedAt,
      ).not.toBeNull()
      expect(unarchived).toMatchObject({
        kind: "server.result",
        payload: { account: { archivedAt: null, version: 4 } },
      })
      as.shutdown()
    })

    it("keeps one default: a new default takes the flag, and archiving or deleting it clears it", async () => {
      const s = stack()
      await s.accounts.create(create, OWNER)
      await s.accounts.create({ ...create, id: secondAccountId, name: "Wallet" }, OWNER)
      const as = open(s, OWNER)

      await as.command("account.setDefault", {
        groupId,
        id: accountId,
        isDefault: true,
        version: 1,
      })
      await as.command("account.setDefault", {
        groupId,
        id: secondAccountId,
        isDefault: true,
        version: 1,
      })
      const defaults = () =>
        [...s.accounts.accounts.values()].filter((a) => a.isDefault).map((a) => a.id)
      expect(defaults()).toEqual([secondAccountId])

      await as.command("account.archive", {
        groupId,
        id: secondAccountId,
        archived: true,
        version: 2,
      })
      expect(defaults()).toEqual([])
      expect(
        await as.command("account.setDefault", {
          groupId,
          id: secondAccountId,
          isDefault: true,
          version: 3,
        }),
      )
        .toMatchObject({
          kind: "server.error",
          code: "conflict",
          details: { code: "ACCOUNT_ARCHIVED" },
        })

      const current = s.accounts.accounts.get(accountId)!.version
      await as.command("account.setDefault", {
        groupId,
        id: accountId,
        isDefault: true,
        version: current,
      })
      await as.command("account.delete", { groupId, id: accountId, version: current + 1 })
      expect(defaults()).toEqual([])
      as.shutdown()
    })

    it("deletes an account into the trash and restores it", async () => {
      const s = stack()
      await s.accounts.create(create, OWNER)
      const as = open(s, OWNER)

      await as.command("account.delete", { groupId, id: accountId, version: 1 })
      const live = await as.query("account.list", { groupId })
      const trash = await as.query("account.list", { groupId, deleted: true })
      const restored = await as.command("account.restore", { groupId, id: accountId })

      expect(live).toMatchObject({ kind: "server.result", payload: { accounts: [] } })
      expect(trash).toMatchObject({
        kind: "server.result",
        payload: { accounts: [{ id: accountId }] },
      })
      expect(restored).toMatchObject({
        kind: "server.result",
        payload: { account: { id: accountId, deletedAt: null } },
      })
      as.shutdown()
    })

    it("answers a stale edit with a conflict and the current version", async () => {
      const s = stack()
      await s.accounts.create(create, OWNER)
      const as = open(s, OWNER)

      const answer = await as.command("account.update", { ...create, name: "Late", version: 5 })

      expect(answer).toMatchObject({
        kind: "server.error",
        code: "conflict",
        details: { code: "VERSION_CONFLICT", currentVersion: 1 },
      })
      expect(s.accounts.accounts.get(accountId)?.name).toBe("Main account")
      as.shutdown()
    })

    it("refuses the account past the household's cap as a conflict, and keeps it at the cap", async () => {
      const s = stack()
      for (let index = 0; index < ACCOUNT_MAX_PER_GROUP; index++) {
        await s.accounts.create({ ...create, id: uuidV7(), name: `Account ${index}` }, OWNER)
      }
      const as = open(s, OWNER)

      const answer = await as.command("account.create", {
        ...create,
        id: uuidV7(),
        name: "One too many",
      })

      expect(answer).toMatchObject({
        kind: "server.error",
        code: "conflict",
        details: { code: "ACCOUNT_LIMIT_REACHED" },
      })
      expect(s.accounts.accounts.size).toBe(ACCOUNT_MAX_PER_GROUP)
      as.shutdown()
    })

    it("refuses a fraction of the smallest unit, an amount past the safe bound and a currency that is no ISO code (R2, R3)", async () => {
      const s = stack()
      const as = open(s, OWNER)

      const answers = [
        await as.command("account.create", { ...create, startingBalance: 12.34 }),
        await as.command("account.create", {
          ...create,
          startingBalance: Number.MAX_SAFE_INTEGER + 1,
        }),
        await as.command("account.create", { ...create, currency: "usd" }),
        await as.command("account.create", { ...create, currency: uuidV7() }),
        await as.command("account.create", { ...create, name: "   " }),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject({
          kind: "server.error",
          code: "bad_request",
          details: { code: "INVALID_REQUEST" },
        })
      }
      expect(s.accounts.accounts.size).toBe(0)
      as.shutdown()
    })

    it("answers a retried create with the first account", async () => {
      const s = stack()
      const as = open(s, OWNER)

      await as.command("account.create", create)
      const again = await as.command("account.create", create)

      expect(again).toMatchObject({
        kind: "server.result",
        payload: { created: false, account: { id: accountId, version: 1 } },
      })
      expect(s.accounts.accounts.size).toBe(1)
      as.shutdown()
    })
  })
}

describe("accounts over the REST list", () => {
  function rest(s: Stack, userId: number | null) {
    const app = new Hono<APIContext>()
    app.use("*", async (c, next) => {
      c.set("requestId", "req-accounts")
      if (userId !== null) {
        c.set("auth", buildAuthData({ user: { id: userId }, session: { userId } }))
      }
      await next()
    })
    app.route(
      "/groups/:groupId/accounts",
      createAccountsRoute({ list: (query) => s.queries.execute(query) }),
    )
    return (path: string) => app.request(`http://local/groups/${path}`)
  }

  it("lists a member's household accounts with their balances, and the trash on request", async () => {
    const s = stack()
    await s.accounts.create(create, OWNER)
    await s.accounts.create({ ...create, id: secondAccountId, name: "Old" }, OWNER)
    await s.accounts.delete({ groupId, id: secondAccountId, expectedVersion: 1 }, OWNER)

    const live = await rest(s, VIEWER)(`${groupId}/accounts`)
    const trash = await rest(s, VIEWER)(`${groupId}/accounts?deleted=true`)

    expect(live.status).toBe(200)
    expect((await live.json()).accounts).toMatchObject([{ id: accountId, balance: 1234 }])
    expect((await trash.json()).accounts).toMatchObject([{ id: secondAccountId }])
  })

  it("answers a stranger as an unknown household, with no account", async () => {
    const s = stack()
    await s.accounts.create(create, OWNER)

    const response = await rest(s, STRANGER)(`${groupId}/accounts`)

    expect(response.status).toBe(404)
    expect(JSON.stringify(await response.json())).not.toContain("Main account")
  })

  it("answers 401 and lists nothing when there is no session", async () => {
    const s = stack()
    await s.accounts.create(create, OWNER)

    const response = await rest(s, null)(`${groupId}/accounts`)

    expect(response.status).toBe(401)
    expect(JSON.stringify(await response.json())).not.toContain("Main account")
  })

  it("refuses a household id that is not a UUID", async () => {
    const response = await rest(stack(), OWNER)("not-a-group/accounts")

    expect(response.status).toBe(400)
  })
})
