import { expect } from "@std/expect"
import { it } from "@std/testing/bdd"
import type { AdminRatesSnapshot } from "@domain/money"
import type { AdminApiResult, AdminFetch } from "../../state.ts"
import { createRatesState } from "./state.ts"

const ok = <T>(data: T) => ({ ok: true, status: 200, data }) as AdminApiResult<T>
const fail = <T>(status: number, message: string) =>
  ({ ok: false, status, error: { message } }) as AdminApiResult<T>

const snapshot = {
  missing: { date: `2026-11-06`, currencies: [] },
} as unknown as AdminRatesSnapshot

it("reads the rates from the admin API, and keeps the last reading when a new one fails", async () => {
  let down = false
  const paths: string[] = []
  const request = ((path: string) => {
    paths.push(path)
    return Promise.resolve(down ? fail(500, `Down.`) : ok(snapshot))
  }) as unknown as AdminFetch
  const state = createRatesState(request)
  await state.refresh()
  expect(state.read.value).toEqual({ snapshot, pending: false, failed: false })
  down = true
  await state.refresh()
  expect(state.read.value).toEqual({ snapshot, pending: false, failed: true })
  expect(paths).toEqual([`/api/admin/rates`, `/api/admin/rates`])
})

it("sends one read at a time", async () => {
  let release = () => {}
  let calls = 0
  const request = (() => {
    calls++
    return new Promise((resolve) => release = () => resolve(ok(snapshot)))
  }) as unknown as AdminFetch
  const state = createRatesState(request)
  const first = state.refresh()
  await state.refresh()
  release()
  await first
  expect(calls).toBe(1)
})
