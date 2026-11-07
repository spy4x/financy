import { AccountArchiveCommand } from "@domain/accounts"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createAccountArchiveHandler } from "../../features/accounts/handlers.ts"
import { accountDependencies } from "../account-dependencies.ts"

export const accountArchiveHandler: CommandHandler<AccountArchiveCommand> =
  createAccountArchiveHandler(
    accountDependencies,
  )
