import { expect } from "@std/expect"
import { it } from "@std/testing/bdd"
import type { AdminRecurringOverview } from "@domain/recurring"
import type { AdminApiResult, AdminFetch } from "../../state.ts"
import { createRecurringState } from "./state.ts"

const overview: AdminRecurringOverview = {
  households: 1,
  rules: 3,
  paused: 1,
  made: 12,
  topHouseholds: [{
    groupId: `019a0000-0000-7000-8000-000000000001`,
    groupName: `Home`,
    rules: 3,
    paused: 1,
    made: 12,
    lastChangeDate: `2026-11-05`,
  }],
}

it("reads the overview from the admin API", async () => {
  const paths: string[] = []
  const request = ((path: string) => {
    paths.push(path)
    return Promise.resolve({ ok: true, status: 200, data: overview })
  }) as AdminFetch
  const state = createRecurringState(request)

  await state.load()

  expect(paths).toEqual([`/api/admin/recurring`])
  expect(state.recurring.value).toEqual({ overview, error: null })
})

it("keeps the last counts and shows the error when a later read fails", async () => {
  const answers: AdminApiResult<unknown>[] = [
    { ok: true, status: 200, data: overview },
    { ok: false, status: 500, error: { message: `Server error` } } as AdminApiResult<unknown>,
  ]
  const state = createRecurringState((() => Promise.resolve(answers.shift()!)) as AdminFetch)

  await state.load()
  await state.load()

  expect(state.recurring.value).toEqual({ overview, error: `Server error` })
})
