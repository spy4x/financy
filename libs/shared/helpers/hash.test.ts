import { checkHash, hash } from "./hash.ts"
import { assert, describe, it } from "@shared/testing"

const password = "securePassword"
const pepper = "pepper"

describe("hash", () => {
  it("hash()", async () => {
    const hashed = await hash(password, pepper)
    assert(hashed.length > 0, "Hashed password should not be empty")
    const hashed2 = await hash(password, pepper)
    assert(
      hashed !== hashed2,
      "Hashes should be different due to random salt",
    )
    const hashedEmptyString = await hash("", pepper)
    assert(
      hashedEmptyString.length > 0,
      "Should still produce a hash for empty password",
    )
  })

  it("checkHash()", async () => {
    const hashed = await hash(password, pepper)
    const result = await checkHash(password, hashed, pepper)
    assert(
      result === true,
      "checkHash returns true for the correct password",
    )

    const wrongResult = await checkHash("wrongPassword", hashed, pepper)
    assert(
      wrongResult === false,
      "checkHash returns false for the wrong password",
    )

    const hashedWrongPepper = await checkHash(
      password,
      hashed,
      "wrongPepper",
    )
    assert(
      hashedWrongPepper === false,
      "checkHash returns false for the wrong pepper",
    )

    const result2 = await checkHash(password, "invalidHash", pepper)
    assert(
      result2 === false,
      "Should return false for incorrect hash format",
    )
  })
})
