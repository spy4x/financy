import type { StorageRead, TypedStorage } from "@spy4x/platform/browser/storage"

/**
 * The stored value, or `null` when the key is missing or held something unreadable. An unreadable
 * entry (bad JSON, or a value its schema rejects) is already removed by `get()`.
 */
export function storedValue<T>(read: StorageRead<T>): T | null {
  return read.status === "ok" ? read.value : null
}

/**
 * Writes `value`, or removes the key when `value` is `null`. A schema rejects `null`, so writing it
 * would leave the previous value in storage. A failed write (a full or blocked storage) is logged,
 * not thrown, because it runs inside a signal effect.
 */
export function persist<T>(storage: TypedStorage<T>, value: T | null): void {
  try {
    if (value === null) {
      storage.del()
      return
    }
    storage.set(value)
  } catch (error) {
    console.error(`Error saving "${storage.key}" to storage:`, error)
  }
}

/** `onReject` for `makeStorage`: logs a stored or written value its schema rejected. */
export function logRejected(key: string, reason: string): void {
  console.error(`Rejected "${key}" in storage: ${reason}`)
}
