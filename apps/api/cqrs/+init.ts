/**
 * Initialize all event handlers and command handlers for the API
 * This file should be imported early in the API startup process
 */

import { eventBus } from "@api/services/eventBus.ts"
import { commandBus } from "@api/services/commandBus.ts"
import {
  AccountCreatedEvent,
  GroupCreatedEvent,
  TransactionCreatedEvent,
  TransactionDeletedEvent,
  TransactionUndeletedEvent,
  TransactionUpdatedEvent,
  UserSignedUpEvent,
} from "@api/cqrs/events.ts"
import {
  AccountCreateCommand,
  GroupCreateCommand,
  TransactionCreateCommand,
  TransactionDeleteCommand,
  TransactionUndeleteCommand,
  TransactionUpdateCommand,
} from "@api/cqrs/commands.ts"
import { groupCreateOnUserSignedUpHandler } from "./event-handlers/group-create-on-user-signed-up.ts"
import { websocketNotifyOnGroupCreatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-group-created.ts"
import { websocketNotifyOnAccountCreatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-account-created.ts"
import { websocketNotifyOnTransactionCreatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-transaction-created.ts"
import { websocketNotifyOnTransactionUpdatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-transaction-updated.ts"
import { websocketNotifyOnTransactionDeletedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-transaction-deleted.ts"
import { websocketNotifyOnTransactionUndeletedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-transaction-undeleted.ts"
import { GroupCreateHandler as groupCreateHandler } from "@api/cqrs/command-handlers/group-create.ts"
import { AccountCreateHandler as accountCreateHandler } from "@api/cqrs/command-handlers/account-create.ts"
import { transactionCreateHandler } from "@api/cqrs/command-handlers/transaction-create.ts"
import { transactionUpdateHandler } from "@api/cqrs/command-handlers/transaction-update.ts"
import { transactionDeleteHandler } from "@api/cqrs/command-handlers/transaction-delete.ts"
import { transactionUndeleteHandler } from "@api/cqrs/command-handlers/transaction-undelete.ts"

// Register event handlers
eventBus.on(UserSignedUpEvent, groupCreateOnUserSignedUpHandler)
eventBus.on(GroupCreatedEvent, websocketNotifyOnGroupCreatedHandler)
eventBus.on(AccountCreatedEvent, websocketNotifyOnAccountCreatedHandler)
eventBus.on(TransactionCreatedEvent, websocketNotifyOnTransactionCreatedHandler)
eventBus.on(TransactionUpdatedEvent, websocketNotifyOnTransactionUpdatedHandler)
eventBus.on(TransactionDeletedEvent, websocketNotifyOnTransactionDeletedHandler)
eventBus.on(TransactionUndeletedEvent, websocketNotifyOnTransactionUndeletedHandler)
eventBus.on(TransactionUndeletedEvent, websocketNotifyOnTransactionUndeletedHandler)

// Register command handlers
commandBus.register(GroupCreateCommand, groupCreateHandler)
commandBus.register(AccountCreateCommand, accountCreateHandler)
commandBus.register(TransactionCreateCommand, transactionCreateHandler)
commandBus.register(TransactionUpdateCommand, transactionUpdateHandler)
commandBus.register(TransactionDeleteCommand, transactionDeleteHandler)
commandBus.register(TransactionUndeleteCommand, transactionUndeleteHandler)

console.log("✅ Event handlers and command handlers initialized")
