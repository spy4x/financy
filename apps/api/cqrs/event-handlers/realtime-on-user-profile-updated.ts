import { realtime } from "@api/services/realtimeHub.ts"
import { createProfileHintListener } from "./user-change-hints.ts"

export const realtimeOnUserProfileUpdatedHandler = createProfileHintListener((userId) =>
  realtime.notifyUserChange(userId)
)
