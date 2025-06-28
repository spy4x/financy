import { CategoryCreatedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when a category is created
 */
export const websocketNotifyOnCategoryCreatedHandler = async (event: CategoryCreatedEvent) => {
  const { category, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about category creation: ${category.name}`)

  try {
    // Notify all clients about the new category
    websockets.onModelChange(
      SyncModelName.category,
      [category],
      WebSocketMessageType.CREATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about category creation: ${category.name}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about category creation:`, error)
  }
}
