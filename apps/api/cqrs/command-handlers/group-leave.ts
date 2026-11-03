import { GroupLeaveCommand } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupLeaveHandler } from "../../features/groups/handlers.ts"
import type { CommandHandler } from "@spy4x/platform/cqrs"

export const groupLeaveHandler: CommandHandler<GroupLeaveCommand> = createGroupLeaveHandler(
  db.group,
)
