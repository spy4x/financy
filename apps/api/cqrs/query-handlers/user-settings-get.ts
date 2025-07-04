import { QueryHandler } from "@shared/cqrs/types.ts"
import { UserSettingsGetQuery, type UserSettingsGetResult } from "@api/cqrs/queries.ts"
import { db } from "@api/services/db.ts"

export const userSettingsGetHandler: QueryHandler<UserSettingsGetQuery> = async (
  query: UserSettingsGetQuery,
): Promise<UserSettingsGetResult> => {
  const { userId } = query.data

  const settings = await db.userSettings.findOne({ id: userId })

  return {
    settings,
  }
}
