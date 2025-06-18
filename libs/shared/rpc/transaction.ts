// =============================================================================
// Transaction RPC Operations
// =============================================================================
// This file contains RPC operations for transaction management.
// These operations are used for client-server communication.
// =============================================================================

import { TransactionType, type } from "../types/+index.ts"
import type { PreparedRPCRequest, RPCClass } from "./types.ts"
import { randomId } from "../helpers/random.ts"

// Reuse existing schemas from shared types
export type { TransactionBase } from "../types/+index.ts"

// =============================================================================
// Transaction Create RPC
// =============================================================================

export interface TransactionCreatePayload {
  transaction: {
    accountId: number
    type: TransactionType
    amount: number
    originalCurrency?: string
    originalAmount?: number
    categoryId?: number
    memo?: string
  }
}

export interface TransactionCreateResult {
  id: number
  groupId: number
  accountId: number
  type: TransactionType
  amount: number
  originalCurrency: string | null
  originalAmount: number | null
  categoryId: number | null
  memo: string | null
  createdBy: number
  createdAt: string
  updatedAt: string
}

export interface TransactionCreateError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export const TransactionCreateCommand: RPCClass<
  TransactionCreatePayload,
  TransactionCreateResult,
  TransactionCreateError
> = {
  name: "TransactionCreateCommand",
  payloadSchema: (data: unknown) => {
    const result = type({
      transaction: type({
        accountId: "number",
        type: `${TransactionType.DEBIT} | ${TransactionType.CREDIT}`,
        amount: "number",
        originalCurrency: "string?",
        originalAmount: "number?",
        categoryId: "number?",
        memo: "string?",
      }),
    })(data)
    if (result instanceof type.errors) {
      return new Error(`Validation failed: ${result.summary}`)
    }
    return result as TransactionCreatePayload
  },
  resultSchema: (data: unknown) => {
    const result = type({
      id: "number",
      groupId: "number",
      accountId: "number",
      type: `${TransactionType.DEBIT} | ${TransactionType.CREDIT}`,
      amount: "number",
      originalCurrency: "string | null",
      originalAmount: "number | null",
      categoryId: "number | null",
      memo: "string | null",
      createdBy: "number",
      createdAt: "string",
      updatedAt: "string",
    })(data)
    if (result instanceof type.errors) {
      return new Error(`Validation failed: ${result.summary}`)
    }
    return result as TransactionCreateResult
  },
  errorSchema: (data: unknown) => {
    const result = type({
      code: "string",
      message: "string",
      "details?": "Record<string, unknown>",
    })(data)
    if (result instanceof type.errors) {
      return new Error(`Validation failed: ${result.summary}`)
    }
    return result as TransactionCreateError
  },
  prepare: (payload: TransactionCreatePayload): PreparedRPCRequest<TransactionCreatePayload> => ({
    rpc: "TransactionCreateCommand",
    p: payload,
    id: randomId(),
  }),
}

// =============================================================================
// Transaction Update RPC
// =============================================================================

export interface TransactionUpdatePayload {
  id: number
  transaction: {
    accountId?: number
    type?: TransactionType
    amount?: number
    originalCurrency?: string
    originalAmount?: number
    categoryId?: number
    memo?: string
  }
}

export interface TransactionUpdateResult {
  id: number
  groupId: number
  accountId: number
  type: TransactionType
  amount: number
  originalCurrency: string | null
  originalAmount: number | null
  categoryId: number | null
  memo: string | null
  createdBy: number
  createdAt: string
  updatedAt: string
}

export interface TransactionUpdateError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export const TransactionUpdateCommand: RPCClass<
  TransactionUpdatePayload,
  TransactionUpdateResult,
  TransactionUpdateError
> = {
  name: "TransactionUpdateCommand",
  payloadSchema: (data: unknown) => {
    const result = type({
      id: "number",
      transaction: type({
        accountId: "number?",
        type: `(${TransactionType.DEBIT} | ${TransactionType.CREDIT})?`,
        amount: "number?",
        originalCurrency: "string?",
        originalAmount: "number?",
        categoryId: "number?",
        memo: "string?",
      }),
    })(data)
    if (result instanceof type.errors) {
      return new Error(`Validation failed: ${result.summary}`)
    }
    return result as TransactionUpdatePayload
  },
  resultSchema: (data: unknown) => {
    const result = type({
      id: "number",
      groupId: "number",
      accountId: "number",
      type: `${TransactionType.DEBIT} | ${TransactionType.CREDIT}`,
      amount: "number",
      originalCurrency: "string | null",
      originalAmount: "number | null",
      categoryId: "number | null",
      memo: "string | null",
      createdBy: "number",
      createdAt: "string",
      updatedAt: "string",
    })(data)
    if (result instanceof type.errors) {
      return new Error(`Validation failed: ${result.summary}`)
    }
    return result as TransactionUpdateResult
  },
  errorSchema: (data: unknown) => {
    const result = type({
      code: "string",
      message: "string",
      "details?": "Record<string, unknown>",
    })(data)
    if (result instanceof type.errors) {
      return new Error(`Validation failed: ${result.summary}`)
    }
    return result as TransactionUpdateError
  },
  prepare: (payload: TransactionUpdatePayload): PreparedRPCRequest<TransactionUpdatePayload> => ({
    rpc: "TransactionUpdateCommand",
    p: payload,
    id: randomId(),
  }),
}

// =============================================================================
// Transaction Delete RPC
// =============================================================================

export interface TransactionDeletePayload {
  id: number
}

export interface TransactionDeleteResult {
  id: number
  deletedAt: string
}

export interface TransactionDeleteError {
  code: string
  message: string
  details?: Record<string, unknown>
}

export const TransactionDeleteCommand: RPCClass<
  TransactionDeletePayload,
  TransactionDeleteResult,
  TransactionDeleteError
> = {
  name: "TransactionDeleteCommand",
  payloadSchema: (data: unknown) => {
    const result = type({
      id: "number",
    })(data)
    if (result instanceof type.errors) {
      return new Error(`Validation failed: ${result.summary}`)
    }
    return result as TransactionDeletePayload
  },
  resultSchema: (data: unknown) => {
    const result = type({
      id: "number",
      deletedAt: "string",
    })(data)
    if (result instanceof type.errors) {
      return new Error(`Validation failed: ${result.summary}`)
    }
    return result as TransactionDeleteResult
  },
  errorSchema: (data: unknown) => {
    const result = type({
      code: "string",
      message: "string",
      "details?": "Record<string, unknown>",
    })(data)
    if (result instanceof type.errors) {
      return new Error(`Validation failed: ${result.summary}`)
    }
    return result as TransactionDeleteError
  },
  prepare: (payload: TransactionDeletePayload): PreparedRPCRequest<TransactionDeletePayload> => ({
    rpc: "TransactionDeleteCommand",
    p: payload,
    id: randomId(),
  }),
}
