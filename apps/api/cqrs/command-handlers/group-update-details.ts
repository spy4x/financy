import { GroupUpdateDetailsCommand } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupUpdateDetailsHandler } from "../../features/groups/handlers.ts"
import type { CommandHandler } from "@spy4x/platform/cqrs"

export const groupUpdateDetailsHandler: CommandHandler<GroupUpdateDetailsCommand> =
  createGroupUpdateDetailsHandler(db.group)
