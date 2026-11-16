import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { ConnectionLostError, RealtimeRequestError } from "@spy4x/realtime"
import { NO_RECURRING_ERRORS } from "@ui/recurring-parts.tsx"
import { RECURRING_MESSAGES, recurringPlan, recurringRefusal } from "./recurring-refusal.ts"
import { TRANSACTION_MESSAGES } from "./transactions.ts"

function refused(code: string) {
  return new RealtimeRequestError("conflict", "Refused", { code })
}

describe("recurringRefusal", () => {
  it("says the person is offline when the connection is lost", () => {
    expect(recurringRefusal(new ConnectionLostError("dropped"), RECURRING_MESSAGES.save).form)
      .toBe(RECURRING_MESSAGES.offline)
  })

  it("leaves a plan refusal to the plan's notice", () => {
    const plan = new RealtimeRequestError("forbidden", "No plan", {
      code: "PLAN_LIMIT_REACHED",
      entitlement: "maxRecurringRules",
      limit: 0,
      canUpgrade: true,
    })
    expect(recurringRefusal(plan, RECURRING_MESSAGES.save)).toEqual(NO_RECURRING_ERRORS)
    expect(recurringPlan(plan)).not.toBe(null)
  })

  it("names a conflict and a deleted rule above the buttons", () => {
    expect(recurringRefusal(refused("VERSION_CONFLICT"), RECURRING_MESSAGES.save).form)
      .toBe(RECURRING_MESSAGES.conflict)
    expect(recurringRefusal(refused("RECURRING_RULE_NOT_FOUND"), RECURRING_MESSAGES.save).form)
      .toBe(RECURRING_MESSAGES.gone)
  })

  it("puts a gone account or category, or a category of the wrong kind, under its select", () => {
    expect(recurringRefusal(refused("ACCOUNT_NOT_FOUND"), RECURRING_MESSAGES.save).account)
      .toBe(TRANSACTION_MESSAGES.accountGone)
    expect(recurringRefusal(refused("CATEGORY_NOT_FOUND"), RECURRING_MESSAGES.save).category)
      .toBe(TRANSACTION_MESSAGES.categoryGone)
    expect(recurringRefusal(refused("CATEGORY_KIND_MISMATCH"), RECURRING_MESSAGES.save).category)
      .toBe(TRANSACTION_MESSAGES.categoryKind)
  })

  it("puts a refused repeat under the interval field and nothing in the form", () => {
    const cause = Object.assign(new RealtimeRequestError("bad_request", "Refused", {}), {
      fields: { rrule: { code: "pattern" } },
    })
    const errors = recurringRefusal(cause, RECURRING_MESSAGES.save)
    expect(errors.interval).toBeTruthy()
    expect(errors.form).toBe(null)
  })

  it("shows anything else above the buttons", () => {
    expect(recurringRefusal(new Error("boom"), RECURRING_MESSAGES.save).form).toBeTruthy()
  })
})
