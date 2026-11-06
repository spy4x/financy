import { AccountUpdateCommand } from "@domain/accounts"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createAccountUpdateHandler } from "../../features/accounts/handlers.ts"
import { accountDependencies } from "../account-dependencies.ts"

export const accountUpdateHandler: CommandHandler<AccountUpdateCommand> =
  createAccountUpdateHandler(
    accountDependencies,
  )
