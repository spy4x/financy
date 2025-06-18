import { GroupCreatedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for sending WebSocket notifications when a group is created
 */
export const websocketNotifyOnGroupCreatedHandler = async (event: GroupCreatedEvent) => {
  const { group, membership, acknowledgmentId } = event.data

  console.log(`Sending WebSocket notifications for group "${group.name}" creation...`)

  try {
    // Send WebSocket notifications for group creation
    websockets.onModelChange(
      SyncModelName.group,
      [group],
      WebSocketMessageType.CREATED,
      acknowledgmentId,
    )

    websockets.onModelChange(
      SyncModelName.groupMembership,
      [membership],
      WebSocketMessageType.CREATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket notifications sent for group "${group.name}"`)
  } catch (error) {
    console.error(`❌ Failed to send WebSocket notifications for group "${group.name}":`, error)
    // Don't throw here - WebSocket notification failures shouldn't break the command
  }
}
