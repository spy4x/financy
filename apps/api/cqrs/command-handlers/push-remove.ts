import { createPushRemoveHandler } from "../../features/push/handlers.ts"
import { eventBus } from "../../services/eventBus.ts"
import { getWebPush } from "../../services/webPush.ts"

export const pushRemoveHandler = createPushRemoveHandler({
  webPush: getWebPush,
  emit: (event) => eventBus.emit(event),
})
