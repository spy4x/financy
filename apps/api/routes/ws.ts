import { type Context, Hono } from "hono"
import { upgradeWebSocket } from "hono/deno"
import { log, websockets } from "$api/services"
import { APIContext } from "../_types.ts"
import { isAuthenticated2FA } from "$api/middlewares"

export const wsRoute = new Hono<APIContext>()
  .get(
    `/`,
    isAuthenticated2FA,
    upgradeWebSocket((c: Context<APIContext>) => {
      const authData = c.get("auth")
      return {
        onOpen: async (/*event*/ _, thisWS) => {
          websockets.opened(authData.user.id, thisWS)
        },
        onMessage: async (event, thisWS) => {
          log(`Message from client: ${event.data}`)
          await websockets.onMessage(thisWS, event)
        },
        onClose: (/*event*/ _, thisWS) => {
          websockets.closed(thisWS)
        },
      }
    }),
  )
