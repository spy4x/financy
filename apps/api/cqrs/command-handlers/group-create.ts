import { GroupCreateCommand } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupCreateHandler } from "../../features/groups/handlers.ts"
import type { CommandHandler } from "@spy4x/platform/cqrs"

export const groupCreateHandler: CommandHandler<GroupCreateCommand> = createGroupCreateHandler(
  db.group,
)
