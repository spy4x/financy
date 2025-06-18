import { BaseWebSocketHandler } from "./base.ts"
import type { WS } from "@api/services/websockets.ts"
import type { WebSocketMessage } from "@shared/types"

export class PingWebSocketHandler extends BaseWebSocketHandler {
  protected entity = "client"
  protected supportedTypes = ["ping", "pong"]

  async handle(ws: WS, message: WebSocketMessage, _userId: number): Promise<void> {
    if (message.t === "ping") {
      // Respond with PONG
      ws.send(JSON.stringify({
        e: "server",
        t: "pong",
      }))
    }
    // PONG messages don't need a response
  }
}
