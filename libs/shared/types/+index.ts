import { configure } from "arktype/config"
// configure MUST be called before importing Arktype
// This configures Arktype to throw an error when undeclared keys are encountered
configure({ onUndeclaredKey: "reject", onDeepUndeclaredKey: "reject" }) // TODO: this is not respected for some reason, need to investigate
import { Type, type } from "arktype" // The core arktype import must be AFTER the config has been set

// #region Helpers
export { type }
export type ValidationSchema = Type

/**
 * Validate a value against a schema.
 * @param schema The schema to validate against.
 * @param value The value to validate.
 * @returns An error or a valid value.
 */
export function validate<T extends Type>(
  schema: T,
  value: unknown,
): { error: null; data: T["infer"] } | {
  error: {
    description: string
    details: type.errors
  }
  data: null
} {
  const result = schema(value)
  if (result instanceof type.errors) {
    return {
      error: {
        description: result.summary,
        details: result,
      },
      data: null,
    }
  } else {
    return {
      error: null,
      data: result as T["infer"], // Type assertion needed here
    }
  }
}
// #endregion Helpers

// #region State
export type OperationState<T, E = unknown> = {
  inProgress: boolean
  result: null | T
  error: null | E
}
export function op<T, E = unknown>(
  inProgress: boolean = false,
  result: T | null = null,
  error: E | null = null,
): OperationState<T, E> {
  return {
    inProgress,
    result,
    error,
  }
}
export type OperationResult<T, E = unknown> = { error: null; result: T } | {
  error: E
  result: null
}
// #endregion State

// #region Base Types

export const dateSchema = type(
  "Date | string.date.iso.parse",
)
export type DateType = typeof dateSchema.infer
export const DateNullableSchema = dateSchema.or("null").default(null)

export const ImmutableBaseModelSchema = type({
  id: "number",
  createdAt: dateSchema,
})
export const UndeletableBaseModelSchema = ImmutableBaseModelSchema.and({
  updatedAt: dateSchema,
})
export const BaseModelSchema = UndeletableBaseModelSchema.and({
  deletedAt: DateNullableSchema,
})
export type BaseModel = typeof BaseModelSchema.infer

// #endregion Base Types

// #region Currency Types
export enum CurrencyType {
  FIAT = 1,
  CRYPTO = 2,
}

export const currencyBaseSchema = type({
  code: "string <= 10",
  name: "string <= 100",
  "symbol?": "string <= 10 | null",
  type: type.enumerated(...Object.values(CurrencyType) as CurrencyType[]).default(
    CurrencyType.FIAT,
  ),
  decimalPlaces: "number >= 0 = 2",
})
export type CurrencyBase = typeof currencyBaseSchema.infer

export const currencySchema = BaseModelSchema.and(currencyBaseSchema)
export type Currency = typeof currencySchema.infer

export const currencyUpdateSchema = currencyBaseSchema.pick(
  "name",
  "symbol",
  "type",
  "decimalPlaces",
)
export type CurrencyUpdate = typeof currencyUpdateSchema.infer
// #endregion Currency Types

export enum ItemStatus {
  ACTIVE = "active",
  DELETED = "deleted",
  ALL = "all",
}
export const itemStatusValues = Object.values(ItemStatus) as ItemStatus[]

/**
 * Item status utility functions
 */
export const ItemStatusUtils = {
  /**
   * Check if an item matches the filter status
   */
  matches: (item: { deletedAt: Date | null }, status: ItemStatus): boolean => {
    switch (status) {
      case ItemStatus.ACTIVE:
        return !item.deletedAt
      case ItemStatus.DELETED:
        return !!item.deletedAt
      case ItemStatus.ALL:
        return true
      default:
        return true
    }
  },

  /**
   * Get human-readable status name
   */
  toString: (status: ItemStatus): string => {
    switch (status) {
      case ItemStatus.ACTIVE:
        return "Active"
      case ItemStatus.DELETED:
        return "Deleted"
      case ItemStatus.ALL:
        return "All"
      default:
        return "Unknown"
    }
  },
}

export enum UserRole { //TODO: rethink roles as user.role
  VIEWER = 1,
  OPERATOR = 2,
  SUPERVISOR = 3,
  ADMIN = 4,
}
export const userRoleValues = Object.values(UserRole) as UserRole[]

export enum GroupRole {
  VIEWER = 1,
  EDITOR = 2,
  ADMIN = 3,
  OWNER = 4,
}
export const groupRoleValues = Object.values(GroupRole) as GroupRole[]

/**
 * Group role utility functions
 */
export const GroupRoleUtils = {
  /**
   * Check if a role can edit transactions and categories
   */
  canEdit: (role: GroupRole): boolean => role >= GroupRole.EDITOR,

  /**
   * Check if a role can manage group settings and members
   */
  canManage: (role: GroupRole): boolean => role >= GroupRole.ADMIN,

  /**
   * Check if a role can delete the group
   */
  canDelete: (role: GroupRole): boolean => role === GroupRole.OWNER,

  /**
   * Get human-readable role name
   */
  toString: (role: GroupRole): string => {
    switch (role) {
      case GroupRole.VIEWER:
        return "Viewer"
      case GroupRole.EDITOR:
        return "Editor"
      case GroupRole.ADMIN:
        return "Admin"
      case GroupRole.OWNER:
        return "Owner"
      default:
        return "Unknown"
    }
  },
}

export enum UserMFAStatus {
  NOT_CONFIGURED = 1,
  CONFIGURATION_NOT_FINISHED = 2,
  CONFIGURED = 3,
}
export const userMFAStatusValues = Object.values(
  UserMFAStatus,
) as UserMFAStatus[]
export const NAME_MAX_LENGTH = 50
export const userBaseSchema = type({
  firstName: `string <= ${NAME_MAX_LENGTH} = ''`,
  lastName: `string <= ${NAME_MAX_LENGTH} = ''`,
  lastLoginAt: dateSchema.default(() => new Date()),
  mfa: type.enumerated(...userMFAStatusValues).default(
    UserMFAStatus.NOT_CONFIGURED,
  ),
  role: type.enumerated(...userRoleValues).default(UserRole.VIEWER),
})
export type UserBase = typeof userBaseSchema.infer

export const userSchema = BaseModelSchema.and(userBaseSchema)
export type User = typeof userSchema.infer

export const userUpdateSchema = userBaseSchema.pick("firstName", "lastName")
export type UserUpdate = typeof userUpdateSchema.infer

// #region Auth
export const authOTPSchema = type({
  otp: "string.numeric == 6",
})
export type AuthOTP = typeof authOTPSchema.infer

export const authUsernameSchema = type({
  username: "string <= 50",
})
export type AuthUsername = typeof authUsernameSchema.infer

export const authPasswordSchema = type({
  password: "8 <= string <= 50",
})
export type AuthPassword = typeof authPasswordSchema.infer

export const authUsernamePasswordSchema = authUsernameSchema.and(
  authPasswordSchema,
)
export type AuthUsernamePassword = typeof authUsernamePasswordSchema.infer

export const authPasswordChangeSchema = authPasswordSchema.and({
  newPassword: "8 <= string <= 50",
})
export type AuthPasswordChange = typeof authPasswordChangeSchema.infer

export enum UserKeyKind {
  USERNAME_PASSWORD = 1,
  USERNAME_2FA_CONNECTING = 2,
  USERNAME_2FA_COMPLETED = 3,
}
export const userKeyKindValues = Object.values(UserKeyKind) as UserKeyKind[]

export enum SessionMFAStatus {
  NOT_REQUIRED = 1,
  NOT_PASSED_YET = 2,
  COMPLETED = 3,
}

export enum UserSessionStatus {
  ACTIVE = 1,
  EXPIRED = 2,
  SIGNED_OUT = 3,
}

export const userSessionStatusValues = Object.values(UserSessionStatus) as UserSessionStatus[]
export const userKeyBaseSchema = type({
  userId: "number = 0",
  kind: type.enumerated(...userKeyKindValues).default(
    UserKeyKind.USERNAME_PASSWORD,
  ),
  identification: "string <= 50 = ''",
  secret: "string <= 60 | null = null",
})
export type UserKeyBase = typeof userKeyBaseSchema.infer

export const userKeySchema = BaseModelSchema.and(userKeyBaseSchema)
export type UserKey = typeof userKeySchema.infer

export const userKeyPublicSchema = userKeySchema.omit("secret")
export type UserKeyPublic = typeof userKeyPublicSchema.infer

export const userSessionBaseSchema = type({
  token: "string <= 32 = ''",
  userId: "number = 0",
  keyId: "number = 0",
  status: type.enumerated(...userSessionStatusValues).default(
    UserSessionStatus.ACTIVE,
  ),
  mfa: type.enumerated(...Object.values(SessionMFAStatus) as SessionMFAStatus[]).default(
    SessionMFAStatus.NOT_REQUIRED,
  ),
  expiresAt: dateSchema.default(() => new Date()),
})
export type UserSessionBase = typeof userSessionBaseSchema.infer

export const userSessionSchema = UndeletableBaseModelSchema.and(
  userSessionBaseSchema,
)
export type UserSession = typeof userSessionSchema.infer

export const userSessionPublicSchema = userSessionSchema.omit("token", "keyId")
export type UserSessionPublic = typeof userSessionPublicSchema.infer

export const userPushTokenSchemaBase = type({
  userId: "number = 0",
  deviceId: "string <= 256 = ''",
  endpoint: "string <= 256 = ''",
  auth: "string <= 256 = ''",
  p256dh: "string <= 256 = ''",
})
export type UserPushTokenBase = typeof userPushTokenSchemaBase.infer

export const userPushTokenSchema = BaseModelSchema.and(userPushTokenSchemaBase)
export type UserPushToken = typeof userPushTokenSchema.infer
// #endregion Auth

// #region Group
export const groupBaseSchema = type({
  name: `string <= ${NAME_MAX_LENGTH} = ''`,
  currencyId: "number > 0",
})
export type GroupBase = typeof groupBaseSchema.infer
export const groupSchema = BaseModelSchema.and(groupBaseSchema)
export type Group = typeof groupSchema.infer
export const groupUpdateSchema = groupSchema.pick("id", "name", "currencyId")
export type GroupUpdate = typeof groupUpdateSchema.infer
// #endregion Group

// #region Group Membership
export const groupMembershipBaseSchema = type({
  userId: "number > 0",
  groupId: "number > 0",
  role: type.enumerated(...groupRoleValues).default(GroupRole.VIEWER),
})
export type GroupMembershipBase = typeof groupMembershipBaseSchema.infer
export const groupMembershipSchema = BaseModelSchema.and(
  groupMembershipBaseSchema,
)
export type GroupMembership = typeof groupMembershipSchema.infer
export const groupMembershipUpdateSchema = groupMembershipBaseSchema.pick(
  "role",
)
export type GroupMembershipUpdate = typeof groupMembershipUpdateSchema.infer
// #endregion Group Membership

// #region Account
export const accountBaseSchema = type({
  name: `string <= ${NAME_MAX_LENGTH} = ''`,
  groupId: "number > 0",
  currencyId: "number > 0",
  startingBalance: "number = 0",
})
export type AccountBase = typeof accountBaseSchema.infer
export const accountSchema = BaseModelSchema.and(accountBaseSchema)
export type Account = typeof accountSchema.infer
export const accountUpdateSchema = accountSchema.pick("id", "name", "currencyId", "startingBalance")
export type AccountUpdate = typeof accountUpdateSchema.infer
// #endregion Account

// #region Category
export enum CategoryType {
  EXPENSE = 1,
  INCOME = 2,
}

/**
 * Category type utility functions
 */
export const CategoryTypeUtils = {
  /**
   * Get human-readable category type name
   */
  toString: (type: CategoryType): string => {
    switch (type) {
      case CategoryType.EXPENSE:
        return "Expense"
      case CategoryType.INCOME:
        return "Income"
      default:
        return "Unknown"
    }
  },

  /**
   * Check if category type is expense
   */
  isExpense: (type: CategoryType): boolean => type === CategoryType.EXPENSE,

  /**
   * Check if category type is income
   */
  isIncome: (type: CategoryType): boolean => type === CategoryType.INCOME,
}

export const categoryBaseSchema = type({
  name: `string <= ${NAME_MAX_LENGTH} = ''`,
  groupId: "number > 0",
  type: type.enumerated(...Object.values(CategoryType) as CategoryType[]).default(
    CategoryType.EXPENSE,
  ),
  "monthlyLimit?": "number >= 0 | null",
  "icon?": "string <= 10 | null",
  "color?": "string <= 7 | null",
})
export type CategoryBase = typeof categoryBaseSchema.infer
export const categorySchema = BaseModelSchema.and(categoryBaseSchema)
export type Category = typeof categorySchema.infer
export const categoryUpdateSchema = categorySchema.pick(
  "id",
  "name",
  "type",
  "monthlyLimit",
  "icon",
  "color",
)
export type CategoryUpdate = typeof categoryUpdateSchema.infer
// #endregion Category

// #region Tag
export const tagBaseSchema = type({
  name: `string <= ${NAME_MAX_LENGTH} = ''`,
})
export type TagBase = typeof tagBaseSchema.infer
export const tagSchema = BaseModelSchema.and(tagBaseSchema)
export type Tag = typeof tagSchema.infer
export const tagUpdateSchema = tagBaseSchema.pick("name")
export type TagUpdate = typeof tagUpdateSchema.infer
// #endregion Tag

// #region Transaction
/**
 * Transaction direction: money flow relative to account
 */
export enum TransactionDirection {
  MONEY_OUT = 1,
  MONEY_IN = 2,
}

/**
 * Transaction type: business semantics
 */
export enum TransactionType {
  EXPENSE = 1,
  INCOME = 2,
  TRANSFER = 3,
}

/**
 * Transaction type utility functions
 */
export const TransactionUtils = {
  /**
   * Get human-readable transaction type name
   */
  toString: (type: TransactionType): string => {
    switch (type) {
      case TransactionType.EXPENSE:
        return "Expense"
      case TransactionType.INCOME:
        return "Income"
      case TransactionType.TRANSFER:
        return "Transfer"
      default:
        return "Unknown"
    }
  },

  /**
   * Check if transaction direction is money out
   */
  isMoneyOut: (direction: TransactionDirection): boolean =>
    direction === TransactionDirection.MONEY_OUT,

  /**
   * Check if transaction direction is money in
   */
  isMoneyIn: (direction: TransactionDirection): boolean =>
    direction === TransactionDirection.MONEY_IN,

  /**
   * Check if transaction type is transfer (between accounts)
   */
  isTransfer: (type: TransactionType): boolean => type === TransactionType.TRANSFER,

  /**
   * Check if transaction affects profit/loss reporting
   */
  affectsProfitLoss: (type: TransactionType): boolean => type !== TransactionType.TRANSFER,

  /**
   * Validate transaction field constraints based on type
   */
  validateFields: (transaction: Partial<TransactionBase>): string | null => {
    if (!transaction.type) return "Transaction type is required"

    if (transaction.type === TransactionType.TRANSFER) {
      // For transfers: linkedTransactionCode will be set after creation, categoryId must be null
      if (transaction.categoryId != null) {
        return "Transfer transactions cannot have categoryId"
      }
    } else {
      // For expense/income: categoryId must be set, linkedTransactionCode must be null
      if (!transaction.categoryId) {
        return "Transactions require categoryId"
      }
      if (transaction.linkedTransactionCode != null) {
        return "Transactions cannot have linkedTransactionCode"
      }
    }

    return null // Valid
  },

  /**
   * Auto-determine direction from transaction type
   */
  getDirectionFromType: (type: TransactionType): TransactionDirection => {
    switch (type) {
      case TransactionType.EXPENSE:
        return TransactionDirection.MONEY_OUT
      case TransactionType.INCOME:
        return TransactionDirection.MONEY_IN
      case TransactionType.TRANSFER:
        // For transfers, direction depends on perspective (source vs destination)
        // This should be handled at the transaction creation level
        return TransactionDirection.MONEY_OUT // Default to source perspective
      default:
        return TransactionDirection.MONEY_OUT
    }
  },
}

export const transactionBaseSchema = type({
  amount: "number = 0",
  memo: "string <= 500 = ''",
  // Direction of money flow relative to account (optional - auto-determined from type)
  "direction?": "1 | 2 | undefined", // TransactionDirection enum values (1=MONEY_OUT, 2=MONEY_IN)
  // Business type of transaction
  type: type.enumerated(...Object.values(TransactionType) as TransactionType[]).default(
    TransactionType.EXPENSE,
  ),
  "categoryId?": "number > 0 | null", // Nullable for transfers
  "originalCurrencyId?": "number > 0 | undefined",
  originalAmount: "number = 0",
  groupId: "number > 0",
  accountId: "number > 0",
  "linkedTransactionCode?": "string <= 10 | null", // For linking transfer pairs
  timestamp: dateSchema.default(() => new Date()),
})
export type TransactionBase = typeof transactionBaseSchema.infer
export const transactionCreateSchema = transactionBaseSchema.and(type({
  createdBy: "number > 0",
}))
export type TransactionCreate = typeof transactionCreateSchema.infer
export const transactionSchema = BaseModelSchema.and(transactionCreateSchema)
export type Transaction = typeof transactionSchema.infer
export const transactionUpdateSchema = transactionSchema.pick(
  "id",
  "amount",
  "memo",
  "direction",
  "type",
  "categoryId",
  "originalCurrencyId",
  "originalAmount",
  "accountId",
  "linkedTransactionCode",
  "timestamp",
)
export type TransactionUpdate = typeof transactionUpdateSchema.infer
// #endregion Transaction

// #region Sync
// TODO: Actualize sync functionality
export type SyncModel =
  | User
  | Transaction
  | Account
  | Category
  | Currency
  | Tag
  | Group
  | GroupMembership
  | UserKey
  | UserSession
  | UserPushToken

export enum SyncModelName {
  user = "user",
  group = "group",
  groupMembership = "groupMembership",
  account = "account",
  category = "category",
  currency = "currency",
  transaction = "transaction",
  tag = "tag",
  // transactionToTag = "transactionToTag",
  // groupToTag = "groupToTag",
  // userKey = "userKey",
  // userSession = "userSession",
  // userPushToken = "userPushToken",
}

export const SYNC_MODELS = [
  SyncModelName.user,
  SyncModelName.group,
  SyncModelName.groupMembership,
  SyncModelName.account,
  SyncModelName.category,
  SyncModelName.currency,
  SyncModelName.tag,
  SyncModelName.transaction,
  // SyncModelName.transactionToTag,
  // SyncModelName.groupToTag,
  // SyncModelName.userKey,
  // SyncModelName.userSession,
  // SyncModelName.userPushToken,
] as const

export enum WSStatus {
  CONNECTING = 1,
  CONNECTED = 2,
  DISCONNECTED = 3,
}

export enum WebSocketMessageType {
  PING = "ping",
  PONG = "pong",
  MESSAGE = "message",
  LIST = "list",
  SYNC_START = "start",
  SYNC_FINISHED = "finished",
  CREATE = "create",
  CREATED = "created",
  UPDATE = "update",
  UPDATED = "updated",
  DELETE = "delete",
  DELETED = "deleted",
  UNDELETE = "undelete",
  TRANSFER = "transfer",
  ERROR_VALIDATION = "error_validation",
}

export const webSocketMessageSchema = type({
  /** Entity: "system" or one of database models, like "zone", "lampBox" or "zoneLampBox" */
  e: "string",
  /** Type */
  t: type.enumerated(...Object.values(WebSocketMessageType) as WebSocketMessageType[]),
  /** Payload: Array of Entity data, has to be parsed with a model schema, because whole websocket message was stringified */
  p: "unknown[]?",
  /** Acknowledgement id */
  id: "string?",
})
export type WebSocketMessage = typeof webSocketMessageSchema.infer
// #endregion Sync
