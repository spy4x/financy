/// <reference lib="deno.ns" />
import { ICacheStorage } from "@shared/cache"
import { RedisClient, Reply } from "@iuioiua/redis"

export class KeyValueService implements ICacheStorage {
  private constructor(private connection: Deno.Conn, private client: RedisClient) {}

  public static async connect(hostname: string, port: number): Promise<KeyValueService> {
    const connection = await Deno.connect({ hostname, port })
    const client = new RedisClient(connection)
    const kv = new KeyValueService(connection, client)
    const reply = await kv.client.sendCommand(["PING"])
    if (reply !== "PONG") {
      throw new Error(`Failed to connect to KV: ${reply}`)
    }
    console.log(`✅ Connected to KV`)
    return kv
  }

  /** Gets a value from the database, null if not found. */
  public async get<T extends Reply>(key: string): Promise<null | T> {
    return (await this.client.sendCommand(["GET", key])) as T
  }

  /** Sets a key in the database with an expiration time. */
  public async set(key: string, value: number | string, ttlSec: number): Promise<void> {
    await this.client.sendCommand(["SET", key, value, "EX", ttlSec])
  }

  /** Deletes a key from the database. */
  public async del(key: string): Promise<void> {
    await this.client.sendCommand(["DEL", key])
  }

  /** Deletes all keys in the current database. */
  public async reset(): Promise<void> {
    await this.client.sendCommand(["FLUSHDB"])
  }

  /** Closes the connection to the KV server. */
  public close(): void {
    this.connection.close()
  }
}
