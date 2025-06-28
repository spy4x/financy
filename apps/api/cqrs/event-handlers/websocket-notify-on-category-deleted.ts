import { CategoryDeletedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when a category is deleted
 */
export const websocketNotifyOnCategoryDeletedHandler = async (event: CategoryDeletedEvent) => {
  const { category, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about category deletion: ${category.name}`)

  try {
    // Notify all clients about the deleted category
    websockets.onModelChange(
      SyncModelName.category,
      [category],
      WebSocketMessageType.DELETED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about category deletion: ${category.name}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about category deletion:`, error)
  }
}
