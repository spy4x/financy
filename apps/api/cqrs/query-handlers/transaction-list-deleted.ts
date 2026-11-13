import { TransactionListDeletedQuery } from "@domain/transactions"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createTransactionListDeletedHandler } from "../../features/transactions/handlers.ts"
import { transactionDependencies } from "../transaction-dependencies.ts"

export const transactionListDeletedHandler: QueryHandler<TransactionListDeletedQuery> =
  createTransactionListDeletedHandler(transactionDependencies)
