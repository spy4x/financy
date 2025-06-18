import { Event } from "@shared/cqrs/types.ts"
import {
  type Category,
  type Group,
  type GroupMembership,
  type Transaction,
  type User,
} from "@shared/types"

// =============================================================================
// TRANSACTION EVENTS
// =============================================================================

export interface TransactionCreatedPayload {
  transaction: Transaction
  acknowledgmentId?: string
}

export class TransactionCreatedEvent implements Event<TransactionCreatedPayload> {
  constructor(public data: TransactionCreatedPayload) {}
}

export interface TransactionUpdatedPayload {
  transaction: Transaction
  acknowledgmentId?: string
}

export class TransactionUpdatedEvent implements Event<TransactionUpdatedPayload> {
  constructor(public data: TransactionUpdatedPayload) {}
}

export interface TransactionDeletedPayload {
  transaction: Transaction
  acknowledgmentId?: string
}

export class TransactionDeletedEvent implements Event<TransactionDeletedPayload> {
  constructor(public data: TransactionDeletedPayload) {}
}

// =============================================================================
// CATEGORY EVENTS
// =============================================================================

export interface CategoryCreatedPayload {
  category: Category
  acknowledgmentId?: string
}

export class CategoryCreatedEvent implements Event<CategoryCreatedPayload> {
  constructor(public data: CategoryCreatedPayload) {}
}

export interface CategoryUpdatedPayload {
  category: Category
  acknowledgmentId?: string
}

export class CategoryUpdatedEvent implements Event<CategoryUpdatedPayload> {
  constructor(public data: CategoryUpdatedPayload) {}
}

export interface CategoryDeletedPayload {
  category: Category
  acknowledgmentId?: string
}

export class CategoryDeletedEvent implements Event<CategoryDeletedPayload> {
  constructor(public data: CategoryDeletedPayload) {}
}

// =============================================================================
// GROUP EVENTS
// =============================================================================

export interface GroupCreatedPayload {
  group: Group
  membership: GroupMembership
  acknowledgmentId?: string
}

export class GroupCreatedEvent implements Event<GroupCreatedPayload> {
  constructor(public data: GroupCreatedPayload) {}
}

export interface GroupUpdatedPayload {
  group: Group
  acknowledgmentId?: string
}

export class GroupUpdatedEvent implements Event<GroupUpdatedPayload> {
  constructor(public data: GroupUpdatedPayload) {}
}

export interface GroupDeletedPayload {
  group: Group
  acknowledgmentId?: string
}

export class GroupDeletedEvent implements Event<GroupDeletedPayload> {
  constructor(public data: GroupDeletedPayload) {}
}

// =============================================================================
// USER EVENTS
// =============================================================================

export interface UserUpdatedPayload {
  user: User
  acknowledgmentId?: string
}

export class UserUpdatedEvent implements Event<UserUpdatedPayload> {
  constructor(public data: UserUpdatedPayload) {}
}

// =============================================================================
// WEBSOCKET EVENTS
// =============================================================================

export interface WebSocketErrorPayload {
  message: string
  details?: unknown
  acknowledgmentId?: string
}

export class WebSocketErrorEvent implements Event<WebSocketErrorPayload> {
  constructor(public data: WebSocketErrorPayload) {}
}

export interface SyncCompletedPayload {
  syncAt: number
}

export class SyncCompletedEvent implements Event<SyncCompletedPayload> {
  constructor(public data: SyncCompletedPayload) {}
}
