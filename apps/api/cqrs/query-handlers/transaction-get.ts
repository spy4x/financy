import { TransactionGetQuery } from "@domain/transactions"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createTransactionGetHandler } from "../../features/transactions/handlers.ts"
import { transactionDependencies } from "../transaction-dependencies.ts"

export const transactionGetHandler: QueryHandler<TransactionGetQuery> = createTransactionGetHandler(
  transactionDependencies,
)
