import type { PushNotificationMessage } from "@spy4x/platform/model"
import type { GroupOwnershipTransferredEvent } from "../events.ts"

/**
 * Tells the new owner of a group by web push, on every device they registered, with a link to the
 * group's settings. Best-effort: `send` never throws, and a person with no device simply learns it
 * on their next visit.
 */
export function createOwnershipPushListener(
  send: (userId: number, message: PushNotificationMessage) => Promise<unknown>,
) {
  return async (event: GroupOwnershipTransferredEvent) => {
    await send(event.data.newOwnerId, {
      title: `You now own "${event.data.groupName}"`,
      body: "Its owner handed the group to you. You manage its members, plan and deletion now.",
      url: `/groups/${encodeURIComponent(event.data.groupId)}`,
    })
  }
}
