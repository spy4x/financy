import { configure } from "arktype/config"
configure({ onUndeclaredKey: "delete" }) // delete all fields that are not in the schema
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
): { error: null; value: T["infer"] } | {
  error: {
    description: string
    details: type.errors
  }
  value: null
} {
  const result = schema(value)
  if (result instanceof type.errors) {
    return {
      error: {
        description: result.summary,
        details: result,
      },
      value: null,
    }
  } else {
    return {
      error: null,
      value: result as T["infer"], // Type assertion needed here
    }
  }
}
// #endregion Helpers

// #region Base Types

export const DateSchema = type(
  "Date | string.date.iso.parse",
)
export type DateType = typeof DateSchema.infer
export const DateNullableSchema = DateSchema.or("null").default(null)

export const ImmutableBaseModelSchema = type({
  //   "+": "delete", // delete all fields that are not in the schema
  id: "number",
  createdAt: DateSchema,
})
export const UndeletableBaseModelSchema = ImmutableBaseModelSchema.and({
  updatedAt: DateSchema,
})
export const BaseModelSchema = UndeletableBaseModelSchema.and({
  deletedAt: DateNullableSchema,
})
export type BaseModel = typeof BaseModelSchema.infer

// #endregion Base Types

export enum UserRole { //TODO: rethink roles as user.role
  VIEWER = 0,
  OPERATOR = 1,
  SUPERVISOR = 2,
  ADMIN = 3,
}
export const userRoleValues = Object.values(UserRole)
export enum UserMFAStatus {
  NOT_CONFIGURED = 1,
  CONFIGURATION_NOT_FINISHED = 2,
  CONFIGURED = 3,
}
export const userMFAStatusValues = Object.values(
  UserMFAStatus,
) as UserMFAStatus[]
export const NAME_MAX_LENGTH = 50
export const UserBaseSchema = type({
  firstName: `string <= ${NAME_MAX_LENGTH}`,
  lastName: `string <= ${NAME_MAX_LENGTH}`,
  lastLoginAt: DateSchema,
  mfa: type.enumerated(...userMFAStatusValues).default(
    UserMFAStatus.NOT_CONFIGURED,
  ),
  role: type.enumerated(...userRoleValues).default(UserRole.VIEWER),
})
export type UserBase = typeof UserBaseSchema.infer

export const userSchema = BaseModelSchema.and(UserBaseSchema)
export type User = typeof userSchema.infer

export const userUpdateSchema = UserBaseSchema.pick("firstName", "lastName")
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
  USERNAME_PASSWORD = 0,
  USERNAME_2FA_CONNECTING = 1,
  USERNAME_2FA_COMPLETED = 2,
}
export const userKeyKindValues = Object.values(UserKeyKind)

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

export const userSessionStatusValues = Object.values(UserSessionStatus)
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
  mfa: type.enumerated(...Object.values(SessionMFAStatus)).default(
    SessionMFAStatus.NOT_REQUIRED,
  ),
  expiresAt: DateSchema.default(() => new Date()),
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

// #region Sync
// TODO: Actualize sync functionality
export type SyncModel = User

export enum SyncModelName {
  user = "user",
}

export const SYNC_MODELS = [
  SyncModelName.user,
] as const

export enum WebSocketMessageType {
  PING = "ping",
  PONG = "pong",
  MESSAGE = "message",
  LIST = "list",
  SYNC_START = "start",
  SYNC_FINISHED = "finished",
  CREATED = "created",
  UPDATED = "updated",
  DELETED = "deleted",
}
export const webSocketMessageSchema = type({
  /** Entity: "system" or one of database models, like "zone", "lampBox" or "zoneLampBox" */
  e: "string",
  /** Type */
  t: type.enumerated(...Object.values(WebSocketMessageType)),
  /** Payload: Array of Entity data, has to be parsed with a model schema, because whole websocket message was stringified */
  p: "unknown[]?",
  /** Acknowledgement id */
  id: "string?",
})
export type WebSocketMessage = typeof webSocketMessageSchema.infer
// #endregion Sync
