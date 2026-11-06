import { AccountCreateCommand } from "@domain/accounts"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createAccountCreateHandler } from "../../features/accounts/handlers.ts"
import { accountDependencies } from "../account-dependencies.ts"

export const accountCreateHandler: CommandHandler<AccountCreateCommand> =
  createAccountCreateHandler(
    accountDependencies,
  )
