/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { AccountKind } from "@domain/accounts"
import { PlanError } from "@domain/billing"
import { type CategoryIcon, CategoryKind } from "@domain/categories"
import { TransactionKind } from "@domain/transactions"
import { RECURRING_RULE_RESTORE_DAYS, RecurringRuleError } from "@domain/recurring"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { PostgresRecurringRuleRepository } from "@server/recurring/postgres-recurring-rule-repository.ts"
import { purgeDeletedRecurringRules } from "@server/recurring/purge-deleted-recurring-rules.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { team, withSchema } from "./group-team.ts"
import { expectVersion7Ids } from "./ids.ts"

/**
 * Repeating rules against a real Postgres built from schema.sql: the household's sequence and
 * outbox, a skip sent twice, the plan cap under the lock, the purge and the account it frees, the
 * tenant boundary and the roles. The transports and the gates are in `apps/api/features/recurring/`;
 * a write racing a member's removal is in `group-write-race.integration.test.ts`. Needs `DB_HOST`,
 * `DB_USER`, `DB_PASS` and `DB_NAME` (recipe in docs/handoff.md); it fails when they are missing
 * rather than skipping.
 */

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(() => null, (error) => error)
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  return ((await refusal(promise)) as { code?: string } | null)?.code
}

async function nextSequence(sql: postgres.Sql, groupId: string): Promise<bigint> {
  return BigInt(
    (await sql<{ next: string }[]>`
      SELECT next_change_sequence::text AS next FROM groups WHERE id = ${groupId}
    `)[0].next,
  )
}

Deno.test(`repeating rules against Postgres`, async (t) => {
  await withSchema(async (sql) => {
    const accounts = new PostgresAccountRepository(sql)
    const categories = new PostgresCategoryRepository(sql)
    const rules = new PostgresRecurringRuleRepository(sql)

    /** A household with one USD account and a Rent expense category, made by its owner. */
    async function household() {
      const members = await team(sql)
      const account = (await accounts.create({
        groupId: members.groupId,
        id: uuidV7(),
        name: `Main`,
        kind: AccountKind.BANK,
        currency: `USD`,
        startingBalance: 0,
        allowance: null,
      }, members.owner)).account
      const rent = (await categories.create({
        groupId: members.groupId,
        id: uuidV7(),
        name: `Rent`,
        kind: CategoryKind.EXPENSE,
        icon: `house` as CategoryIcon,
        color: `#c2410c`,
        parentId: null,
        allowance: null,
      }, members.owner)).category.id
      /** The fields of a 1200 USD rent on the 1st of each month from December. */
      const fields = {
        groupId: members.groupId,
        accountId: account.id,
        categoryId: rent,
        kind: TransactionKind.EXPENSE,
        amount: 120000,
        currency: `USD`,
        accountAmount: null,
        memo: ``,
        rrule: `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1`,
        startDate: `2026-12-01`,
        endDate: null,
        count: null,
      }
      /** Writes a rule as the owner unless told otherwise. */
      const rule = async (more: Record<string, unknown> = {}, actor = members.owner) =>
        (await rules.create(
          { ...fields, id: uuidV7(), allowance: null, ...more } as Parameters<
            typeof rules.create
          >[0],
          actor,
        )).rule
      return { ...members, account, rent, fields, rule }
    }

    await t.step(
      `every rule write moves the household's sequence once and leaves its outbox row; a retry and a second skip write nothing`,
      async () => {
        const h = await household()
        const before = await nextSequence(sql, h.groupId)
        const id = uuidV7()
        const at = { groupId: h.groupId, id }

        const first = await rules.create({ ...h.fields, id, allowance: null }, h.editor)
        const retry = await rules.create({ ...h.fields, id, allowance: null }, h.editor)
        await rules.update({ ...h.fields, id, memo: `Rent`, expectedVersion: 1 }, h.editor)
        const skipped = await rules.skip({ ...at, date: `2027-01-01` }, h.editor)
        const skippedAgain = await rules.skip({ ...at, date: `2027-01-01` }, h.editor)
        await rules.delete({ ...at, expectedVersion: 3 }, h.editor)
        const restored = await rules.restore({ ...at, allowance: null }, h.owner)

        expect(first.created).toBe(true)
        expect(retry).toMatchObject({ created: false, rule: { id, version: 1 } })
        expect(skippedAgain).toEqual(skipped)
        expect(await nextSequence(sql, h.groupId)).toBe(before + 5n)
        const outbox = await sql<{ eventKind: string }[]>`
          SELECT event_kind FROM outbox_events
          WHERE group_id = ${h.groupId} AND event_kind LIKE 'recurring_rule.%'
          ORDER BY aggregate_version
        `
        expect(outbox.map((row) => row.eventKind)).toEqual([
          `recurring_rule.created`,
          `recurring_rule.updated`,
          `recurring_rule.skipped`,
          `recurring_rule.deleted`,
          `recurring_rule.restored`,
        ])
        const tombstones = await sql`
          SELECT kind FROM group_change_tombstones WHERE entity_id = ${id}
        `
        expect(tombstones).toEqual([{ kind: `recurring_rules` }])
        expect(restored).toMatchObject({
          amount: 120000,
          accountAmount: null,
          memo: `Rent`,
          rrule: `FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1`,
          startDate: `2026-12-01`,
          skippedDates: [`2027-01-01`],
          madeThrough: null,
          pausedReason: null,
          version: 5,
          createdByUserId: h.editor,
          updatedByUserId: h.owner,
          deletedAt: null,
        })
        expectVersion7Ids([restored])
        expect(
          await codeOf(rules.create({ ...h.fields, id, amount: 99, allowance: null }, h.editor)),
        ).toBe(`ID_ALREADY_EXISTS`)
      },
    )

    await t.step(`refuses to skip a date the rule never falls on, and stores nothing`, async () => {
      const h = await household()
      const rule = await h.rule({ count: 2 })
      const at = { groupId: h.groupId, id: rule.id }

      const offRepeat = await refusal(rules.skip({ ...at, date: `2027-01-02` }, h.owner))
      const pastCount = await refusal(rules.skip({ ...at, date: `2027-02-01` }, h.owner))

      for (const error of [offRepeat, pastCount]) {
        expect(error).toBeInstanceOf(RecurringRuleError)
        expect(error).toMatchObject({
          code: `INVALID_REQUEST`,
          fields: { date: { code: `invalid` } },
        })
      }
      expect(await rules.get(h.groupId, rule.id)).toMatchObject({ skippedDates: [], version: 1 })
    })

    await t.step(`changes and deletes a rule without touching an entry`, async () => {
      const h = await household()
      const rule = await h.rule()
      const entries = new PostgresTransactionRepository(sql)
      const entry = (await entries.create({
        groupId: h.groupId,
        id: uuidV7(),
        accountId: h.account.id,
        categoryId: h.rent,
        kind: TransactionKind.EXPENSE,
        amount: 120000,
        currency: `USD`,
        memo: `Rent`,
        date: `2026-12-01`,
        allowance: null,
      }, h.owner)).transaction

      await rules.update(
        { ...h.fields, id: rule.id, amount: 130000, memo: `New rent`, expectedVersion: 1 },
        h.owner,
      )
      await rules.delete({ groupId: h.groupId, id: rule.id, expectedVersion: 2 }, h.owner)

      expect(await entries.get(h.groupId, entry.id)).toEqual(entry)
    })

    await t.step(
      `keeps rules inside their household: a foreign account, category or rule is not found, and the table refuses a cross link (R17)`,
      async () => {
        const mine = await household()
        const theirs = await household()
        const foreign = await theirs.rule()

        expect(await codeOf(mine.rule({ accountId: theirs.account.id }))).toBe(`ACCOUNT_NOT_FOUND`)
        expect(await codeOf(mine.rule({ categoryId: theirs.rent }))).toBe(`CATEGORY_NOT_FOUND`)
        expect(await rules.get(mine.groupId, foreign.id)).toBeNull()
        const at = { groupId: mine.groupId, id: foreign.id }
        expect(await codeOf(rules.delete({ ...at, expectedVersion: 1 }, mine.owner)))
          .toBe(`RECURRING_RULE_NOT_FOUND`)
        expect(await codeOf(rules.skip({ ...at, date: `2027-01-01` }, mine.owner)))
          .toBe(`RECURRING_RULE_NOT_FOUND`)
        const crossAccount = await refusal(
          sql`UPDATE recurring_rules SET account_id = ${mine.account.id} WHERE id = ${foreign.id}`,
        )
        const crossCategory = await refusal(
          sql`UPDATE recurring_rules SET category_id = ${mine.rent} WHERE id = ${foreign.id}`,
        )
        expect((crossAccount as { code?: string }).code).toBe(`23503`)
        expect((crossCategory as { code?: string }).code).toBe(`23503`)
        expect(await rules.get(theirs.groupId, foreign.id)).toMatchObject({
          accountId: theirs.account.id,
          version: 1,
        })
      },
    )

    await t.step(`refuses a viewer's and a stranger's write (R16)`, async () => {
      const h = await household()
      const rule = await h.rule()
      const at = { groupId: h.groupId, id: rule.id }

      expect(await codeOf(h.rule({}, h.viewer))).toBe(`ROLE_INSUFFICIENT`)
      expect(await codeOf(rules.skip({ ...at, date: `2027-01-01` }, h.viewer)))
        .toBe(`ROLE_INSUFFICIENT`)
      expect(await codeOf(rules.delete({ ...at, expectedVersion: 1 }, h.viewer)))
        .toBe(`ROLE_INSUFFICIENT`)
      expect(await codeOf(h.rule({}, h.stranger))).toBe(`GROUP_NOT_FOUND`)
      expect(await rules.list(h.groupId)).toMatchObject([{ id: rule.id, version: 1 }])
    })

    await t.step(
      `counts live rules against the plan's cap under the lock, on create and on restore`,
      async () => {
        const h = await household()
        expect(await refusal(h.rule({ allowance: 0 }))).toBeInstanceOf(PlanError)
        const first = await h.rule({ allowance: 1 })
        expect(await refusal(h.rule({ allowance: 1 }))).toBeInstanceOf(PlanError)
        await rules.delete({ groupId: h.groupId, id: first.id, expectedVersion: 1 }, h.owner)
        const second = await h.rule({ allowance: 1 })
        expect(
          await refusal(rules.restore({ groupId: h.groupId, id: first.id, allowance: 1 }, h.owner)),
        ).toBeInstanceOf(PlanError)
        expect(await rules.count(h.groupId)).toBe(1)
        expect((await rules.list(h.groupId)).map((rule) => rule.id)).toEqual([second.id])
      },
    )

    await t.step(
      `keeps an account a rule names, then purges the rule ${RECURRING_RULE_RESTORE_DAYS} days after its delete and lets the account go`,
      async () => {
        const h = await household()
        const gone = await h.rule()
        const deleteAccount = () =>
          accounts.delete({ groupId: h.groupId, id: h.account.id, expectedVersion: 1 }, h.owner)

        expect(await codeOf(deleteAccount())).toBe(`ACCOUNT_HAS_RECURRING_RULES`)
        await rules.delete({ groupId: h.groupId, id: gone.id, expectedVersion: 1 }, h.owner)
        expect(await codeOf(deleteAccount())).toBe(`ACCOUNT_HAS_RECURRING_RULES`)
        const [{ deletedAt }] = await sql<{ deletedAt: Date }[]>`
          SELECT deleted_at FROM recurring_rules WHERE id = ${gone.id}
        `
        const boundary = new Date(deletedAt.getTime() + RECURRING_RULE_RESTORE_DAYS * 86_400_000)

        // Other steps' deleted rules share the schema, so the rows are checked, not the counts.
        await purgeDeletedRecurringRules(sql, boundary)
        expect(await sql`SELECT id FROM recurring_rules WHERE id = ${gone.id}`).toHaveLength(1)

        await purgeDeletedRecurringRules(sql, new Date(boundary.getTime() + 1))
        expect(await sql`SELECT id FROM recurring_rules WHERE id = ${gone.id}`).toHaveLength(0)
        expect((await deleteAccount()).deletedAt).not.toBeNull()
      },
    )
  })
})
