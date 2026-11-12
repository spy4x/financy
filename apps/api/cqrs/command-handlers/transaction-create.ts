import { TransactionCreateCommand } from "@domain/transactions"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createTransactionCreateHandler } from "../../features/transactions/handlers.ts"
import { transactionDependencies } from "../transaction-dependencies.ts"

export const transactionCreateHandler: CommandHandler<TransactionCreateCommand> =
  createTransactionCreateHandler(transactionDependencies)
