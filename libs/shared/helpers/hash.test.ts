import { checkHash, hash } from "./hash.ts"
import { describe, expect, it } from "@shared/testing"

const password = "securePassword"
const pepper = "pepper"

describe("hash", () => {
  it("hash()", async () => {
    const hashed = await hash(password, pepper)
    expect(hashed.length > 0).toBe(true)
    const hashed2 = await hash(password, pepper)
    expect(hashed !== hashed2).toBe(true)
    const hashedEmptyString = await hash("", pepper)
    expect(hashedEmptyString.length > 0).toBe(true)
  })

  it("checkHash()", async () => {
    const hashed = await hash(password, pepper)
    const result = await checkHash(password, hashed, pepper)
    expect(result).toBe(true)

    const wrongResult = await checkHash("wrongPassword", hashed, pepper)
    expect(wrongResult).toBe(false)

    const hashedWrongPepper = await checkHash(
      password,
      hashed,
      "wrongPepper",
    )
    expect(hashedWrongPepper).toBe(false)

    const result2 = await checkHash(password, "invalidHash", pepper)
    expect(result2).toBe(false)
  })
})
