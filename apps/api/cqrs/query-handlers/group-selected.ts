import { GroupSelectedQuery } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupSelectedHandler } from "../../features/groups/handlers.ts"
import type { QueryHandler } from "@spy4x/platform/cqrs"

export const groupSelectedHandler: QueryHandler<GroupSelectedQuery> = createGroupSelectedHandler(
  db.group,
)
