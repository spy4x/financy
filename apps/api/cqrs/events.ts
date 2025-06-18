import { Event } from "@shared/event-bus"
import { User } from "@shared/types"

/**
 * Event emitted when a user signs up (after user creation and session setup)
 */
export class UserSignedUpEvent implements Event {
  constructor(public data: { user: User; username: string }) {}
}
