import { TransferUpdateCommand } from "@domain/transfers"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createTransferUpdateHandler } from "../../features/transfers/handlers.ts"
import { transferDependencies } from "../transfer-dependencies.ts"

export const transferUpdateHandler: CommandHandler<TransferUpdateCommand> =
  createTransferUpdateHandler(
    transferDependencies,
  )
