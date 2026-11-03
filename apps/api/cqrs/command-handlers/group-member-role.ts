import { GroupMemberRoleCommand } from "@domain/groups"
import { db } from "../../services/db.ts"
import { createGroupMemberRoleHandler } from "../../features/groups/handlers.ts"
import type { CommandHandler } from "@spy4x/platform/cqrs"

export const groupMemberRoleHandler: CommandHandler<GroupMemberRoleCommand> =
  createGroupMemberRoleHandler(db.group)
