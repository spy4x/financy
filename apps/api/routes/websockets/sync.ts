import { BaseWebSocketHandler } from "./base.ts"
import type { WS } from "@api/services/websockets.ts"
import type { WebSocketMessage } from "@shared/types"
import { websockets } from "@api/services/websockets.ts"

export class SyncWebSocketHandler extends BaseWebSocketHandler {
  protected entity = "sync"
  protected supportedTypes = ["sync_start"]

  async handle(ws: WS, message: WebSocketMessage, _userId: number): Promise<void> {
    if (message.t === "sync_start") {
      const lastSyncAt = message.p?.[0] as number
      if (typeof lastSyncAt !== "number") {
        this.sendError(ws, "Invalid lastSyncAt parameter", undefined, message.id)
        return
      }

      await websockets.syncData(ws, lastSyncAt)
    }
  }
}
