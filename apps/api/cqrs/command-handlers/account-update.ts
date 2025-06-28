import { CommandHandler } from "@shared/cqrs/types.ts"
import { AccountUpdateCommand } from "@api/cqrs/commands.ts"
import { AccountUpdatedEvent } from "@api/cqrs/events.ts"
import { db } from "@api/services/db.ts"
import { eventBus } from "@api/services/eventBus.ts"

/**
 * Handler for updating an account
 */
export const AccountUpdateHandler: CommandHandler<AccountUpdateCommand> = async (command) => {
  const { accountId, updates, userId, acknowledgmentId } = command.data

  console.log(`Updating account ${accountId} for user ${userId}...`)

  try {
    // Find the existing account
    const existingAccount = await db.account.findOne({ id: accountId })
    if (!existingAccount) {
      throw new Error("Account not found")
    }

    // Verify user has access to this account
    const hasAccess = await db.account.verifyLegitimacy({
      ...existingAccount,
      ...updates,
    }, userId)
    if (!hasAccess) {
      throw new Error("Access denied to this account")
    }

    // Update the account
    const account = await db.account.updateOne({
      id: accountId,
      data: updates,
    })

    if (!account) {
      throw new Error("Failed to update account")
    }

    console.log(`✅ Account ${accountId} updated successfully`)

    // Emit event for real-time updates
    eventBus.emit(
      new AccountUpdatedEvent({
        account,
        userId,
        acknowledgmentId,
      }),
    )

    return { account }
  } catch (error) {
    console.error(`❌ Failed to update account ${accountId} for user ${userId}:`, error)
    throw error
  }
}
