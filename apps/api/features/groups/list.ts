import { GroupError, GroupListPageKey, GroupListQuery, GroupListResult } from "@domain/groups"
import type { Actor } from "@domain/identity"

/** What listing groups needs from the app. */
export interface GroupListDependencies {
  list(query: GroupListQuery): Promise<GroupListResult>
  cursor: {
    encode(userId: number, pageKey: GroupListPageKey): Promise<string>
    decode(cursor: string, expectedUserId: number): Promise<GroupListPageKey>
  }
}

/** The page size when a `group.list` query names none, and the most it may ask for. */
export const DEFAULT_LIST_LIMIT = 50
export const MAX_LIST_LIMIT = 100

/**
 * One page of the actor's groups, in the shape `GET /api/groups` answers with. The REST route and
 * the socket call this, so the two cannot drift apart.
 */
export async function listGroupsPage(
  dependencies: GroupListDependencies,
  actor: Actor,
  page: { limit: number; cursor?: string },
) {
  const after = page.cursor
    ? await dependencies.cursor.decode(page.cursor, actor.userId)
    : undefined
  const result = await dependencies.list(
    new GroupListQuery({ actor, page: { limit: page.limit, after } }),
  )
  const nextCursor = result.nextPageKey
    ? await dependencies.cursor.encode(actor.userId, result.nextPageKey)
    : null
  return { groups: result.groups, nextCursor }
}

/**
 * The `group.list` payload: `{ limit?: 1..100, cursor?: string }`, or nothing for the first page.
 * Throws `GroupError("INVALID_REQUEST")` for anything else, which the socket answers `bad_request`.
 */
export function parseListPayload(payload: unknown): { limit: number; cursor?: string } {
  if (payload === undefined || payload === null) return { limit: DEFAULT_LIST_LIMIT }
  if (typeof payload !== "object" || Array.isArray(payload)) {
    throw new GroupError("INVALID_REQUEST", "Expected an object with an optional limit and cursor")
  }
  const { limit, cursor, ...rest } = payload as Record<string, unknown>
  if (Object.keys(rest).length > 0) {
    throw new GroupError("INVALID_REQUEST", "Expected only limit and cursor")
  }
  if (
    limit !== undefined &&
    (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > MAX_LIST_LIMIT)
  ) {
    throw new GroupError("INVALID_REQUEST", "Group list limit is invalid")
  }
  if (cursor !== undefined && (typeof cursor !== "string" || cursor.length === 0)) {
    throw new GroupError("INVALID_REQUEST", "Group list cursor is invalid")
  }
  return { limit: (limit as number | undefined) ?? DEFAULT_LIST_LIMIT, cursor: cursor as string }
}
