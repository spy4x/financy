import {
  assertCanChangeHouseholdSettings,
  type CoinPrice,
  defaultHouseholdSettings,
  type HouseholdRateReader,
  type HouseholdSettings,
  type HouseholdSettingsRepository,
  type HouseholdSettingsUpdateInput,
  HouseholdVersionConflictError,
} from "@domain/money"
import type { GroupRoleLookup } from "@domain/notes"
import type { ExchangeRate } from "@spy4x/platform/universal/money"

/**
 * Household settings in memory, for the transport tests. Like the Postgres one, a save checks the
 * actor's role again, as the write's transaction does, then the version.
 */
export class MemoryHouseholdSettings implements HouseholdSettingsRepository {
  readonly saved = new Map<string, HouseholdSettings>()
  writes = 0

  constructor(private readonly groups: GroupRoleLookup) {}

  get(groupId: string): Promise<HouseholdSettings> {
    return Promise.resolve(this.saved.get(groupId) ?? defaultHouseholdSettings(groupId))
  }

  async update(input: HouseholdSettingsUpdateInput, actorId: number): Promise<HouseholdSettings> {
    assertCanChangeHouseholdSettings(await this.groups.roleOf(input.groupId, actorId))
    const before = await this.get(input.groupId)
    if (before.version !== input.expectedVersion) throw new HouseholdVersionConflictError(before)
    const after = {
      groupId: input.groupId,
      baseCurrency: input.baseCurrency,
      version: before.version + 1,
      chosen: true,
      updatedAt: new Date(0),
    }
    this.saved.set(input.groupId, after)
    this.writes++
    return after
  }
}

/**
 * Rates in memory: `ecb` is what the ECB sent, `rated` every code with a rate, `coins` the stored
 * coin prices.
 */
export function memoryRates(
  ecb: ExchangeRate[],
  rated: string[],
  coins: CoinPrice[] = [],
): HouseholdRateReader {
  return {
    latestEcbRates: (codes) => Promise.resolve(ecb.filter((rate) => codes.includes(rate.quote))),
    ratedCurrencies: () => Promise.resolve(rated),
    coinPrices: () => Promise.resolve(coins),
  }
}
