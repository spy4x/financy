import { TransactionUpdatedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for sending WebSocket notifications when a transaction is updated
 */
export const websocketNotifyOnTransactionUpdatedHandler = async (
  event: TransactionUpdatedEvent,
) => {
  const {
    transaction,
    accountUpdated,
    oldCategoryUpdated,
    newCategoryUpdated,
    acknowledgmentId,
  } = event.data

  console.log(`Sending WebSocket notifications for transaction update: ${transaction.id}`)

  try {
    // Send WebSocket notifications for transaction update
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

    // Send WebSocket notifications for category updates
    if (oldCategoryUpdated) {
      websockets.onModelChange(
        SyncModelName.category,
        [oldCategoryUpdated],
        WebSocketMessageType.UPDATED,
      )
    }

    if (newCategoryUpdated) {
      websockets.onModelChange(
        SyncModelName.category,
        [newCategoryUpdated],
        WebSocketMessageType.UPDATED,
      )
    }

    console.log(`✅ WebSocket notifications sent for transaction update: ${transaction.id}`)
  } catch (error) {
    console.error(`❌ Failed to send WebSocket notifications for transaction update:`, error)
    // Don't throw here - WebSocket notification failures shouldn't break the command
  }
}
