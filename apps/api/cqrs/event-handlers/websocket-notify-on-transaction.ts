import { EventHandler } from "@shared/cqrs/types.ts"
import {
  TransactionCreatedEvent,
  TransactionDeletedEvent,
  TransactionUpdatedEvent,
} from "@shared/rpc"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName } from "@shared/types"

/**
 * Handler for broadcasting transaction created events via WebSocket
 */
export const WebSocketNotifyOnTransactionCreatedHandler: EventHandler<TransactionCreatedEvent> =
  async (event) => {
    const { transaction, acknowledgmentId } = event.data

    console.log(`Broadcasting transaction created event for transaction ${transaction.id}`)

    websockets.onModelChange(
      SyncModelName.transaction,
      [transaction],
      "created",
      acknowledgmentId,
    )
  }

/**
 * Handler for broadcasting transaction updated events via WebSocket
 */
export const WebSocketNotifyOnTransactionUpdatedHandler: EventHandler<TransactionUpdatedEvent> =
  async (event) => {
    const { transaction, acknowledgmentId } = event.data

    console.log(`Broadcasting transaction updated event for transaction ${transaction.id}`)

    websockets.onModelChange(
      SyncModelName.transaction,
      [transaction],
      "updated",
      acknowledgmentId,
    )
  }

/**
 * Handler for broadcasting transaction deleted events via WebSocket
 */
export const WebSocketNotifyOnTransactionDeletedHandler: EventHandler<TransactionDeletedEvent> =
  async (event) => {
    const { transaction, acknowledgmentId } = event.data

    console.log(`Broadcasting transaction deleted event for transaction ${transaction.id}`)

    websockets.onModelChange(
      SyncModelName.transaction,
      [transaction],
      "deleted",
      acknowledgmentId,
    )
  }
