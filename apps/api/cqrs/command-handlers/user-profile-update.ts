import { createUserProfileUpdateHandler } from "../../features/profile/handlers.ts"
import { db } from "../../services/db.ts"
import { eventBus } from "../../services/eventBus.ts"

export const userProfileUpdateHandler = createUserProfileUpdateHandler({
  db,
  emit: (event) => eventBus.emit(event),
})
