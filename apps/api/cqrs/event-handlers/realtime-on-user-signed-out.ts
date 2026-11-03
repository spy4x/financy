import { UserSignedOutEvent } from "@api/cqrs/events.ts"
import { realtime } from "@api/services/realtimeHub.ts"

/** Closes the sockets of the session that just signed out, and of any other that lost its right. */
export const realtimeOnUserSignedOutHandler = async (event: UserSignedOutEvent) => {
  await realtime.revalidate(event.data.userId)
}
