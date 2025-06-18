import { UserSignedUpEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for creating a default "Personal" group when a user signs up
 */
export const onUserSignedUpCreateGroup = async (event: UserSignedUpEvent) => {
  const { user, username } = event.data

  console.log(`Creating default "Personal" group for user ${user.id} (${username})...`)

  try {
    // Create default "Personal" group and membership in a separate transaction
    const { newGroup, newMembership } = await db.begin(async (tx) => {
      // Create default "Personal" group
      const newGroup = await tx.group.createOne({
        data: {
          name: "Personal",
          defaultCurrency: "USD",
        },
      })

      if (!newGroup) {
        throw new Error("Failed to create default group")
      }

      // Create group membership for the user as owner
      const newMembership = await tx.groupMembership.createOne({
        data: {
          groupId: newGroup.id,
          userId: user.id,
          role: 3, // Owner role
        },
      })

      if (!newMembership) {
        throw new Error("Failed to create group membership")
      }

      return { newGroup, newMembership }
    })

    // Notify WebSocket about the new group and membership
    websockets.onModelChange(
      SyncModelName.group,
      [newGroup],
      WebSocketMessageType.CREATED,
    )
    websockets.onModelChange(
      SyncModelName.groupMembership,
      [newMembership],
      WebSocketMessageType.CREATED,
    )

    console.log(`✅ Default "Personal" group created for user ${user.id} (${username})`)
  } catch (error) {
    console.error(`❌ Failed to create default group for user ${user.id} (${username}):`, error)
    // Note: We don't throw here to avoid affecting the user creation process
    // The user can still manually create a group later
  }
}
