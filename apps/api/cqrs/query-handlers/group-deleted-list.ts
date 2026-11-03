import { GroupDeletedListQuery } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupDeletedListHandler } from "../../features/groups/handlers.ts"
import type { QueryHandler } from "@spy4x/platform/cqrs"

export const groupDeletedListHandler: QueryHandler<GroupDeletedListQuery> =
  createGroupDeletedListHandler(db.group)
