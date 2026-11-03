import { QueryBus } from "@spy4x/platform/cqrs"
import { sessionGate } from "@api/cqrs/session-gate.ts"

export const queryBus = new QueryBus()
queryBus.use(sessionGate)
