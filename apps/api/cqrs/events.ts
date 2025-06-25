import { Event } from "@shared/cqrs/types.ts"
import { Account, Group, GroupMembership, Transaction, User } from "@shared/types"

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

/**
 * Event emitted when an account is created
 */
export class AccountCreatedEvent implements Event<{ account: Account; acknowledgmentId?: string }> {
  constructor(public data: { account: Account; acknowledgmentId?: string }) {}
}

/**
 * Event emitted when a transaction is created
 */
export class TransactionCreatedEvent implements
  Event<{
    transaction: Transaction
    accountUpdated: Account
    acknowledgmentId?: string
  }> {
  constructor(
    public data: {
      transaction: Transaction
      accountUpdated: Account
      acknowledgmentId?: string
    },
  ) {}
}

/**
 * Event emitted when a transaction is updated
 */
export class TransactionUpdatedEvent implements
  Event<{
    transaction: Transaction
    originalTransaction: Transaction
    accountUpdated: Account
    acknowledgmentId?: string
  }> {
  constructor(
    public data: {
      transaction: Transaction
      originalTransaction: Transaction
      accountUpdated: Account
      acknowledgmentId?: string
    },
  ) {}
}

/**
 * Event emitted when a transaction is deleted
 */
export class TransactionDeletedEvent implements
  Event<{
    transaction: Transaction
    accountUpdated: Account
    acknowledgmentId?: string
  }> {
  constructor(
    public data: {
      transaction: Transaction
      accountUpdated: Account
      acknowledgmentId?: string
    },
  ) {}
}
