import { User } from "@shared/types"
import { auth } from "@web/state/auth.ts"
import { IS_BROWSER } from "@fresh/runtime.ts"
import { ws } from "@web/state/ws.ts"

export function StateInit(
  props: { url: string; ENV: string; WEB_API_PREFIX: string; user: null | User },
) {
  // TODO: set url, ENV, WEB_API_PREFIX in states
  if (props.user) auth.setUser(props.user)
  if (!IS_BROWSER) return
  auth.init()
  ws.init()
  return null
}
