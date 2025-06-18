// =============================================================================
// RPC Types
// =============================================================================
// This file contains the core RPC interfaces and types for the Financy
// application. RPC (Remote Procedure Call) is used for client-server
// communication, providing type-safe request/response patterns.
//
// Key Design Principles:
// - Type-safe request/response with error handling
// - Validation of payloads using ArkType
// - Clear separation between RPC (client-server) and CQRS (internal)
// - Generic interfaces for extensibility
// - Async/await promise-like interface for frontend
// =============================================================================

import { type } from "../types/+index.ts"

/**
 * Base interface for all RPC operations
 */
export interface RPC<TPayload = unknown, TResult = unknown, TError = unknown> {
  /** RPC operation name (e.g., "TransactionCreateCommand") */
  name: string
  /** Payload validation schema */
  payloadSchema: (data: unknown) => TPayload | Error
  /** Result validation schema */
  resultSchema: (data: unknown) => TResult | Error
  /** Error validation schema */
  errorSchema: (data: unknown) => TError | Error
  /** Phantom type for TypeScript inference */
  __resultType?: TResult
  /** Phantom type for TypeScript inference */
  __errorType?: TError
  /** Phantom type for TypeScript inference */
  __payloadType?: TPayload
}

/**
 * Prepared RPC request ready for transmission
 */
export interface PreparedRPCRequest<TPayload = unknown> {
  /** RPC operation name */
  rpc: string
  /** Validated payload */
  p: TPayload
  /** Unique acknowledgment ID */
  id: string
}

/**
 * RPC class with static prepare method for type-safe request creation
 */
export interface RPCClass<TPayload = unknown, TResult = unknown, TError = unknown>
  extends RPC<TPayload, TResult, TError> {
  /**
   * Prepare a type-safe RPC request
   * @param payload - The payload to send
   * @returns Prepared request ready for transmission
   */
  prepare(payload: TPayload): PreparedRPCRequest<TPayload>
}

/**
 * Handler function for RPC operations
 */
export interface RPCHandler<
  TPayload = unknown,
  TResult = unknown,
  TError = unknown,
> {
  (payload: TPayload, context: RPCContext): Promise<RPCResult<TResult, TError>>
}

/**
 * Result type for RPC operations
 */
export type RPCResult<TResult, TError> =
  | { data: TResult; error: null }
  | { data: null; error: TError }

/**
 * WebSocket message format for RPC requests
 */
export interface WebSocketRPCRequest {
  /** RPC operation name */
  rpc: string
  /** Payload data */
  p: unknown
  /** Acknowledgment ID for response correlation */
  id: string
}

/**
 * WebSocket message format for RPC responses
 */
export interface WebSocketRPCResponse {
  /** Acknowledgment ID from request */
  id: string
  /** Response data (if successful) */
  data?: unknown
  /** Error information (if failed) */
  error?: unknown
}

/**
 * Frontend WebSocket RPC response type
 */
export type WebSocketRPCPromiseResult<TResult, TError> = Promise<
  | { error: null; data: TResult }
  | { error: TError; data: null }
>

/**
 * Context passed to RPC handlers
 */
export interface RPCContext {
  /** Authenticated user ID */
  userId: number
  /** WebSocket connection ID */
  connectionId: string
  /** Additional context data */
  [key: string]: unknown
}

/**
 * WebSocket RPC message validation schema
 */
export const webSocketRPCRequestSchema = type({
  rpc: "string",
  p: "unknown",
  id: "string",
})
