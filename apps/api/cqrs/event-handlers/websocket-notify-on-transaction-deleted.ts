import { TransactionDeletedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for sending WebSocket notifications when a transaction is deleted
 */
export const websocketNotifyOnTransactionDeletedHandler = async (
  event: TransactionDeletedEvent,
) => {
  const { transaction, accountUpdated, categoryUpdated, acknowledgmentId } = event.data

  console.log(`Sending WebSocket notifications for transaction deletion: ${transaction.id}`)

  try {
    // Send WebSocket notifications for transaction deletion
    websockets.onModelChange(
      SyncModelName.transaction,
      [transaction],
      WebSocketMessageType.DELETED,
      acknowledgmentId,
    )

    // Send WebSocket notifications for account update
    websockets.onModelChange(
      SyncModelName.account,
      [accountUpdated],
      WebSocketMessageType.UPDATED,
    )

    // Send WebSocket notifications for category update
    websockets.onModelChange(
      SyncModelName.category,
      [categoryUpdated],
      WebSocketMessageType.UPDATED,
    )

    console.log(`✅ WebSocket notifications sent for transaction deletion: ${transaction.id}`)
  } catch (error) {
    console.error(`❌ Failed to send WebSocket notifications for transaction deletion:`, error)
    // Don't throw here - WebSocket notification failures shouldn't break the command
  }
}
