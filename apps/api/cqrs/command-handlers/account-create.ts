import { CommandHandler } from "@shared/cqrs/types.ts"
import { AccountCreateCommand } from "@api/cqrs/commands.ts"
import { AccountCreatedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for creating an account
 */
export const AccountCreateHandler: CommandHandler<AccountCreateCommand> = async (command) => {
  const { account: accountData, userId, acknowledgmentId } = command.data

  console.log(`Creating account "${accountData.name}" for user ${userId}...`)

  try {
    // Verify user has access to the specified group
    const hasAccess = await db.account.verifyLegitimacy(accountData, userId)
    if (!hasAccess) {
      throw new Error("Access denied to specified group")
    }

    // Create the account
    const account = await db.account.createOne({ data: accountData })

    if (!account) {
      throw new Error("Failed to create account")
    }

    // Emit event for WebSocket notifications and other side effects
    eventBus.emit(
      new AccountCreatedEvent({
        account,
        acknowledgmentId,
      }),
    )

    console.log(`✅ Account "${accountData.name}" created for user ${userId}`)

    return { account }
  } catch (error) {
    console.error(`❌ Failed to create account "${accountData.name}":`, error)
    throw error
  }
}
