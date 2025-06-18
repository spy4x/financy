import type { WS } from "@api/services/websockets.ts"
import type { WebSocketMessage } from "@shared/types"

export interface WebSocketMessageHandler {
  canHandle(entity: string, messageType: string): boolean
  handle(ws: WS, message: WebSocketMessage, userId: number): Promise<void>
}

export abstract class BaseWebSocketHandler implements WebSocketMessageHandler {
  protected abstract entity: string
  protected abstract supportedTypes: string[]

  canHandle(entity: string, messageType: string): boolean {
    return entity === this.entity && this.supportedTypes.includes(messageType)
  }

  abstract handle(ws: WS, message: WebSocketMessage, userId: number): Promise<void>

  protected sendError(ws: WS, message: string, details?: unknown, acknowledgmentId?: string): void {
    ws.send(JSON.stringify({
      e: this.entity,
      t: "error_validation",
      p: [message, details],
      id: acknowledgmentId,
    }))
  }

  protected sendAcknowledgment(
    ws: WS,
    messageType: string,
    payload: unknown[],
    acknowledgmentId?: string,
  ): void {
    ws.send(JSON.stringify({
      e: this.entity,
      t: messageType,
      p: payload,
      id: acknowledgmentId,
    }))
  }
}
