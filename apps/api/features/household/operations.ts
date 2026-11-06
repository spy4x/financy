import {
  type HouseholdSettings,
  householdSettingsPayloadSchema,
  HouseholdSettingsQuery,
  type HouseholdSettingsView,
  HouseholdUpdateSettingsCommand,
  householdUpdateSettingsPayloadSchema,
  parseHouseholdRequest,
} from "@domain/money"
import type { Actor } from "@domain/identity"
import type { Operations } from "@spy4x/realtime/operations"

/** What the household requests need from the app: the buses. */
export interface HouseholdOperationDependencies {
  updateSettings(command: HouseholdUpdateSettingsCommand): Promise<{ settings: HouseholdSettings }>
  settings(query: HouseholdSettingsQuery): Promise<HouseholdSettingsView>
}

/**
 * The household commands and queries. The socket and `POST /api/call/<name>` both serve this
 * list, so they have no REST route. Each one parses its payload and dispatches on the bus; who may
 * do what is decided in the handlers.
 */
export function createHouseholdOperations(
  dependencies: HouseholdOperationDependencies,
): Operations<Actor> {
  return {
    "household.updateSettings": {
      kind: "command",
      handle: async ({ actor, requestId, payload, idempotencyKey }) => {
        const input = parseHouseholdRequest(householdUpdateSettingsPayloadSchema, payload)
        return await dependencies.updateSettings(
          new HouseholdUpdateSettingsCommand({ actor, ...input, requestId, idempotencyKey }),
        )
      },
    },
    "household.settings": {
      kind: "query",
      handle: async ({ actor, payload }) => {
        const input = parseHouseholdRequest(householdSettingsPayloadSchema, payload)
        return await dependencies.settings(new HouseholdSettingsQuery({ actor, ...input }))
      },
    },
  }
}
