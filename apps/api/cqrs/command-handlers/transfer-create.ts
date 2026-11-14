import { TransferCreateCommand } from "@domain/transfers"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createTransferCreateHandler } from "../../features/transfers/handlers.ts"
import { transferDependencies } from "../transfer-dependencies.ts"

export const transferCreateHandler: CommandHandler<TransferCreateCommand> =
  createTransferCreateHandler(
    transferDependencies,
  )
