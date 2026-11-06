import { AccountGetQuery } from "@domain/accounts"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createAccountGetHandler } from "../../features/accounts/handlers.ts"
import { accountDependencies } from "../account-dependencies.ts"

export const accountGetHandler: QueryHandler<AccountGetQuery> = createAccountGetHandler(
  accountDependencies,
)
