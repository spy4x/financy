import type { AccountTotalQuery, AccountWidgetQuery } from "@domain/accounts"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import {
  createAccountTotalHandler,
  createAccountWidgetHandler,
} from "../../features/accounts/handlers.ts"
import { accountDependencies } from "../account-dependencies.ts"
import { db } from "../../services/db.ts"

/**
 * The household total runs on the accounts, the household settings and the rates tables. Today is
 * the server's UTC date: the rate job stores rates by the ECB's date, which is a UTC day too.
 */
const totalDependencies = {
  ...accountDependencies,
  settings: db.householdSettings,
  rates: db.rates,
  today: () => new Date().toISOString().slice(0, 10),
}

export const accountTotalHandler: QueryHandler<AccountTotalQuery> = createAccountTotalHandler(
  totalDependencies,
)

/** "How much do we have?" on the overview: the same read as the total. */
export const accountWidgetHandler: QueryHandler<AccountWidgetQuery> = createAccountWidgetHandler(
  totalDependencies,
)
