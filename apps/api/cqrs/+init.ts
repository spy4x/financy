/**
 * Initialize all event handlers for the API
 * This file should be imported early in the API startup process
 */

import { eventBus } from "@api/services/eventBus.ts"
import { UserSignedUpEvent } from "@api/cqrs/events.ts"
import { onUserSignedUpCreateGroup } from "@api/cqrs/event-handlers/on-user-signed-up-create-group.ts"

// Register event handlers
eventBus.on(UserSignedUpEvent, onUserSignedUpCreateGroup)

console.log("✅ Event handlers initialized")
