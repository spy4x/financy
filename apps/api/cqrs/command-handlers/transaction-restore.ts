import { TransactionRestoreCommand } from "@domain/transactions"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createTransactionRestoreHandler } from "../../features/transactions/handlers.ts"
import { transactionDependencies } from "../transaction-dependencies.ts"

export const transactionRestoreHandler: CommandHandler<TransactionRestoreCommand> =
  createTransactionRestoreHandler(transactionDependencies)
