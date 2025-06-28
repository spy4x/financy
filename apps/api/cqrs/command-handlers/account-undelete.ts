import { CommandHandler } from "@shared/cqrs/types.ts"
import { AccountUndeleteCommand } from "@api/cqrs/commands.ts"
import { AccountUndeletedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for undeleting (restoring) an account
 */
export const AccountUndeleteHandler: CommandHandler<AccountUndeleteCommand> = async (command) => {
  const { accountId, userId, acknowledgmentId } = command.data

  console.log(`Undeleting account ${accountId} for user ${userId}...`)

  try {
    // Find the existing account (including deleted ones)
    const existingAccount = await db.account.findOne({ id: accountId })
    if (!existingAccount) {
      throw new Error("Account not found")
    }

    // Verify user has access to this account
    const hasAccess = await db.account.verifyLegitimacy(existingAccount, userId)
    if (!hasAccess) {
      throw new Error("Access denied to this account")
    }

    // Undelete the account
    const account = await db.account.undeleteOne({ id: accountId })

    if (!account) {
      throw new Error("Failed to undelete account")
    }

    console.log(`✅ Account ${accountId} undeleted successfully`)

    // Emit event for real-time updates
    eventBus.emit(
      new AccountUndeletedEvent({
        account,
        userId,
        acknowledgmentId,
      }),
    )

    return { account }
  } catch (error) {
    console.error(`❌ Failed to undelete account ${accountId} for user ${userId}:`, error)
    throw error
  }
}
