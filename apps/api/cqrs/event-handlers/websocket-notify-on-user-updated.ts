import { UserUpdatedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when a user is updated
 */
export const websocketNotifyOnUserUpdatedHandler = async (event: UserUpdatedEvent) => {
  const { user, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about user update: ${user.id}`)

  try {
    // Notify all clients about the updated user
    websockets.onModelChange(
      SyncModelName.user,
      [user],
      WebSocketMessageType.UPDATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about user update: ${user.id}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about user update:`, error)
  }
}
