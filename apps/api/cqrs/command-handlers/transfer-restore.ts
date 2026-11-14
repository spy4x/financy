import { TransferRestoreCommand } from "@domain/transfers"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createTransferRestoreHandler } from "../../features/transfers/handlers.ts"
import { transferDependencies } from "../transfer-dependencies.ts"

export const transferRestoreHandler: CommandHandler<TransferRestoreCommand> =
  createTransferRestoreHandler(
    transferDependencies,
  )
