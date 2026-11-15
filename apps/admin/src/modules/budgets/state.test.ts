import { expect } from "@std/expect"
import { it } from "@std/testing/bdd"
import { type AdminBudgetsOverview, BudgetMethod } from "@domain/budgets"
import type { AdminApiResult, AdminFetch } from "../../state.ts"
import { createBudgetsState } from "./state.ts"

const overview: AdminBudgetsOverview = {
  month: `2026-11`,
  households: 1,
  categories: 3,
  envelopeHouseholds: 0,
  topHouseholds: [{
    groupId: `019a0000-0000-7000-8000-000000000001`,
    groupName: `Home`,
    categories: 3,
    method: BudgetMethod.LIMITS,
    lastChangeDate: `2026-11-05`,
  }],
}

it("reads the overview from the admin API", async () => {
  const paths: string[] = []
  const request = ((path: string) => {
    paths.push(path)
    return Promise.resolve({ ok: true, status: 200, data: overview })
  }) as AdminFetch
  const state = createBudgetsState(request)

  await state.load()

  expect(paths).toEqual([`/api/admin/budgets`])
  expect(state.budgets.value).toEqual({ overview, error: null })
})

it("keeps the last counts and shows the error when a later read fails", async () => {
  const answers: AdminApiResult<unknown>[] = [
    { ok: true, status: 200, data: overview },
    { ok: false, status: 500, error: { message: `Server error` } } as AdminApiResult<unknown>,
  ]
  const state = createBudgetsState((() => Promise.resolve(answers.shift()!)) as AdminFetch)

  await state.load()
  await state.load()

  expect(state.budgets.value).toEqual({ overview, error: `Server error` })
})
