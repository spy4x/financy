import { AccountRestoreCommand } from "@domain/accounts"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createAccountRestoreHandler } from "../../features/accounts/handlers.ts"
import { accountDependencies } from "../account-dependencies.ts"

export const accountRestoreHandler: CommandHandler<AccountRestoreCommand> =
  createAccountRestoreHandler(
    accountDependencies,
  )
