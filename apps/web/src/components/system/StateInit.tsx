import { auth } from "@web/state/auth.ts"
import { ws } from "@web/state/ws.ts"
import { category } from "@web/state/category.ts"
import { group } from "@web/state/group.ts"

let isInitialized = false

export function StateInit(
  _props: { ENV: string },
) {
  if (isInitialized) {
    return null
  }
  isInitialized = true
  // TODO: set url, ENV, WEB_API_PREFIX in states
  // if (!IS_BROWSER) return
  auth.init()
  category.init()
  group.init()
  ws.init()
  return null
}
