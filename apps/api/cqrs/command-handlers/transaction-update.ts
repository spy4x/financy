import { TransactionUpdateCommand } from "@domain/transactions"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createTransactionUpdateHandler } from "../../features/transactions/handlers.ts"
import { transactionDependencies } from "../transaction-dependencies.ts"

export const transactionUpdateHandler: CommandHandler<TransactionUpdateCommand> =
  createTransactionUpdateHandler(transactionDependencies)
