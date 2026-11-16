import { TransactionLatestQuery } from "@domain/transactions"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createTransactionLatestHandler } from "../../features/transactions/handlers.ts"
import { transactionDependencies } from "../transaction-dependencies.ts"

export const transactionLatestHandler: QueryHandler<TransactionLatestQuery> =
  createTransactionLatestHandler(transactionDependencies)
