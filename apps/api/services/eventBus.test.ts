import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { Hono } from "hono"
import { contextStorage } from "hono/context-storage"
import { requestId } from "hono/request-id"
import type { Event } from "@spy4x/platform/cqrs"
import type { APIContext } from "../_types.ts"
import { eventBus, eventListenerFailures, subscribe } from "./eventBus.ts"

class ListenerProbeEvent implements Event<{ n: number }> {
  constructor(public data: { n: number }) {}
}

/** Runs `work` and returns what `console.log` received while the bus delivered the event. */
async function captureLogs(work: () => void | Promise<void>): Promise<unknown[][]> {
  const lines: unknown[][] = []
  const original = console.log
  console.log = (...args: unknown[]) => void lines.push(args)
  try {
    await work()
    // `emit` delivers on a microtask and a rejected listener is reported one microtask later.
    await new Promise((resolve) => setTimeout(resolve, 0))
  } finally {
    console.log = original
  }
  return lines
}

describe("the event bus's listener failure report", () => {
  it("logs one structured line and counts it when a listener throws", async () => {
    const labels = { event: "ListenerProbeEvent", listener: "throwingListener" }
    const before = eventListenerFailures.value(labels)
    const throwingListener = () => {
      throw new Error("disk on fire")
    }
    const off = subscribe(ListenerProbeEvent, throwingListener)

    const lines = await captureLogs(() => eventBus.emit(new ListenerProbeEvent({ n: 1 })))
    off()

    expect(lines).toHaveLength(1)
    expect(JSON.parse(String(lines[0][1]))).toEqual({
      level: "error",
      message: "event listener failed",
      event: "ListenerProbeEvent",
      listener: "throwingListener",
      error: "Error: disk on fire",
    })
    expect(eventListenerFailures.value(labels)).toBe(before + 1)
  })

  it("reports a listener that rejects, and still runs the listeners after it", async () => {
    const seen: number[] = []
    const rejectingListener = () => Promise.reject(new Error("nope"))
    const offs = [
      subscribe(ListenerProbeEvent, rejectingListener),
      subscribe(ListenerProbeEvent, (event) => void seen.push(event.data.n)),
    ]

    const lines = await captureLogs(() => eventBus.emit(new ListenerProbeEvent({ n: 7 })))
    offs.forEach((off) => off())

    expect(lines).toHaveLength(1)
    expect(JSON.parse(String(lines[0][1])).listener).toBe("rejectingListener")
    expect(seen).toEqual([7])
  })

  it("logs nothing and counts nothing when every listener succeeds", async () => {
    const labels = { event: "ListenerProbeEvent", listener: "quietListener" }
    const quietListener = () => {}
    const off = subscribe(ListenerProbeEvent, quietListener)

    const lines = await captureLogs(() => eventBus.emit(new ListenerProbeEvent({ n: 2 })))
    off()

    expect(lines).toHaveLength(0)
    expect(eventListenerFailures.value(labels)).toBe(0)
  })

  it("puts the request id of the request that raised the event on the log line", async () => {
    const throwingListener = () => {
      throw new Error("boom")
    }
    const off = subscribe(ListenerProbeEvent, throwingListener)
    const app = new Hono<APIContext>()
      .use(contextStorage(), requestId({ generator: () => "req-abc" }))
      .get("/", (c) => {
        eventBus.emit(new ListenerProbeEvent({ n: 3 }))
        return c.text("ok")
      })

    const lines = await captureLogs(async () => {
      await app.request("/")
    })
    off()

    expect(lines).toHaveLength(1)
    expect(lines[0][0]).toBe("req-abc")
  })

  it("leaves the code that raised the event unaffected when a listener throws", async () => {
    const throwingListener = () => {
      throw new Error("boom")
    }
    const off = subscribe(ListenerProbeEvent, throwingListener)
    let afterEmit = false
    const app = new Hono<APIContext>().get("/", (c) => {
      expect(() => eventBus.emit(new ListenerProbeEvent({ n: 4 }))).not.toThrow()
      afterEmit = true
      return c.text("ok")
    })

    let response: Response | undefined
    await captureLogs(async () => {
      response = await app.request("/")
    })
    off()

    expect(response?.status).toBe(200)
    expect(afterEmit).toBe(true)
  })
})
