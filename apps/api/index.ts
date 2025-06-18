import { Hono } from "hono"
import { contextStorage } from "hono/context-storage"
import { requestId } from "hono/request-id"
import { db } from "@api/services/db.ts"
import { websocketsRoute } from "./routes/websockets.ts"
import { logger } from "@api/middlewares/log.ts"
import { parseAuth } from "@api/middlewares/auth.ts"
import { APIContext } from "./_types.ts"
import { getRandomString } from "@shared/helpers/random.ts"
import { authRoute } from "./routes/auth.ts"

// Initialize event handlers
import "./cqrs/+init.ts"

const app = new Hono<APIContext>().basePath("/api")
app.use(
  contextStorage(),
  requestId({ generator: () => getRandomString(8) }),
  logger(),
  parseAuth,
)
app.route("/ws", websocketsRoute) // isAuthenticated check is inside, because ⚠️ order of middlewares matters. Don't move this line if you don't know what you're doing.

app.get(
  "/health",
  async (c) =>
    c.json({
      status: "ok",
      isDbConnected: await db.isConnected(),
      date: Date.now(),
    }),
)
app.route("/auth", authRoute) // has some public routes and some more protected

export default app
