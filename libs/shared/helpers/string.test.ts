import { describe, expect, it } from "@shared/testing"
import { search } from "./string.ts"

describe("String helper functions", () => {
  describe("search", () => {
    it("should find word in string (case insensitive)", () => {
      expect(search("Hello World", "hello")).toBe(true)
      expect(search("Hello World", "WORLD")).toBe(true)
      expect(search("Hello World", "llo")).toBe(true)
    })

    it("should return false when word not found in string", () => {
      expect(search("Hello World", "xyz")).toBe(false)
      expect(search("Hello World", "goodbye")).toBe(false)
    })

    it("should handle empty strings", () => {
      expect(search("", "hello")).toBe(false)
      expect(search("hello", "")).toBe(true) // Empty search matches
    })

    it("should handle number values", () => {
      expect(search(123, "123")).toBe(true)
      expect(search(456, "456")).toBe(true)
      expect(search(123, "12")).toBe(false) // Partial number match should fail
      expect(search(123, "1")).toBe(false) // Partial number match should fail
    })

    it("should handle null/undefined values", () => {
      expect(search(null, "hello")).toBe(false)
      expect(search(undefined, "hello")).toBe(false)
    })

    it("should respect condition parameter", () => {
      expect(search("Hello World", "hello", true)).toBe(true)
      expect(search("Hello World", "hello", false)).toBe(false)
      expect(search("Hello World", "xyz", true)).toBe(false)
      expect(search("Hello World", "xyz", false)).toBe(false)
    })

    it("should handle edge cases", () => {
      expect(search("", "", true)).toBe(false) // Empty value should return false
      expect(search("test", "", true)).toBe(true) // Empty search string always matches non-empty string
      expect(search(0, "0")).toBe(false) // Number 0 is falsy, so function returns false regardless of search match
      expect(search(0, "")).toBe(false) // Number 0 is falsy, so function returns false regardless of search match
    })
  })
})
