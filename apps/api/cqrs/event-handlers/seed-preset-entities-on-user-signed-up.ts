import { UserSignedUpEvent } from "@api/cqrs/events.ts"
import {
  AccountCreateCommand,
  CategoryCreateCommand,
  GroupCreateCommand,
  GroupUpdateCommand,
  UserSettingsUpsertCommand,
} from "@api/cqrs/commands.ts"
import { AccountBase, CategoryBase, CategoryType, GroupRole, Theme } from "@shared/types"
import { commandBus } from "@api/services/commandBus.ts"

// Common account presets for new users
const DEFAULT_ACCOUNTS: Omit<AccountBase, "groupId">[] = [
  {
    name: "Checking Account",
    currencyId: 1, // USD - first currency in migration
    startingBalance: 0,
  },
  {
    name: "Savings Account",
    currencyId: 1, // USD - first currency in migration
    startingBalance: 0,
  },
]

// Common category presets with reasonable monthly limits (in cents)
const DEFAULT_CATEGORIES: Omit<CategoryBase, "groupId">[] = [
  {
    name: "Groceries",
    type: CategoryType.EXPENSE,
    monthlyLimit: 50000,
    icon: "🛒",
    color: "#10B981",
  }, // $500
  {
    name: "Restaurants",
    type: CategoryType.EXPENSE,
    monthlyLimit: 30000,
    icon: "🍽️",
    color: "#84CC16",
  }, // $300
  {
    name: "Transportation",
    type: CategoryType.EXPENSE,
    monthlyLimit: 25000,
    icon: "🚗",
    color: "#F59E0B",
  }, // $250
  {
    name: "Utilities",
    type: CategoryType.EXPENSE,
    monthlyLimit: 20000,
    icon: "⚡",
    color: "#3B82F6",
  }, // $200
  {
    name: "Entertainment",
    type: CategoryType.EXPENSE,
    monthlyLimit: 15000,
    icon: "🎬",
    color: "#EC4899",
  }, // $150
  {
    name: "Healthcare",
    type: CategoryType.EXPENSE,
    monthlyLimit: 25000,
    icon: "⚕️",
    color: "#EF4444",
  }, // $250
  {
    name: "Shopping",
    type: CategoryType.EXPENSE,
    monthlyLimit: 20000,
    icon: "🛍️",
    color: "#8B5CF6",
  }, // $200
  { name: "Gas", type: CategoryType.EXPENSE, monthlyLimit: 15000, icon: "⛽", color: "#F97316" }, // $150
  {
    name: "Coffee & Snacks",
    type: CategoryType.EXPENSE,
    monthlyLimit: 10000,
    icon: "☕",
    color: "#92400E",
  }, // $100
  {
    name: "Subscriptions",
    type: CategoryType.EXPENSE,
    monthlyLimit: 5000,
    icon: "💳",
    color: "#6B7280",
  }, // $50
  { name: "Salary", type: CategoryType.INCOME, monthlyLimit: null, icon: "💰", color: "#059669" }, // No limit for income
  {
    name: "Freelance",
    type: CategoryType.INCOME,
    monthlyLimit: null,
    icon: "💻",
    color: "#7C3AED",
  }, // No limit for income
]

/**
 * Handler for creating preset entities (group, accounts, categories) when a user signs up
 */
export const seedPresetEntitiesOnUserSignedUpHandler = async (event: UserSignedUpEvent) => {
  const { user, username } = event.data

  console.log(`Creating preset entities for user ${user.id} (${username})...`)

  try {
    // 1. Create the default "Personal" group first
    const groupResult = await commandBus.execute(
      new GroupCreateCommand({
        group: {
          name: "Personal",
          currencyId: 1, // USD - first currency in migration
          defaultAccountId: null, // Will be set later after creating accounts
        },
        userId: user.id,
        role: GroupRole.OWNER,
      }),
    )

    const groupId = groupResult.group.id
    console.log(`✅ Default "Personal" group created (ID: ${groupId})`)

    // 1.1. Create default user settings with the newly created group as selected
    try {
      await commandBus.execute(
        new UserSettingsUpsertCommand({
          userId: user.id,
          settings: {
            theme: Theme.SYSTEM,
            selectedGroupId: groupId,
          },
        }),
      )
      console.log(`✅ Default user settings created for user ${user.id}`)
    } catch (error) {
      console.error(`❌ Failed to create user settings for user ${user.id}:`, error)
      // Continue anyway as this is not critical for the user experience
    }

    // 2. Create default accounts
    console.log(`Creating default accounts for group ${groupId}...`)
    let firstAccountId: number | null = null
    for (const accountData of DEFAULT_ACCOUNTS) {
      try {
        const accountResult = await commandBus.execute(
          new AccountCreateCommand({
            account: {
              ...accountData,
              groupId,
            },
            userId: user.id,
          }),
        )
        console.log(
          `✅ Account "${accountResult.account.name}" created (ID: ${accountResult.account.id})`,
        )
        // Remember the first account to set as default
        if (firstAccountId === null) {
          firstAccountId = accountResult.account.id
        }
      } catch (error) {
        console.error(`❌ Failed to create account "${accountData.name}":`, error)
        // Continue with other accounts even if one fails
      }
    }

    // 2.1. Set the first account as the default account for the group
    if (firstAccountId) {
      try {
        await commandBus.execute(
          new GroupUpdateCommand({
            groupId,
            updates: { defaultAccountId: firstAccountId },
            userId: user.id,
          }),
        )
        console.log(`✅ Set account ${firstAccountId} as default for group ${groupId}`)
      } catch (error) {
        console.error(`❌ Failed to set default account for group ${groupId}:`, error)
      }
    }

    // 3. Create default categories
    console.log(`Creating default categories for group ${groupId}...`)
    for (const categoryData of DEFAULT_CATEGORIES) {
      try {
        const categoryResult = await commandBus.execute(
          new CategoryCreateCommand({
            category: {
              ...categoryData,
              groupId,
            },
            userId: user.id,
          }),
        )
        console.log(
          `✅ Category "${categoryResult.category.name}" created (ID: ${categoryResult.category.id})`,
        )
      } catch (error) {
        console.error(`❌ Failed to create category "${categoryData.name}":`, error)
        // Continue with other categories even if one fails
      }
    }

    console.log(`✅ All preset entities created successfully for user ${user.id} (${username})`)
  } catch (error) {
    console.error(`❌ Failed to create preset entities for user ${user.id} (${username}):`, error)
    // Note: We don't throw here to avoid affecting the user creation process
    // The user can still manually create entities later
  }
}
