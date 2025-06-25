import { TransactionUndeletedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for sending WebSocket notifications when a transaction is undeleted
 */
export const websocketNotifyOnTransactionUndeletedHandler = async (
  event: TransactionUndeletedEvent,
) => {
  const { transaction, accountUpdated, acknowledgmentId } = event.data

  console.log(`Sending WebSocket notifications for transaction undelete: ${transaction.id}`)

  try {
    // Send WebSocket notifications for transaction update (restored)
    websockets.onModelChange(
      SyncModelName.transaction,
      [transaction],
      WebSocketMessageType.UPDATED,
      acknowledgmentId,
    )

    // Send WebSocket notifications for account update
    websockets.onModelChange(
      SyncModelName.account,
      [accountUpdated],
      WebSocketMessageType.UPDATED,
    )

    console.log(`✅ WebSocket notifications sent for transaction undelete: ${transaction.id}`)
  } catch (error) {
    console.error(`❌ Failed to send WebSocket notifications for transaction undelete:`, error)
    // Don't throw here - WebSocket notification failures shouldn't break the command
  }
}
