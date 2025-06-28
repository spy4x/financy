import { CommandHandler } from "@shared/cqrs/types.ts"
import { AccountDeleteCommand } from "@api/cqrs/commands.ts"
import { AccountDeletedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for deleting an account
 */
export const AccountDeleteHandler: CommandHandler<AccountDeleteCommand> = async (command) => {
  const { accountId, userId, acknowledgmentId } = command.data

  console.log(`Deleting account ${accountId} for user ${userId}...`)

  try {
    // Find the existing account
    const existingAccount = await db.account.findOne({ id: accountId })
    if (!existingAccount) {
      throw new Error("Account not found")
    }

    // Verify user has access to this account
    const hasAccess = await db.account.verifyLegitimacy(existingAccount, userId)
    if (!hasAccess) {
      throw new Error("Access denied to this account")
    }

    // Delete the account
    const account = await db.account.deleteOne({ id: accountId })

    if (!account) {
      throw new Error("Failed to delete account")
    }

    console.log(`✅ Account ${accountId} deleted successfully`)

    // Emit event for real-time updates
    eventBus.emit(
      new AccountDeletedEvent({
        account,
        userId,
        acknowledgmentId,
      }),
    )

    return { account }
  } catch (error) {
    console.error(`❌ Failed to delete account ${accountId} for user ${userId}:`, error)
    throw error
  }
}
