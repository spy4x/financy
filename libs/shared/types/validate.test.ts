import { describe, expect, it } from "@shared/testing"
import { type, validate } from "./+index.ts"

// Define test schemas
const testSchema = type({
  name: "string",
  age: "number",
})

describe(validate.name, () => {
  it("returns a valid value when the input matches the schema", () => {
    const input = { name: "John", age: 30 }
    const result = validate(testSchema, input)

    expect(result.error).toBeNull()
    expect(result.value).toEqual(input)
  })

  it("returns an error when the input does not match the schema", () => {
    const input = { name: "John", age: "thirty" } // Invalid age type
    const result = validate(testSchema, input)

    expect(result.error).not.toBeNull()
    expect(result.error?.description).toContain("age must be a number (was a string)")
    expect(result.value).toBeNull()
  })
})
