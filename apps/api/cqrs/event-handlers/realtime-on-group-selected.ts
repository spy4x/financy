import { realtime } from "@api/services/realtimeHub.ts"
import { createGroupSelectedHintListener } from "./user-change-hints.ts"

export const realtimeOnGroupSelectedHandler = createGroupSelectedHintListener((userId) =>
  realtime.notifyUserChange(userId)
)
