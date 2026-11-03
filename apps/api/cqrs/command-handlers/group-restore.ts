import { GroupRestoreCommand } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupRestoreHandler } from "../../features/groups/handlers.ts"
import type { CommandHandler } from "@spy4x/platform/cqrs"

export const groupRestoreHandler: CommandHandler<GroupRestoreCommand> = createGroupRestoreHandler(
  db.group,
)
