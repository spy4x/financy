import { BillingGetQuery } from "@domain/billing"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createBillingGetHandler } from "../../features/billing/handlers.ts"
import { billingDependencies } from "../billing-dependencies.ts"

export const billingGetHandler: QueryHandler<BillingGetQuery> = createBillingGetHandler(
  billingDependencies,
)
