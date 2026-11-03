import { BillingPortalCommand } from "@domain/billing"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createBillingPortalHandler } from "../../features/billing/handlers.ts"
import { billingDependencies } from "../billing-dependencies.ts"

export const billingPortalHandler: CommandHandler<BillingPortalCommand> =
  createBillingPortalHandler(billingDependencies)
