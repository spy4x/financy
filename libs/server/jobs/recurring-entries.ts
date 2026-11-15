import type postgres from "postgres"
import { effectivePlanId, entitlementsOf, type Plan, PlanError, UNLIMITED } from "@domain/billing"
import type { GroupRole } from "@domain/groups"
import {
  dueOccurrences,
  pauseReasonOf,
  RECURRING_MAKE_MAX,
  RECURRING_RULE_EVENTS,
  RecurringRuleError,
} from "@domain/recurring"
import { TransactionError, type TransactionKind } from "@domain/transactions"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { PostgresBillingRepository } from "../billing/postgres-billing-repository.ts"
import {
  GroupNotActiveError,
  lockActorRole,
  recordGroupChange,
} from "../groups/group-change-log.ts"
import { PostgresRateRepository } from "../money/postgres-rate-repository.ts"
import { PostgresTransactionRepository } from "../transactions/postgres-transaction-repository.ts"
import type { JobHandler } from "./jobs.ts"

/** The hourly job that makes the entries of repeating rules (docs/jobs.md, "Repeat a job"). */
export const RECURRING_ENTRIES_JOB = `recurring.make-entries`

/** Rules one query of the job reads; the next query goes on after the last id. */
const RULE_BATCH = 200

/** What the job needs. */
export interface RecurringEntriesDeps {
  sql: postgres.Sql
  /** Whether billing is on, and the grace period: what decides a household's plan cap. */
  billing: {
    billingEnabled: boolean
    graceDays: number
    /** The plan catalog, `PLANS` unless a test passes its own. */
    plans?: readonly Plan[]
  }
  /** Told about each rule that stopped and the run's totals; never an amount or a memo. */
  log: (line: string) => void
  /** The clock; tests pass a fixed one. */
  now?: () => Date
  /** The most entries one rule makes in one run, {@link RECURRING_MAKE_MAX} unless a test sets it. */
  max?: number
  /** Rules read per query, {@link RULE_BATCH} unless a test sets it. */
  batch?: number
}

/** What one run did, counted per entry made and per rule otherwise. */
export interface RecurringEntriesReport {
  /** Entries written. */
  made: number
  /** Rules the run paused, or found paused still. */
  paused: number
  /** Rules whose household is read-only or full this run. */
  blocked: number
  /** Rules that stopped on an error; the other rules went on. */
  failed: number
  /** Of `failed`, the rules that stopped on an error the job does not expect: the run fails. */
  unexpected: number
}

/** Some rules stopped on an error the job does not expect; the log names each rule. */
export class RecurringEntriesError extends Error {
  constructor(count: number) {
    super(`${count} repeating rules failed`)
    this.name = `RecurringEntriesError`
  }
}

/** A rule as the job reads it, with its household's date today. */
interface DueRule {
  id: string
  groupId: string
  accountId: string
  categoryId: string
  kind: TransactionKind
  amount: number
  currency: string
  accountAmount: number | null
  memo: string
  rrule: string
  startDate: string
  endDate: string | null
  count: number | null
  skippedDates: string[]
  madeThrough: string | null
  pausedReason: number | null
  version: number
  createdByUserId: number | null
  today: string
}

/** How one step on a rule ended. */
type Outcome = `made` | `existed` | `paused` | `stale` | `blocked`

/**
 * The job's handler: one run of {@link makeRecurringEntries}. A run fails, and is retried, only
 * when a rule stopped on an error the job does not expect, after every other rule had its turn;
 * a missing rate or a refused entry is logged and waits for the next hourly run.
 */
export function recurringEntriesJob(deps: RecurringEntriesDeps): JobHandler {
  return async () => {
    const report = await makeRecurringEntries(deps)
    deps.log(
      `recurring entries: made ${report.made}, paused ${report.paused}, ` +
        `blocked ${report.blocked}, failed ${report.failed}`,
    )
    if (report.unexpected > 0) throw new RecurringEntriesError(report.unexpected)
  }
}

/**
 * Makes every repeating entry that is due: for each live rule whose next day to cover has begun
 * in its household's time zone, the occurrences after its `made_through` through today
 * ({@link dueOccurrences}), at most `max` of them, each in a transaction of its own:
 *
 * - The household is locked and the author's role read again (`lockActorRole`), then the rule row
 *   (`FOR UPDATE`). A rule changed or deleted since it was read stops for this run.
 * - An author who cannot write, or an archived account or category, pauses the rule
 *   ({@link pauseReasonOf}): its reason is stored and pushed, nothing else is written, and
 *   `made_through` stays, so the missed dates are made once the cause is gone.
 * - The entry is written as the author through the entries' own path (`writeNew`): references,
 *   conversion at the occurrence's own date, the plan's room, the change pushed to the household's
 *   tabs. The unique key on rule and date turns a second write of a date into nothing.
 * - `made_through` moves forward to the date, and only forward, in the same transaction.
 *
 * A household whose plan allows no entries (read-only) or is full writes nothing this run, and is
 * not paused. Once every date of the run is made, the rule is made through the run's last day.
 */
export async function makeRecurringEntries(
  deps: RecurringEntriesDeps,
): Promise<RecurringEntriesReport> {
  const { sql, log } = deps
  const now = (deps.now ?? (() => new Date()))()
  const max = deps.max ?? RECURRING_MAKE_MAX
  const batch = deps.batch ?? RULE_BATCH
  const billing = new PostgresBillingRepository(sql)
  const rates = new PostgresRateRepository(sql)
  /** Each household's `maxTransactions` this run; `0` is read-only. */
  const allowances = new Map<string, number | null>()
  /** Households that may write nothing more this run. */
  const blocked = new Set<string>()
  const report: RecurringEntriesReport = {
    made: 0,
    paused: 0,
    blocked: 0,
    failed: 0,
    unexpected: 0,
  }

  /** One occurrence of `rule` on `date`, in its own transaction. */
  const makeOne = async (rule: DueRule, date: string, allowance: number | null) =>
    await sql.begin(async (tx: postgres.TransactionSql): Promise<Outcome> => {
      const checked = await checkRule(tx, rule)
      if (checked.outcome !== null) return checked.outcome
      if (checked.madeThrough !== null && checked.madeThrough >= date) return `stale`
      const entry = await new PostgresTransactionRepository(tx, rates).writeNew(
        {
          groupId: rule.groupId,
          id: uuidV7(),
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          kind: rule.kind,
          amount: rule.amount,
          currency: rule.currency,
          accountAmount: rule.accountAmount ?? undefined,
          memo: rule.memo,
          date,
          allowance,
        },
        rule.createdByUserId!,
        checked.role,
        { ruleId: rule.id, date },
      )
      // The entry's change carries the rule's new `made_through` and cleared pause too.
      await tx`
        UPDATE recurring_rules
        SET made_through = ${date}::date, paused_reason = NULL,
            change_sequence = COALESCE(${entry?.changeSequence ?? null}::bigint, change_sequence)
        WHERE id = ${rule.id} AND group_id = ${rule.groupId}
          AND (made_through IS NULL OR made_through < ${date}::date)
      `
      if (entry === null && checked.pausedReason !== null) await resumed(tx, rule)
      return entry === null ? `existed` : `made`
    })

  /**
   * Moves `made_through` to `through` once every date before it is made. A rule that was not
   * paused needs no lock: no entry is written, and the version guard skips a rule changed since.
   * A paused one is checked again, and its pause cleared once the cause is gone.
   */
  const finish = async (rule: DueRule, through: string): Promise<Outcome> => {
    if (rule.pausedReason === null) {
      await sql`
        UPDATE recurring_rules SET made_through = ${through}::date
        WHERE id = ${rule.id} AND group_id = ${rule.groupId} AND deleted_at IS NULL
          AND version = ${rule.version}
          AND (made_through IS NULL OR made_through < ${through}::date)
      `
      return `made`
    }
    return await sql.begin(async (tx: postgres.TransactionSql): Promise<Outcome> => {
      const checked = await checkRule(tx, rule)
      if (checked.outcome !== null) return checked.outcome
      await tx`
        UPDATE recurring_rules SET made_through = ${through}::date, paused_reason = NULL
        WHERE id = ${rule.id} AND group_id = ${rule.groupId}
          AND (made_through IS NULL OR made_through < ${through}::date)
      `
      if (checked.pausedReason !== null) await resumed(tx, rule)
      return `made`
    })
  }

  /** Runs the rule's due dates; returns how it ended. */
  const runRule = async (rule: DueRule): Promise<Outcome | null> => {
    if (!allowances.has(rule.groupId)) {
      allowances.set(rule.groupId, await entryAllowance(billing, rule.groupId, deps.billing, now))
    }
    const allowance = allowances.get(rule.groupId)!
    if (allowance === 0) return `blocked`
    const due = dueOccurrences(rule, rule.today, max)
    if (due === null) return null
    for (const date of due.dates) {
      const outcome = await makeOne(rule, date, allowance)
      if (outcome === `made`) report.made++
      if (outcome !== `made` && outcome !== `existed`) return outcome
    }
    return await finish(rule, due.through)
  }

  let after: string | null = null
  while (true) {
    const rules: DueRule[] = await readDueRules(sql, now, after, batch)
    for (const rule of rules) {
      if (blocked.has(rule.groupId)) {
        report.blocked++
        continue
      }
      try {
        const outcome = await runRule(rule)
        if (outcome === `paused`) report.paused++
        if (outcome === `blocked`) {
          blocked.add(rule.groupId)
          report.blocked++
        }
      } catch (error) {
        if (error instanceof PlanError) {
          blocked.add(rule.groupId)
          report.blocked++
          continue
        }
        report.failed++
        const expected = error instanceof TransactionError ||
          error instanceof RecurringRuleError || error instanceof GroupNotActiveError
        if (!expected) report.unexpected++
        const code = (error as { code?: unknown }).code
        log(
          `recurring entries: rule ${rule.id} stopped for this run: ${(error as Error).name}` +
            (typeof code === `string` ? ` ${code}` : ``),
        )
      }
    }
    if (rules.length < batch) return report
    after = rules[rules.length - 1].id
  }
}

/**
 * A household's `maxTransactions` at `now`, mirroring the API's entitlement gate: no cap while
 * billing is off, else the cap of the plan the household is on, the free plan's once a lapsed
 * subscription's grace has ended.
 */
async function entryAllowance(
  billing: PostgresBillingRepository,
  groupId: string,
  setup: RecurringEntriesDeps[`billing`],
  now: Date,
): Promise<number | null> {
  if (!setup.billingEnabled) return UNLIMITED.limits.maxTransactions
  const plan = effectivePlanId(await billing.get(groupId), now, setup.graceDays, setup.plans)
  return entitlementsOf(plan, true, setup.plans).limits.maxTransactions
}

/** What {@link checkRule} found: an outcome that stops the step, or what the step may go on with. */
type Checked =
  | { outcome: Outcome; role: null; madeThrough: null; pausedReason: null }
  | { outcome: null; role: GroupRole; madeThrough: string | null; pausedReason: number | null }

/**
 * Locks the household and reads the author's role in it, then locks the rule row, in the order
 * every rule write takes them. A rule deleted, changed or moved since the run read it is `stale`.
 * A cause to pause ({@link pauseReasonOf}) stores the reason, pushing the change only when it is
 * new, and answers `paused`.
 */
async function checkRule(tx: postgres.TransactionSql, rule: DueRule): Promise<Checked> {
  const role = rule.createdByUserId === null
    ? await lockGroup(tx, rule.groupId)
    : await lockActorRole(tx, rule.groupId, rule.createdByUserId)
  const current = (
    await tx<{ version: number; madeThrough: string | null; pausedReason: number | null }[]>`
      SELECT version, to_char(made_through, 'YYYY-MM-DD') AS made_through, paused_reason
      FROM recurring_rules
      WHERE id = ${rule.id} AND group_id = ${rule.groupId} AND deleted_at IS NULL
      FOR UPDATE
    `
  )[0]
  const stale = { outcome: `stale`, role: null, madeThrough: null, pausedReason: null } as const
  if (!current || current.version !== rule.version) return stale
  const [account, category] = await Promise.all([
    tx<{ archived: boolean }[]>`
      SELECT archived_at IS NOT NULL AS archived FROM accounts
      WHERE id = ${rule.accountId} AND group_id = ${rule.groupId} AND deleted_at IS NULL
    `,
    tx<{ archived: boolean }[]>`
      SELECT archived_at IS NOT NULL AS archived FROM categories
      WHERE id = ${rule.categoryId} AND group_id = ${rule.groupId}
    `,
  ])
  const reason = pauseReasonOf(role, account[0] ?? null, category[0] ?? { archived: true })
  if (reason !== null) {
    if (current.pausedReason !== reason) {
      await tx`
        UPDATE recurring_rules SET paused_reason = ${reason}
        WHERE id = ${rule.id} AND group_id = ${rule.groupId}
      `
      await stampRule(tx, rule, RECURRING_RULE_EVENTS.paused)
    }
    return { outcome: `paused`, role: null, madeThrough: null, pausedReason: null }
  }
  return {
    outcome: null,
    role: role!,
    madeThrough: current.madeThrough,
    pausedReason: current.pausedReason,
  }
}

/** Locks the household as `lockActorRole` does, for a rule whose author's account is gone. */
async function lockGroup(tx: postgres.TransactionSql, groupId: string): Promise<null> {
  const active = await tx`
    SELECT 1 FROM groups WHERE id = ${groupId} AND deleted_at IS NULL FOR NO KEY UPDATE
  `
  if (active.length === 0) throw new GroupNotActiveError(groupId)
  return null
}

/** Pushes a rule whose pause was cleared without an entry to carry the change. */
async function resumed(tx: postgres.TransactionSql, rule: DueRule): Promise<void> {
  await stampRule(tx, rule, RECURRING_RULE_EVENTS.resumed)
}

/**
 * Records a change the job made to a rule on its household, under the owner's id: the job acts for
 * the household, and the author may have no account left to name. The rule's `version` stays, so
 * a member's edit that was based on it still applies.
 */
async function stampRule(
  tx: postgres.TransactionSql,
  rule: DueRule,
  eventKind: string,
): Promise<void> {
  const [{ ownerUserId }] = await tx<{ ownerUserId: number }[]>`
    SELECT owner_user_id FROM groups WHERE id = ${rule.groupId}
  `
  const sequence = await recordGroupChange(tx, rule.groupId, ownerUserId, eventKind)
  await tx`
    UPDATE recurring_rules SET change_sequence = ${sequence}::bigint
    WHERE id = ${rule.id} AND group_id = ${rule.groupId}
  `
}

/**
 * Live rules of live households whose next day to cover has begun in the household's time zone at
 * `now`, after `after` in id order, at most `limit`. A rule past its end date, made through it,
 * is left out; a rule past its count is read once a day and made through today.
 */
async function readDueRules(
  sql: postgres.Sql,
  now: Date,
  after: string | null,
  limit: number,
): Promise<DueRule[]> {
  const rows = await sql<
    (Omit<DueRule, `amount` | `accountAmount`> & { amount: string; accountAmount: string | null })[]
  >`
    SELECT
      rules.id, rules.group_id, rules.account_id, rules.category_id, rules.kind,
      rules.amount::text AS amount, rules.account_amount::text AS account_amount, rules.currency,
      rules.memo, rules.rrule, to_char(rules.start_date, 'YYYY-MM-DD') AS start_date,
      to_char(rules.end_date, 'YYYY-MM-DD') AS end_date, rules.count,
      ARRAY(
        SELECT to_char(skipped, 'YYYY-MM-DD') FROM unnest(rules.skipped_dates) AS skipped
        ORDER BY skipped
      ) AS skipped_dates,
      to_char(rules.made_through, 'YYYY-MM-DD') AS made_through, rules.paused_reason,
      rules.version, rules.created_by_user_id,
      to_char(day.today, 'YYYY-MM-DD') AS today
    FROM recurring_rules AS rules
    INNER JOIN groups ON groups.id = rules.group_id AND groups.deleted_at IS NULL
    CROSS JOIN LATERAL (
      SELECT (${now}::timestamptz AT TIME ZONE groups.time_zone)::date AS today
    ) AS day
    WHERE rules.deleted_at IS NULL
      AND COALESCE(rules.made_through, rules.start_date - 1) < day.today
      AND (rules.end_date IS NULL OR COALESCE(rules.made_through, rules.start_date - 1) < rules.end_date)
      AND (${after}::uuid IS NULL OR rules.id > ${after}::uuid)
    ORDER BY rules.id
    LIMIT ${limit}
  `
  return rows.map((row) => ({
    ...row,
    amount: Number(row.amount),
    accountAmount: row.accountAmount === null ? null : Number(row.accountAmount),
  }))
}
