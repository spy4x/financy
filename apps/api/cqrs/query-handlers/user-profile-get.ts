import { QueryHandler } from "@spy4x/platform/cqrs"
import { UserProfileGetQuery } from "@api/cqrs/queries.ts"
import { db } from "@api/services/db.ts"

export const userProfileGetHandler: QueryHandler<UserProfileGetQuery> = async (query) => {
  const userId = query.data.actor.userId
  // Display data only: this row's `mfa` and `role` decide nothing here (see `findOneCached`).
  const user = await db.user.findOneCached({ id: userId })
  if (!user || user.deletedAt) {
    throw new Error("User not found")
  }
  return { user }
}
