import { AccountSetDefaultCommand } from "@domain/accounts"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createAccountSetDefaultHandler } from "../../features/accounts/handlers.ts"
import { accountDependencies } from "../account-dependencies.ts"

export const accountSetDefaultHandler: CommandHandler<AccountSetDefaultCommand> =
  createAccountSetDefaultHandler(
    accountDependencies,
  )
