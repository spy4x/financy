/**
 * Initialize all event handlers and command handlers for the API
 * This file should be imported early in the API startup process
 */

import { eventBus } from "@api/services/eventBus.ts"
import { commandBus } from "@api/services/commandBus.ts"
import { AccountCreatedEvent, GroupCreatedEvent, UserSignedUpEvent } from "@api/cqrs/events.ts"
import { AccountCreateCommand, GroupCreateCommand } from "@api/cqrs/commands.ts"
import { groupCreateOnUserSignedUpHandler } from "./event-handlers/group-create-on-user-signed-up.ts"
import { websocketNotifyOnGroupCreatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-group-created.ts"
import { websocketNotifyOnAccountCreatedHandler } from "@api/cqrs/event-handlers/websocket-notify-on-account-created.ts"
import { GroupCreateHandler as groupCreateHandler } from "@api/cqrs/command-handlers/group-create.ts"
import { AccountCreateHandler as accountCreateHandler } from "@api/cqrs/command-handlers/account-create.ts"

// Register event handlers
eventBus.on(UserSignedUpEvent, groupCreateOnUserSignedUpHandler)
eventBus.on(GroupCreatedEvent, websocketNotifyOnGroupCreatedHandler)
eventBus.on(AccountCreatedEvent, websocketNotifyOnAccountCreatedHandler)

// Register command handlers
commandBus.register(GroupCreateCommand, groupCreateHandler)
commandBus.register(AccountCreateCommand, accountCreateHandler)

console.log("✅ Event handlers and command handlers initialized")
