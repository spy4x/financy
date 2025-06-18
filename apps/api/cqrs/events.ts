import { Event } from "@shared/cqrs/types.ts"
import { Group, GroupMembership, User } from "@shared/types"

/**
 * Event emitted when a user signs up (after user creation and session setup)
 */
export class UserSignedUpEvent implements Event<{ user: User; username: string }> {
  constructor(public data: { user: User; username: string }) {}
}

/**
 * Event emitted when a group is created (after group + membership creation)
 */
export class GroupCreatedEvent
  implements Event<{ group: Group; membership: GroupMembership; acknowledgmentId?: string }> {
  constructor(
    public data: { group: Group; membership: GroupMembership; acknowledgmentId?: string },
  ) {}
}
