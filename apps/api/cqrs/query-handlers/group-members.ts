import { GroupMembersQuery } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupMembersHandler } from "../../features/groups/handlers.ts"
import type { QueryHandler } from "@spy4x/platform/cqrs"

export const groupMembersHandler: QueryHandler<GroupMembersQuery> = createGroupMembersHandler(
  db.group,
)
