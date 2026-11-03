import type { CommandBus, CqrsMiddleware } from "@spy4x/platform/cqrs"

export interface CommandMiddleware {
  /** Replays a retried command's first result (`@spy4x/server/idempotency`). */
  idempotency: CqrsMiddleware
  /** Refuses a command the group's plan does not allow (`entitlement-gate.ts`). */
  entitlements: CqrsMiddleware
}

/**
 * Attaches the command bus's middleware after the session gate, in the one order that works:
 *
 * 1. Idempotency, so a command from a session that may not act never reaches the key store, and a
 *    retry of a command that already landed gets its stored answer without running again.
 * 2. The entitlement gate, after the key store, so that retry is answered even when the group has
 *    reached its cap since. The query bus has no such gate: reads are never refused.
 */
export function useCommandMiddleware(bus: CommandBus, middleware: CommandMiddleware): void {
  bus.use(middleware.idempotency)
  bus.use(middleware.entitlements)
}
