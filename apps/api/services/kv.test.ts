/// <reference lib="deno.ns" />
/**
 * What financy relies on from `RedisKvStore` (`@spy4x/server/kv`), which replaced financy's own
 * `KeyValueService`. The unit tier has no network permission, so `Deno.connect` is swapped for a
 * fake connection that answers each Redis command and records it.
 */
import { afterEach, describe, expect, it } from "@shared/testing"
import { CacheService } from "@spy4x/platform/cache"
import { connectKv } from "./kv.ts"

const originalConnect = Deno.connect
const originalAbortTimeout = AbortSignal.timeout
const originalLog = console.log

afterEach(() => {
  Deno.connect = originalConnect
  AbortSignal.timeout = originalAbortTimeout
  console.log = originalLog
})

/** RESP reply for one command, chosen by its name. */
function replyTo(command: string[]): string {
  switch (command[0]) {
    case "PING":
      return "+PONG\r\n"
    case "SET":
      return "+OK\r\n"
    case "GET":
      return "$-1\r\n"
    case "DEL":
      return ":1\r\n"
    case "SCAN":
      return "*2\r\n$1\r\n0\r\n*1\r\n$11\r\nfinancy:old\r\n"
    default:
      return "-ERR unexpected command in test\r\n"
  }
}

/** Replaces `Deno.connect` with a fake Redis and returns every command it receives. */
function fakeRedis(): string[][] {
  const commands: string[][] = []
  let reader: ReadableStreamDefaultController<Uint8Array> | undefined
  let closed = false
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      reader = controller
    },
  })
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      const lines = new TextDecoder().decode(chunk).split("\r\n")
      const command = lines.filter((_, i) => i > 0 && lines[i - 1].startsWith("$"))
      commands.push(command)
      reader?.enqueue(new TextEncoder().encode(replyTo(command)))
    },
  })
  const conn = {
    readable,
    writable,
    close() {
      if (closed) return
      closed = true
      reader?.close()
    },
  } as unknown as Deno.TcpConn
  Deno.connect = (() => Promise.resolve(conn)) as unknown as typeof Deno.connect
  AbortSignal.timeout = () => new AbortController().signal
  console.log = () => {}
  return commands
}

describe("connectKv", () => {
  it("stores every cache key under the financy: prefix", async () => {
    const commands = fakeRedis()
    const kv = await connectKv("fake-host", 6379)
    try {
      const cache = new CacheService(kv)
      await cache.set("user_1", { id: 1 }, 60)
      await cache.get("user_1")
      expect(commands.slice(1)).toEqual([
        ["SET", "financy:user_1", `{"id":1}`, "EX", "60"],
        ["GET", "financy:user_1"],
      ])
    } finally {
      kv.close()
    }
  })

  it("reset() deletes only financy: keys instead of flushing the database", async () => {
    const commands = fakeRedis()
    const kv = await connectKv("fake-host", 6379)
    try {
      await new CacheService(kv).reset()
      expect(commands.slice(1)).toEqual([
        ["SCAN", "0", "MATCH", "financy:*", "COUNT", "200"],
        ["DEL", "financy:old"],
      ])
    } finally {
      kv.close()
    }
  })
})
