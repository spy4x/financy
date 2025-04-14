import type { AuthData } from "./services/auth/types.ts"
import type { RequestIdVariables } from "hono/request-id"

export interface APIContext {
  Variables: RequestIdVariables & {
    /**
     * Information about the user's authentication.
     * ⚠️ Warning: it can be `null`. This is for convenience.
     * If you want to ensure that the user is authenticated, use the `authRequiredMiddleware` middleware.
     */
    auth: AuthData
  }
}
