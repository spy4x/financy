import { auth } from "@web/state/auth.ts"
import { ws } from "@web/state/ws.ts"

export function StateInit(
  props: { ENV: string },
) {
  // TODO: set url, ENV, WEB_API_PREFIX in states
  // if (!IS_BROWSER) return
  auth.init()
  ws.init()
  return null
}
