import { createPushRegisterHandler } from "../../features/push/handlers.ts"
import { eventBus } from "../../services/eventBus.ts"
import { getWebPush } from "../../services/webPush.ts"

export const pushRegisterHandler = createPushRegisterHandler({
  webPush: getWebPush,
  emit: (event) => eventBus.emit(event),
})
