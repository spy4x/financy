import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { emailToVerify } from "./+lib.ts"

describe("emailToVerify", () => {
  it("asks for the account's address while it is unproven", () => {
    expect(emailToVerify({ email: "ann@example.com", proven: false, pending: null })).toBe(
      "ann@example.com",
    )
  })

  it("asks for the new address while a change waits, whatever the old one's proof", () => {
    for (const proven of [true, false]) {
      expect(emailToVerify({ email: "ann@example.com", proven, pending: "new@example.com" }))
        .toBe("new@example.com")
    }
  })

  it("asks for nothing once the address is proven, or when the account has none", () => {
    expect(emailToVerify({ email: "ann@example.com", proven: true, pending: null })).toBe(null)
    expect(emailToVerify({ email: null, proven: false, pending: null })).toBe(null)
  })
})
