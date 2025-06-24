import { AccountCreatedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when an account is created
 */
export const websocketNotifyOnAccountCreatedHandler = async (event: AccountCreatedEvent) => {
  const { account, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about account creation: ${account.name}`)

  try {
    // Notify all clients about the new account
    websockets.onModelChange(
      SyncModelName.account,
      [account],
      WebSocketMessageType.CREATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about account creation: ${account.name}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about account creation:`, error)
  }
}
