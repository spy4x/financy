import { TransactionCreatedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for sending WebSocket notifications when a transaction is created
 */
export const websocketNotifyOnTransactionCreatedHandler = async (
  event: TransactionCreatedEvent,
) => {
  const { transaction, acknowledgmentId } = event.data

  console.log(`Sending WebSocket notifications for transaction creation: ${transaction.id}`)

  try {
    // Send WebSocket notifications for transaction creation
    websockets.onModelChange(
      SyncModelName.transaction,
      [transaction],
      WebSocketMessageType.CREATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket notifications sent for transaction creation: ${transaction.id}`)
  } catch (error) {
    console.error(`❌ Failed to send WebSocket notifications for transaction creation:`, error)
    // Don't throw here - WebSocket notification failures shouldn't break the command
  }
}
