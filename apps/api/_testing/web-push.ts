import { encodeBase64Url } from "@std/encoding"
import type { PushSenderOptions } from "../services/web-push-service.ts"

/** Browser-side subscription keys that encrypt for real: a P-256 public key and an auth secret. */
export async function browserKeys(): Promise<{ auth: string; p256dh: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveKey",
  ])
  return {
    p256dh: encodeBase64Url(await crypto.subtle.exportKey("raw", pair.publicKey)),
    auth: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
  }
}

/** One request the fake push service received. */
export interface PushRequest {
  endpoint: string
  headers: Record<string, string>
}

/**
 * Sender options whose push service is in memory: every request is recorded, and an endpoint
 * listed in `failures` is answered with that HTTP status (any other gets 201). DNS answers with a
 * public address, so the library's endpoint check passes without a network.
 */
export function fakePushService(failures: Record<string, number> = {}) {
  const requests: PushRequest[] = []
  const fetcher = ((input: string | URL | Request, init?: RequestInit) => {
    const endpoint = String(input)
    requests.push({ endpoint, headers: { ...init?.headers as Record<string, string> } })
    return Promise.resolve(new Response(null, { status: failures[endpoint] ?? 201 }))
  }) as typeof fetch
  const options: PushSenderOptions = {
    subject: "mailto:push@example.com",
    fetch: fetcher,
    resolver: { resolve: () => Promise.resolve(["93.184.216.34"]) },
  }
  return { options, requests }
}
