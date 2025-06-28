import { CommandHandler } from "@shared/cqrs/types.ts"
import { GroupUndeleteCommand } from "@api/cqrs/commands.ts"
import { GroupUndeletedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { GroupRoleUtils } from "@shared/types"

/**
 * Handler for undeleting (restoring) a group
 */
export const GroupUndeleteHandler: CommandHandler<GroupUndeleteCommand> = async (command) => {
  const { groupId, userId, acknowledgmentId } = command.data

  console.log(`Undeleting group ${groupId} for user ${userId}...`)

  try {
    // Find the existing group (including deleted ones)
    const existingGroup = await db.group.findOne({ id: groupId })
    if (!existingGroup) {
      throw new Error("Group not found")
    }

    // Check if user has owner access to this group
    const membership = await db.groupMembership.findByUserAndGroup(userId, groupId)
    if (!membership || !GroupRoleUtils.canDelete(membership.role)) {
      throw new Error("Only group owners can restore groups")
    }

    // Undelete the group
    const group = await db.group.undeleteOne({ id: groupId })

    if (!group) {
      throw new Error("Failed to undelete group")
    }

    console.log(`✅ Group ${groupId} undeleted successfully`)

    // Emit event for real-time updates
    eventBus.emit(
      new GroupUndeletedEvent({
        group,
        userId,
        acknowledgmentId,
      }),
    )

    return { group }
  } catch (error) {
    console.error(`❌ Failed to undelete group ${groupId} for user ${userId}:`, error)
    throw error
  }
}
