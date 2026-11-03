/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { BillingEventType, createStripeBilling, SubscriptionStatus } from "@spy4x/billing"
import {
  DEV_PRO_PRICE_ID,
  DEV_WEBHOOK_SECRET,
  proWebhook,
  stripeSignature,
  subscriptionEvent,
} from "./billing.ts"

Deno.test("subscriptionEvent is signed so that the Stripe adapter accepts it as the event it names", async () => {
  const stripe = createStripeBilling({
    secretKey: "sk_test_unused",
    webhookSecret: DEV_WEBHOOK_SECRET,
    plans: [{ planId: "pro", priceId: DEV_PRO_PRICE_ID }],
    fetch: () => Promise.reject(new Error("no network")),
  })
  const body = subscriptionEvent({
    eventId: "evt_9",
    reference: "group-1",
    type: "customer.subscription.updated",
    status: "past_due",
  })

  const parsed = await stripe.parseEvent(new TextEncoder().encode(body), {
    "Stripe-Signature": await stripeSignature(body),
  })

  expect(parsed).toMatchObject({
    ok: true,
    event: {
      id: "evt_9",
      type: BillingEventType.SubscriptionUpdated,
      subscription: { reference: "group-1", planId: "pro", status: 3 },
    },
  })
})

Deno.test("proWebhook puts its group on Pro with a subscription no other call shares", async () => {
  const stripe = createStripeBilling({
    secretKey: "sk_test_unused",
    webhookSecret: DEV_WEBHOOK_SECRET,
    plans: [{ planId: "pro", priceId: DEV_PRO_PRICE_ID }],
    fetch: () => Promise.reject(new Error("no network")),
  })
  const read = async (groupId: string) => {
    const { headers, data } = await proWebhook(groupId)
    return await stripe.parseEvent(new TextEncoder().encode(data), {
      "Stripe-Signature": headers["stripe-signature"],
    })
  }

  const first = await read("group-1")
  const second = await read("group-2")

  expect(first).toMatchObject({
    ok: true,
    event: {
      subscription: { reference: "group-1", planId: "pro", status: SubscriptionStatus.Active },
    },
  })
  const ids = [first, second].map((parsed) => {
    const { subscription } =
      (parsed as unknown as { event: { subscription: Record<string, string> } })
        .event
    return [subscription.id, subscription.customerId]
  })
  expect(ids[0][0]).not.toBe(ids[1][0])
  expect(ids[0][1]).not.toBe(ids[1][1])
})
