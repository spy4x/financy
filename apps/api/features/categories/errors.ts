import type { Context } from "hono"
import type { ContentfulStatusCode } from "hono/utils/http-status"
import {
  CategoryError,
  type CategoryErrorCode,
  CategoryVersionConflictError,
} from "@domain/categories"
import { AccessError } from "@domain/identity"
import type { APIContext } from "../../_types.ts"
import { codeForStatus, errorResponse, fieldsOf } from "../../services/error-response.ts"

export type CategoryFeatureErrorCode =
  | CategoryErrorCode
  | "AUTH_REQUIRED"
  | "INTERNAL_ERROR"
  | "MFA_REQUIRED"

/** A refusal the REST route makes itself, before anything is dispatched. */
export class CategoryFeatureError extends Error {
  constructor(
    public readonly code: CategoryFeatureErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "CategoryFeatureError"
  }
}

interface ErrorDefinition {
  status: ContentfulStatusCode
  message: string
}

/** Every refusal's status and message; the field a tree refusal names rides in `fields`. */
export const CATEGORY_ERROR_DEFINITIONS: Record<CategoryFeatureErrorCode, ErrorDefinition> = {
  AUTH_REQUIRED: { status: 401, message: "Authentication required" },
  CATEGORY_LIMIT_REACHED: { status: 409, message: "The household cannot hold more categories" },
  CATEGORY_NAME_TAKEN: { status: 409, message: "A sibling category has this name" },
  CATEGORY_NOT_FOUND: { status: 404, message: "Category not found" },
  CATEGORY_PARENT_ARCHIVED: { status: 409, message: "Unarchive the parent category first" },
  CATEGORY_TREE_INVALID: { status: 409, message: "Categories nest one level deep" },
  GROUP_NOT_FOUND: { status: 404, message: "Group not found" },
  ID_ALREADY_EXISTS: { status: 409, message: "Category id is already in use" },
  INTERNAL_ERROR: { status: 500, message: "Internal server error" },
  INVALID_REQUEST: { status: 400, message: "Request is invalid" },
  MFA_REQUIRED: { status: 401, message: "Complete MFA to access categories" },
  ROLE_INSUFFICIENT: { status: 403, message: "Only an editor can change categories" },
  VERSION_CONFLICT: { status: 409, message: "The category was changed by someone else" },
}

/** The JSON error of the category route. A version conflict also carries `currentVersion`. */
export function categoryErrorResponse(c: Context<APIContext>, error: unknown): Response {
  const code: CategoryFeatureErrorCode =
    error instanceof CategoryFeatureError || error instanceof CategoryError ||
      error instanceof AccessError
      ? error.code
      : "INTERNAL_ERROR"
  const definition = CATEGORY_ERROR_DEFINITIONS[code]
  return errorResponse(c, codeForStatus(definition.status), {
    message: definition.message,
    reason: code,
    status: definition.status,
    fields: fieldsOf(error),
    details: error instanceof CategoryVersionConflictError
      ? { currentVersion: error.currentVersion }
      : undefined,
  })
}
