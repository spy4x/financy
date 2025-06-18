/**
 * Initialize all event handlers and command handlers for the API
 * This file should be imported early in the API startup process
 */

import { eventBus } from "@api/services/eventBus.ts"
import { commandBus } from "@api/services/commandBus.ts"

// Import existing handlers
import { GroupCreatedEvent, UserSignedUpEvent } from "@api/cqrs/events.ts"
import { GroupCreateCommand } from "@api/cqrs/commands.ts"
import { groupCreateOnUserSignedUpHandler } from "./event-handlers/group-create-on-user-signed-up.ts"
import { websocketNotifyOnGroupCreatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-group-created.ts"
import { GroupCreateHandler as groupCreateHandler } from "@api/cqrs/command-handlers/group-create.ts"

// Import new RPC handlers
import {
  CategoryCreateCommand,
  CategoryCreatedEvent,
  CategoryDeleteCommand,
  CategoryDeletedEvent,
  CategoryUpdateCommand,
  CategoryUpdatedEvent,
  TransactionCreateCommand,
  TransactionCreatedEvent,
  TransactionDeleteCommand,
  TransactionDeletedEvent,
  TransactionUpdateCommand,
  TransactionUpdatedEvent,
} from "@shared/rpc"

import {
  TransactionCreateHandler,
  TransactionDeleteHandler,
  TransactionUpdateHandler,
} from "./command-handlers/transaction.ts"

import {
  CategoryCreateHandler,
  CategoryDeleteHandler,
  CategoryUpdateHandler,
} from "./command-handlers/category.ts"

import {
  WebSocketNotifyOnTransactionCreatedHandler,
  WebSocketNotifyOnTransactionDeletedHandler,
  WebSocketNotifyOnTransactionUpdatedHandler,
} from "./event-handlers/websocket-notify-on-transaction.ts"

import {
  WebSocketNotifyOnCategoryCreatedHandler,
  WebSocketNotifyOnCategoryDeletedHandler,
  WebSocketNotifyOnCategoryUpdatedHandler,
} from "./event-handlers/websocket-notify-on-category.ts"

// Register existing event handlers
eventBus.on(UserSignedUpEvent, groupCreateOnUserSignedUpHandler)
eventBus.on(GroupCreatedEvent, websocketNotifyOnGroupCreatedHandler)

// Register new event handlers
eventBus.on(TransactionCreatedEvent, WebSocketNotifyOnTransactionCreatedHandler)
eventBus.on(TransactionUpdatedEvent, WebSocketNotifyOnTransactionUpdatedHandler)
eventBus.on(TransactionDeletedEvent, WebSocketNotifyOnTransactionDeletedHandler)
eventBus.on(CategoryCreatedEvent, WebSocketNotifyOnCategoryCreatedHandler)
eventBus.on(CategoryUpdatedEvent, WebSocketNotifyOnCategoryUpdatedHandler)
eventBus.on(CategoryDeletedEvent, WebSocketNotifyOnCategoryDeletedHandler)

// Register existing command handlers
commandBus.register(GroupCreateCommand, groupCreateHandler)

// Register new command handlers
commandBus.register(TransactionCreateCommand, TransactionCreateHandler)
commandBus.register(TransactionUpdateCommand, TransactionUpdateHandler)
commandBus.register(TransactionDeleteCommand, TransactionDeleteHandler)
commandBus.register(CategoryCreateCommand, CategoryCreateHandler)
commandBus.register(CategoryUpdateCommand, CategoryUpdateHandler)
commandBus.register(CategoryDeleteCommand, CategoryDeleteHandler)

console.log("✅ Event handlers and command handlers initialized")
