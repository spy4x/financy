import { describe, expect, it } from "@shared/testing"
import { getDaysOfWeek, isValidDate, timeAgo } from "./time.ts"

describe("Time helper functions", () => {
  describe("timeAgo", () => {
    it("should return '-' for null/undefined input", () => {
      expect(timeAgo(null)).toBe("-")
      // @ts-ignore - Testing undefined case
      expect(timeAgo(undefined)).toBe("-")
    })

    it("should handle string date input", () => {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const result = timeAgo(oneHourAgo)
      expect(result).toBe("1 hour ago")
    })

    it("should handle Date object input", () => {
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000)
      const result = timeAgo(oneMinuteAgo)
      expect(result).toBe("1 minute ago")
    })

    it("should handle number timestamp input", () => {
      const thirtySecondsAgo = Date.now() - 30 * 1000
      const result = timeAgo(thirtySecondsAgo)
      expect(result).toBe("30 seconds ago")
    })

    it("should handle very recent times", () => {
      const fiveSecondsAgo = Date.now() - 5 * 1000
      const result = timeAgo(fiveSecondsAgo)
      expect(result).toBe("a moment ago")
    })

    it("should handle single vs plural correctly", () => {
      const oneSecondAgo = Date.now() - 1 * 1000
      const twoSecondsAgo = Date.now() - 2 * 1000

      expect(timeAgo(oneSecondAgo)).toBe("a moment ago") // < 10 seconds
      expect(timeAgo(twoSecondsAgo)).toBe("a moment ago") // < 10 seconds

      const elevenSecondsAgo = Date.now() - 11 * 1000
      const twelveSecondsAgo = Date.now() - 12 * 1000

      expect(timeAgo(elevenSecondsAgo)).toBe("11 seconds ago")
      expect(timeAgo(twelveSecondsAgo)).toBe("12 seconds ago")
    })

    it("should handle different time ranges", () => {
      const now = Date.now()

      // Minutes
      const twoMinutesAgo = now - 2 * 60 * 1000
      expect(timeAgo(twoMinutesAgo)).toBe("2 minutes ago")

      // Hours
      const threeHoursAgo = now - 3 * 60 * 60 * 1000
      expect(timeAgo(threeHoursAgo)).toBe("3 hours ago")

      // Days
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000
      expect(timeAgo(twoDaysAgo)).toBe("2 days ago")

      // Months (approximate)
      const twoMonthsAgo = now - 60 * 24 * 60 * 60 * 1000
      expect(timeAgo(twoMonthsAgo)).toBe("2 months ago")

      // Years (approximate)
      const oneYearAgo = now - 400 * 24 * 60 * 60 * 1000
      expect(timeAgo(oneYearAgo)).toBe("1 year ago")
    })
  })

  describe("getDaysOfWeek", () => {
    it("should return empty array for empty string", () => {
      expect(getDaysOfWeek("")).toEqual([])
    })

    it("should parse single day", () => {
      expect(getDaysOfWeek("1000000")).toEqual(["Mon"])
      expect(getDaysOfWeek("0100000")).toEqual(["Tue"])
      expect(getDaysOfWeek("0000001")).toEqual(["Sun"])
    })

    it("should parse multiple days", () => {
      expect(getDaysOfWeek("1100000")).toEqual(["Mon", "Tue"])
      expect(getDaysOfWeek("1010100")).toEqual(["Mon", "Wed", "Fri"])
      expect(getDaysOfWeek("0000011")).toEqual(["Sat", "Sun"])
    })

    it("should parse all days", () => {
      expect(getDaysOfWeek("1111111")).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
    })

    it("should handle no days selected", () => {
      expect(getDaysOfWeek("0000000")).toEqual([])
    })
  })

  describe("isValidDate", () => {
    it("should return true for valid Date objects", () => {
      expect(isValidDate(new Date())).toBe(true)
      expect(isValidDate(new Date("2024-01-01"))).toBe(true)
    })

    it("should return true for valid date strings", () => {
      expect(isValidDate("2024-01-01")).toBe(true)
      expect(isValidDate("2024-12-31")).toBe(true)
      expect(isValidDate("2024-01-01T12:00:00")).toBe(true)
    })

    it("should return false for invalid Date objects", () => {
      expect(isValidDate(new Date("invalid"))).toBe(false)
    })

    it("should return false for invalid date strings", () => {
      expect(isValidDate("not-a-date")).toBe(false)
      expect(isValidDate("2024-13-01")).toBe(false) // Invalid month
      expect(isValidDate("hello")).toBe(false)
      expect(isValidDate("")).toBe(false)
    })

    it("should return false for non-date types", () => {
      expect(isValidDate(123)).toBe(false)
      expect(isValidDate(null)).toBe(false)
      expect(isValidDate(undefined)).toBe(false)
      expect(isValidDate({})).toBe(false)
      expect(isValidDate([])).toBe(false)
    })
  })
})
