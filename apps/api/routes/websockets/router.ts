// =============================================================================
// WebSocket Router
// =============================================================================
// This file routes WebSocket messages to appropriate handlers.
// New RPC-first architecture with fallback to legacy message handling.
// =============================================================================

import type { WS } from "../../services/websockets.ts"
import type { WebSocketMessage } from "@shared/types"
import type {
  WebSocketRPCRequest,
  WebSocketRPCResponse,
} from "../../../../libs/shared/rpc/types.ts"
import { webSocketRPCRequestSchema } from "../../../../libs/shared/rpc/types.ts"
import { validate } from "@shared/types"
import { RPCBus } from "../../../../libs/shared/rpc/bus.ts"

// Legacy handlers - keeping for backwards compatibility during migration
import type { WebSocketMessageHandler } from "./base.ts"
import { PingWebSocketHandler } from "./ping.ts"
import { SyncWebSocketHandler } from "./sync.ts"

/**
 * Routes WebSocket messages to appropriate handlers
 */
export class WebSocketMessageRouter {
  private rpcBus = new RPCBus()

  // Legacy handlers for backwards compatibility
  private legacyHandlers: WebSocketMessageHandler[] = [
    new PingWebSocketHandler(),
    new SyncWebSocketHandler(),
  ]

  /**
   * Initialize RPC handlers
   */
  initializeRPCHandlers(): void {
    // Import and register RPC handlers
    import("../../rpc/transaction-create.ts").then(({ transactionCreateHandler }) => {
      import("../../../../libs/shared/rpc/transaction.ts").then(({ TransactionCreateCommand }) => {
        this.rpcBus.register(TransactionCreateCommand, transactionCreateHandler)
      })
    })

    console.log("RPC handlers initialized")
  }

  /**
   * Route a message to the appropriate handler
   */
  async routeMessage(ws: WS, rawMessage: unknown, userId: number): Promise<boolean> {
    try {
      // First try to handle as RPC message
      const rpcValidation = validate(webSocketRPCRequestSchema, rawMessage)
      if (!rpcValidation.error) {
        return await this.handleRPCMessage(ws, rpcValidation.data, userId)
      }

      // Fall back to legacy message handling
      const legacyMessage = rawMessage as WebSocketMessage
      return await this.handleLegacyMessage(ws, legacyMessage, userId)
    } catch (error) {
      console.error("Router error:", error)
      this.sendErrorResponse(ws, {
        code: "ROUTER_ERROR",
        message: "Failed to route message",
        details: { error: error instanceof Error ? error.message : String(error) },
      })
      return false
    }
  }

  /**
   * Handle RPC message
   */
  private async handleRPCMessage(
    ws: WS,
    message: WebSocketRPCRequest,
    userId: number,
  ): Promise<boolean> {
    const context = {
      userId,
      connectionId: "ws-connection", // TODO: Add proper connection ID tracking
    }

    try {
      const response = await this.rpcBus.handleWebSocketMessage(message, context)
      this.sendRPCResponse(ws, response)
      return true
    } catch (error) {
      console.error(`RPC handler error for ${message.rpc}:`, error)
      this.sendRPCResponse(ws, {
        id: message.id,
        error: {
          code: "RPC_HANDLER_ERROR",
          message: "RPC handler failed",
          details: { error: error instanceof Error ? error.message : String(error) },
        },
      })
      return false
    }
  }

  /**
   * Handle legacy message format (backwards compatibility)
   */
  private async handleLegacyMessage(
    ws: WS,
    message: WebSocketMessage,
    userId: number,
  ): Promise<boolean> {
    const handler = this.legacyHandlers.find((h) => h.canHandle(message.e, message.t))

    if (!handler) {
      console.warn(`No handler found for legacy message: ${message.e}:${message.t}`)
      return false
    }

    try {
      await handler.handle(ws, message, userId)
      return true
    } catch (error) {
      console.error(`Legacy handler error for ${message.e}:${message.t}:`, error)
      ws.send(JSON.stringify({
        e: message.e,
        t: "error_validation",
        p: ["Handler error", error instanceof Error ? error.message : "Unknown error"],
        id: message.id,
      }))
      return false
    }
  }

  /**
   * Send RPC response
   */
  private sendRPCResponse(ws: WS, response: WebSocketRPCResponse): void {
    ws.send(JSON.stringify(response))
  }

  /**
   * Send error response
   */
  private sendErrorResponse(
    ws: WS,
    error: { code: string; message: string; details?: unknown },
  ): void {
    ws.send(JSON.stringify({
      error,
    }))
  }

  /**
   * Get RPC bus for handler registration
   */
  getRPCBus(): RPCBus {
    return this.rpcBus
  }

  /**
   * Get all registered handlers (for debugging)
   */
  getHandlers(): WebSocketMessageHandler[] {
    return [...this.legacyHandlers]
  }

  /**
   * Get all registered RPC handlers (for debugging)
   */
  getRegisteredRPCs(): string[] {
    return this.rpcBus.getRegisteredRPCs()
  }
}
