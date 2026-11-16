import type {
  TransactionCategoryWidgetQuery,
  TransactionLedgerQuery,
  TransactionWidgetQuery,
} from "@domain/transactions"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import {
  createTransactionCategoryWidgetHandler,
  createTransactionLedgerHandler,
  createTransactionWidgetHandler,
} from "../../features/transactions/handlers.ts"
import { transactionDependencies } from "../transaction-dependencies.ts"
import { db } from "../../services/db.ts"

/** The ledger runs on the entries and the household's base currency; the rates come with entries. */
export const transactionLedgerHandler: QueryHandler<TransactionLedgerQuery> =
  createTransactionLedgerHandler({ ...transactionDependencies, settings: db.householdSettings })

/** The overview's money widgets read the same ledger, through the same dependencies. */
export const transactionWidgetHandler: QueryHandler<TransactionWidgetQuery> =
  createTransactionWidgetHandler({ ...transactionDependencies, settings: db.householdSettings })

/** "Where did the money go?" reads the same ledger, and the household's category names. */
export const transactionCategoryWidgetHandler: QueryHandler<TransactionCategoryWidgetQuery> =
  createTransactionCategoryWidgetHandler({
    ...transactionDependencies,
    settings: db.householdSettings,
    categories: db.category,
  })
