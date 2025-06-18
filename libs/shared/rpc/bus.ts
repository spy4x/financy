// =============================================================================
// RPC Bus
// =============================================================================
// This file implements the RPC bus for registering and executing RPC handlers.
// The bus provides type-safe registration and execution of RPC operations.
// =============================================================================

import type {
  RPC,
  RPCContext,
  RPCHandler,
  RPCResult,
  WebSocketRPCRequest,
  WebSocketRPCResponse,
} from "./types.ts"

/**
 * RPC Bus for handling type-safe RPC calls
 */
export class RPCBus {
  private handlers = new Map<string, RPCHandler>()
  private rpcs = new Map<string, RPC>()

  /**
   * Register an RPC handler
   */
  register<TPayload, TResult, TError>(
    rpc: RPC<TPayload, TResult, TError>,
    handler: RPCHandler<TPayload, TResult, TError>,
  ): void {
    this.rpcs.set(rpc.name, rpc)
    this.handlers.set(rpc.name, handler as RPCHandler)
    console.log(`✅ RPC handler registered: ${rpc.name}`)
  }

  /**
   * Execute an RPC call with validation
   */
  async execute(
    rpcName: string,
    payload: unknown,
    context: RPCContext,
  ): Promise<RPCResult<unknown, unknown>> {
    const rpc = this.rpcs.get(rpcName)
    const handler = this.handlers.get(rpcName)

    if (!rpc || !handler) {
      return {
        data: null,
        error: `No handler registered for RPC: ${rpcName}`,
      }
    }

    try {
      // Validate payload
      const validationResult = rpc.payloadSchema(payload)
      if (validationResult instanceof Error) {
        return {
          data: null,
          error: `Invalid payload: ${validationResult.message}`,
        }
      }

      // Execute handler
      const result = await handler(validationResult, context)

      // Validate result
      if (result.data !== null) {
        const resultValidation = rpc.resultSchema(result.data)
        if (resultValidation instanceof Error) {
          console.error(`Invalid result from ${rpcName}:`, resultValidation.message)
          return {
            data: null,
            error: `Invalid result from handler`,
          }
        }
      } else {
        const errorValidation = rpc.errorSchema(result.error)
        if (errorValidation instanceof Error) {
          console.error(`Invalid error from ${rpcName}:`, errorValidation.message)
          return {
            data: null,
            error: `Invalid error from handler`,
          }
        }
      }

      return result
    } catch (error) {
      console.error(`RPC handler error for ${rpcName}:`, error)
      return {
        data: null,
        error: `Internal server error: ${error instanceof Error ? error.message : "Unknown error"}`,
      }
    }
  } /**
   * Handle RPC from WebSocket message
   */

  async handleWebSocketMessage(
    message: WebSocketRPCRequest,
    context: RPCContext,
  ): Promise<WebSocketRPCResponse> {
    const result = await this.execute(message.rpc, message.p, context)

    return {
      id: message.id,
      data: result.data !== null ? result.data : undefined,
      error: result.error !== null ? result.error : undefined,
    }
  }

  /**
   * Get all registered RPC names
   */
  getRegisteredRPCs(): string[] {
    return Array.from(this.handlers.keys())
  }

  /**
   * Check if an RPC is registered
   */
  isRegistered(rpcName: string): boolean {
    return this.handlers.has(rpcName)
  }
}
