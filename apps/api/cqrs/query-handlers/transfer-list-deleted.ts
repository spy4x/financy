import { TransferListDeletedQuery } from "@domain/transfers"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createTransferListDeletedHandler } from "../../features/transfers/handlers.ts"
import { transferDependencies } from "../transfer-dependencies.ts"

export const transferListDeletedHandler: QueryHandler<TransferListDeletedQuery> =
  createTransferListDeletedHandler(transferDependencies)
