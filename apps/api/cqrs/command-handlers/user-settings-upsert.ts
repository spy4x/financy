import { CommandHandler } from "@shared/cqrs/types.ts"
import { UserSettingsUpsertCommand } from "@api/cqrs/commands.ts"
import { UserSettingsUpdatedEvent } from "@api/cqrs/events.ts"
import { UserSettings } from "@shared/types"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for upserting user settings
 */
export const UserSettingsUpsertHandler: CommandHandler<UserSettingsUpsertCommand> = async (
  command,
) => {
  const { userId, settings, acknowledgmentId } = command.data

  console.log(`Upserting user settings for user ${userId}...`)

  try {
    // Verify user has access to the selected group
    const groupMemberships = await db.groupMembership.findMany(userId)
    const groupIds = groupMemberships.map((gm) => gm.groupId)

    if (!groupIds.includes(settings.selectedGroupId)) {
      throw new Error(
        `Selected group ${settings.selectedGroupId} is not accessible to user ${userId}`,
      )
    }

    // Upsert the user settings (try update first, then create if not exists)
    let userSettings: UserSettings

    try {
      // Try to find existing settings first
      const existingSettings = await db.userSettings.findOne({ id: userId })

      if (existingSettings) {
        // Update existing settings
        userSettings = await db.userSettings.updateOne({
          id: userId,
          data: {
            theme: settings.theme,
            selectedGroupId: settings.selectedGroupId,
          },
        })
      } else {
        // Create new settings - user_settings table uses user ID as primary key
        userSettings = await db.userSettings.createOne({
          data: {
            id: userId,
            theme: settings.theme,
            selectedGroupId: settings.selectedGroupId,
          } as Parameters<typeof db.userSettings.createOne>[0]["data"],
        })
      }
    } catch (error) {
      throw new Error(`Failed to upsert user settings: ${error}`)
    }

    if (!userSettings) {
      throw new Error("Failed to upsert user settings")
    }

    console.log(`✅ User settings for user ${userId} upserted successfully`)

    // Emit event for real-time updates
    eventBus.emit(
      new UserSettingsUpdatedEvent({
        settings: userSettings,
        acknowledgmentId,
      }),
    )

    return { settings: userSettings }
  } catch (error) {
    console.error(`❌ Failed to upsert user settings for user ${userId}:`, error)
    throw error
  }
}
