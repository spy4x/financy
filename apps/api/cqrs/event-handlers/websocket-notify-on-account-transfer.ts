import { AccountTransferEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for sending WebSocket notifications when an account transfer is completed
 */
export const websocketNotifyOnAccountTransferHandler = async (
  event: AccountTransferEvent,
) => {
  const {
    fromTransaction,
    toTransaction,
    fromAccountUpdated,
    toAccountUpdated,
    acknowledgmentId,
  } = event.data

  console.log(
    `Sending WebSocket notifications for account transfer: ${fromTransaction.id} → ${toTransaction.id}`,
  )

  try {
    // Send WebSocket notifications for both transactions
    websockets.onModelChange(
      SyncModelName.transaction,
      [fromTransaction, toTransaction],
      WebSocketMessageType.CREATED,
      acknowledgmentId,
    )

    // Send WebSocket notifications for both account updates
    websockets.onModelChange(
      SyncModelName.account,
      [fromAccountUpdated, toAccountUpdated],
      WebSocketMessageType.UPDATED,
    )

    console.log(
      `✅ WebSocket notifications sent for account transfer: ${fromTransaction.id} → ${toTransaction.id}`,
    )
  } catch (error) {
    console.error(`❌ Failed to send WebSocket notifications for account transfer:`, error)
    // Don't throw here - WebSocket notification failures shouldn't break the command
  }
}
