import { FreshContext } from "@fresh/server.ts"
import { ContextState } from "./_types.ts"

export const handler = [
  log,
  auth,
]

async function log(
  req: Request,
  ctx: FreshContext<ContextState>,
) {
  if (ctx.destination !== "route" || req.url.includes("/health")) return ctx.next()

  const startTime = Date.now()
  const path = new URL(req.url).pathname
  console.log(`> ${path}`)
  const resp = await ctx.next()
  const status = resp.status
  // log request and how much time it took
  console.log(`< ${path} ${status} ${Date.now() - startTime}ms`)
  return resp
}

async function auth(
  req: Request,
  ctx: FreshContext<ContextState>,
) {
  if (ctx.destination !== "route") return ctx.next()
  const cookie = req.headers.get("Cookie")
  if (!cookie || !cookie.includes("sessionIdToken=")) {
    return ctx.next()
  }
  console.log("Auth middleware:", cookie)
  // Get user info from API for SSR
  const response = await fetch("http://api:8000/api/auth/me", {
    headers: {
      "Cookie": cookie,
    },
  })
  if (response.status === 200) {
    ctx.state.user = await response.json()
  } else {
    ctx.state.user = null
  }
  return ctx.next()
}
