import type { QueryHandler } from "@spy4x/platform/cqrs"
import type { GroupActivityQuery } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupActivityHandler } from "../../features/groups/activity.ts"

export const groupActivityHandler: QueryHandler<GroupActivityQuery> = createGroupActivityHandler(
  db.group,
  db.groupActivity,
)
