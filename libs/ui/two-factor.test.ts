import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { UserMFAStatus } from "@domain/identity"
import { TwoFactorStep, twoFactorStep } from "./two-factor.ts"

describe("twoFactorStep", () => {
  it("offers only Enable to a user without an authenticator app", () => {
    expect(twoFactorStep(UserMFAStatus.NOT_CONFIGURED, false)).toBe(TwoFactorStep.Enable)
    expect(twoFactorStep(UserMFAStatus.CONFIGURATION_NOT_FINISHED, false)).toBe(
      TwoFactorStep.Enable,
    )
  })

  it("offers only Disable to a user with an authenticator app", () => {
    expect(twoFactorStep(UserMFAStatus.CONFIGURED, false)).toBe(TwoFactorStep.Disable)
  })

  it("asks for the first code while enrolment is under way", () => {
    expect(twoFactorStep(UserMFAStatus.NOT_CONFIGURED, true)).toBe(TwoFactorStep.Confirm)
  })
})
