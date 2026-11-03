import { GroupDeleteCommand } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupDeleteHandler } from "../../features/groups/handlers.ts"
import type { CommandHandler } from "@spy4x/platform/cqrs"

export const groupDeleteHandler: CommandHandler<GroupDeleteCommand> = createGroupDeleteHandler(
  db.group,
)
