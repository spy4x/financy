import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import type { HouseholdTotal } from "@domain/accounts"
import { createHouseholdTotalStore } from "./household-total.ts"

const HOME = "019a5b0e-1af5-7f04-8ae4-b1ee5d111001"
const WORK = "019a5b0e-1af5-7f04-8ae4-b1ee5d111002"

const totalOf = (amount: number): HouseholdTotal => ({
  amount,
  currency: "EUR",
  rateDate: null,
  leftOut: [],
  tooLarge: false,
})

/** A fetch whose answers the test releases one by one, in any order. */
function deferredFetch() {
  const pending: { groupId: string; resolve(total: HouseholdTotal): void; reject(): void }[] = []
  return {
    pending,
    fetch: (groupId: string) =>
      new Promise<HouseholdTotal>((resolve, reject) =>
        pending.push({ groupId, resolve, reject: () => reject(new Error("offline")) })
      ),
  }
}

describe("the household total store", () => {
  it("shows the open household's total once the server answers, and reads it again on refresh", async () => {
    let amount = 100
    const store = createHouseholdTotalStore({ fetch: () => Promise.resolve(totalOf(amount)) })

    await store.open(HOME)
    expect(store.total.value?.amount).toBe(100)
    amount = 250
    await store.refresh()

    expect(store.total.value?.amount).toBe(250)
  })

  it("drops a late answer for the household that was open before", async () => {
    const server = deferredFetch()
    const store = createHouseholdTotalStore(server)

    const first = store.open(HOME)
    const second = store.open(WORK)
    server.pending[1].resolve(totalOf(2))
    server.pending[0].resolve(totalOf(1))
    await Promise.all([first, second])

    expect(store.groupId.value).toBe(WORK)
    expect(store.total.value?.amount).toBe(2)
  })

  it("keeps the last total when a read fails, and marks the failure", async () => {
    const server = deferredFetch()
    const store = createHouseholdTotalStore(server)
    const opened = store.open(HOME)
    server.pending[0].resolve(totalOf(100))
    await opened

    const again = store.refresh()
    server.pending[1].reject()
    await again

    expect(store.total.value?.amount).toBe(100)
    expect(store.failed.value).toBe(true)
  })
})
