/**
 * financy's glue over `makeStorage` (`@spy4x/platform/browser/storage`), which replaced financy's
 * own storage helper, and the behaviour of that helper financy now depends on.
 */
import { afterEach, describe, expect, it } from "@shared/testing"
import { makeStorage, memoryStorage } from "@spy4x/platform/browser/storage"
import { type, type User, UserMFAStatus, UserRole, userSchema } from "@shared/types"
import { persist, storedValue } from "./storage.ts"

const originalError = console.error

afterEach(() => {
  console.error = originalError
})

const user: User = {
  id: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
  firstName: "Ada",
  lastName: "Lovelace",
  lastLoginAt: new Date("2026-01-01T00:00:00.000Z"),
  mfa: UserMFAStatus.NOT_CONFIGURED,
  role: UserRole.VIEWER,
}

describe("persist", () => {
  it("removes the stored user on sign-out instead of keeping the previous one", () => {
    const storage = memoryStorage()
    const userStorage = makeStorage(storage, "user", { schema: userSchema })
    persist(userStorage, user)
    persist(userStorage, null)
    expect(storage.getItem("user")).toBe(null)
  })

  it("does not write a value its schema rejects", () => {
    const storage = memoryStorage()
    const idStorage = makeStorage(storage, "selectedGroupId", { schema: type("number") })
    persist(idStorage, "not a number" as unknown as number)
    expect(storage.getItem("selectedGroupId")).toBe(null)
  })

  it("logs a failed write instead of throwing", () => {
    const logged: unknown[] = []
    console.error = (...args: unknown[]) => logged.push(args)
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota exceeded", "QuotaExceededError")
      },
      removeItem: () => {},
    }
    expect(() => persist(makeStorage<string>(full, "theme"), "dark")).not.toThrow()
    expect(logged.length).toBe(1)
  })
})

describe("storedValue", () => {
  it("reads unparseable JSON as null and removes it", () => {
    const storage = memoryStorage({ theme: "dark" })
    expect(storedValue(makeStorage<string>(storage, "theme").get())).toBe(null)
    expect(storage.getItem("theme")).toBe(null)
  })
})
