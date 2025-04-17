import { validate, ValidationSchema } from "@shared/types"

export interface ICacheStorage {
  /** Returns the value of the key if it exists, otherwise null */
  get(key: string): Promise<null | string>

  /** Sets the value of the key with an expiration time in seconds */
  set(key: string, value: string, ttlSec: number): Promise<void>

  /** Deletes the key */
  del(key: string): Promise<void>

  /** Clears all keys in the storage */
  reset(): Promise<void>
}

export interface ICacheService {
  get<T>(key: string): Promise<null | T>
  set<T>(key: string, value: T, ttlMs: number): Promise<void>
  delete(key: string): Promise<void>
  wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttlMs: number,
    options?: {
      shouldSaveFalsy?: boolean
    },
  ): Promise<T>
  reset(): Promise<void>
}

export class CacheService implements ICacheService {
  constructor(private storage: ICacheStorage) {
  }

  public async get<T>(key: string): Promise<null | T> {
    const result = await this.storage.get(key)
    if (!result) {
      return null
    }
    return JSON.parse(result) as T
  }

  public set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    return this.storage.set(key, JSON.stringify(value), ttlSec)
  }

  public async delete(key: string): Promise<void> {
    await this.storage.del(key)
  }

  public async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttlSec: number,
    options = { shouldSaveFalsy: false },
  ): Promise<T> {
    const data = await this.storage.get(key)
    if (data) {
      return JSON.parse(data) as T
    }
    const value = await fn()
    if (value || options.shouldSaveFalsy) {
      await this.set(key, value, ttlSec)
    }
    return value
  }

  public async reset(): Promise<void> {
    await this.storage.reset()
  }
}

export type PublicAPICacheModel<T> = {
  key: (id: number) => string
  /** Cache expiration time in seconds */
  ttl: number
  get: (id: number) => Promise<null | T>
  set: (id: number, item: T) => Promise<void>
  delete: (id: number) => Promise<void>
  wrap: (id: number, fn: () => Promise<T>) => Promise<T>
}

export const buildMethods = <T>(
  cacheService: ICacheService,
  prefix: string,
  /** Cache expiration time in seconds */
  ttl: number,
  schema?: ValidationSchema<T>,
): PublicAPICacheModel<T> => {
  const key = (id: number): string => `${prefix}_${id}`
  return {
    key,
    ttl,
    get: async (id: number): Promise<null | T> => {
      const result = await cacheService.get<T>(key(id))
      if (!result) {
        return null
      }
      if (schema) {
        const parseResult = validate(schema, result)
        if (parseResult.error) {
          throw parseResult.error.details
        }
        return parseResult.data as T
      }
      return result
    },
    set: async (id: number, item: T): Promise<void> => {
      return cacheService.set(key(id), item, ttl)
    },
    delete: async (id: number): Promise<void> => {
      return cacheService.delete(key(id))
    },
    wrap: async (id: number, fn: () => Promise<T>): Promise<T> => {
      const result = await cacheService.wrap<T>(key(id), fn, ttl)
      if (schema) {
        const parseResult = validate(schema, result)
        if (parseResult.error) {
          throw parseResult.error.details
        }
        return parseResult.data as T
      }
      return result
    },
  }
}
