import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import type { FieldErrors } from "@spy4x/validation"
import { type AliasRules, assertAliasCount, parseAliases } from "./+lib.ts"

class ShopError extends Error {
  constructor(message: string, public readonly fields: FieldErrors) {
    super(message)
  }
}

const rules: AliasRules = {
  noun: "shop",
  max: 2,
  maxLength: 5,
  refuse: (message, fields) => new ShopError(message, fields),
}

describe("aliases", () => {
  it("refuses with the aggregate's own error, naming the record in the message", () => {
    expect(() => assertAliasCount({ aliases: ["a", "b", "c"] }, rules))
      .toThrow(new ShopError("A shop can have at most 2 aliases", {}))
    expect(() => parseAliases(["abcdef"], rules))
      .toThrow(new ShopError("Each shop alias must contain at most 5 characters", {}))
    expect(() => parseAliases(["a\u0000b"], rules))
      .toThrow(new ShopError("Shop aliases must not contain control or invisible characters", {}))
  })

  it("takes the limits from the rules: the most aliases and the longest one", () => {
    expect(() => assertAliasCount({ aliases: ["a", "b"] }, rules)).not.toThrow()
    expect(parseAliases(["abcde"], rules)).toEqual(["abcde"])
  })

  it("leaves a payload without a list of aliases to the schema", () => {
    for (const value of [null, {}, { aliases: "abc" }]) {
      expect(() => assertAliasCount(value, rules)).not.toThrow()
    }
  })
})
