import { validate, ValidationSchema } from "@shared/types"

class StorageHelper {
  constructor(private storage: Storage) {}

  get<T>(key: string, schema?: ValidationSchema): null | T {
    const str = this.storage.getItem(key)
    if (!str) {
      return null
    }
    let value: null | unknown = null
    try {
      value = JSON.parse(str)
    } catch (e) {
      console.error(`Error parsing "${key}" data from storage:`, e)
      return null
    }
    if (schema) {
      const parseResult = validate(schema, value)
      if (parseResult.error) {
        console.error("Error validating data:", parseResult.error)
        this.storage.removeItem(key)
        return null
      }
      return parseResult.value as T
    }
    return value as T
  }

  set<T>(key: string, value: T): void {
    try {
      this.storage.setItem(key, JSON.stringify(value))
    } catch (e) {
      console.error(`Error setting "${key}" data to storage:`, e)
    }
  }

  del(key: string): void {
    try {
      this.storage.removeItem(key)
    } catch (e) {
      console.error(`Error removing "${key}" data from storage:`, e)
    }
  }
}

export const LocalStorage = new StorageHelper(localStorage)
export const SessionStorage = new StorageHelper(sessionStorage)
export function makeStorage<T>(
  storage: Storage,
  key: string,
  schema?: ValidationSchema,
) {
  const helper = new StorageHelper(storage)

  return {
    get: () => helper.get<T>(key, schema),
    set: (value: T) => helper.set(key, value),
    del: () => helper.del(key),
  }
}
