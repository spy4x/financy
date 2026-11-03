import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { createKvStore } from "@spy4x/platform/rate-limit"
import { createSubscriberRateLimits } from "./subscriber-rate-limits.ts"

describe(`subscriber rate limits`, () => {
  it(`keys the address budget by the given keyed hash, never by the address`, async () => {
    const keys: string[] = []
    const limits = createSubscriberRateLimits({
      windowMs: 60_000,
      strictLimit: 10,
      store: () =>
        createKvStore({
          backend: {
            get: (key) => Promise.resolve(void keys.push(key)),
            set: (key) => Promise.resolve(void keys.push(key)),
            delete: () => Promise.resolve(),
          },
        }),
      recipientKey: (email) => Promise.resolve(`keyed-${email.length}`),
    })

    expect((await limits.mailByRecipient(`ada@example.com`)).allowed).toBe(true)

    expect(keys.length).toBeGreaterThan(0)
    expect(keys.every((key) => key.includes(`keyed-15`))).toBe(true)
    expect(keys.join(` `)).not.toContain(`ada@example.com`)
  })
})
