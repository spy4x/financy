import { CommandHandler } from "@shared/cqrs/types.ts"
import { GroupUpdateCommand } from "@api/cqrs/commands.ts"
import { GroupUpdatedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"
import { GroupRoleUtils } from "@shared/types"

/**
 * Handler for updating a group
 */
export const GroupUpdateHandler: CommandHandler<GroupUpdateCommand> = async (command) => {
  const { groupId, updates, userId, acknowledgmentId } = command.data

  console.log(`Updating group ${groupId} for user ${userId}...`)

  try {
    // Find the existing group
    const existingGroup = await db.group.findOne({ id: groupId })
    if (!existingGroup) {
      throw new Error("Group not found")
    }

    // Check if user has admin/owner access to this group
    const membership = await db.groupMembership.findByUserAndGroup(userId, groupId)
    if (!membership || !GroupRoleUtils.canManage(membership.role)) {
      throw new Error("Insufficient permissions to update group")
    }

    // Update the group
    const group = await db.group.updateOne({
      id: groupId,
      data: updates,
    })

    if (!group) {
      throw new Error("Failed to update group")
    }

    console.log(`✅ Group ${groupId} updated successfully`)

    // Emit event for real-time updates
    eventBus.emit(
      new GroupUpdatedEvent({
        group,
        userId,
        acknowledgmentId,
      }),
    )

    return { group }
  } catch (error) {
    console.error(`❌ Failed to update group ${groupId} for user ${userId}:`, error)
    throw error
  }
}
