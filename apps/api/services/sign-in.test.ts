import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { normalizeUsername } from "./sign-in.ts"

describe("normalizeUsername", () => {
  it("trims and lower-cases a username", () => {
    expect(normalizeUsername("  ConcurrentUser  ")).toBe("concurrentuser")
  })

  it("refuses a username that is empty after trimming", () => {
    expect(normalizeUsername("   ")).toBe(null)
  })

  it("counts characters, not UTF-16 code units, against the 50 limit", () => {
    expect(normalizeUsername("😀".repeat(50))).toBe("😀".repeat(50))
    expect(normalizeUsername("a".repeat(51))).toBe(null)
  })

  it("refuses a value that is not a string", () => {
    for (const raw of [undefined, null, 42, ["alice"], { username: "alice" }]) {
      expect(normalizeUsername(raw)).toBe(null)
    }
  })

  it("refuses text Postgres cannot store as given", () => {
    expect(normalizeUsername("nul\u0000byte")).toBe(null)
    expect(normalizeUsername("lone\uD800surrogate")).toBe(null)
  })
})
