import {
  type Category,
  CategoryArchiveCommand,
  categoryArchivePayloadSchema,
  type CategoryArchiveResult,
  CategoryCreateCommand,
  categoryCreatePayloadSchema,
  categoryGetPayloadSchema,
  CategoryGetQuery,
  categoryListPayloadSchema,
  CategoryListQuery,
  CategoryUpdateCommand,
  categoryUpdatePayloadSchema,
  type CategoryWriteResult,
  parseCategoryRequest,
} from "@domain/categories"
import type { Actor } from "@domain/identity"
import type { Operations } from "@spy4x/realtime/operations"

/** What the category requests need from the app: the buses. */
export interface CategoryOperationDependencies {
  create(command: CategoryCreateCommand): Promise<CategoryWriteResult>
  update(command: CategoryUpdateCommand): Promise<{ category: Category }>
  archive(command: CategoryArchiveCommand): Promise<CategoryArchiveResult>
  get(query: CategoryGetQuery): Promise<{ category: Category }>
  list(query: CategoryListQuery): Promise<{ categories: Category[] }>
}

/**
 * The category commands and queries, listed once. The socket and `POST /api/call/<name>` both
 * serve this list, so a category has no REST route per command. Each one parses its payload and
 * dispatches on the bus; who may do what is decided in the handlers.
 */
export function createCategoryOperations(
  dependencies: CategoryOperationDependencies,
): Operations<Actor> {
  return {
    "category.create": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseCategoryRequest(categoryCreatePayloadSchema, payload)
        return await dependencies.create(
          new CategoryCreateCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "category.update": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseCategoryRequest(categoryUpdatePayloadSchema, payload)
        return await dependencies.update(
          new CategoryUpdateCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "category.archive": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseCategoryRequest(categoryArchivePayloadSchema, payload)
        return await dependencies.archive(
          new CategoryArchiveCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "category.get": {
      kind: "query",
      handle: async ({ actor, payload }) => {
        const input = parseCategoryRequest(categoryGetPayloadSchema, payload)
        return await dependencies.get(new CategoryGetQuery({ actor, ...input }))
      },
    },
    "category.list": {
      kind: "query",
      handle: async ({ actor, payload }) => {
        const input = parseCategoryRequest(categoryListPayloadSchema, payload)
        return await dependencies.list(new CategoryListQuery({ actor, ...input }))
      },
    },
  }
}
