import { describe, expect, it } from "@shared/testing"
import { memoryStorage } from "@spy4x/platform/browser/storage"
import { isUuid } from "@spy4x/platform/universal/uuid"
import { DEVICE_ID_KEY, ensureDeviceId } from "./device-id.ts"

describe("ensureDeviceId", () => {
  it("gives a browser with no device id a UUID version 7 and stores it", () => {
    const storage = memoryStorage()
    const deviceId = ensureDeviceId(storage)
    expect(isUuid(deviceId, 7)).toBe(true)
    expect(storage.getItem(DEVICE_ID_KEY)).toBe(deviceId)
  })

  it("keeps a stored UUID version 4 device id", () => {
    const stored = "3b241101-e2bb-4255-8caf-4136c566a962"
    const storage = memoryStorage()
    storage.setItem(DEVICE_ID_KEY, stored)
    expect(ensureDeviceId(storage)).toBe(stored)
    expect(storage.getItem(DEVICE_ID_KEY)).toBe(stored)
  })
})
