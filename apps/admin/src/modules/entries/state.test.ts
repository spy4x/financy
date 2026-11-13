import { expect } from "@std/expect"
import { it } from "@std/testing/bdd"
import type { AdminEntriesOverview } from "@domain/transactions"
import type { AdminApiResult, AdminFetch } from "../../state.ts"
import { createEntriesState } from "./state.ts"

const overview: AdminEntriesOverview = {
  entries: 3,
  households: 1,
  lastEntryDate: `2026-11-05`,
  months: [{ month: `2026-11`, entries: 3, households: 1 }],
  topHouseholds: [],
}

it("reads the overview from the admin API", async () => {
  const paths: string[] = []
  const request = ((path: string) => {
    paths.push(path)
    return Promise.resolve({ ok: true, status: 200, data: overview })
  }) as AdminFetch
  const state = createEntriesState(request)

  await state.load()

  expect(paths).toEqual([`/api/admin/entries`])
  expect(state.entries.value).toEqual({ overview, error: null })
})

it("keeps the last counts and shows the error when a later read fails", async () => {
  const answers: AdminApiResult<unknown>[] = [
    { ok: true, status: 200, data: overview },
    { ok: false, status: 500, error: { message: `Server error` } } as AdminApiResult<unknown>,
  ]
  const state = createEntriesState((() => Promise.resolve(answers.shift()!)) as AdminFetch)

  await state.load()
  await state.load()

  expect(state.entries.value).toEqual({ overview, error: `Server error` })
})
