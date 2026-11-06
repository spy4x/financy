import { type } from "arktype"
import type { Command, Query } from "@spy4x/platform/cqrs"
import { currencyCode, type ExchangeRate } from "@spy4x/platform/universal/money"
import { UUID_PATTERN } from "@spy4x/platform/universal/uuid"
import { type FieldErrors, fieldErrors } from "@spy4x/validation"
import type { Actor } from "@domain/identity"
import { assertCanEditDetails, GroupError, type GroupRole } from "@domain/groups"

/**
 * A household's main currency and the exchange rates its totals convert through. The main
 * currency is a Financy setting of a group, kept in its own table (`household_settings`) so the
 * group files stay Seed's. Rates are reference data the worker fetches each day; a household never
 * writes one. `docs/financy/exchange-rates.md` is the operator's guide.
 */

/** The main currency of a group nobody has chosen one for. */
export const DEFAULT_BASE_CURRENCY = "EUR"

/** The base every ECB rate is quoted in: one euro buys `rate` of the quote. */
export const ECB_BASE = "EUR"

/** The first day of the ECB's reference rates. Nothing earlier is fetched. */
export const ECB_FIRST_DATE = "1999-01-04"

/**
 * The sources a rate row names, as the ts-libs clients name themselves: the ECB through
 * Frankfurter, and the paid fallback (exchangerate-api.com). A fallback rate never leaves the
 * server: its provider's terms forbid serving it through an API.
 */
export const RATE_SOURCES = {
  ecb: "frankfurter:ECB",
  fallback: "exchangerate-api",
} as const

/** The kinds of the outbox and audit rows a settings change writes. */
export const HOUSEHOLD_EVENTS = {
  /** The group's change log entry: other members' pages read the settings again. */
  settingsUpdated: "household.settings_updated",
  /** The activity row, with the old and the new currency. */
  mainCurrencyChanged: "household.main_currency_changed",
} as const

/**
 * The rate a conversion uses, or why there is none. A found rate is that date's or the latest
 * earlier one (R6), with the date and source it is for. `rate` may be quoted either way round, as
 * `convertMoney` accepts. No rate is a typed answer a screen names, never `0` or `1`.
 */
export type RateLookup =
  | { found: true; rate: ExchangeRate }
  | { found: false; reason: "no-rate" }

/** A group's household settings as the API returns them. */
export interface HouseholdSettings {
  groupId: string
  baseCurrency: string
  /**
   * `0` while the group has the default and nobody saved; then 1 and up, growing by one with each
   * save. A save names the version it was made from.
   */
  version: number
  /** Whether a person saved the setting; the default does not count (the first step). */
  chosen: boolean
  updatedAt: Date | null
}

/** The settings of a group nobody saved yet. */
export function defaultHouseholdSettings(groupId: string): HouseholdSettings {
  return {
    groupId,
    baseCurrency: DEFAULT_BASE_CURRENCY,
    version: 0,
    chosen: false,
    updatedAt: null,
  }
}

/**
 * What the settings section reads: the settings, the latest ECB rate of each currency the group
 * uses with its date, and every currency this server has a daily rate for. Fallback rates are never
 * in `rates`; a currency only the fallback covers is still in `ratedCurrencies`, which names codes,
 * not rates.
 */
export interface HouseholdSettingsView {
  settings: HouseholdSettings
  rates: ExchangeRate[]
  ratedCurrencies: string[]
}

export type HouseholdErrorCode =
  | "GROUP_NOT_FOUND"
  | "INVALID_REQUEST"
  | "ROLE_INSUFFICIENT"
  | "VERSION_CONFLICT"

export class HouseholdError extends Error {
  constructor(
    public readonly code: HouseholdErrorCode,
    message: string,
    /** Each failed field's code and rule, when a schema refused the request. */
    public readonly fields?: FieldErrors,
  ) {
    super(message)
    this.name = "HouseholdError"
  }
}

/**
 * A save named a version the settings moved past: another member saved first. It carries the
 * settings as they are now, so the dialog can say what the other member chose.
 */
export class HouseholdVersionConflictError extends HouseholdError {
  constructor(public readonly current: HouseholdSettings) {
    super("VERSION_CONFLICT", "The settings were changed by someone else")
    this.name = "HouseholdVersionConflictError"
  }
}

// #region Request schemas
const groupIdField = { groupId: UUID_PATTERN } as const

/** The `household.updateSettings` payload: the new main currency and the version it replaces. */
export const householdUpdateSettingsPayloadSchema = type({
  ...groupIdField,
  baseCurrency: currencyCode,
  version: "number.integer >= 0",
  "+": "reject",
})

/** The `household.settings` payload. */
export const householdSettingsPayloadSchema = type({ ...groupIdField, "+": "reject" })

/**
 * Validates a `household.*` payload. A currency is one of the ISO 4217 table in ts-libs; anything
 * else is refused with `HouseholdError("INVALID_REQUEST")`.
 */
export function parseHouseholdRequest<
  S extends typeof householdUpdateSettingsPayloadSchema | typeof householdSettingsPayloadSchema,
>(schema: S, value: unknown): S["infer"] {
  const result = schema(value)
  if (result instanceof type.errors) {
    throw new HouseholdError("INVALID_REQUEST", result.summary, fieldErrors(result))
  }
  return result as S["infer"]
}
// #endregion Request schemas

// #region Authorization
/**
 * Throws unless `role` may change the household settings: Seed's rule for a group's details, an
 * admin or the owner. A stranger is told the group does not exist.
 */
export function assertCanChangeHouseholdSettings(role: GroupRole | null): void {
  try {
    assertCanEditDetails(role)
  } catch (error) {
    if (error instanceof GroupError && error.code === "ROLE_INSUFFICIENT") {
      throw new HouseholdError(
        "ROLE_INSUFFICIENT",
        "Only an admin or the owner can change the main currency",
      )
    }
    if (error instanceof GroupError) throw new HouseholdError("GROUP_NOT_FOUND", "Group not found")
    throw error
  }
}

/** Throws `GROUP_NOT_FOUND` unless `role` is a member's: every member reads the settings. */
export function assertCanReadHouseholdSettings(role: GroupRole | null): void {
  if (role === null) throw new HouseholdError("GROUP_NOT_FOUND", "Group not found")
}
// #endregion Authorization

// #region Commands and queries
export interface HouseholdUpdateSettingsPayload {
  actor: Actor
  groupId: string
  baseCurrency: string
  /** The version the person saw; `0` for the default. */
  version: number
  requestId?: string
  idempotencyKey?: string
}

export class HouseholdUpdateSettingsCommand
  implements Command<HouseholdUpdateSettingsPayload, { settings: HouseholdSettings }> {
  __resultType?: { settings: HouseholdSettings }
  constructor(public data: HouseholdUpdateSettingsPayload) {}
}

export interface HouseholdSettingsPayload {
  actor: Actor
  groupId: string
}

export class HouseholdSettingsQuery
  implements Query<HouseholdSettingsPayload, HouseholdSettingsView> {
  __resultType?: HouseholdSettingsView
  constructor(public data: HouseholdSettingsPayload) {}
}
// #endregion Commands and queries

// #region Ports
export interface HouseholdSettingsUpdateInput {
  groupId: string
  baseCurrency: string
  expectedVersion: number
  requestId?: string
}

/**
 * Where household settings are kept. A write locks the actor's membership row and checks the role
 * again in its transaction, then audits and records the change on the group.
 */
export interface HouseholdSettingsRepository {
  /** The group's settings, the default when nobody saved. */
  get(groupId: string): Promise<HouseholdSettings>
  /**
   * Throws `GROUP_NOT_FOUND` for a removed member or a deleted group, `ROLE_INSUFFICIENT` for a
   * role below admin, and {@link HouseholdVersionConflictError} for a stale version.
   */
  update(input: HouseholdSettingsUpdateInput, actorId: number): Promise<HouseholdSettings>
}

/** The rates a settings view needs, without the fallback's. */
export interface HouseholdRateReader {
  /** The latest ECB rate of each of `currencies` against the euro, with its date. */
  latestEcbRates(currencies: readonly string[]): Promise<ExchangeRate[]>
  /** Every currency with a rate from any source in the last week, plus the euro. */
  ratedCurrencies(): Promise<string[]>
}
// #endregion Ports

// #region Group files
/**
 * The household settings in a group's export file: one entry, named by the exported group's id,
 * with the main currency and whether a person chose it. An import gives the new group the same.
 */
export const householdExportEntrySchema = type({
  id: UUID_PATTERN,
  baseCurrency: currencyCode,
  chosen: "boolean",
})
export type HouseholdExportEntry = typeof householdExportEntrySchema.infer

/** Checks one household entry of a file. Throws `INVALID_REQUEST` naming what is wrong. */
export function parseHouseholdExportEntry(entry: unknown): HouseholdExportEntry {
  const parsed = householdExportEntrySchema(entry)
  if (parsed instanceof type.errors) {
    throw new HouseholdError("INVALID_REQUEST", `household settings: ${parsed.summary}`)
  }
  return parsed
}
// #endregion Group files

// #region Reading the API's answer
const settingsShape = type({
  groupId: UUID_PATTERN,
  baseCurrency: currencyCode,
  version: "number.integer >= 0",
  chosen: "boolean",
  updatedAt: "string.date.iso.parse | null",
})
const rateShape = type({
  base: "string",
  quote: "string",
  rate: /^\d+(\.\d+)?$/,
  date: /^\d{4}-\d{2}-\d{2}$/,
  source: "string",
})
const viewShape = type({
  settings: settingsShape,
  rates: rateShape.array(),
  ratedCurrencies: "string[]",
})

/** The settings view the API sent, or `null` when it is not one (a client reads untrusted JSON). */
export function readHouseholdSettingsView(value: unknown): HouseholdSettingsView | null {
  const parsed = viewShape(value)
  return parsed instanceof type.errors ? null : parsed
}

/** The settings the API sent with a save or a conflict, or `null` when they are not. */
export function readHouseholdSettings(value: unknown): HouseholdSettings | null {
  const parsed = settingsShape(value)
  return parsed instanceof type.errors ? null : parsed
}
// #endregion Reading the API's answer

/**
 * The admin's Exchange rates page (`GET /api/admin/rates`): the daily job's last run, each
 * source's last fetch, the main currencies in use with no rate on the latest rate day, the paid
 * fallback's calls this month, and the last 7 days. It names no household and counts none.
 */
export interface AdminRatesSnapshot {
  /** The daily job's last finished run, or `null` before the first. */
  lastRun: { at: string; failed: boolean } | null
  /** Each source's last fetch: when (ISO 8601) and how many rates it stored then. */
  fetches: { source: string; fetchedAt: string; count: number }[]
  /** The main currencies in use with no rate on `date`: the latest ECB day, else today. */
  missing: { date: string; currencies: string[] }
  /** The paid fallback's calls this month, or `null` while it is off. */
  fallback: { used: number; cap: number; resetsOn: string } | null
  /** The last 7 days, newest first; a day no source has rates for has no rows. */
  days: { date: string; rows: { source: string; currencies: number; fetchedAt: string }[] }[]
}
