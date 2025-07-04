import { QueryHandler } from "@shared/cqrs/types.ts"
import { UserGroupsQuery, type UserGroupsResult } from "@api/cqrs/queries.ts"
import { db } from "@api/services/db.ts"

export const userGroupsHandler: QueryHandler<UserGroupsQuery> = async (
  query: UserGroupsQuery,
): Promise<UserGroupsResult> => {
  const { userId } = query.data

  const memberships = await db.groupMembership.findMany(userId)
  const groupIds = memberships.map((m) => m.groupId)

  if (groupIds.length === 0) {
    return {
      groups: [],
      memberships: [],
    }
  }

  // Get groups in parallel
  const groups = await Promise.all(
    groupIds.map((groupId) => db.group.findOne({ id: groupId })),
  )

  // Filter out any null groups (deleted/not found)
  const validGroups = groups.filter((g) => g !== null)

  return {
    groups: validGroups,
    memberships,
  }
}
