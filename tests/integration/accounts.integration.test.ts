/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { CommandBus, QueryBus } from "@spy4x/platform/cqrs"
import { SecondFactorStatus } from "@spy4x/server/sign-in"
import { type Actor, UserMFAStatus } from "@domain/identity"
import {
  ACCOUNT_MAX_PER_GROUP,
  ACCOUNT_RESTORE_DAYS,
  AccountArchiveCommand,
  AccountCreateCommand,
  AccountDeleteCommand,
  AccountGetQuery,
  AccountKind,
  AccountListQuery,
  AccountRestoreCommand,
  AccountSetDefaultCommand,
  AccountUpdateCommand,
} from "@domain/accounts"
import { PostgresGroupRepository } from "@server/groups/postgres-group-repository.ts"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { purgeDeletedAccounts } from "@server/accounts/purge-deleted-accounts.ts"
import { createSessionGate } from "../../apps/api/cqrs/session-gate.ts"
import {
  createAccountArchiveHandler,
  createAccountCreateHandler,
  createAccountDeleteHandler,
  createAccountGetHandler,
  createAccountListHandler,
  createAccountRestoreHandler,
  createAccountSetDefaultHandler,
  createAccountUpdateHandler,
} from "../../apps/api/features/accounts/handlers.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { team, withSchema } from "./group-team.ts"
import { expectVersion7Ids } from "./ids.ts"

/**
 * Accounts against a real Postgres built from the migrations, through the handlers the API puts on
 * its buses. Needs `DB_HOST`, `DB_USER`, `DB_PASS` and `DB_NAME` (recipe in docs/handoff.md); it
 * fails when they are missing rather than skipping.
 */

function actor(userId: number): Actor {
  return {
    userId,
    userMfa: UserMFAStatus.NOT_CONFIGURED,
    sessionSecondFactor: SecondFactorStatus.NotRequired,
  }
}

function buses(sql: postgres.Sql) {
  const groups = new PostgresGroupRepository(sql)
  const roleOf = async (groupId: string, userId: number) =>
    (await groups.getForMember(groupId, userId))?.role ?? null
  const dependencies = { accounts: new PostgresAccountRepository(sql), groups: { roleOf } }
  const commands = new CommandBus()
  commands.use(createSessionGate([]))
  commands.register(AccountCreateCommand, createAccountCreateHandler(dependencies))
  commands.register(AccountUpdateCommand, createAccountUpdateHandler(dependencies))
  commands.register(AccountArchiveCommand, createAccountArchiveHandler(dependencies))
  commands.register(AccountSetDefaultCommand, createAccountSetDefaultHandler(dependencies))
  commands.register(AccountDeleteCommand, createAccountDeleteHandler(dependencies))
  commands.register(AccountRestoreCommand, createAccountRestoreHandler(dependencies))
  const queries = new QueryBus()
  queries.use(createSessionGate([]))
  queries.register(AccountListQuery, createAccountListHandler(dependencies))
  queries.register(AccountGetQuery, createAccountGetHandler(dependencies))
  return { commands, queries }
}

const fields = { name: "Main account", kind: AccountKind.BANK, currency: "USD", startingBalance: 0 }

async function refusal(promise: Promise<unknown>): Promise<unknown> {
  return await promise.then(() => null, (error) => error)
}

async function nextSequence(sql: postgres.Sql, groupId: string): Promise<bigint> {
  return BigInt(
    (await sql<{ next: string }[]>`
      SELECT next_change_sequence::text AS next FROM groups WHERE id = ${groupId}
    `)[0].next,
  )
}

/** Gives the household `count` more accounts without going through the cap. */
async function fill(sql: postgres.Sql, groupId: string, userId: number, count: number) {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: uuidV7(),
    group_id: groupId,
    name: `Filler ${index + 1}`,
    kind: AccountKind.CASH,
    currency: "EUR",
    change_sequence: 1,
    created_by_user_id: userId,
    updated_by_user_id: userId,
  }))
  await sql`INSERT INTO accounts ${sql(rows)}`
}

Deno.test("accounts against Postgres", async (t) => {
  await withSchema(async (sql) => {
    const { commands, queries } = buses(sql)
    const create = (userId: number, groupId: string, more: Partial<typeof fields> = {}) =>
      commands.execute(
        new AccountCreateCommand({
          actor: actor(userId),
          groupId,
          id: uuidV7(),
          ...fields,
          ...more,
        }),
      )

    await t.step(
      "every account write moves the household's sequence once and leaves its outbox and audit rows",
      async () => {
        const { groupId, owner } = await team(sql)
        const before = await nextSequence(sql, groupId)

        const { account } = await create(owner, groupId)
        const write = { actor: actor(owner), groupId, id: account.id }
        await commands.execute(
          new AccountUpdateCommand({ ...write, ...fields, name: "Bills", version: 1 }),
        )
        await commands.execute(new AccountArchiveCommand({ ...write, archived: true, version: 2 }))
        await commands.execute(new AccountArchiveCommand({ ...write, archived: false, version: 3 }))
        await commands.execute(
          new AccountSetDefaultCommand({ ...write, isDefault: true, version: 4 }),
        )
        await commands.execute(new AccountDeleteCommand({ ...write, version: 5 }))
        await commands.execute(new AccountRestoreCommand(write))

        const kinds = [
          "account.created",
          "account.updated",
          "account.archived",
          "account.unarchived",
          "account.default_set",
          "account.deleted",
          "account.restored",
        ]
        expect(await nextSequence(sql, groupId)).toBe(before + 7n)
        const outbox = await sql<{ eventKind: string }[]>`
          SELECT event_kind FROM outbox_events
          WHERE group_id = ${groupId} AND event_kind LIKE 'account.%' ORDER BY aggregate_version
        `
        expect(outbox.map((row) => row.eventKind)).toEqual(kinds)
        const audit = await sql<{ eventKind: string; entityType: string; details: object }[]>`
          SELECT event_kind, entity_type, details FROM audit_events
          WHERE group_id = ${groupId} AND entity_id = ${account.id} ORDER BY id
        `
        expect(audit.map((row) => row.eventKind)).toEqual(kinds)
        expect(audit.every((row) => row.entityType === "account")).toBe(true)
        expect(audit[1].details).toEqual({ name: "Bills", from: "Main account" })
        expectVersion7Ids([account])
      },
    )

    await t.step(
      "stores a starting balance up to the safe bound and reads it back as the same number, as the balance (R3, R9)",
      async () => {
        const { groupId, owner } = await team(sql)
        const top = await create(owner, groupId, { startingBalance: Number.MAX_SAFE_INTEGER })
        const bottom = await create(owner, groupId, {
          name: "Loan",
          kind: AccountKind.LIABILITY,
          startingBalance: -Number.MAX_SAFE_INTEGER,
        })
        const yen = await create(owner, groupId, {
          name: "Yen",
          currency: "JPY",
          startingBalance: 500,
        })

        const listed = await queries.execute(new AccountListQuery({ actor: actor(owner), groupId }))

        expect(
          listed.accounts.map((
            { name, startingBalance, balance },
          ) => [name, startingBalance, balance]),
        )
          .toEqual([
            ["Loan", -Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER],
            ["Main account", Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
            ["Yen", 500, 500],
          ])
        expect([top, bottom, yen].map((result) => result.created)).toEqual([true, true, true])
        await expect(
          sql`UPDATE accounts SET starting_balance = ${String(Number.MAX_SAFE_INTEGER + 2)}::bigint
              WHERE id = ${top.account.id}`,
        ).rejects.toThrow("accounts_starting_balance_check")
      },
    )

    await t.step(
      "the database refuses a currency that is no upper-case three-letter code",
      async () => {
        const { groupId, owner } = await team(sql)
        const { account } = await create(owner, groupId)
        for (const currency of ["usd", "US", "USDT1", "1"]) {
          await expect(sql`UPDATE accounts SET currency = ${currency} WHERE id = ${account.id}`)
            .rejects.toThrow("accounts_currency_check")
        }
      },
    )

    await t.step(
      "keeps one default per household: the index refuses a second, and an archived one cannot be it",
      async () => {
        const { groupId, owner } = await team(sql)
        const first = (await create(owner, groupId)).account
        const second = (await create(owner, groupId, { name: "Wallet" })).account
        const at = (id: string, version: number) => ({ actor: actor(owner), groupId, id, version })

        await commands.execute(
          new AccountSetDefaultCommand({ ...at(first.id, 1), isDefault: true }),
        )
        await commands.execute(
          new AccountSetDefaultCommand({ ...at(second.id, 1), isDefault: true }),
        )
        const defaults = await sql<{ id: string; version: number }[]>`
          SELECT id, version FROM accounts WHERE group_id = ${groupId} AND is_default
        `
        expect(defaults.map((row) => row.id)).toEqual([second.id])
        await expect(sql`UPDATE accounts SET is_default = TRUE WHERE id = ${first.id}`)
          .rejects.toThrow("idx_accounts_group_default")

        await commands.execute(new AccountArchiveCommand({ ...at(second.id, 2), archived: true }))
        const archived = await queries.execute(
          new AccountGetQuery({ actor: actor(owner), groupId, id: second.id }),
        )
        expect(archived.account).toMatchObject({ isDefault: false, version: 3 })
        expect(
          await refusal(
            commands.execute(
              new AccountSetDefaultCommand({ ...at(second.id, 3), isDefault: true }),
            ),
          ),
        ).toMatchObject({ code: "ACCOUNT_ARCHIVED" })
        await expect(sql`UPDATE accounts SET is_default = TRUE WHERE id = ${second.id}`)
          .rejects.toThrow("accounts_default_live_check")
      },
    )

    await t.step(
      "answers another household's account as not found and leaves it as it was (R17)",
      async () => {
        const mine = await team(sql)
        const theirs = await team(sql)
        const { account } = await create(theirs.owner, theirs.groupId)
        const at = { actor: actor(mine.owner), groupId: mine.groupId, id: account.id, version: 1 }

        const refusals = [
          await refusal(queries.execute(new AccountGetQuery(at))),
          await refusal(
            commands.execute(new AccountUpdateCommand({ ...at, ...fields, name: "Mine" })),
          ),
          await refusal(commands.execute(new AccountSetDefaultCommand({ ...at, isDefault: true }))),
          await refusal(commands.execute(new AccountArchiveCommand({ ...at, archived: true }))),
          await refusal(commands.execute(new AccountDeleteCommand(at))),
        ]

        for (const error of refusals) expect(error).toMatchObject({ code: "ACCOUNT_NOT_FOUND" })
        const [row] = await sql`
          SELECT name, is_default, archived_at, deleted_at, version FROM accounts WHERE id = ${account.id}
        `
        expect(row).toEqual({
          name: "Main account",
          isDefault: false,
          archivedAt: null,
          deletedAt: null,
          version: 1,
        })
      },
    )

    await t.step(
      "a viewer reads the accounts and cannot write one; a stranger sees no household",
      async () => {
        const { groupId, owner, viewer, stranger } = await team(sql)
        await create(owner, groupId)

        const listed = await queries.execute(
          new AccountListQuery({ actor: actor(viewer), groupId }),
        )

        expect(listed.accounts.map((account) => account.name)).toEqual(["Main account"])
        expect(await refusal(create(viewer, groupId))).toMatchObject({ code: "ROLE_INSUFFICIENT" })
        expect(await refusal(create(stranger, groupId))).toMatchObject({ code: "GROUP_NOT_FOUND" })
        expect(
          await refusal(queries.execute(new AccountListQuery({ actor: actor(stranger), groupId }))),
        ).toMatchObject({ code: "GROUP_NOT_FOUND" })
      },
    )

    await t.step("the cap holds when two creates race for the last place", async () => {
      const { groupId, owner, editor } = await team(sql)
      await fill(sql, groupId, owner, ACCOUNT_MAX_PER_GROUP - 1)

      const outcomes = await Promise.allSettled([create(owner, groupId), create(editor, groupId)])

      expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"])
      const rejected = outcomes.find((outcome) => outcome.status === "rejected")
      expect((rejected as PromiseRejectedResult).reason).toMatchObject({
        code: "ACCOUNT_LIMIT_REACHED",
      })
      const [{ count }] = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM accounts WHERE group_id = ${groupId}
      `
      expect(count).toBe(ACCOUNT_MAX_PER_GROUP)
    })

    await t.step(
      "a retried create is answered with the first account and stores one row",
      async () => {
        const { groupId, owner } = await team(sql)
        const command = new AccountCreateCommand({
          actor: actor(owner),
          groupId,
          id: uuidV7(),
          ...fields,
        })

        const first = await commands.execute(command)
        const again = await commands.execute(command)

        expect([first.created, again.created]).toEqual([true, false])
        expect(again.account.id).toBe(first.account.id)
        expect(
          await refusal(
            commands.execute(new AccountCreateCommand({ ...command.data, name: "Other" })),
          ),
        ).toMatchObject({ code: "ID_ALREADY_EXISTS" })
      },
    )

    await t.step(
      "the purge removes an account deleted more than the restore window ago and keeps a newer one",
      async () => {
        const { groupId, owner } = await team(sql)
        const old = (await create(owner, groupId, { name: "Old" })).account
        const recent = (await create(owner, groupId, { name: "Recent" })).account
        const now = new Date("2026-12-31T00:00:00.000Z")
        const day = 24 * 60 * 60 * 1000
        await sql`
          UPDATE accounts SET deleted_at = ${new Date(
          now.getTime() - (ACCOUNT_RESTORE_DAYS + 1) * day,
        )}
          WHERE id = ${old.id}
        `
        await sql`
          UPDATE accounts SET deleted_at = ${new Date(
          now.getTime() - (ACCOUNT_RESTORE_DAYS - 1) * day,
        )}
          WHERE id = ${recent.id}
        `

        const result = await purgeDeletedAccounts(sql, now)

        expect(result.removed).toBe(1)
        const left = await sql<{ id: string }[]>`
          SELECT id FROM accounts WHERE id IN ${sql([old.id, recent.id])}
        `
        expect(left.map((row) => row.id)).toEqual([recent.id])
      },
    )
  })
})
