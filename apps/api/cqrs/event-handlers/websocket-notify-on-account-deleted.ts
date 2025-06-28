import { AccountDeletedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when an account is deleted
 */
export const websocketNotifyOnAccountDeletedHandler = async (event: AccountDeletedEvent) => {
  const { account, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about account deletion: ${account.name}`)

  try {
    // Notify all clients about the deleted account
    websockets.onModelChange(
      SyncModelName.account,
      [account],
      WebSocketMessageType.DELETED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about account deletion: ${account.name}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about account deletion:`, error)
  }
}
