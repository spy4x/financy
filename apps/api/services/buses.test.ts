import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import type { Command, Query } from "@spy4x/platform/cqrs"
import { SecondFactorStatus } from "@spy4x/server/sign-in"
import { AccessError, type Actor, UserMFAStatus } from "@domain/identity"
import { commandBus } from "./commandBus.ts"
import { queryBus } from "./queryBus.ts"

/** A configured second factor, and a session that has not given it yet. */
const pendingActor: Actor = {
  userId: 1,
  userMfa: UserMFAStatus.CONFIGURED,
  sessionSecondFactor: SecondFactorStatus.Pending,
}

class BusesProbeCommand implements Command<{ actor: Actor }, string> {
  readonly __resultType?: string
  constructor(public data: { actor: Actor }) {}
}

class BusesProbeQuery implements Query<{ actor: Actor }, string> {
  readonly __resultType?: string
  constructor(public data: { actor: Actor }) {}
}

describe("the app's bus singletons", () => {
  it("refuse a command from a session that still owes a second factor, before its handler", async () => {
    let handled = false
    commandBus.register(BusesProbeCommand, () => {
      handled = true
      return Promise.resolve("handled")
    })

    await expect(commandBus.execute(new BusesProbeCommand({ actor: pendingActor }))).rejects
      .toThrow(AccessError)
    expect(handled).toBe(false)
  })

  it("refuse a query from a session that still owes a second factor, before its handler", async () => {
    let handled = false
    queryBus.register(BusesProbeQuery, () => {
      handled = true
      return Promise.resolve("handled")
    })

    await expect(queryBus.execute(new BusesProbeQuery({ actor: pendingActor }))).rejects.toThrow(
      AccessError,
    )
    expect(handled).toBe(false)
  })
})
