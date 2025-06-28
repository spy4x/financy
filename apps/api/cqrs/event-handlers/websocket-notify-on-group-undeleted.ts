import { GroupUndeletedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when a group is undeleted
 */
export const websocketNotifyOnGroupUndeletedHandler = async (event: GroupUndeletedEvent) => {
  const { group, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about group undeletion: ${group.name}`)

  try {
    // Notify all clients about the undeleted group
    websockets.onModelChange(
      SyncModelName.group,
      [group],
      WebSocketMessageType.UPDATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about group undeletion: ${group.name}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about group undeletion:`, error)
  }
}
