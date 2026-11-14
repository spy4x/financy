import { TransferDeleteCommand } from "@domain/transfers"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createTransferDeleteHandler } from "../../features/transfers/handlers.ts"
import { transferDependencies } from "../transfer-dependencies.ts"

export const transferDeleteHandler: CommandHandler<TransferDeleteCommand> =
  createTransferDeleteHandler(
    transferDependencies,
  )
