import { GroupDeletedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when a group is deleted
 */
export const websocketNotifyOnGroupDeletedHandler = async (event: GroupDeletedEvent) => {
  const { group, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about group deletion: ${group.name}`)

  try {
    // Notify all clients about the deleted group
    websockets.onModelChange(
      SyncModelName.group,
      [group],
      WebSocketMessageType.DELETED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about group deletion: ${group.name}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about group deletion:`, error)
  }
}
