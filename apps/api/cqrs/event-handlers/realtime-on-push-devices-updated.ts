import { realtime } from "@api/services/realtimeHub.ts"
import { createPushDevicesHintListener } from "./user-change-hints.ts"

export const realtimeOnPushDevicesUpdatedHandler = createPushDevicesHintListener((userId) =>
  realtime.notifyUserChange(userId)
)
