import { CategoryUpdatedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when a category is updated
 */
export const websocketNotifyOnCategoryUpdatedHandler = async (event: CategoryUpdatedEvent) => {
  const { category, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about category update: ${category.name}`)

  try {
    // Notify all clients about the updated category
    websockets.onModelChange(
      SyncModelName.category,
      [category],
      WebSocketMessageType.UPDATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about category update: ${category.name}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about category update:`, error)
  }
}
