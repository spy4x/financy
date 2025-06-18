import { type } from "arktype"
import { Query } from "@shared/cqrs/types.ts"

// Query payloads and results
export interface SyncDataPayload {
  lastSyncAt: number
}

export interface SyncDataResult {
  // This will be handled through websocket callbacks
  success: boolean
}

// Query classes implementing the Query interface
export class SyncDataQuery implements Query<SyncDataPayload, SyncDataResult> {
  __resultType?: SyncDataResult
  constructor(public data: SyncDataPayload) {}
}

// Arktype schemas for validation
export const syncDataPayloadSchema = type({
  lastSyncAt: "number",
})

export const syncDataResultSchema = type({
  success: "boolean",
})
