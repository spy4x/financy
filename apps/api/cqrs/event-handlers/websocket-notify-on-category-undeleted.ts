import { CategoryUndeletedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when a category is undeleted
 */
export const websocketNotifyOnCategoryUndeletedHandler = async (event: CategoryUndeletedEvent) => {
  const { category, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about category undeletion: ${category.name}`)

  try {
    // Notify all clients about the undeleted category
    websockets.onModelChange(
      SyncModelName.category,
      [category],
      WebSocketMessageType.UPDATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about category undeletion: ${category.name}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about category undeletion:`, error)
  }
}
