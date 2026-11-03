import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { DEFAULT_LOCKOUT_POLICY, lockDelayMs } from "@spy4x/server/lockout"

// The counter takes the library's default policy. These tests pin it in the template's own
// numbers, so a library release that changes a default fails here before it reaches sign-in.
const MINUTE = 60_000
const DAY = 24 * 60 * MINUTE

describe("the one-time code lockout policy", () => {
  it("lets the first five wrong codes through with no wait", () => {
    expect(DEFAULT_LOCKOUT_POLICY.freeFailures).toBe(5)
    for (let failures = 1; failures <= 5; failures++) expect(lockDelayMs(failures)).toBe(0)
  })

  it("waits 15 minutes after the sixth wrong code and doubles for each one after", () => {
    expect(lockDelayMs(6)).toBe(15 * MINUTE)
    expect(lockDelayMs(7)).toBe(30 * MINUTE)
    expect(lockDelayMs(8)).toBe(60 * MINUTE)
    expect(lockDelayMs(9)).toBe(120 * MINUTE)
  })

  it("never waits longer than one day, however many codes were wrong", () => {
    expect(lockDelayMs(12)).toBe(16 * 60 * MINUTE)
    expect(lockDelayMs(13)).toBe(DAY)
    expect(lockDelayMs(1_000_000)).toBe(DAY)
  })

  it("forgets the count after seven days without a wrong code", () => {
    expect(DEFAULT_LOCKOUT_POLICY.quietResetMs).toBe(7 * DAY)
  })

  it("keeps a guesser under a 1% chance a year of hitting a valid code", () => {
    // The worst case: the guesser tries again the moment each lock ends, for a year.
    const year = 365 * DAY
    let now = 0
    let guesses = 0
    while (now < year) {
      guesses += 1
      now += lockDelayMs(guesses)
    }
    // The package accepts 3 codes at any moment (TOTP_WINDOW = 1) out of 10^6.
    const chancePerGuess = 3 / 1_000_000
    const chance = 1 - (1 - chancePerGuess) ** guesses
    expect(guesses).toBeLessThan(400)
    expect(chance).toBeLessThan(0.01)
  })
})
