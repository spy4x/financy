import { Handlers } from "@fresh/server.ts"

export const handler: Handlers = {
  GET(_req) {
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { "Content-Type": "application/json" },
    })
  },
}
