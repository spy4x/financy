import { Event } from "@shared/cqrs/types.ts"
import { Account, Category, Group, GroupMembership, Transaction, User } from "@shared/types"

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

/**
 * Event emitted when a transaction is undeleted (restored)
 */
export class TransactionUndeletedEvent implements
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
 * Event emitted when a category is created
 */
export class CategoryCreatedEvent
  implements Event<{ category: Category; userId: number; acknowledgmentId?: string }> {
  constructor(public data: { category: Category; userId: number; acknowledgmentId?: string }) {}
}

/**
 * Event emitted when a category is updated
 */
export class CategoryUpdatedEvent
  implements Event<{ category: Category; userId: number; acknowledgmentId?: string }> {
  constructor(public data: { category: Category; userId: number; acknowledgmentId?: string }) {}
}

/**
 * Event emitted when a category is deleted
 */
export class CategoryDeletedEvent
  implements Event<{ category: Category; userId: number; acknowledgmentId?: string }> {
  constructor(public data: { category: Category; userId: number; acknowledgmentId?: string }) {}
}

/**
 * Event emitted when a category is undeleted (restored)
 */
export class CategoryUndeletedEvent
  implements Event<{ category: Category; userId: number; acknowledgmentId?: string }> {
  constructor(public data: { category: Category; userId: number; acknowledgmentId?: string }) {}
}

/**
 * Event emitted when a group is updated
 */
export class GroupUpdatedEvent
  implements Event<{ group: Group; userId: number; acknowledgmentId?: string }> {
  constructor(public data: { group: Group; userId: number; acknowledgmentId?: string }) {}
}

/**
 * Event emitted when a group is deleted
 */
export class GroupDeletedEvent
  implements Event<{ group: Group; userId: number; acknowledgmentId?: string }> {
  constructor(public data: { group: Group; userId: number; acknowledgmentId?: string }) {}
}

/**
 * Event emitted when a group is undeleted (restored)
 */
export class GroupUndeletedEvent
  implements Event<{ group: Group; userId: number; acknowledgmentId?: string }> {
  constructor(public data: { group: Group; userId: number; acknowledgmentId?: string }) {}
}

/**
 * Event emitted when an account is updated
 */
export class AccountUpdatedEvent
  implements Event<{ account: Account; userId: number; acknowledgmentId?: string }> {
  constructor(public data: { account: Account; userId: number; acknowledgmentId?: string }) {}
}

/**
 * Event emitted when an account is deleted
 */
export class AccountDeletedEvent
  implements Event<{ account: Account; userId: number; acknowledgmentId?: string }> {
  constructor(public data: { account: Account; userId: number; acknowledgmentId?: string }) {}
}

/**
 * Event emitted when an account is undeleted (restored)
 */
export class AccountUndeletedEvent
  implements Event<{ account: Account; userId: number; acknowledgmentId?: string }> {
  constructor(public data: { account: Account; userId: number; acknowledgmentId?: string }) {}
}

/**
 * Event emitted when money is transferred between accounts
 */
export class AccountTransferEvent implements
  Event<{
    fromTransaction: Transaction
    toTransaction: Transaction
    fromAccountUpdated: Account
    toAccountUpdated: Account
    acknowledgmentId?: string
  }> {
  constructor(
    public data: {
      fromTransaction: Transaction
      toTransaction: Transaction
      fromAccountUpdated: Account
      toAccountUpdated: Account
      acknowledgmentId?: string
    },
  ) {}
}

/**
 * Event emitted when a user is updated
 */
export class UserUpdatedEvent implements Event<{ user: User; acknowledgmentId?: string }> {
  constructor(public data: { user: User; acknowledgmentId?: string }) {}
}
