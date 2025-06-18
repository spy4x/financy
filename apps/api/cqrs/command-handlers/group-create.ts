import { CommandHandler } from "@shared/cqrs/types.ts"
import { GroupCreateCommand } from "@api/cqrs/commands.ts"
import { GroupCreatedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for creating a group with membership in a single transaction
 */
export const GroupCreateHandler: CommandHandler<GroupCreateCommand> = async (command) => {
  const { group: groupData, userId, role = 3, acknowledgmentId } = command.data

  console.log(`Creating group "${groupData.name}" with membership for user ${userId}...`)

  try {
    // Create the group and its membership in a single transaction
    const { group, membership } = await db.begin(async (tx) => {
      // Create the group
      const group = await tx.group.createOne({ data: groupData })

      if (!group) {
        throw new Error("Failed to create group")
      }

      // Create group membership for the user
      const membership = await tx.groupMembership.createOne({
        data: {
          groupId: group.id,
          userId,
          role,
        },
      })

      if (!membership) {
        throw new Error("Failed to create group membership")
      }

      return { group, membership }
    })

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new GroupCreatedEvent({
        group,
        membership,
        acknowledgmentId,
      }),
    )

    console.log(`✅ Group "${groupData.name}" created with membership for user ${userId}`)

    return { group, membership }
  } catch (error) {
    console.error(`❌ Failed to create group "${groupData.name}" with membership:`, error)
    throw error
  }
}
