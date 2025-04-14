import { getContext } from "hono/context-storage"
import type { APIContext } from "../_types.ts"

export function log(...data: unknown[]): void {
  let env: null | APIContext["Variables"] = null
  try {
    env = getContext<APIContext>().var
    // deno-lint-ignore no-empty
  } catch {}
  const requestId = env?.requestId || "no-req-id"
  console.log(`${requestId}`, ...data)
}
