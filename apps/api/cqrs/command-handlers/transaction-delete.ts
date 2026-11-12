import { TransactionDeleteCommand } from "@domain/transactions"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createTransactionDeleteHandler } from "../../features/transactions/handlers.ts"
import { transactionDependencies } from "../transaction-dependencies.ts"

export const transactionDeleteHandler: CommandHandler<TransactionDeleteCommand> =
  createTransactionDeleteHandler(transactionDependencies)
