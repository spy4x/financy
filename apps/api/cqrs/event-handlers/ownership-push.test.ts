import { describe, it } from "@std/testing/bdd"
import { expect } from "@std/expect"
import type { PushNotificationMessage } from "@spy4x/platform/model"
import { GroupOwnershipTransferredEvent } from "../events.ts"
import { createOwnershipPushListener } from "./ownership-push.ts"

describe("ownership push", () => {
  it("pushes to the new owner only, naming the group and linking to its settings", async () => {
    const sent: { userId: number; message: PushNotificationMessage }[] = []
    const listener = createOwnershipPushListener((userId, message) => {
      sent.push({ userId, message })
      return Promise.resolve()
    })

    await listener(
      new GroupOwnershipTransferredEvent({
        groupId: "7b6d8d6c-1af5-4f04-8ae4-b1ee5d111001",
        groupName: "Team",
        newOwnerId: 7,
      }),
    )

    expect(sent).toHaveLength(1)
    expect(sent[0].userId).toBe(7)
    expect(sent[0].message.title).toContain(`"Team"`)
    expect(sent[0].message.url).toBe("/groups/7b6d8d6c-1af5-4f04-8ae4-b1ee5d111001")
  })
})
