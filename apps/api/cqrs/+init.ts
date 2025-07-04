/**
 * Initialize all event handlers, command handlers, and query handlers for the API
 * This file should be imported early in the API startup process
 */

import { eventBus } from "@api/services/eventBus.ts"
import { commandBus } from "@api/services/commandBus.ts"
import { queryBus } from "@api/services/queryBus.ts"
import {
  AccountCreatedEvent,
  AccountDeletedEvent,
  AccountTransferEvent,
  AccountUndeletedEvent,
  AccountUpdatedEvent,
  CategoryCreatedEvent,
  CategoryDeletedEvent,
  CategoryUndeletedEvent,
  CategoryUpdatedEvent,
  GroupCreatedEvent,
  GroupDeletedEvent,
  GroupUndeletedEvent,
  GroupUpdatedEvent,
  TransactionCreatedEvent,
  TransactionDeletedEvent,
  TransactionUndeletedEvent,
  TransactionUpdatedEvent,
  UserSettingsUpdatedEvent,
  UserSignedUpEvent,
  UserUpdatedEvent,
} from "@api/cqrs/events.ts"
import {
  AccountCreateCommand,
  AccountDeleteCommand,
  AccountTransferCommand,
  AccountUndeleteCommand,
  AccountUpdateCommand,
  CategoryCreateCommand,
  CategoryDeleteCommand,
  CategoryUndeleteCommand,
  CategoryUpdateCommand,
  GroupCreateCommand,
  GroupDeleteCommand,
  GroupUndeleteCommand,
  GroupUpdateCommand,
  TransactionCreateCommand,
  TransactionDeleteCommand,
  TransactionUndeleteCommand,
  TransactionUpdateCommand,
  UserSettingsUpsertCommand,
  UserUpdateCommand,
} from "@api/cqrs/commands.ts"
import {
  AccountListQuery,
  AnalyticsQuery,
  CategoryListQuery,
  TransactionListQuery,
  UserDashboardQuery,
  UserGroupsQuery,
  UserSettingsGetQuery,
} from "@api/cqrs/queries.ts"
import { seedPresetEntitiesOnUserSignedUpHandler } from "./event-handlers/seed-preset-entities-on-user-signed-up.ts"
import { websocketNotifyOnGroupCreatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-group-created.ts"
import { websocketNotifyOnGroupUpdatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-group-updated.ts"
import { websocketNotifyOnGroupDeletedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-group-deleted.ts"
import { websocketNotifyOnGroupUndeletedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-group-undeleted.ts"
import { websocketNotifyOnAccountCreatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-account-created.ts"
import { websocketNotifyOnAccountUpdatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-account-updated.ts"
import { websocketNotifyOnAccountDeletedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-account-deleted.ts"
import { websocketNotifyOnAccountUndeletedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-account-undeleted.ts"
import { websocketNotifyOnAccountTransferHandler } from "@api/cqrs/event-handlers/websocket-notify-on-account-transfer.ts"
import { websocketNotifyOnCategoryCreatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-category-created.ts"
import { websocketNotifyOnCategoryUpdatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-category-updated.ts"
import { websocketNotifyOnCategoryDeletedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-category-deleted.ts"
import { websocketNotifyOnCategoryUndeletedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-category-undeleted.ts"
import { websocketNotifyOnTransactionCreatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-transaction-created.ts"
import { websocketNotifyOnTransactionUpdatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-transaction-updated.ts"
import { websocketNotifyOnTransactionDeletedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-transaction-deleted.ts"
import { websocketNotifyOnTransactionUndeletedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-transaction-undeleted.ts"
import { websocketNotifyOnUserUpdatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-user-updated.ts"
import { websocketNotifyOnUserSettingsUpdatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-user-settings-updated.ts"
import { GroupCreateHandler as groupCreateHandler } from "@api/cqrs/command-handlers/group-create.ts"
import { GroupUpdateHandler as groupUpdateHandler } from "@api/cqrs/command-handlers/group-update.ts"
import { GroupDeleteHandler as groupDeleteHandler } from "@api/cqrs/command-handlers/group-delete.ts"
import { GroupUndeleteHandler as groupUndeleteHandler } from "@api/cqrs/command-handlers/group-undelete.ts"
import { AccountCreateHandler as accountCreateHandler } from "@api/cqrs/command-handlers/account-create.ts"
import { AccountUpdateHandler as accountUpdateHandler } from "@api/cqrs/command-handlers/account-update.ts"
import { AccountDeleteHandler as accountDeleteHandler } from "@api/cqrs/command-handlers/account-delete.ts"
import { AccountTransferHandler as accountTransferHandler } from "@api/cqrs/command-handlers/account-transfer.ts"
import { AccountUndeleteHandler as accountUndeleteHandler } from "@api/cqrs/command-handlers/account-undelete.ts"
import { CategoryCreateHandler as categoryCreateHandler } from "@api/cqrs/command-handlers/category-create.ts"
import { CategoryUpdateHandler as categoryUpdateHandler } from "@api/cqrs/command-handlers/category-update.ts"
import { CategoryDeleteHandler as categoryDeleteHandler } from "@api/cqrs/command-handlers/category-delete.ts"
import { CategoryUndeleteHandler as categoryUndeleteHandler } from "@api/cqrs/command-handlers/category-undelete.ts"
import { transactionCreateHandler } from "@api/cqrs/command-handlers/transaction-create.ts"
import { transactionUpdateHandler } from "@api/cqrs/command-handlers/transaction-update.ts"
import { transactionDeleteHandler } from "@api/cqrs/command-handlers/transaction-delete.ts"
import { transactionUndeleteHandler } from "@api/cqrs/command-handlers/transaction-undelete.ts"
import { UserUpdateHandler as userUpdateHandler } from "@api/cqrs/command-handlers/user-update.ts"
import { UserSettingsUpsertHandler } from "@api/cqrs/command-handlers/user-settings-upsert.ts"
import { accountListHandler } from "@api/cqrs/query-handlers/account-list.ts"
import { transactionListHandler } from "@api/cqrs/query-handlers/transaction-list.ts"
import { categoryListHandler } from "@api/cqrs/query-handlers/category-list.ts"
import { analyticsHandler } from "@api/cqrs/query-handlers/analytics.ts"
import { userDashboardHandler } from "@api/cqrs/query-handlers/user-dashboard.ts"
import { userGroupsHandler } from "@api/cqrs/query-handlers/user-groups.ts"
import { userSettingsGetHandler } from "@api/cqrs/query-handlers/user-settings-get.ts"

// Register event handlers
eventBus.on(UserSignedUpEvent, seedPresetEntitiesOnUserSignedUpHandler)
eventBus.on(GroupCreatedEvent, websocketNotifyOnGroupCreatedHandler)
eventBus.on(GroupUpdatedEvent, websocketNotifyOnGroupUpdatedHandler)
eventBus.on(GroupDeletedEvent, websocketNotifyOnGroupDeletedHandler)
eventBus.on(GroupUndeletedEvent, websocketNotifyOnGroupUndeletedHandler)
eventBus.on(AccountCreatedEvent, websocketNotifyOnAccountCreatedHandler)
eventBus.on(AccountUpdatedEvent, websocketNotifyOnAccountUpdatedHandler)
eventBus.on(AccountDeletedEvent, websocketNotifyOnAccountDeletedHandler)
eventBus.on(AccountUndeletedEvent, websocketNotifyOnAccountUndeletedHandler)
eventBus.on(AccountTransferEvent, websocketNotifyOnAccountTransferHandler)
eventBus.on(CategoryCreatedEvent, websocketNotifyOnCategoryCreatedHandler)
eventBus.on(CategoryUpdatedEvent, websocketNotifyOnCategoryUpdatedHandler)
eventBus.on(CategoryDeletedEvent, websocketNotifyOnCategoryDeletedHandler)
eventBus.on(CategoryUndeletedEvent, websocketNotifyOnCategoryUndeletedHandler)
eventBus.on(TransactionCreatedEvent, websocketNotifyOnTransactionCreatedHandler)
eventBus.on(TransactionUpdatedEvent, websocketNotifyOnTransactionUpdatedHandler)
eventBus.on(TransactionDeletedEvent, websocketNotifyOnTransactionDeletedHandler)
eventBus.on(TransactionUndeletedEvent, websocketNotifyOnTransactionUndeletedHandler)
eventBus.on(UserUpdatedEvent, websocketNotifyOnUserUpdatedHandler)
eventBus.on(UserSettingsUpdatedEvent, websocketNotifyOnUserSettingsUpdatedHandler)

// Register command handlers
commandBus.register(GroupCreateCommand, groupCreateHandler)
commandBus.register(GroupUpdateCommand, groupUpdateHandler)
commandBus.register(GroupDeleteCommand, groupDeleteHandler)
commandBus.register(GroupUndeleteCommand, groupUndeleteHandler)
commandBus.register(AccountCreateCommand, accountCreateHandler)
commandBus.register(AccountUpdateCommand, accountUpdateHandler)
commandBus.register(AccountDeleteCommand, accountDeleteHandler)
commandBus.register(AccountTransferCommand, accountTransferHandler)
commandBus.register(AccountUndeleteCommand, accountUndeleteHandler)
commandBus.register(CategoryCreateCommand, categoryCreateHandler)
commandBus.register(CategoryUpdateCommand, categoryUpdateHandler)
commandBus.register(CategoryDeleteCommand, categoryDeleteHandler)
commandBus.register(CategoryUndeleteCommand, categoryUndeleteHandler)
commandBus.register(TransactionCreateCommand, transactionCreateHandler)
commandBus.register(TransactionUpdateCommand, transactionUpdateHandler)
commandBus.register(TransactionDeleteCommand, transactionDeleteHandler)
commandBus.register(TransactionUndeleteCommand, transactionUndeleteHandler)
commandBus.register(UserUpdateCommand, userUpdateHandler)
commandBus.register(UserSettingsUpsertCommand, UserSettingsUpsertHandler)

// Register query handlers
queryBus.register(AccountListQuery, accountListHandler)
queryBus.register(TransactionListQuery, transactionListHandler)
queryBus.register(CategoryListQuery, categoryListHandler)
queryBus.register(AnalyticsQuery, analyticsHandler)
queryBus.register(UserDashboardQuery, userDashboardHandler)
queryBus.register(UserGroupsQuery, userGroupsHandler)
queryBus.register(UserSettingsGetQuery, userSettingsGetHandler)

console.log("✅ Event handlers, command handlers, and query handlers initialized")
