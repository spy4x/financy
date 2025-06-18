import { type } from "arktype"
import { Command } from "@shared/cqrs/types.ts"
import {
  type Category,
  type CategoryBase,
  categoryBaseSchema,
  type CategoryUpdate,
  categoryUpdateSchema,
  type Group,
  type GroupBase,
  groupBaseSchema,
  type GroupMembership,
  GroupRole,
  type GroupUpdate,
  groupUpdateSchema,
  type Transaction,
  type TransactionBase,
  transactionBaseSchema,
  type TransactionUpdate,
  transactionUpdateSchema,
  type User,
  userSchema,
} from "@shared/types"

// =============================================================================
// TRANSACTION COMMANDS
// =============================================================================

export interface TransactionCreatePayload {
  transaction: TransactionBase
  acknowledgmentId?: string
}

export interface TransactionCreateResult {
  transaction: Transaction
}

export class TransactionCreateCommand
  implements Command<TransactionCreatePayload, TransactionCreateResult> {
  __resultType?: TransactionCreateResult
  constructor(public data: TransactionCreatePayload) {}
}

export interface TransactionUpdatePayload {
  id: number
  transaction: TransactionUpdate
  acknowledgmentId?: string
}

export interface TransactionUpdateResult {
  transaction: Transaction
}

export class TransactionUpdateCommand
  implements Command<TransactionUpdatePayload, TransactionUpdateResult> {
  __resultType?: TransactionUpdateResult
  constructor(public data: TransactionUpdatePayload) {}
}

export interface TransactionDeletePayload {
  id: number
  userId: number
  acknowledgmentId?: string
}

export interface TransactionDeleteResult {
  transaction: Transaction
}

export class TransactionDeleteCommand
  implements Command<TransactionDeletePayload, TransactionDeleteResult> {
  __resultType?: TransactionDeleteResult
  constructor(public data: TransactionDeletePayload) {}
}

// =============================================================================
// CATEGORY COMMANDS
// =============================================================================

export interface CategoryCreatePayload {
  category: CategoryBase
  acknowledgmentId?: string
}

export interface CategoryCreateResult {
  category: Category
}

export class CategoryCreateCommand implements Command<CategoryCreatePayload, CategoryCreateResult> {
  __resultType?: CategoryCreateResult
  constructor(public data: CategoryCreatePayload) {}
}

export interface CategoryUpdatePayload {
  id: number
  category: CategoryUpdate
  acknowledgmentId?: string
}

export interface CategoryUpdateResult {
  category: Category
}

export class CategoryUpdateCommand implements Command<CategoryUpdatePayload, CategoryUpdateResult> {
  __resultType?: CategoryUpdateResult
  constructor(public data: CategoryUpdatePayload) {}
}

export interface CategoryDeletePayload {
  id: number
  userId: number
  acknowledgmentId?: string
}

export interface CategoryDeleteResult {
  category: Category
}

export class CategoryDeleteCommand implements Command<CategoryDeletePayload, CategoryDeleteResult> {
  __resultType?: CategoryDeleteResult
  constructor(public data: CategoryDeletePayload) {}
}

// =============================================================================
// GROUP COMMANDS
// =============================================================================

export interface GroupCreatePayload {
  group: GroupBase
  userId: number
  role?: GroupRole
  acknowledgmentId?: string
}

export interface GroupCreateResult {
  group: Group
  membership: GroupMembership
}

export class GroupCreateCommand implements Command<GroupCreatePayload, GroupCreateResult> {
  __resultType?: GroupCreateResult
  constructor(public data: GroupCreatePayload) {}
}

export interface GroupUpdatePayload {
  id: number
  group: GroupUpdate
  acknowledgmentId?: string
}

export interface GroupUpdateResult {
  group: Group
}

export class GroupUpdateCommand implements Command<GroupUpdatePayload, GroupUpdateResult> {
  __resultType?: GroupUpdateResult
  constructor(public data: GroupUpdatePayload) {}
}

export interface GroupDeletePayload {
  id: number
  userId: number
  acknowledgmentId?: string
}

export interface GroupDeleteResult {
  group: Group
}

export class GroupDeleteCommand implements Command<GroupDeletePayload, GroupDeleteResult> {
  __resultType?: GroupDeleteResult
  constructor(public data: GroupDeletePayload) {}
}

// =============================================================================
// USER COMMANDS
// =============================================================================

export interface UserUpdatePayload {
  id: number
  user: Partial<User>
  acknowledgmentId?: string
}

export interface UserUpdateResult {
  user: User
}

export class UserUpdateCommand implements Command<UserUpdatePayload, UserUpdateResult> {
  __resultType?: UserUpdateResult
  constructor(public data: UserUpdatePayload) {}
}

// =============================================================================
// ARKTYPE SCHEMAS FOR VALIDATION
// =============================================================================

// Transaction command schemas
export const transactionCreatePayloadSchema = type({
  transaction: transactionBaseSchema,
  "acknowledgmentId?": "string",
})

export const transactionUpdatePayloadSchema = type({
  id: "number",
  transaction: transactionUpdateSchema,
  "acknowledgmentId?": "string",
})

export const transactionDeletePayloadSchema = type({
  id: "number",
  userId: "number",
  "acknowledgmentId?": "string",
})

// Category command schemas
export const categoryCreatePayloadSchema = type({
  category: categoryBaseSchema,
  "acknowledgmentId?": "string",
})

export const categoryUpdatePayloadSchema = type({
  id: "number",
  category: categoryUpdateSchema,
  "acknowledgmentId?": "string",
})

export const categoryDeletePayloadSchema = type({
  id: "number",
  userId: "number",
  "acknowledgmentId?": "string",
})

// Group command schemas
export const groupCreatePayloadSchema = type({
  group: groupBaseSchema,
  userId: "number",
  "role?": "number",
  "acknowledgmentId?": "string",
})

export const groupUpdatePayloadSchema = type({
  id: "number",
  group: groupUpdateSchema,
  "acknowledgmentId?": "string",
})

export const groupDeletePayloadSchema = type({
  id: "number",
  userId: "number",
  "acknowledgmentId?": "string",
})

// User command schemas
export const userUpdatePayloadSchema = type({
  id: "number",
  user: userSchema,
  "acknowledgmentId?": "string",
})
