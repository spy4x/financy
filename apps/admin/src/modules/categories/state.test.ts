import { expect } from "@std/expect"
import { it } from "@std/testing/bdd"
import type { AdminCategoriesOverview } from "@domain/categories"
import type { AdminApiResult, AdminFetch } from "../../state.ts"
import { createCategoriesState } from "./state.ts"

const overview: AdminCategoriesOverview = {
  categories: 3,
  archived: 1,
  subcategories: 1,
  households: 1,
  byKind: [],
  topHouseholds: [],
}

it("reads the overview from the admin API", async () => {
  const paths: string[] = []
  const request = ((path: string) => {
    paths.push(path)
    return Promise.resolve({ ok: true, status: 200, data: overview })
  }) as AdminFetch
  const state = createCategoriesState(request)

  await state.load()

  expect(paths).toEqual([`/api/admin/categories`])
  expect(state.categories.value).toEqual({ overview, error: null })
})

it("keeps the last counts and shows the error when a later read fails", async () => {
  const answers: AdminApiResult<unknown>[] = [
    { ok: true, status: 200, data: overview },
    { ok: false, status: 500, error: { message: `Server error` } } as AdminApiResult<unknown>,
  ]
  const state = createCategoriesState((() => Promise.resolve(answers.shift()!)) as AdminFetch)

  await state.load()
  await state.load()

  expect(state.categories.value).toEqual({ overview, error: `Server error` })
})
