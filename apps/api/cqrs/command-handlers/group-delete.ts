import { CommandHandler } from "@shared/cqrs/types.ts"
import { GroupDeleteCommand } from "@api/cqrs/commands.ts"
import { GroupDeletedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { GroupRoleUtils } from "@shared/types"

/**
 * Handler for deleting a group
 */
export const GroupDeleteHandler: CommandHandler<GroupDeleteCommand> = async (command) => {
  const { groupId, userId, acknowledgmentId } = command.data

  console.log(`Deleting group ${groupId} for user ${userId}...`)

  try {
    // Find the existing group
    const existingGroup = await db.group.findOne({ id: groupId })
    if (!existingGroup) {
      throw new Error("Group not found")
    }

    // Check if user has owner access to this group
    const membership = await db.groupMembership.findByUserAndGroup(userId, groupId)
    if (!membership || !GroupRoleUtils.canDelete(membership.role)) {
      throw new Error("Only group owners can delete groups")
    }

    // Check if this is the last group for the user
    const userGroups = await db.group.findMany(userId)
    const activeGroups = userGroups.filter((g) => !g.deletedAt)
    if (activeGroups.length <= 1) {
      throw new Error("Cannot delete the last group. At least one group must exist at all times.")
    }

    // Delete the group
    const group = await db.group.deleteOne({ id: groupId })

    if (!group) {
      throw new Error("Failed to delete group")
    }

    console.log(`✅ Group ${groupId} deleted successfully`)

    // Emit event for real-time updates
    eventBus.emit(
      new GroupDeletedEvent({
        group,
        userId,
        acknowledgmentId,
      }),
    )

    return { group }
  } catch (error) {
    console.error(`❌ Failed to delete group ${groupId} for user ${userId}:`, error)
    throw error
  }
}
