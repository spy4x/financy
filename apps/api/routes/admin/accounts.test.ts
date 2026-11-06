import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import type { MiddlewareHandler } from "hono"
import { AccountKind, type AdminAccountsOverview } from "@domain/accounts"
import { UserRole } from "@domain/identity"
import type { APIContext } from "../../_types.ts"
import { buildAuthData } from "../../_testing/fake-auth.ts"
import {
  API_URL,
  mountRoute,
  sameOriginHeaders,
  testMutationGuards,
  testSessionGuards,
} from "../../_testing/mutation-requests.ts"
import { createAdminRoute } from "./+routes.ts"
import { createAdminAccountsRoutes } from "./accounts.ts"

const passThrough: MiddlewareHandler<APIContext> = async (_c, next) => await next()

const overview: AdminAccountsOverview = {
  accounts: 3,
  households: 1,
  byKind: [{ kind: AccountKind.BANK, accounts: 3 }],
  byCurrency: [{ currency: "EUR", accounts: 2 }, { currency: "VND", accounts: 1 }],
  topHouseholds: [{
    groupId: "019a0000-0000-7000-8000-000000000001",
    groupName: "Home",
    accounts: 3,
    currencies: ["EUR", "VND"],
  }],
}

function buildApp(role: UserRole) {
  let reads = 0
  const route = createAdminAccountsRoutes({
    limit: passThrough,
    read: () => (reads++, Promise.resolve(overview)),
  })
  const app = mountRoute(
    "/admin",
    createAdminRoute({
      auth: testSessionGuards(),
      mutationGuards: testMutationGuards,
      modules: [route],
    }),
    buildAuthData({ user: { id: 7, role } }),
  )
  return { app, reads: () => reads }
}

describe("GET /api/admin/accounts", () => {
  it("answers an operator the counts, kinds and currencies as the read gives them", async () => {
    const { app, reads } = buildApp(UserRole.OPERATOR)
    const response = await app.request(`${API_URL}/admin/accounts`, { headers: sameOriginHeaders })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(overview)
    expect(reads()).toBe(1)
  })

  it("answers 404 to a viewer and reads nothing", async () => {
    const { app, reads } = buildApp(UserRole.VIEWER)
    const response = await app.request(`${API_URL}/admin/accounts`, { headers: sameOriginHeaders })

    expect(response.status).toBe(404)
    expect(reads()).toBe(0)
  })
})
