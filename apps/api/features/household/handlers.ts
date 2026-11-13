import type { CommandHandler, QueryHandler } from "@spy4x/platform/cqrs"
import {
  assertCanChangeHouseholdSettings,
  assertCanReadHouseholdSettings,
  type HouseholdRateReader,
  HouseholdSettingsQuery,
  type HouseholdSettingsRepository,
  HouseholdUpdateSettingsCommand,
} from "@domain/money"
import type { GroupRoleLookup } from "@domain/notes"

/** What the household handlers need: the settings, the ECB's rates, and the actor's role. */
export interface HouseholdHandlerDependencies {
  settings: HouseholdSettingsRepository
  rates: HouseholdRateReader
  groups: GroupRoleLookup
}

/**
 * `household.updateSettings`: an admin or the owner changes the main currency. The role is checked
 * here and again in the write's transaction, which also checks the version, writes the audit row
 * and records the change on the group, so a member removed while the write waits is refused.
 */
export function createHouseholdUpdateSettingsHandler(
  { settings, groups }: HouseholdHandlerDependencies,
): CommandHandler<HouseholdUpdateSettingsCommand> {
  return async ({ data }) => {
    assertCanChangeHouseholdSettings(await groups.roleOf(data.groupId, data.actor.userId))
    return {
      settings: await settings.update(
        {
          groupId: data.groupId,
          baseCurrency: data.baseCurrency,
          expectedVersion: data.version,
          requestId: data.requestId,
        },
        data.actor.userId,
      ),
    }
  }
}

/**
 * `household.settings`: every member reads the main currency, every currency this server has a
 * daily rate for, the latest ECB rate of each, and today's coin prices. A fallback rate is never
 * sent to a client: its provider's terms forbid it. No API token may send this query
 * (`cqrs/token-scope.ts`), so coin prices never leave through the token API either.
 */
export function createHouseholdSettingsHandler(
  { settings, rates, groups }: HouseholdHandlerDependencies,
): QueryHandler<HouseholdSettingsQuery> {
  return async ({ data }) => {
    assertCanReadHouseholdSettings(await groups.roleOf(data.groupId, data.actor.userId))
    const ratedCurrencies = await rates.ratedCurrencies()
    return {
      settings: await settings.get(data.groupId),
      rates: await rates.latestEcbRates(ratedCurrencies),
      ratedCurrencies,
      coinPrices: await rates.coinPrices(),
    }
  }
}
