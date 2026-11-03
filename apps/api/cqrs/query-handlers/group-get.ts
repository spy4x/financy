import { GroupGetQuery } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupGetHandler } from "../../features/groups/handlers.ts"
import type { QueryHandler } from "@spy4x/platform/cqrs"

export const groupGetHandler: QueryHandler<GroupGetQuery> = createGroupGetHandler(db.group)
