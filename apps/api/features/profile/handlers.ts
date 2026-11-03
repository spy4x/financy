import type { CommandHandler } from "@spy4x/platform/cqrs"
import { AuthAuditEventType } from "@domain/identity"
import type { UserProfileUpdateCommand } from "../../cqrs/commands.ts"
import { UserProfileUpdatedEvent } from "../../cqrs/events.ts"
import type { AppDbBase } from "../../services/db-base.ts"

/**
 * What the profile command needs from the app. `cqrs/command-handlers/user-profile-update.ts`
 * passes the real ones; the integration tests pass a database over their own schema.
 */
export interface ProfileHandlerDependencies {
  db: AppDbBase
  emit(event: UserProfileUpdatedEvent): void
}

/**
 * Renames the actor. The new name and its `auth_audits` row are written in one transaction, so a
 * change is never kept without its row. The event goes out only after both are committed.
 */
export function createUserProfileUpdateHandler(
  { db, emit }: ProfileHandlerDependencies,
): CommandHandler<UserProfileUpdateCommand> {
  return async ({ data: { actor, firstName, lastName, request } }) => {
    const user = await db.begin(async (tx) => {
      const current = await tx.user.findOne({ id: actor.userId })
      if (!current || current.deletedAt) throw new Error("User not found")
      const updated = await tx.user.updateOne({ id: actor.userId, data: { firstName, lastName } })
      // `updateOne` returns `undefined` only when the row vanished between the check above and
      // this statement - a race, not a normal "not found".
      if (!updated) throw new Error("User not found")
      await tx.authAudit.insert({
        userId: updated.id,
        eventType: AuthAuditEventType.PROFILE_UPDATED,
        identifier: null,
        ip: request.ip || null,
        userAgent: request.userAgent || null,
      })
      return updated
    })
    emit(new UserProfileUpdatedEvent({ user, request }))
    return { user }
  }
}
