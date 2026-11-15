/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { AccountKind } from "@domain/accounts"
import { BillingStatus, type Plan, PRO_PLAN_ID } from "@domain/billing"
import { type CategoryIcon, CategoryKind } from "@domain/categories"
import { GroupRole } from "@domain/groups"
import { RATE_SOURCES } from "@domain/money"
import { RecurringPauseReason } from "@domain/recurring"
import { TransactionKind } from "@domain/transactions"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import type { JobHandler } from "@server/jobs/jobs.ts"
import {
  makeRecurringEntries,
  type RecurringEntriesDeps,
  recurringEntriesJob,
} from "@server/jobs/recurring-entries.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { PostgresRecurringRuleRepository } from "@server/recurring/postgres-recurring-rule-repository.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { TEST_FREE_PLAN, TEST_PRO_PLAN, testLimits } from "../../libs/domain/billing/test-plans.ts"
import { holdMemberChange, stillWaiting, team, withSchema } from "./group-team.ts"
import { expectVersion7Ids } from "./ids.ts"

/**
 * The job that makes repeating entries, against a real Postgres built from schema.sql: each rule of
 * spy4x/financy#219 is a step. Every step's rules are deleted when it ends, so one step's rules are
 * not made by the next step's runs. Needs `DB_HOST`, `DB_USER`, `DB_PASS` and `DB_NAME` (recipe in
 * docs/handoff.md); it fails when they are missing rather than skipping.
 */

/** A catalog where the free plan is read-only and the paid one holds `paid` entries. */
function plans(paid: number | null): readonly Plan[] {
  return [
    {
      ...TEST_FREE_PLAN,
      entitlements: {
        ...TEST_FREE_PLAN.entitlements,
        limits: testLimits(null, { maxTransactions: 0 }),
      },
    },
    {
      ...TEST_PRO_PLAN,
      entitlements: {
        ...TEST_PRO_PLAN.entitlements,
        limits: testLimits(null, { maxTransactions: paid }),
      },
    },
  ]
}

/** A made entry as the tests compare it. */
interface MadeRow extends postgres.Row {
  occurrenceDate: string
  date: string
  amount: string
  accountAmount: string
  converted: boolean
  memo: string
  kind: number
  createdByUserId: number
  deleted: boolean
  changeSequence: string
}

Deno.test(`the repeating entries job against Postgres`, async (t) => {
  await withSchema(async (sql) => {
    const accounts = new PostgresAccountRepository(sql)
    const categories = new PostgresCategoryRepository(sql)
    const rules = new PostgresRecurringRuleRepository(sql)
    const entries = new PostgresTransactionRepository(sql)
    const lines: string[] = []

    /** Runs one step, then deletes every live rule, so later runs leave this step's rules alone. */
    async function step(name: string, body: () => Promise<void>) {
      await t.step(name, async () => {
        try {
          await body()
        } finally {
          await sql`UPDATE recurring_rules SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL`
        }
      })
    }

    /** One run at `now`, billing off unless `more` says otherwise. */
    async function run(now: string, more: Partial<RecurringEntriesDeps> = {}) {
      return await makeRecurringEntries({
        sql,
        billing: { billingEnabled: false, graceDays: 0 },
        log: (line) => lines.push(line),
        now: () => new Date(now),
        ...more,
      })
    }

    /**
     * A household in `timeZone` with one account in `currency` and a Rent expense category. Its
     * rules are written by the editor unless told otherwise: a rent of 1200 on the 1st of each
     * month from January 2027.
     */
    async function household(timeZone = `UTC`, currency = `USD`) {
      const members = await team(sql)
      await sql`UPDATE groups SET time_zone = ${timeZone} WHERE id = ${members.groupId}`
      const account = (await accounts.create({
        groupId: members.groupId,
        id: uuidV7(),
        name: `Main`,
        kind: AccountKind.BANK,
        currency,
        startingBalance: 0,
        allowance: null,
      }, members.owner)).account.id
      const category = (await categories.create({
        groupId: members.groupId,
        id: uuidV7(),
        name: `Rent`,
        kind: CategoryKind.EXPENSE,
        icon: `house` as CategoryIcon,
        color: `#c2410c`,
        parentId: null,
        allowance: null,
      }, members.owner)).category.id
      const fields = {
        groupId: members.groupId,
        accountId: account,
        categoryId: category,
        kind: TransactionKind.EXPENSE,
        amount: 120000,
        currency,
        accountAmount: null,
        memo: `Rent`,
        rrule: `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1`,
        startDate: `2027-01-01`,
        endDate: null,
        count: null,
      }
      const rule = async (more: Record<string, unknown> = {}, actor = members.editor) =>
        (await rules.create(
          { ...fields, id: uuidV7(), allowance: null, ...more } as Parameters<
            typeof rules.create
          >[0],
          actor,
        )).rule
      return { ...members, account, category, fields, rule }
    }

    /** The entries a rule made, deleted ones included, in date order. */
    async function made(ruleId: string): Promise<MadeRow[]> {
      return await sql<MadeRow[]>`
        SELECT to_char(occurrence_date, 'YYYY-MM-DD') AS occurrence_date,
          to_char(date, 'YYYY-MM-DD') AS date, amount::text AS amount,
          account_amount::text AS account_amount, converted, memo, kind, created_by_user_id,
          deleted_at IS NOT NULL AS deleted, change_sequence::text AS change_sequence
        FROM transactions WHERE recurring_rule_id = ${ruleId}
        ORDER BY occurrence_date
      `
    }

    const datesOf = async (ruleId: string) => (await made(ruleId)).map((row) => row.date)

    /** The rule's stored job state. */
    async function state(ruleId: string) {
      return (await sql<{ madeThrough: string | null; pausedReason: number | null }[]>`
        SELECT to_char(made_through, 'YYYY-MM-DD') AS made_through, paused_reason
        FROM recurring_rules WHERE id = ${ruleId}
      `)[0]
    }

    /** The change kinds recorded on the household after `after`, in order. */
    async function changesAfter(groupId: string, after: bigint): Promise<string[]> {
      return (await sql<{ eventKind: string }[]>`
        SELECT event_kind FROM outbox_events
        WHERE group_id = ${groupId} AND aggregate_version > ${after.toString()}::bigint
        ORDER BY aggregate_version
      `).map((row) => row.eventKind)
    }

    async function sequenceOf(groupId: string): Promise<bigint> {
      return BigInt(
        (await sql<{ next: string }[]>`
        SELECT next_change_sequence::text AS next FROM groups WHERE id = ${groupId}
      `)[0].next,
      ) - 1n
    }

    await step(`makes each due entry once when the job runs twice in the same hour`, async () => {
      const h = await household()
      const rule = await h.rule({ rrule: `FREQ=DAILY;INTERVAL=1` })

      const first = await run(`2027-01-03T12:00:00Z`)
      const second = await run(`2027-01-03T12:30:00Z`)

      expect(first.made).toBe(3)
      expect(second.made).toBe(0)
      const rows = await made(rule.id)
      expect(rows.map((row) => row.date)).toEqual([`2027-01-01`, `2027-01-02`, `2027-01-03`])
      expect(rows[0]).toMatchObject({
        occurrenceDate: `2027-01-01`,
        amount: `-120000`,
        accountAmount: `-120000`,
        converted: false,
        memo: `Rent`,
        kind: TransactionKind.EXPENSE,
        createdByUserId: h.editor,
        deleted: false,
      })
      const ids = await sql<{ id: string }[]>`
        SELECT id FROM transactions WHERE recurring_rule_id = ${rule.id}
      `
      expectVersion7Ids(ids)
      expect(await state(rule.id)).toEqual({ madeThrough: `2027-01-03`, pausedReason: null })
    })

    await step(`makes each due entry once when two runs overlap`, async () => {
      const h = await household()
      const rule = await h.rule({ rrule: `FREQ=DAILY;INTERVAL=1` })

      await Promise.all([run(`2027-01-05T12:00:00Z`), run(`2027-01-05T12:00:00Z`)])

      expect(await datesOf(rule.id)).toEqual([
        `2027-01-01`,
        `2027-01-02`,
        `2027-01-03`,
        `2027-01-04`,
        `2027-01-05`,
      ])
      expect((await state(rule.id)).madeThrough).toBe(`2027-01-05`)
    })

    await step(
      `makes one entry when a crash left the entry written and made_through behind`,
      async () => {
        const h = await household()
        const rule = await h.rule()
        // What a crash after the insert would leave, if the two were not one transaction.
        await sql`
          INSERT INTO transactions (
            id, group_id, account_id, category_id, kind, account_amount, amount, currency, memo,
            date, change_sequence, created_by_user_id, updated_by_user_id, recurring_rule_id,
            occurrence_date
          ) VALUES (
            ${uuidV7()}, ${h.groupId}, ${h.account}, ${h.category}, 1, -120000, -120000, 'USD',
            'Rent', '2027-01-01', 1, ${h.editor}, ${h.editor}, ${rule.id}, '2027-01-01'
          )
        `

        await run(`2027-01-01T12:00:00Z`)

        expect(await datesOf(rule.id)).toEqual([`2027-01-01`])
        expect((await state(rule.id)).madeThrough).toBe(`2027-01-01`)
      },
    )

    await step(`makes 28 February, 29 February in a leap year, and 30 April`, async () => {
      const h = await household()
      const lastDay = await h.rule({ rrule: `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1` })
      const leap = await h.rule({
        rrule: `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=-1`,
        startDate: `2028-02-01`,
      })

      await run(`2027-05-01T00:00:00Z`)
      await run(`2028-03-01T00:00:00Z`)

      expect((await datesOf(lastDay.id)).slice(0, 4))
        .toEqual([`2027-01-31`, `2027-02-28`, `2027-03-31`, `2027-04-30`])
      expect(await datesOf(leap.id)).toEqual([`2028-02-29`])
    })

    await step(
      `makes a rule on the 1st after midnight in the household's zone, not before (R14)`,
      async () => {
        const h = await household(`Asia/Ho_Chi_Minh`)
        const rule = await h.rule()

        // 23:30 on 31 December in Ho Chi Minh City.
        await run(`2026-12-31T16:30:00Z`)
        expect(await datesOf(rule.id)).toEqual([])
        expect((await state(rule.id)).madeThrough).toBeNull()

        // 00:30 on 1 January there, while it is still 31 December in UTC.
        await run(`2026-12-31T17:30:00Z`)
        expect(await datesOf(rule.id)).toEqual([`2027-01-01`])
      },
    )

    await step(
      `makes other households' entries when one household's zone is unknown to Postgres or Intl`,
      async () => {
        const utc = await household()
        const utcRule = await utc.rule()
        // Intl knows this old name; Postgres 18 refuses it.
        const legacy = await household()
        const legacyRule = await legacy.rule()
        await sql`UPDATE groups SET time_zone = 'US/Pacific-New' WHERE id = ${legacy.groupId}`
        const unknown = await household()
        const unknownRule = await unknown.rule()
        await sql`UPDATE groups SET time_zone = 'Nowhere/Atlantis' WHERE id = ${unknown.groupId}`
        lines.length = 0

        const report = await run(`2027-01-01T20:00:00Z`)

        expect(report.unexpected).toBe(0)
        expect(await datesOf(utcRule.id)).toEqual([`2027-01-01`])
        expect(await datesOf(legacyRule.id)).toEqual([`2027-01-01`])
        expect(await datesOf(unknownRule.id)).toEqual([])
        expect(lines).toEqual([
          `recurring entries: group ${unknown.groupId} skipped for this run: its time zone is not known`,
        ])
      },
    )

    await step(
      `converts a USD rule paid from a EUR account at each occurrence's own date's rate (R4, R6)`,
      async () => {
        const h = await household(`UTC`, `EUR`)
        const rule = await h.rule({ currency: `USD`, amount: 1000 })
        const rates = new PostgresRateRepository(sql)
        for (const [date, rate] of [[`2027-01-01`, `1.1`], [`2027-02-01`, `1.25`]]) {
          await rates.insert(
            [{ base: `EUR`, quote: `USD`, rate, date, source: RATE_SOURCES.ecb }],
            new Date(),
            (_rate, problem) => {
              throw new Error(problem)
            },
          )
        }

        await run(`2027-02-01T12:00:00Z`)

        const rows = await made(rule.id)
        expect(rows.map((row) => [row.date, row.amount, row.accountAmount, row.converted]))
          .toEqual([
            [`2027-01-01`, `-1000`, `-909`, true],
            [`2027-02-01`, `-1000`, `-800`, true],
          ])
      },
    )

    await step(
      `stops a rule with no rate for its date, logs it, and makes the others`,
      async () => {
        const h = await household(`UTC`, `EUR`)
        const noRate = await h.rule({ currency: `JPY`, amount: 5000, memo: `Private memo` })
        const plain = await h.rule({ currency: `EUR` })
        lines.length = 0

        const report = await run(`2027-01-01T12:00:00Z`)
        await recurringEntriesJob({
          sql,
          billing: { billingEnabled: false, graceDays: 0 },
          log: () => {},
          now: () => new Date(`2027-01-01T12:00:00Z`),
        })({} as Parameters<JobHandler>[0])

        expect(report).toMatchObject({ made: 1, failed: 1, unexpected: 0 })
        expect(await datesOf(noRate.id)).toEqual([])
        expect((await state(noRate.id)).madeThrough).toBeNull()
        expect(await datesOf(plain.id)).toEqual([`2027-01-01`])
        expect(lines).toEqual([
          `recurring entries: rule ${noRate.id} stopped for this run: TransactionError NO_RATE`,
        ])
        expect(lines.join(``)).not.toContain(`Private memo`)
        expect(lines.join(``)).not.toContain(`5000`)
      },
    )

    await step(
      `fails the run on an error it does not expect, after making the other rules`,
      async () => {
        const h = await household()
        const broken = await h.rule({ memo: `Break the insert` })
        const plain = await h.rule()
        await sql.unsafe(`
          CREATE FUNCTION refuse_broken() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.memo = 'Break the insert' THEN RAISE EXCEPTION 'refused'; END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER refuse_broken BEFORE INSERT ON transactions
            FOR EACH ROW EXECUTE FUNCTION refuse_broken();
        `)
        try {
          const job = recurringEntriesJob({
            sql,
            billing: { billingEnabled: false, graceDays: 0 },
            log: () => {},
            now: () => new Date(`2027-01-01T12:00:00Z`),
          })
          const error = await job({} as Parameters<JobHandler>[0]).then(() => null, (e) => e)

          expect((error as Error | null)?.name).toBe(`RecurringEntriesError`)
          expect(await datesOf(broken.id)).toEqual([])
          expect(await datesOf(plain.id)).toEqual([`2027-01-01`])
        } finally {
          await sql.unsafe(
            `DROP TRIGGER refuse_broken ON transactions; DROP FUNCTION refuse_broken;`,
          )
        }
      },
    )

    await step(`does not make a deleted occurrence again`, async () => {
      const h = await household()
      const rule = await h.rule()
      await run(`2027-01-01T12:00:00Z`)
      const [entry] = await sql<{ id: string; version: number }[]>`
        SELECT id, version FROM transactions WHERE recurring_rule_id = ${rule.id}
      `
      await entries.delete(
        { groupId: h.groupId, id: entry.id, expectedVersion: entry.version },
        h.editor,
      )
      // Even a rule whose made_through went back does not make the date again.
      await sql`UPDATE recurring_rules SET made_through = NULL WHERE id = ${rule.id}`

      await run(`2027-01-02T12:00:00Z`)

      const rows = await made(rule.id)
      expect(rows.map((row) => [row.date, row.deleted])).toEqual([[`2027-01-01`, true]])
      expect((await state(rule.id)).madeThrough).toBe(`2027-01-02`)
    })

    await step(`leaves the entries a rule made unchanged when the rule is edited`, async () => {
      const h = await household()
      const rule = await h.rule()
      await run(`2027-01-01T12:00:00Z`)

      await rules.update(
        { ...h.fields, id: rule.id, amount: 130000, memo: `New rent`, expectedVersion: 1 },
        h.editor,
      )
      await run(`2027-02-01T12:00:00Z`)

      const rows = await made(rule.id)
      expect(rows.map((row) => [row.date, row.amount, row.memo])).toEqual([
        [`2027-01-01`, `-120000`, `Rent`],
        [`2027-02-01`, `-130000`, `New rent`],
      ])
    })

    await step(`does not make skipped dates`, async () => {
      const h = await household()
      const rule = await h.rule({ rrule: `FREQ=DAILY;INTERVAL=1` })
      await rules.skip({ groupId: h.groupId, id: rule.id, date: `2027-01-02` }, h.editor)

      await run(`2027-01-03T12:00:00Z`)

      expect(await datesOf(rule.id)).toEqual([`2027-01-01`, `2027-01-03`])
      expect((await state(rule.id)).madeThrough).toBe(`2027-01-03`)
    })

    await step(`makes at most the cap per rule in one run, and the rest in the next`, async () => {
      const h = await household()
      const rule = await h.rule({ rrule: `FREQ=DAILY;INTERVAL=1` })

      await run(`2027-01-05T12:00:00Z`, { max: 2 })
      expect(await datesOf(rule.id)).toEqual([`2027-01-01`, `2027-01-02`])
      expect((await state(rule.id)).madeThrough).toBe(`2027-01-02`)

      await run(`2027-01-05T13:00:00Z`, { max: 2 })
      await run(`2027-01-05T14:00:00Z`, { max: 2 })
      expect(await datesOf(rule.id)).toHaveLength(5)
    })

    await step(`reads due rules in batches until none are left`, async () => {
      const h = await household()
      const ids = []
      for (let i = 0; i < 5; i++) ids.push((await h.rule()).id)

      const report = await run(`2027-01-01T12:00:00Z`, { batch: 2 })

      expect(report.made).toBe(5)
      for (const id of ids) expect(await datesOf(id)).toEqual([`2027-01-01`])
    })

    await step(
      `pushes each made entry to the household's tabs as a change, and stamps the rule with it`,
      async () => {
        const h = await household()
        const rule = await h.rule()
        const before = await sequenceOf(h.groupId)

        await run(`2027-02-01T12:00:00Z`)

        expect(await changesAfter(h.groupId, before))
          .toEqual([`transaction.created`, `transaction.created`])
        const rows = await made(rule.id)
        expect(rows.map((row) => BigInt(row.changeSequence))).toEqual([before + 1n, before + 2n])
        expect((await rules.get(h.groupId, rule.id))?.changeSequence).toBe(`${before + 2n}`)
      },
    )

    await step(
      `pauses the rule of an author who was removed, writes nothing, and shows the reason (R16)`,
      async () => {
        const h = await household()
        const rule = await h.rule()
        await sql`DELETE FROM group_members WHERE group_id = ${h.groupId} AND user_id = ${h.editor}`
        const before = await sequenceOf(h.groupId)

        const report = await run(`2027-01-01T12:00:00Z`)
        await run(`2027-01-01T13:00:00Z`)

        expect(report.paused).toBe(1)
        expect(await datesOf(rule.id)).toEqual([])
        expect(await rules.get(h.groupId, rule.id)).toMatchObject({
          pausedReason: RecurringPauseReason.AUTHOR_CANNOT_WRITE,
          madeThrough: null,
          version: 1,
        })
        // One change for the pause; the second run finds it paused already and records nothing.
        expect(await changesAfter(h.groupId, before)).toEqual([`recurring_rule.paused`])

        // Back in the household: the job lifts the pause and makes the date it missed.
        await sql`
          INSERT INTO group_members (group_id, user_id, role, added_by_user_id)
          VALUES (${h.groupId}, ${h.editor}, ${GroupRole.EDITOR}, ${h.owner})
        `
        await run(`2027-02-01T12:00:00Z`)
        expect(await datesOf(rule.id)).toEqual([`2027-01-01`, `2027-02-01`])
        expect(await state(rule.id)).toEqual({ madeThrough: `2027-02-01`, pausedReason: null })
      },
    )

    await step(`pauses the rule of an author who became a viewer`, async () => {
      const h = await household()
      const rule = await h.rule()
      await sql`
        UPDATE group_members SET role = ${GroupRole.VIEWER} WHERE group_id = ${h.groupId} AND user_id = ${h.editor}
      `

      await run(`2027-01-01T12:00:00Z`)

      expect(await datesOf(rule.id)).toEqual([])
      expect((await state(rule.id)).pausedReason).toBe(RecurringPauseReason.AUTHOR_CANNOT_WRITE)
    })

    await step(`pauses the rule of an author whose account is gone`, async () => {
      const h = await household()
      const deleted = await h.rule()
      const purged = await h.rule()
      await sql`UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${h.editor}`
      await sql`UPDATE recurring_rules SET created_by_user_id = NULL WHERE id = ${purged.id}`

      await run(`2027-01-01T12:00:00Z`)

      for (const rule of [deleted, purged]) {
        expect(await datesOf(rule.id)).toEqual([])
        expect((await state(rule.id)).pausedReason)
          .toBe(RecurringPauseReason.AUTHOR_CANNOT_WRITE)
      }
    })

    await step(
      `pauses the rule of a blocked author, and makes it once they are unblocked`,
      async () => {
        const h = await household()
        const rule = await h.rule()
        await sql`UPDATE users SET blocked_at = CURRENT_TIMESTAMP WHERE id = ${h.editor}`

        await run(`2027-01-01T12:00:00Z`)

        expect(await datesOf(rule.id)).toEqual([])
        expect((await state(rule.id)).pausedReason).toBe(RecurringPauseReason.AUTHOR_CANNOT_WRITE)

        await sql`UPDATE users SET blocked_at = NULL WHERE id = ${h.editor}`
        await run(`2027-01-01T13:00:00Z`)

        expect(await datesOf(rule.id)).toEqual([`2027-01-01`])
        expect((await state(rule.id)).pausedReason).toBeNull()
      },
    )

    for (const change of [`removal`, `demotion`] as const) {
      await step(
        `writes nothing when the author's ${change} commits while the job waits`,
        async () => {
          const h = await household()
          const rule = await h.rule()

          const held = await holdMemberChange(sql, h.groupId, h.owner, h.editor, change)
          const running = run(`2027-01-01T12:00:00Z`)
          expect(await stillWaiting(running)).toBe(true)
          held.release()
          await held.committed
          await running

          expect(await datesOf(rule.id)).toEqual([])
          expect((await state(rule.id)).pausedReason).toBe(RecurringPauseReason.AUTHOR_CANNOT_WRITE)
        },
      )
    }

    await step(
      `pauses a rule whose account or category is archived, and resumes after`,
      async () => {
        const h = await household()
        const rule = await h.rule()
        await sql`UPDATE accounts SET archived_at = CURRENT_TIMESTAMP WHERE id = ${h.account}`
        await sql`UPDATE categories SET archived_at = CURRENT_TIMESTAMP WHERE id = ${h.category}`

        await run(`2027-01-01T12:00:00Z`)
        expect((await state(rule.id)).pausedReason).toBe(RecurringPauseReason.ACCOUNT_ARCHIVED)

        await sql`UPDATE accounts SET archived_at = NULL WHERE id = ${h.account}`
        await run(`2027-01-01T13:00:00Z`)
        expect((await state(rule.id)).pausedReason).toBe(RecurringPauseReason.CATEGORY_ARCHIVED)
        expect(await datesOf(rule.id)).toEqual([])

        const before = await sequenceOf(h.groupId)
        await sql`UPDATE categories SET archived_at = NULL WHERE id = ${h.category}`
        await run(`2027-01-01T14:00:00Z`)
        expect(await datesOf(rule.id)).toEqual([`2027-01-01`])
        expect((await state(rule.id)).pausedReason).toBeNull()
        // The entry's change carries the lifted pause: no change of its own.
        expect(await changesAfter(h.groupId, before)).toEqual([`transaction.created`])
      },
    )

    await step(
      `lifts a pause with a change of its own when the missed date was skipped meanwhile`,
      async () => {
        const h = await household()
        const rule = await h.rule()
        await sql`UPDATE accounts SET archived_at = CURRENT_TIMESTAMP WHERE id = ${h.account}`
        await run(`2027-01-01T12:00:00Z`)
        await rules.skip({ groupId: h.groupId, id: rule.id, date: `2027-01-01` }, h.editor)
        await sql`UPDATE accounts SET archived_at = NULL WHERE id = ${h.account}`
        const before = await sequenceOf(h.groupId)

        await run(`2027-01-02T12:00:00Z`)

        expect(await datesOf(rule.id)).toEqual([])
        expect(await state(rule.id)).toEqual({ madeThrough: `2027-01-02`, pausedReason: null })
        expect(await changesAfter(h.groupId, before)).toEqual([`recurring_rule.resumed`])
      },
    )

    await step(
      `writes nothing for a read-only household, without a pause, and catches up once it pays`,
      async () => {
        const h = await household()
        const rule = await h.rule()
        const billing = { billingEnabled: true, graceDays: 0, plans: plans(null) }

        const report = await run(`2027-02-01T12:00:00Z`, { billing })
        expect(report.blocked).toBe(1)
        expect(await datesOf(rule.id)).toEqual([])
        expect(await state(rule.id)).toEqual({ madeThrough: null, pausedReason: null })

        await sql`
          INSERT INTO subscriptions (
            group_id, provider_subscription_id, plan_id, status, current_period_end,
            provider_event_at, provider_event_rank, ever_active
          ) VALUES (
            ${h.groupId}, 'sub_recurring', ${PRO_PLAN_ID}, ${BillingStatus.Active},
            '2027-03-01T00:00:00Z', '2027-02-01T00:00:00Z', 2, true
          )
        `
        await run(`2027-02-01T13:00:00Z`, { billing })
        expect(await datesOf(rule.id)).toEqual([`2027-01-01`, `2027-02-01`])
      },
    )

    await step(
      `stops a household at its plan's cap for the run, without a pause, and leaves its other rules`,
      async () => {
        const h = await household()
        const daily = await h.rule({ rrule: `FREQ=DAILY;INTERVAL=1` })
        const monthly = await h.rule()
        await sql`
          INSERT INTO subscriptions (
            group_id, provider_subscription_id, plan_id, status, current_period_end,
            provider_event_at, provider_event_rank, ever_active
          ) VALUES (
            ${h.groupId}, 'sub_full', ${PRO_PLAN_ID}, ${BillingStatus.Active},
            '2027-03-01T00:00:00Z', '2027-01-01T00:00:00Z', 2, true
          )
        `
        const billing = { billingEnabled: true, graceDays: 0, plans: plans(2) }

        const report = await run(`2027-01-04T12:00:00Z`, { billing })

        const both = [...await datesOf(daily.id), ...await datesOf(monthly.id)]
        expect(both).toHaveLength(2)
        expect(report.blocked).toBe(2)
        expect((await state(daily.id)).pausedReason).toBeNull()
        expect((await state(monthly.id)).pausedReason).toBeNull()
      },
    )

    await step(`makes nothing for a deleted rule or before a rule's start`, async () => {
      const h = await household()
      const deleted = await h.rule()
      await rules.delete({ groupId: h.groupId, id: deleted.id, expectedVersion: 1 }, h.editor)
      const later = await h.rule({ startDate: `2027-06-01` })

      await run(`2027-02-01T12:00:00Z`)

      expect(await datesOf(deleted.id)).toEqual([])
      expect(await state(later.id)).toEqual({ madeThrough: null, pausedReason: null })
    })

    await step(
      `makes a 1000-count daily rule that started decades ago in runs of 100`,
      async () => {
        const h = await household()
        const rule = await h.rule({
          rrule: `FREQ=DAILY;INTERVAL=1`,
          startDate: `1990-01-01`,
          count: 1000,
        })

        await run(`2026-11-15T12:00:00Z`)

        expect(await datesOf(rule.id)).toHaveLength(100)
        expect((await state(rule.id)).madeThrough).toBe(`1990-04-10`)
      },
    )
  })
})
