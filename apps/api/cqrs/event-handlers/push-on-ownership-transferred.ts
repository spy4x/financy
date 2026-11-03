import { getWebPush } from "@api/services/webPush.ts"
import { createOwnershipPushListener } from "./ownership-push.ts"

export const pushOnOwnershipTransferredHandler = createOwnershipPushListener(
  async (userId, message) => await (await getWebPush()).send(userId, message),
)
