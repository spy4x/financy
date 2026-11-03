import { BillingCheckoutCommand } from "@domain/billing"
import type { CommandHandler } from "@spy4x/platform/cqrs"
import { createBillingCheckoutHandler } from "../../features/billing/handlers.ts"
import { billingDependencies } from "../billing-dependencies.ts"

export const billingCheckoutHandler: CommandHandler<BillingCheckoutCommand> =
  createBillingCheckoutHandler(billingDependencies)
