import { Command } from "@shared/cqrs/types.ts"
import {
  Account,
  AccountBase,
  Category,
  CategoryBase,
  Group,
  GroupBase,
  GroupMembership,
  GroupRole,
  Transaction,
  TransactionBase,
} from "@shared/types"

export interface GroupCreatePayload {
  group: GroupBase
  userId: number
  role?: GroupRole // Defaults to Owner
  acknowledgmentId?: string // For WebSocket acknowledgment
}

export interface GroupCreateResult {
  group: Group
  membership: GroupMembership
}

export class GroupCreateCommand implements Command<GroupCreatePayload, GroupCreateResult> {
  __resultType?: GroupCreateResult
  constructor(public data: GroupCreatePayload) {}
}

export interface AccountCreatePayload {
  account: AccountBase
  userId: number
  acknowledgmentId?: string // For WebSocket acknowledgment
}

export interface AccountCreateResult {
  account: Account
}

export class AccountCreateCommand implements Command<AccountCreatePayload, AccountCreateResult> {
  __resultType?: AccountCreateResult
  constructor(public data: AccountCreatePayload) {}
}

export interface TransactionCreatePayload {
  transaction: TransactionBase
  userId: number
  acknowledgmentId?: string // For WebSocket acknowledgment
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
  transactionId: number
  updates: Partial<TransactionBase>
  userId: number
  acknowledgmentId?: string // For WebSocket acknowledgment
}

export interface TransactionUpdateResult {
  transaction: Transaction
  originalTransaction: Transaction
}

export class TransactionUpdateCommand
  implements Command<TransactionUpdatePayload, TransactionUpdateResult> {
  __resultType?: TransactionUpdateResult
  constructor(public data: TransactionUpdatePayload) {}
}

export interface TransactionDeletePayload {
  transactionId: number
  userId: number
  acknowledgmentId?: string // For WebSocket acknowledgment
}

export interface TransactionDeleteResult {
  transaction: Transaction
}

export class TransactionDeleteCommand
  implements Command<TransactionDeletePayload, TransactionDeleteResult> {
  __resultType?: TransactionDeleteResult
  constructor(public data: TransactionDeletePayload) {}
}

// #region Transaction Undelete
export interface TransactionUndeletePayload {
  transactionId: number
  userId: number
  acknowledgmentId?: string // For WebSocket acknowledgment
}

export interface TransactionUndeleteResult {
  transaction: Transaction
}

export class TransactionUndeleteCommand
  implements Command<TransactionUndeletePayload, TransactionUndeleteResult> {
  __resultType?: TransactionUndeleteResult
  constructor(public data: TransactionUndeletePayload) {}
}
// #endregion Transaction Undelete

export interface CategoryCreatePayload {
  category: CategoryBase
  userId: number
  acknowledgmentId?: string // For WebSocket acknowledgment
}

export interface CategoryCreateResult {
  category: Category
}

export class CategoryCreateCommand implements Command<CategoryCreatePayload, CategoryCreateResult> {
  __resultType?: CategoryCreateResult
  constructor(public data: CategoryCreatePayload) {}
}
