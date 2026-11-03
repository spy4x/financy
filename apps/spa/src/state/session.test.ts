import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { canSignOut } from "./session.ts"

const user = { id: 1, firstName: "Test", lastName: "User" }

describe("canSignOut", () => {
  it("offers sign-out to a session that owes its one-time code and has no user", () => {
    expect(canSignOut({ user: null, isMfaRequired: true })).toBe(true)
  })

  it("offers sign-out to a signed-in user", () => {
    expect(canSignOut({ user: user as never, isMfaRequired: false })).toBe(true)
  })

  it("hides sign-out without a session", () => {
    expect(canSignOut({ user: null, isMfaRequired: false })).toBe(false)
  })
})
