import { RedisKvStore } from "@spy4x/server/kv"

/**
 * Namespace for every key financy writes to Redis. `RedisKvStore` requires one: it prefixes each
 * key with `financy:` and scopes `reset()` to that prefix instead of flushing the whole database.
 */
export const KV_KEY_PREFIX = "financy"

/** Opens the Redis connection the API caches through, under {@link KV_KEY_PREFIX}. */
export async function connectKv(hostname: string, port: number): Promise<RedisKvStore> {
  const kv = await RedisKvStore.connect(hostname, port, KV_KEY_PREFIX)
  console.log(`✅ Connected to KV`)
  return kv
}
