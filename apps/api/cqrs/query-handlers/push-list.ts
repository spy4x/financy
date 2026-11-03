import { createPushListHandler } from "../../features/push/handlers.ts"
import { getWebPush } from "../../services/webPush.ts"

export const pushListHandler = createPushListHandler({ webPush: getWebPush })
