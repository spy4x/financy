import { UserSettingsUpdatedEvent } from "@api/cqrs/events.ts"
import { websockets } from "@api/services/websockets.ts"
import { SyncModelName, WebSocketMessageType } from "@shared/types"

/**
 * Handler for notifying WebSocket clients when user settings are updated
 */
export const websocketNotifyOnUserSettingsUpdatedHandler = async (
  event: UserSettingsUpdatedEvent,
) => {
  const { settings, acknowledgmentId } = event.data

  console.log(`Notifying WebSocket clients about user settings update: ${settings.id}`)

  try {
    // Notify all clients about the updated user settings
    websockets.onModelChange(
      SyncModelName.userSettings,
      [settings],
      WebSocketMessageType.UPDATED,
      acknowledgmentId,
    )

    console.log(`✅ WebSocket clients notified about user settings update: ${settings.id}`)
  } catch (error) {
    console.error(`❌ Failed to notify WebSocket clients about user settings update:`, error)
  }
}
