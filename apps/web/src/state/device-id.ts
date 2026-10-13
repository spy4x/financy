import { uuidV7 } from "@spy4x/platform/universal/uuid"

/** The storage key that holds this browser's device id for push notifications. */
export const DEVICE_ID_KEY = "deviceId"

/**
 * Returns this browser's device id, creating and storing a UUID version 7 when there is none. A
 * stored id is returned as it is, whatever its version: the server knows the browser's push
 * subscription by that id, so replacing it would stop pushes to this browser.
 */
export function ensureDeviceId(storage: Pick<Storage, "getItem" | "setItem">): string {
  const stored = storage.getItem(DEVICE_ID_KEY)
  if (stored) return stored
  const deviceId = uuidV7()
  storage.setItem(DEVICE_ID_KEY, deviceId)
  return deviceId
}
