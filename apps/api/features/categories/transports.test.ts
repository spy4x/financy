import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { Hono } from "hono"
import { drainMicrotasks, FakeClock, FakeSocket } from "@spy4x/realtime/testing"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { FREE_PLAN_ID } from "@domain/billing"
import { GroupRole } from "@domain/groups"
import {
  CATEGORY_MAX_PER_GROUP,
  CategoryArchiveCommand,
  CategoryCreateCommand,
  CategoryGetQuery,
  type CategoryIcon,
  CategoryKind,
  CategoryListQuery,
  CategoryUpdateCommand,
} from "@domain/categories"
import { createSessionGate } from "../../cqrs/session-gate.ts"
import { createEntitlementGate } from "../../cqrs/entitlement-gate.ts"
import { ENTITLEMENT_NEEDS } from "../../cqrs/entitlement-needs.ts"
import { buildAuthData } from "../../_testing/fake-auth.ts"
import { MemoryCategoryRepository } from "../../_testing/memory-categories.ts"
import type { APIContext } from "../../_types.ts"
import {
  API_URL,
  mountRoute,
  sameOriginHeaders,
  WEB_APP_URL,
} from "../../_testing/mutation-requests.ts"
import { createCallRoute } from "../../routes/call.ts"
import { createCategoriesRoute } from "../../routes/categories.ts"
import { Realtime, toRequestError } from "../../services/realtime.ts"
import {
  createCategoryArchiveHandler,
  createCategoryCreateHandler,
  createCategoryGetHandler,
  createCategoryListHandler,
  createCategoryUpdateHandler,
} from "./handlers.ts"
import { createCategoryOperations } from "./operations.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { checkedError } from "../../_testing/api-error.ts"
import { TEST_PLANS, testUsage } from "../../../../libs/domain/billing/test-plans.ts"

/**
 * Categories over every transport, as the API wires them: one pair of buses, the gates and the
 * real handlers over an in-memory repository. The socket and the call route are two adapters of
 * one operations table, so every scenario runs through both and expects the same answer; the REST
 * route keeps the list. The race between a write and a member's removal needs Postgres and is in
 * `tests/integration/group-write-race.integration.test.ts`.
 */

const groupId = uuidV7()
const otherGroupId = uuidV7()
const foodId = uuidV7()
const groceriesId = uuidV7()
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
  const categories = new MemoryCategoryRepository()
  const dependencies = { categories, groups }
  const commands = new CommandBus()
  commands.use(createSessionGate([]))
  commands.use(createEntitlementGate({
    billingEnabled: true,
    plans: TEST_PLANS,
    planOf: () => Promise.resolve(FREE_PLAN_ID),
    roleOf: (group, user) => groups.roleOf(group, user),
    usage: testUsage({ maxCategories: (group) => categories.count(group) }),
  }, ENTITLEMENT_NEEDS))
  commands.register(CategoryCreateCommand, createCategoryCreateHandler(dependencies))
  commands.register(CategoryUpdateCommand, createCategoryUpdateHandler(dependencies))
  commands.register(CategoryArchiveCommand, createCategoryArchiveHandler(dependencies))
  const queries = new QueryBus()
  queries.use(createSessionGate([]))
  queries.register(CategoryListQuery, createCategoryListHandler(dependencies))
  queries.register(CategoryGetQuery, createCategoryGetHandler(dependencies))
  const operations = createCategoryOperations({
    create: (command) => commands.execute(command),
    update: (command) => commands.execute(command),
    archive: (command) => commands.execute(command),
    list: (query) => queries.execute(query),
    get: (query) => queries.execute(query),
  })
  /** Takes the member out of the household, as the owner's removal does. */
  const remove = (group: string, user: number) => delete memberships[`${group}:${user}`]
  return { categories, operations, queries, remove }
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

const food = {
  groupId,
  id: foodId,
  name: "Food",
  kind: CategoryKind.EXPENSE,
  icon: "utensils" as CategoryIcon,
  color: "#c2410c",
  parentId: null,
}
const groceries = {
  ...food,
  id: groceriesId,
  name: "Groceries",
  icon: "shopping-cart" as CategoryIcon,
  parentId: foodId,
}
/** The same categories, as the repository takes them straight: no plan cap applies. */
const direct = <T>(category: T) => ({ ...category, allowance: null })

/** Every write an editor can send about the category at version 1. */
function writes(id = foodId, group = groupId): [string, Record<string, unknown>][] {
  return [
    ["category.create", { ...food, groupId: group, id: uuidV7(), name: "Travel" }],
    ["category.update", { ...food, groupId: group, id, name: "Meals", version: 1 }],
    ["category.archive", { groupId: group, id, archived: true, version: 1 }],
    ["category.archive", { groupId: group, id, archived: false, version: 1 }],
  ]
}

const refused = (status: string, code: string) => ({
  kind: "server.error",
  code: status,
  details: { code },
})

for (const [via, open] of TRANSPORTS) {
  describe(`categories over ${via}`, () => {
    it("lets an editor create a parent and a child, edit, archive the parent with it, and bring both back", async () => {
      const s = stack()
      const as = open(s, EDITOR)

      expect(await as.command("category.create", { ...food, color: "#C2410C" })).toMatchObject({
        kind: "server.result",
        payload: { created: true, category: { id: foodId, color: "#c2410c", version: 1 } },
      })
      await as.command("category.create", groceries)
      expect(
        await as.command("category.update", { ...food, name: "Meals", icon: "coffee", version: 1 }),
      ).toMatchObject({
        kind: "server.result",
        payload: { category: { name: "Meals", version: 2 } },
      })
      const archived = await as.command("category.archive", {
        groupId,
        id: foodId,
        archived: true,
        version: 2,
      })
      expect(archived).toMatchObject({
        kind: "server.result",
        payload: { category: { id: foodId, version: 3 }, children: [{ id: groceriesId }] },
      })
      expect(s.categories.categories.get(groceriesId)?.archivedAt).not.toBeNull()

      const back = await as.command("category.archive", {
        groupId,
        id: foodId,
        archived: false,
        version: 3,
      })
      expect(back).toMatchObject({
        kind: "server.result",
        payload: {
          category: { archivedAt: null },
          children: [{ id: groceriesId, archivedAt: null }],
        },
      })
      as.shutdown()
    })

    it("refuses every write of a viewer and changes nothing (R16)", async () => {
      const s = stack()
      await s.categories.create(direct(food), OWNER)
      s.categories.writes = 0
      const as = open(s, VIEWER)

      for (const [name, payload] of writes()) {
        expect(await as.command(name, payload)).toMatchObject(
          refused("forbidden", "ROLE_INSUFFICIENT"),
        )
      }
      expect(s.categories.writes).toBe(0)
      as.shutdown()
    })

    it("lets a viewer list every category of the household, archived ones included, and no other's", async () => {
      const s = stack()
      await s.categories.create(direct(food), OWNER)
      await s.categories.create(direct(groceries), OWNER)
      await s.categories.archive(
        { groupId, id: groceriesId, archived: true, expectedVersion: 1, allowance: null },
        OWNER,
      )
      await s.categories.create(
        direct({ ...food, groupId: otherGroupId, id: uuidV7(), name: "Other" }),
        OWNER,
      )
      const as = open(s, VIEWER)

      const answer = await as.query("category.list", { groupId })

      const listed = (answer as { payload: { categories: { name: string }[] } }).payload.categories
      expect(listed.map(({ name }) => name)).toEqual(["Food", "Groceries"])
      expect(await as.query("category.get", { groupId, id: groceriesId })).toMatchObject({
        kind: "server.result",
        payload: { category: { parentId: foodId } },
      })
      as.shutdown()
    })

    it("tells a stranger the household does not exist, for reads and writes", async () => {
      const s = stack()
      await s.categories.create(direct(food), OWNER)
      s.categories.writes = 0
      const as = open(s, STRANGER)

      const answers = [
        await as.query("category.list", { groupId }),
        await as.query("category.get", { groupId, id: foodId }),
        ...await Promise.all(writes().map(([name, payload]) => as.command(name, payload))),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject(refused("not_found", "GROUP_NOT_FOUND"))
      }
      expect(s.categories.writes).toBe(0)
      as.shutdown()
    })

    it("refuses a removed member at once, though the same session wrote a moment before (R16)", async () => {
      const s = stack()
      const as = open(s, EDITOR)
      expect(await as.command("category.create", food)).toMatchObject({ kind: "server.result" })
      s.remove(groupId, EDITOR)
      s.categories.writes = 0

      const answers = [
        await as.query("category.list", { groupId }),
        ...await Promise.all(writes().map(([name, payload]) => as.command(name, payload))),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject(refused("not_found", "GROUP_NOT_FOUND"))
      }
      expect(s.categories.writes).toBe(0)
      as.shutdown()
    })

    it("answers another household's category or parent id as not found, the same as an unknown id (R17)", async () => {
      const s = stack()
      const foreign = uuidV7()
      await s.categories.create(direct({ ...food, groupId: otherGroupId, id: foreign }), OWNER)
      await s.categories.create(direct(food), OWNER)
      s.categories.writes = 0
      const as = open(s, OWNER)

      for (const id of [foreign, uuidV7()]) {
        expect(await as.query("category.get", { groupId, id })).toMatchObject(
          refused("not_found", "CATEGORY_NOT_FOUND"),
        )
        for (const [name, payload] of writes(id).slice(1)) {
          expect(await as.command(name, payload)).toMatchObject(
            refused("not_found", "CATEGORY_NOT_FOUND"),
          )
        }
        const child = { ...groceries, id: uuidV7(), parentId: id }
        const answers = [
          await as.command("category.create", child),
          await as.command("category.update", { ...food, parentId: id, version: 1 }),
        ]
        for (const answer of answers) {
          expect(answer).toMatchObject(refused("not_found", "CATEGORY_NOT_FOUND"))
          expect((answer as { details: unknown }).details).not.toMatchObject({ name: "Food" })
        }
      }
      expect(s.categories.writes).toBe(0)
      expect(s.categories.categories.get(foreign)).toMatchObject({
        groupId: otherGroupId,
        name: "Food",
        version: 1,
      })
      as.shutdown()
    })

    it("refuses a second level, an income child of an expense parent and its own parent (R13)", async () => {
      const s = stack()
      await s.categories.create(direct(food), OWNER)
      await s.categories.create(direct(groceries), OWNER)
      s.categories.writes = 0
      const as = open(s, OWNER)

      const answers = [
        await as.command("category.create", {
          ...groceries,
          id: uuidV7(),
          name: "Bread",
          parentId: groceriesId,
        }),
        await as.command("category.create", {
          ...groceries,
          id: uuidV7(),
          name: "Refunds",
          kind: CategoryKind.INCOME,
        }),
        await as.command("category.update", { ...food, parentId: foodId, version: 1 }),
        await as.command("category.update", { ...food, kind: CategoryKind.INCOME, version: 1 }),
      ]

      expect(answers.map((answer) => (answer as { details: { code: string } }).details.code))
        .toEqual(Array(4).fill("CATEGORY_TREE_INVALID"))
      expect(s.categories.writes).toBe(0)
      as.shutdown()
    })

    it("refuses a sibling's name compared folded, and a child brought back alone (D2, D3)", async () => {
      const s = stack()
      await s.categories.create(direct(food), OWNER)
      await s.categories.create(direct(groceries), OWNER)
      await s.categories.archive(
        { groupId, id: foodId, archived: true, expectedVersion: 1, allowance: null },
        OWNER,
      )
      s.categories.writes = 0
      const as = open(s, OWNER)

      expect(await as.command("category.create", { ...food, id: uuidV7(), name: " FÓOD " }))
        .toMatchObject(refused("conflict", "CATEGORY_NAME_TAKEN"))
      expect(
        await as.command("category.archive", {
          groupId,
          id: groceriesId,
          archived: false,
          version: 2,
        }),
      ).toMatchObject(refused("conflict", "CATEGORY_PARENT_ARCHIVED"))
      expect(s.categories.writes).toBe(0)
      as.shutdown()
    })

    it("answers a stale edit with a conflict and the current version", async () => {
      const s = stack()
      await s.categories.create(direct(food), OWNER)
      const as = open(s, OWNER)

      expect(await as.command("category.update", { ...food, name: "Late", version: 5 }))
        .toMatchObject({
          kind: "server.error",
          code: "conflict",
          details: { code: "VERSION_CONFLICT", currentVersion: 1 },
        })
      expect(s.categories.categories.get(foodId)?.name).toBe("Food")
      as.shutdown()
    })

    it("refuses the category past the household's cap, and an unarchive past it (D1)", async () => {
      const s = stack()
      const archivedId = uuidV7()
      await s.categories.create(direct({ ...food, id: archivedId, name: "Old" }), OWNER)
      await s.categories.archive(
        { groupId, id: archivedId, archived: true, expectedVersion: 1, allowance: null },
        OWNER,
      )
      for (let index = 0; index < CATEGORY_MAX_PER_GROUP; index++) {
        await s.categories.create(
          direct({ ...food, id: uuidV7(), name: `Category ${index}` }),
          OWNER,
        )
      }
      const as = open(s, OWNER)

      expect(await as.command("category.create", { ...food, id: uuidV7(), name: "One more" }))
        .toMatchObject(refused("conflict", "CATEGORY_LIMIT_REACHED"))
      expect(
        await as.command("category.archive", {
          groupId,
          id: archivedId,
          archived: false,
          version: 2,
        }),
      ).toMatchObject(refused("conflict", "CATEGORY_LIMIT_REACHED"))
      expect(await s.categories.count(groupId)).toBe(CATEGORY_MAX_PER_GROUP)
      as.shutdown()
    })

    it("refuses a colour, an icon or a name outside the rules, as a bad request", async () => {
      const s = stack()
      const as = open(s, OWNER)

      const answers = [
        await as.command("category.create", { ...food, color: "red" }),
        await as.command("category.create", { ...food, color: "#fff" }),
        await as.command("category.create", { ...food, icon: "<svg onload=x>" }),
        await as.command("category.create", { ...food, name: "   " }),
        await as.command("category.create", { ...food, name: "x".repeat(61) }),
        await as.command("category.create", { ...food, parentId: "food" }),
        await as.command("category.create", { ...food, kind: 3 }),
      ]

      for (const answer of answers) {
        expect(answer).toMatchObject(refused("bad_request", "INVALID_REQUEST"))
      }
      expect(s.categories.categories.size).toBe(0)
      as.shutdown()
    })

    it("answers a retried create with the first category", async () => {
      const s = stack()
      const as = open(s, OWNER)

      await as.command("category.create", food)
      const again = await as.command("category.create", food)

      expect(again).toMatchObject({
        kind: "server.result",
        payload: { created: false, category: { id: foodId, version: 1 } },
      })
      expect(s.categories.categories.size).toBe(1)
      as.shutdown()
    })
  })
}

describe("categories over the REST list", () => {
  function rest(s: Stack, userId: number | null) {
    const app = new Hono<APIContext>()
    app.use("*", async (c, next) => {
      c.set("requestId", "req-categories")
      if (userId !== null) {
        c.set("auth", buildAuthData({ user: { id: userId }, session: { userId } }))
      }
      await next()
    })
    app.route(
      "/groups/:groupId/categories",
      createCategoriesRoute({ list: (query) => s.queries.execute(query) }),
    )
    return (path: string) => app.request(`http://local/groups/${path}`)
  }

  it("lists a member's household categories, archived ones included", async () => {
    const s = stack()
    await s.categories.create(direct(food), OWNER)
    await s.categories.create(direct(groceries), OWNER)
    await s.categories.archive(
      { groupId, id: foodId, archived: true, expectedVersion: 1, allowance: null },
      OWNER,
    )

    const response = await rest(s, VIEWER)(`${groupId}/categories`)

    expect(response.status).toBe(200)
    expect((await response.json()).categories).toMatchObject([
      { id: foodId, name: "Food" },
      { id: groceriesId, parentId: foodId },
    ])
  })

  it("answers a stranger as an unknown household, with no category", async () => {
    const s = stack()
    await s.categories.create(direct(food), OWNER)

    const response = await rest(s, STRANGER)(`${groupId}/categories`)

    expect(response.status).toBe(404)
    expect(JSON.stringify(await response.json())).not.toContain("Food")
  })

  it("answers 401 and lists nothing when there is no session", async () => {
    const s = stack()
    await s.categories.create(direct(food), OWNER)

    const response = await rest(s, null)(`${groupId}/categories`)

    expect(response.status).toBe(401)
    expect(JSON.stringify(await response.json())).not.toContain("Food")
  })

  it("refuses a household id that is not a UUID", async () => {
    const response = await rest(stack(), OWNER)("not-a-group/categories")

    expect(response.status).toBe(400)
  })
})
