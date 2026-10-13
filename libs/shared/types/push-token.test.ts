import { describe, expect, it } from "@shared/testing"
import { userPushTokenSchema, validate } from "./+index.ts"

const token = {
  id: 1,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  deletedAt: null,
  userId: 1,
  endpoint: "https://push.example.com/abc",
  auth: "auth",
  p256dh: "p256dh",
}

describe("userPushTokenSchema", () => {
  it("accepts a UUID version 4 device id, which older browsers hold", () => {
    const deviceId = "3b241101-e2bb-4255-8caf-4136c566a962"
    const result = validate(userPushTokenSchema, { ...token, deviceId })
    expect(result.error).toBe(null)
    expect(result.data?.deviceId).toBe(deviceId)
  })

  it("accepts a UUID version 7 device id", () => {
    const deviceId = "0199e6a4-7c3a-7b2e-9f41-2d6c8a1b3e57"
    const result = validate(userPushTokenSchema, { ...token, deviceId })
    expect(result.error).toBe(null)
    expect(result.data?.deviceId).toBe(deviceId)
  })
})
