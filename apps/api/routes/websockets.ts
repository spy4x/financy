import { type Context, Hono } from "hono"
import { upgradeWebSocket } from "hono/deno"
import { websockets } from "@api/services/websockets.ts"
// import { log } from "@api/services/log.ts" // TODO: Add logging
import { APIContext } from "../_types.ts"
import { isAuthenticated2FA } from "@api/middlewares/auth.ts"

export const websocketsRoute = new Hono<APIContext>()
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
          await websockets.onMessage(thisWS, event)
        },
        onClose: (/*event*/ _, thisWS) => {
          websockets.closed(thisWS)
        },
      }
    }),
  )
