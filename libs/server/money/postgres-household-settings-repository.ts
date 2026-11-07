import type postgres from "postgres"
import {
  assertCanChangeHouseholdSettings,
  defaultHouseholdSettings,
  HOUSEHOLD_EVENTS,
  HouseholdError,
  type HouseholdSettings,
  type HouseholdSettingsRepository,
  type HouseholdSettingsUpdateInput,
  HouseholdVersionConflictError,
} from "@domain/money"
import {
  GroupNotActiveError,
  lockActorRole,
  recordGroupChange,
} from "@server/groups/group-change-log.ts"
import { writeAuditEvent } from "@server/groups/audit.ts"

interface SettingsRow {
  groupId: string
  baseCurrency: string
  version: number
  chosen: boolean
  updatedAt: Date
}

function toSettings(row: SettingsRow): HouseholdSettings {
  return {
    groupId: row.groupId,
    baseCurrency: row.baseCurrency,
    version: row.version,
    chosen: row.chosen,
    updatedAt: row.updatedAt,
  }
}

/**
 * A group's household settings in Postgres. A group without a row has the default, the euro, at
 * version 0; the first save inserts the row. Every save runs in one transaction that locks the
 * group and the actor's membership row (`lockActorRole`), checks the role there, writes with a
 * version check, and writes the audit row and the group's change record.
 */
export class PostgresHouseholdSettingsRepository implements HouseholdSettingsRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async get(groupId: string): Promise<HouseholdSettings> {
    const [row] = await this.sql<SettingsRow[]>`
      SELECT group_id, base_currency, version, chosen_at IS NOT NULL AS chosen, updated_at
      FROM household_settings WHERE group_id = ${groupId}
    `
    return row ? toSettings(row) : defaultHouseholdSettings(groupId)
  }

  async update(input: HouseholdSettingsUpdateInput, actorId: number): Promise<HouseholdSettings> {
    return await this.sql.begin(async (transaction: postgres.TransactionSql) => {
      try {
        assertCanChangeHouseholdSettings(await lockActorRole(transaction, input.groupId, actorId))
      } catch (error) {
        if (error instanceof GroupNotActiveError) {
          throw new HouseholdError("GROUP_NOT_FOUND", "Group not found")
        }
        throw error
      }
      const before = await new PostgresHouseholdSettingsRepository(transaction).get(input.groupId)
      if (before.version !== input.expectedVersion) {
        throw new HouseholdVersionConflictError(before)
      }
      // The group row is locked above, so no other save of this group runs between the read and
      // this write: version 0 inserts the first row, any other version moves the existing one.
      const [row] = await transaction<SettingsRow[]>`
        INSERT INTO household_settings
          (group_id, base_currency, version, updated_by_user_id, chosen_at)
        VALUES (${input.groupId}, ${input.baseCurrency}, 1, ${actorId}, CURRENT_TIMESTAMP)
        ON CONFLICT (group_id) DO UPDATE SET
          base_currency = EXCLUDED.base_currency,
          version = household_settings.version + 1,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          chosen_at = COALESCE(household_settings.chosen_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
        RETURNING group_id, base_currency, version, chosen_at IS NOT NULL AS chosen, updated_at
      `
      await writeAuditEvent(transaction, {
        eventKind: HOUSEHOLD_EVENTS.mainCurrencyChanged,
        actorId,
        groupId: input.groupId,
        requestId: input.requestId,
        details: { from: before.baseCurrency, to: input.baseCurrency },
      })
      await recordGroupChange(transaction, input.groupId, actorId, HOUSEHOLD_EVENTS.settingsUpdated)
      return toSettings(row)
    })
  }
}
