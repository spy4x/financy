import { websocket } from "./websocket.svelte.ts"
import { eventBus } from "./eventBus.ts"
import {
  UserAuthenticatedOnAppStart,
  UserSignedIn,
  UserSignedOut,
  UserSignedUp,
} from "../cqrs/events.ts"

export { websocket }

export function initWebSocket() {
  eventBus.on(UserAuthenticatedOnAppStart, () => websocket.connect())
  eventBus.on(UserSignedIn, () => websocket.connect())
  eventBus.on(UserSignedUp, () => websocket.connect())
  eventBus.on(UserSignedOut, () => websocket.disconnect())
}
