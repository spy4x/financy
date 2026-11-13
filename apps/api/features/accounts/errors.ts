import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import { AccountError, type AccountErrorCode, AccountVersionConflictError } from "@domain/accounts"
import { AccessError } from "@domain/identity"
import type { APIContext } from "../../_types.ts"
import { codeForStatus, errorResponse, fieldsOf } from "../../services/error-response.ts"

export type AccountFeatureErrorCode =
  | AccountErrorCode
  | "AUTH_REQUIRED"
  | "INTERNAL_ERROR"
  | "MFA_REQUIRED"

/** A refusal the REST route makes itself, before anything is dispatched. */
export class AccountFeatureError extends Error {
  constructor(
    public readonly code: AccountFeatureErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "AccountFeatureError"
  }
}

interface ErrorDefinition {
  status: ContentfulStatusCode
  message: string
}

const ERROR_DEFINITIONS: Record<AccountFeatureErrorCode, ErrorDefinition> = {
  ACCOUNT_ARCHIVED: { status: 409, message: "An archived account cannot be the default" },
  ACCOUNT_HAS_TRANSACTIONS: {
    status: 409,
    message: "The account has entries: archive it instead, or delete its entries first",
  },
  ACCOUNT_HAS_RECURRING_RULES: {
    status: 409,
    message: "Repeating entries use the account: archive it instead, or delete them first",
  },
  ACCOUNT_LIMIT_REACHED: { status: 409, message: "The household cannot hold more accounts" },
  ACCOUNT_NOT_FOUND: { status: 404, message: "Account not found" },
  AUTH_REQUIRED: { status: 401, message: "Authentication required" },
  CURRENCY_KIND_MISMATCH: {
    status: 400,
    message: "A crypto account holds a listed coin, and only a crypto account can",
  },
  CURRENCY_LOCKED: { status: 409, message: "The account's currency is fixed once it has entries" },
  GROUP_NOT_FOUND: { status: 404, message: "Group not found" },
  ID_ALREADY_EXISTS: { status: 409, message: "Account id is already in use" },
  INTERNAL_ERROR: { status: 500, message: "Internal server error" },
  INVALID_REQUEST: { status: 400, message: "Request is invalid" },
  MFA_REQUIRED: { status: 401, message: "Complete MFA to access accounts" },
  ROLE_INSUFFICIENT: { status: 403, message: "Only an editor can change accounts" },
  VERSION_CONFLICT: { status: 409, message: "The account was changed by someone else" },
}

/** The JSON error of the account route. A version conflict also carries `currentVersion`. */
export function accountErrorResponse(c: Context<APIContext>, error: unknown): Response {
  const code: AccountFeatureErrorCode =
    error instanceof AccountFeatureError || error instanceof AccountError ||
      error instanceof AccessError
      ? error.code
      : "INTERNAL_ERROR"
  const definition = ERROR_DEFINITIONS[code]
  return errorResponse(c, codeForStatus(definition.status), {
    message: definition.message,
    reason: code,
    status: definition.status,
    fields: fieldsOf(error),
    details: error instanceof AccountVersionConflictError
      ? { currentVersion: error.currentVersion }
      : undefined,
  })
}
