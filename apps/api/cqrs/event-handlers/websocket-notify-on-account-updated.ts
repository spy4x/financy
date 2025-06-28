import { AccountUpdatedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when an account is updated
 */
export const websocketNotifyOnAccountUpdatedHandler = async (event: AccountUpdatedEvent) => {
  const { account, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about account update: ${account.name}`)

  try {
    // Notify all clients about the updated account
    websockets.onModelChange(
      SyncModelName.account,
      [account],
      WebSocketMessageType.UPDATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about account update: ${account.name}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about account update:`, error)
  }
}
