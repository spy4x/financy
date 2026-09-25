/**
 * What financy relies on from `EventBus` (`@spy4x/platform/cqrs`), which replaced financy's own
 * copy. financy's copy threw a listener's error inside a microtask: in the API that crashed the
 * process, and every later listener for that event was skipped.
 */
import { afterEach, describe, expect, it } from "@shared/testing"
import { eventBus } from "./eventBus.ts"

const originalError = console.error

afterEach(() => {
  console.error = originalError
})

/** Collects what the bus logs for failed listeners instead of printing it. */
function captureErrors(): unknown[][] {
  const logged: unknown[][] = []
  console.error = (...args: unknown[]) => logged.push(args)
  return logged
}

/** Lets the bus run the listeners it queued with `queueMicrotask`, and any rejection handlers. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe("eventBus", () => {
  it("keeps notifying later listeners when one throws, and logs the error", async () => {
    class ThrowingListenerEvent {}
    const logged = captureErrors()
    const received: string[] = []
    const offs = [
      eventBus.on(ThrowingListenerEvent, () => {
        throw new Error("listener failed")
      }),
      eventBus.on(ThrowingListenerEvent, () => {
        received.push("second")
      }),
    ]
    try {
      eventBus.emit(new ThrowingListenerEvent())
      await settle()
      expect(received).toEqual(["second"])
      expect(logged.length).toBe(1)
    } finally {
      offs.forEach((off) => off())
    }
  })

  it("logs a rejected async listener instead of leaving an unhandled rejection", async () => {
    class RejectingListenerEvent {}
    const logged = captureErrors()
    const off = eventBus.on(RejectingListenerEvent, () => Promise.reject(new Error("async failed")))
    try {
      eventBus.emit(new RejectingListenerEvent())
      await settle()
      expect(logged.length).toBe(1)
    } finally {
      off()
    }
  })

  it("once() removes its listener even when the callback throws", async () => {
    class OnceEvent {}
    captureErrors()
    let calls = 0
    const off = eventBus.once(OnceEvent, () => {
      calls++
      throw new Error("once failed")
    })
    try {
      eventBus.emit(new OnceEvent())
      await settle()
      eventBus.emit(new OnceEvent())
      await settle()
      expect(calls).toBe(1)
    } finally {
      off()
    }
  })
})
