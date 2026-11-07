import { AccountListQuery } from "@domain/accounts"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createAccountListHandler } from "../../features/accounts/handlers.ts"
import { accountDependencies } from "../account-dependencies.ts"

export const accountListHandler: QueryHandler<AccountListQuery> = createAccountListHandler(
  accountDependencies,
)
