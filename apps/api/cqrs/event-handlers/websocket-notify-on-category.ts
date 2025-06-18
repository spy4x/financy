import { EventHandler } from "@shared/cqrs/types.ts"
import { CategoryCreatedEvent, CategoryDeletedEvent, CategoryUpdatedEvent } from "@shared/rpc"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName } from "@shared/types"

/**
 * Handler for broadcasting category created events via WebSocket
 */
export const WebSocketNotifyOnCategoryCreatedHandler: EventHandler<CategoryCreatedEvent> = async (
  event,
) => {
  const { category, acknowledgmentId } = event.data

  console.log(`Broadcasting category created event for category ${category.id}`)

  websockets.onModelChange(
    SyncModelName.category,
    [category],
    "created",
    acknowledgmentId,
  )
}

/**
 * Handler for broadcasting category updated events via WebSocket
 */
export const WebSocketNotifyOnCategoryUpdatedHandler: EventHandler<CategoryUpdatedEvent> = async (
  event,
) => {
  const { category, acknowledgmentId } = event.data

  console.log(`Broadcasting category updated event for category ${category.id}`)

  websockets.onModelChange(
    SyncModelName.category,
    [category],
    "updated",
    acknowledgmentId,
  )
}

/**
 * Handler for broadcasting category deleted events via WebSocket
 */
export const WebSocketNotifyOnCategoryDeletedHandler: EventHandler<CategoryDeletedEvent> = async (
  event,
) => {
  const { category, acknowledgmentId } = event.data

  console.log(`Broadcasting category deleted event for category ${category.id}`)

  websockets.onModelChange(
    SyncModelName.category,
    [category],
    "deleted",
    acknowledgmentId,
  )
}
