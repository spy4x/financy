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
  User,
  UserBase,
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

// #region Category Update
export interface CategoryUpdatePayload {
  categoryId: number
  updates: Partial<CategoryBase>
  userId: number
  acknowledgmentId?: string
}

export interface CategoryUpdateResult {
  category: Category
}

export class CategoryUpdateCommand implements Command<CategoryUpdatePayload, CategoryUpdateResult> {
  __resultType?: CategoryUpdateResult
  constructor(public data: CategoryUpdatePayload) {}
}
// #endregion Category Update

// #region Category Delete
export interface CategoryDeletePayload {
  categoryId: number
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
// #endregion Category Delete

// #region Category Undelete
export interface CategoryUndeletePayload {
  categoryId: number
  userId: number
  acknowledgmentId?: string
}

export interface CategoryUndeleteResult {
  category: Category
}

export class CategoryUndeleteCommand
  implements Command<CategoryUndeletePayload, CategoryUndeleteResult> {
  __resultType?: CategoryUndeleteResult
  constructor(public data: CategoryUndeletePayload) {}
}
// #endregion Category Undelete

// #region Group Update
export interface GroupUpdatePayload {
  groupId: number
  updates: Partial<GroupBase>
  userId: number
  acknowledgmentId?: string
}

export interface GroupUpdateResult {
  group: Group
}

export class GroupUpdateCommand implements Command<GroupUpdatePayload, GroupUpdateResult> {
  __resultType?: GroupUpdateResult
  constructor(public data: GroupUpdatePayload) {}
}
// #endregion Group Update

// #region Group Delete
export interface GroupDeletePayload {
  groupId: number
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
// #endregion Group Delete

// #region Group Undelete
export interface GroupUndeletePayload {
  groupId: number
  userId: number
  acknowledgmentId?: string
}

export interface GroupUndeleteResult {
  group: Group
}

export class GroupUndeleteCommand implements Command<GroupUndeletePayload, GroupUndeleteResult> {
  __resultType?: GroupUndeleteResult
  constructor(public data: GroupUndeletePayload) {}
}
// #endregion Group Undelete

// #region Account Update
export interface AccountUpdatePayload {
  accountId: number
  updates: Partial<AccountBase>
  userId: number
  acknowledgmentId?: string
}

export interface AccountUpdateResult {
  account: Account
}

export class AccountUpdateCommand implements Command<AccountUpdatePayload, AccountUpdateResult> {
  __resultType?: AccountUpdateResult
  constructor(public data: AccountUpdatePayload) {}
}
// #endregion Account Update

// #region Account Delete
export interface AccountDeletePayload {
  accountId: number
  userId: number
  acknowledgmentId?: string
}

export interface AccountDeleteResult {
  account: Account
}

export class AccountDeleteCommand implements Command<AccountDeletePayload, AccountDeleteResult> {
  __resultType?: AccountDeleteResult
  constructor(public data: AccountDeletePayload) {}
}
// #endregion Account Delete

// #region Account Undelete
export interface AccountUndeletePayload {
  accountId: number
  userId: number
  acknowledgmentId?: string
}

export interface AccountUndeleteResult {
  account: Account
}

export class AccountUndeleteCommand
  implements Command<AccountUndeletePayload, AccountUndeleteResult> {
  __resultType?: AccountUndeleteResult
  constructor(public data: AccountUndeletePayload) {}
}
// #endregion Account Undelete

// #region Account Transfer
export interface AccountTransferPayload {
  fromAccountId: number
  toAccountId: number
  amount: number
  memo?: string
  timestamp?: Date // Optional transaction timestamp, defaults to now
  userId: number
  acknowledgmentId?: string
}

export interface AccountTransferResult {
  fromTransaction: Transaction
  toTransaction: Transaction
}

export class AccountTransferCommand
  implements Command<AccountTransferPayload, AccountTransferResult> {
  __resultType?: AccountTransferResult
  constructor(public data: AccountTransferPayload) {}
}
// #endregion Account Transfer

// #region User Update
export interface UserUpdatePayload {
  userId: number
  updates: Partial<UserBase>
  acknowledgmentId?: string
}

export interface UserUpdateResult {
  user: User
}

export class UserUpdateCommand implements Command<UserUpdatePayload, UserUpdateResult> {
  __resultType?: UserUpdateResult
  constructor(public data: UserUpdatePayload) {}
}
// #endregion User Update
