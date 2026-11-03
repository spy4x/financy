import { GroupSelectCommand } from "@domain/groups"
import { db } from "../../services/db.ts"
import { eventBus } from "../../services/eventBus.ts"
import { createGroupSelectHandler } from "../../features/groups/handlers.ts"
import type { CommandHandler } from "@spy4x/platform/cqrs"

export const groupSelectHandler: CommandHandler<GroupSelectCommand> = createGroupSelectHandler(
  db.group,
  { emit: (event) => eventBus.emit(event) },
)
