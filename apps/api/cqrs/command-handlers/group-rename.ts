import { GroupRenameCommand } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupRenameHandler } from "../../features/groups/handlers.ts"
import type { CommandHandler } from "@spy4x/platform/cqrs"

export const groupRenameHandler: CommandHandler<GroupRenameCommand> = createGroupRenameHandler(
  db.group,
)
