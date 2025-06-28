import { GroupUpdatedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when a group is updated
 */
export const websocketNotifyOnGroupUpdatedHandler = async (event: GroupUpdatedEvent) => {
  const { group, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about group update: ${group.name}`)

  try {
    // Notify all clients about the updated group
    websockets.onModelChange(
      SyncModelName.group,
      [group],
      WebSocketMessageType.UPDATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about group update: ${group.name}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about group update:`, error)
  }
}
