import { AccountDeleteCommand } from "@domain/accounts"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createAccountDeleteHandler } from "../../features/accounts/handlers.ts"
import { accountDependencies } from "../account-dependencies.ts"

export const accountDeleteHandler: CommandHandler<AccountDeleteCommand> =
  createAccountDeleteHandler(
    accountDependencies,
  )
