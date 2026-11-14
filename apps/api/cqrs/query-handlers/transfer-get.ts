import { TransferGetQuery } from "@domain/transfers"
import type { QueryHandler } from "@spy4x/platform/cqrs"
import { createTransferGetHandler } from "../../features/transfers/handlers.ts"
import { transferDependencies } from "../transfer-dependencies.ts"

export const transferGetHandler: QueryHandler<TransferGetQuery> = createTransferGetHandler(
  transferDependencies,
)
