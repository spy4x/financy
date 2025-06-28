import { AccountUndeletedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when an account is undeleted
 */
export const websocketNotifyOnAccountUndeletedHandler = async (event: AccountUndeletedEvent) => {
  const { account, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about account undeletion: ${account.name}`)

  try {
    // Notify all clients about the undeleted account
    websockets.onModelChange(
      SyncModelName.account,
      [account],
      WebSocketMessageType.UPDATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about account undeletion: ${account.name}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about account undeletion:`, error)
  }
}
