import { config } from "@api/services/config.ts"
import { signIn } from "@api/services/auth.ts"
import { realtime } from "@api/services/realtimeHub.ts"
import { createSocketRoute } from "@api/services/socket-route.ts"

// The browser sends the web app's origin; behind the TLS-terminating proxy the API sees `http://`.
export const wsRoute = createSocketRoute({
  auth: signIn.auth,
  expectedOrigin: new URL(config.webAppUrl).origin,
  realtime,
})
