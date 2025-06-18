import { UserSignedUpEvent } from "@api/cqrs/events.ts"
import { GroupCreateCommand } from "@api/cqrs/commands.ts"
import { commandBus } from "@api/services/commandBus.ts"

/**
 * Handler for creating a default "Personal" group when a user signs up
 */
export const groupCreateOnUserSignedUpHandler = async (event: UserSignedUpEvent) => {
  const { user, username } = event.data

  console.log(`Creating default "Personal" group for user ${user.id} (${username})...`)

  try {
    // Use the command to create default "Personal" group and membership
    await commandBus.execute(
      new GroupCreateCommand({
        group: {
          name: "Personal",
          defaultCurrency: "USD",
        },
        userId: user.id,
        role: 3, // Owner role
      }),
    )

    console.log(`✅ Default "Personal" group created for user ${user.id} (${username})`)
  } catch (error) {
    console.error(`❌ Failed to create default group for user ${user.id} (${username}):`, error)
    // Note: We don't throw here to avoid affecting the user creation process
    // The user can still manually create a group later
  }
}
