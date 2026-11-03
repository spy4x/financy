import { GroupMemberRemoveCommand } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupMemberRemoveHandler } from "../../features/groups/handlers.ts"
import type { CommandHandler } from "@spy4x/platform/cqrs"

export const groupMemberRemoveHandler: CommandHandler<GroupMemberRemoveCommand> =
  createGroupMemberRemoveHandler(db.group)
