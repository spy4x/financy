import { CommandBus } from "@spy4x/platform/cqrs"
import { sessionGate } from "@api/cqrs/session-gate.ts"

export const commandBus = new CommandBus()
commandBus.use(sessionGate)
