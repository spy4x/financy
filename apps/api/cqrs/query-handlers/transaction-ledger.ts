import { TransactionLedgerQuery } from "@domain/transactions"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createTransactionLedgerHandler } from "../../features/transactions/handlers.ts"
import { transactionDependencies } from "../transaction-dependencies.ts"
import { db } from "../../services/db.ts"

/** The ledger runs on the entries and the household's base currency; the rates come with entries. */
export const transactionLedgerHandler: QueryHandler<TransactionLedgerQuery> =
  createTransactionLedgerHandler({ ...transactionDependencies, settings: db.householdSettings })
