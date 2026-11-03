import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { isApiTokenFormat } from "@domain/api-tokens"
import { hashApiToken, mintApiToken } from "./api-tokens.ts"

const KEY = "test-only-api-token-key-0123456789abcdef"

describe("mintApiToken", () => {
  it("mints a prefixed token whose hash is what hashApiToken finds again", async () => {
    const { secret, hash } = await mintApiToken(KEY)

    expect(secret.startsWith("tpl_")).toBe(true)
    expect(isApiTokenFormat(secret)).toBe(true)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(secret.slice(4))
    expect(await hashApiToken(secret, KEY)).toBe(hash)
  })

  it("mints a different token every time", async () => {
    const [first, second] = await Promise.all([mintApiToken(KEY), mintApiToken(KEY)])
    expect(first.secret).not.toBe(second.secret)
    expect(first.hash).not.toBe(second.hash)
  })
})

describe("hashApiToken", () => {
  it("needs the server key: another key gives another hash", async () => {
    const { secret, hash } = await mintApiToken(KEY)
    expect(await hashApiToken(secret, KEY)).toBe(hash)
    expect(await hashApiToken(secret, `${KEY}-rotated`)).not.toBe(
      await hashApiToken(secret, KEY),
    )
  })

  it("answers null for anything that is not a token, so it never reaches the database", async () => {
    expect(await hashApiToken("", KEY)).toBe(null)
    expect(await hashApiToken("Bearer tpl_AAAAAAAAAAAAAAAAAAAAAA", KEY)).toBe(null)
    expect(await hashApiToken("sessionIdToken=1:token", KEY)).toBe(null)
  })
})
