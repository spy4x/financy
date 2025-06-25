import { configure } from "arktype/config"
// configure MUST be called before importing Arktype
// This configures Arktype to throw an error when undeclared keys are encountered
configure({ onUndeclaredKey: "reject", onDeepUndeclaredKey: "reject" }) // TODO: this is not respected for some reason, need to investigate
import { Type, type } from "arktype" // The core arktype import must be AFTER the config has been set

// #region Helpers
export { type }
export type ValidationSchema = Type

// #region Currency Types
export type { Currency, CurrencyType } from "./currency.ts"

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
  defaultCurrency: "string == 3 = 'USD'",
})
export type GroupBase = typeof groupBaseSchema.infer
export const groupSchema = BaseModelSchema.and(groupBaseSchema)
export type Group = typeof groupSchema.infer
export const groupUpdateSchema = groupSchema.pick("id", "name", "defaultCurrency")
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
  currency: "string == 3 = 'USD'",
  balance: "number = 0",
})
export type AccountBase = typeof accountBaseSchema.infer
export const accountSchema = BaseModelSchema.and(accountBaseSchema)
export type Account = typeof accountSchema.infer
export const accountUpdateSchema = accountSchema.pick("id", "name", "currency")
export type AccountUpdate = typeof accountUpdateSchema.infer
// #endregion Account

// #region Category
export const categoryBaseSchema = type({
  name: `string <= ${NAME_MAX_LENGTH} = ''`,
  groupId: "number > 0",
  "monthlyLimit?": "number >= 0",
})
export type CategoryBase = typeof categoryBaseSchema.infer
export const categorySchema = BaseModelSchema.and(categoryBaseSchema)
export type Category = typeof categorySchema.infer
export const categoryUpdateSchema = categorySchema.pick("id", "name", "monthlyLimit")
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
export enum TransactionType {
  DEBIT = 1,
  CREDIT = 2,
}

/**
 * Transaction type utility functions
 */
export const TransactionTypeUtils = {
  /**
   * Get human-readable transaction type name
   */
  toString: (type: TransactionType): string => {
    switch (type) {
      case TransactionType.DEBIT:
        return "Debit"
      case TransactionType.CREDIT:
        return "Credit"
      default:
        return "Unknown"
    }
  },

  /**
   * Check if transaction type is debit (money going out)
   */
  isDebit: (type: TransactionType): boolean => type === TransactionType.DEBIT,

  /**
   * Check if transaction type is credit (money coming in)
   */
  isCredit: (type: TransactionType): boolean => type === TransactionType.CREDIT,
}

export const transactionBaseSchema = type({
  amount: "number = 0",
  memo: "string <= 500 = ''",
  type: type.enumerated(...Object.values(TransactionType) as TransactionType[]).default(
    TransactionType.CREDIT,
  ),
  categoryId: "number > 0",
  originalCurrency: "string == 3 = 'USD'",
  originalAmount: "number = 0",
  groupId: "number > 0",
  accountId: "number > 0",
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
  "type",
  "categoryId",
  "originalCurrency",
  "originalAmount",
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
