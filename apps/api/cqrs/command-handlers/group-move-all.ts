import { GroupMoveAllCommand } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupMoveAllHandler } from "../../features/groups/handlers.ts"
import type { CommandHandler } from "@spy4x/platform/cqrs"

export const groupMoveAllHandler: CommandHandler<GroupMoveAllCommand> = createGroupMoveAllHandler(
  db.group,
  db.groupData,
)
