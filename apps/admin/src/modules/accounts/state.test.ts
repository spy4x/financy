import { expect } from "@std/expect"
import { it } from "@std/testing/bdd"
import type { AdminAccountsOverview } from "@domain/accounts"
import type { AdminApiResult, AdminFetch } from "../../state.ts"
import { createAccountsState } from "./state.ts"

const overview: AdminAccountsOverview = {
  accounts: 3,
  households: 1,
  byKind: [],
  byCurrency: [],
  topHouseholds: [],
}

it("reads the overview from the admin API", async () => {
  const paths: string[] = []
  const request = ((path: string) => {
    paths.push(path)
    return Promise.resolve({ ok: true, status: 200, data: overview })
  }) as AdminFetch
  const state = createAccountsState(request)

  await state.load()

  expect(paths).toEqual([`/api/admin/accounts`])
  expect(state.accounts.value).toEqual({ overview, error: null })
})

it("keeps the last counts and shows the error when a later read fails", async () => {
  const answers: AdminApiResult<unknown>[] = [
    { ok: true, status: 200, data: overview },
    { ok: false, status: 500, error: { message: `Server error` } } as AdminApiResult<unknown>,
  ]
  const state = createAccountsState((() => Promise.resolve(answers.shift()!)) as AdminFetch)

  await state.load()
  await state.load()

  expect(state.accounts.value).toEqual({ overview, error: `Server error` })
})
