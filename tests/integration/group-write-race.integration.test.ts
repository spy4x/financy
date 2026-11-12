/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import postgres from "postgres"
import { GroupRole } from "@domain/groups"
import { NoteError } from "@domain/notes"
import { AccountError, AccountKind } from "@domain/accounts"
import { lockActorRole } from "@server/groups/group-change-log.ts"
import { PostgresNoteRepository } from "@server/notes/postgres-note-repository.ts"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { CategoryError, type CategoryIcon, CategoryKind } from "@domain/categories"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { TransactionError, TransactionKind } from "@domain/transactions"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import {
  holdMemberChange,
  type MemberChange,
  stillWaiting,
  team,
  withSchema,
} from "./group-team.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"

/**
 * A write that passed the handler's role check, racing the owner who removes or demotes the
 * writer. The member change is held open until the write is waiting on it; once it commits, the
 * write must be refused, because every group write checks the role again in its own transaction.
 * Needs "DB_HOST", "DB_USER", "DB_PASS" and "DB_NAME" (recipe in docs/handoff.md); it fails when
 * they are missing.
 */

const EXPECTED_CODE: Record<MemberChange, string> = {
  removal: "GROUP_NOT_FOUND",
  demotion: "ROLE_INSUFFICIENT",
}

for (const change of ["removal", "demotion"] as const) {
  for (const write of ["create", "update", "delete"] as const) {
    Deno.test(`note ${write}: refused when a ${change} commits while the write waits`, async () => {
      await withSchema(async (sql) => {
        const { groupId, owner, editor } = await team(sql)
        const notes = new PostgresNoteRepository(sql)
        const id = uuidV7()
        if (write !== "create") {
          await notes.create({ groupId, id, title: "First", body: "" }, editor, null)
        }

        const held = await holdMemberChange(sql, groupId, owner, editor, change)
        const writing = write === "create"
          ? notes.create({ groupId, id, title: "Late", body: "" }, editor, null)
          : write === "update"
          ? notes.update({ groupId, id, title: "Late", body: "", expectedVersion: 1 }, editor)
          : notes.delete({ groupId, id, expectedVersion: 1 }, editor)
        const outcome = writing.then(() => null, (error) => error)

        expect(await stillWaiting(outcome)).toBe(true)
        held.release()
        await held.committed

        const error = await outcome
        expect(error).toBeInstanceOf(NoteError)
        expect((error as NoteError).code).toBe(EXPECTED_CODE[change])
        const rows = await sql<{ title: string; deleted: boolean }[]>`
          SELECT title, deleted_at IS NOT NULL AS deleted FROM notes WHERE id = ${id}
        `
        expect(rows).toEqual(write === "create" ? [] : [{ title: "First", deleted: false }])
      })
    })
  }
}

const ACCOUNT_WRITES = ["create", "update", "archive", "default", "delete"] as const

for (const change of ["removal", "demotion"] as const) {
  for (const write of ACCOUNT_WRITES) {
    Deno.test(`account ${write}: refused when a ${change} commits while the write waits`, async () => {
      await withSchema(async (sql) => {
        const { groupId, owner, editor } = await team(sql)
        const accounts = new PostgresAccountRepository(sql)
        const id = uuidV7()
        const fields = {
          name: "Wallet",
          kind: AccountKind.CASH,
          currency: "EUR",
          startingBalance: 0,
        }
        if (write !== "create") {
          await accounts.create({ groupId, id, ...fields, allowance: null }, editor)
        }

        const held = await holdMemberChange(sql, groupId, owner, editor, change)
        const at = { groupId, id, expectedVersion: 1 }
        const writing = write === "create"
          ? accounts.create({ groupId, id, ...fields, allowance: null }, editor)
          : write === "update"
          ? accounts.update({ ...at, ...fields, name: "Late" }, editor)
          : write === "archive"
          ? accounts.archive({ ...at, archived: true }, editor)
          : write === "default"
          ? accounts.setDefault({ ...at, isDefault: true }, editor)
          : accounts.delete(at, editor)
        const outcome = writing.then(() => null, (error) => error)

        expect(await stillWaiting(outcome)).toBe(true)
        held.release()
        await held.committed

        const error = await outcome
        expect(error).toBeInstanceOf(AccountError)
        expect((error as AccountError).code).toBe(EXPECTED_CODE[change])
        const rows = await sql`
          SELECT name, version FROM accounts WHERE id = ${id}
        `
        expect(rows).toEqual(write === "create" ? [] : [{ name: "Wallet", version: 1 }])
      })
    })
  }
}

const CATEGORY_WRITES = ["create", "update", "archive"] as const

for (const change of ["removal", "demotion"] as const) {
  for (const write of CATEGORY_WRITES) {
    Deno.test(`category ${write}: refused when a ${change} commits while the write waits`, async () => {
      await withSchema(async (sql) => {
        const { groupId, owner, editor } = await team(sql)
        const categories = new PostgresCategoryRepository(sql)
        const id = uuidV7()
        const fields = {
          name: "Food",
          kind: CategoryKind.EXPENSE,
          icon: "utensils" as CategoryIcon,
          color: "#c2410c",
          parentId: null,
        }
        if (write !== "create") {
          await categories.create({ groupId, id, ...fields, allowance: null }, editor)
        }

        const held = await holdMemberChange(sql, groupId, owner, editor, change)
        const at = { groupId, id, expectedVersion: 1 }
        const writing = write === "create"
          ? categories.create({ groupId, id, ...fields, allowance: null }, editor)
          : write === "update"
          ? categories.update({ ...at, ...fields, name: "Late" }, editor)
          : categories.archive({ ...at, archived: true, allowance: null }, editor)
        const outcome = writing.then(() => null, (error) => error)

        expect(await stillWaiting(outcome)).toBe(true)
        held.release()
        await held.committed

        const error = await outcome
        expect(error).toBeInstanceOf(CategoryError)
        expect((error as CategoryError).code).toBe(EXPECTED_CODE[change])
        const rows = await sql`
          SELECT name, version, archived_at IS NOT NULL AS archived FROM categories WHERE id = ${id}
        `
        expect(rows).toEqual(
          write === "create" ? [] : [{ name: "Food", version: 1, archived: false }],
        )
      })
    })
  }
}

const TRANSACTION_WRITES = ["create", "update", "delete", "restore"] as const

for (const change of ["removal", "demotion"] as const) {
  for (const write of TRANSACTION_WRITES) {
    Deno.test(`entry ${write}: refused when a ${change} commits while the write waits`, async () => {
      await withSchema(async (sql) => {
        const { groupId, owner, editor } = await team(sql)
        const accountId = uuidV7()
        const categoryId = uuidV7()
        await new PostgresAccountRepository(sql).create({
          groupId,
          id: accountId,
          name: "Main",
          kind: AccountKind.BANK,
          currency: "USD",
          startingBalance: 0,
          allowance: null,
        }, owner)
        await new PostgresCategoryRepository(sql).create({
          groupId,
          id: categoryId,
          name: "Food",
          kind: CategoryKind.EXPENSE,
          icon: "utensils" as CategoryIcon,
          color: "#c2410c",
          parentId: null,
          allowance: null,
        }, owner)
        const transactions = new PostgresTransactionRepository(sql)
        const id = uuidV7()
        const fields = {
          accountId,
          categoryId,
          kind: TransactionKind.EXPENSE,
          amount: 1234,
          currency: "USD",
          memo: "",
          date: "2026-11-05",
        }
        if (write !== "create") {
          await transactions.create({ groupId, id, ...fields, allowance: null }, editor)
        }
        if (write === "restore") {
          await transactions.delete({ groupId, id, expectedVersion: 1 }, editor)
        }

        const held = await holdMemberChange(sql, groupId, owner, editor, change)
        const at = { groupId, id, expectedVersion: 1 }
        const writing = write === "create"
          ? transactions.create({ groupId, id, ...fields, allowance: null }, editor)
          : write === "update"
          ? transactions.update({ ...at, ...fields, memo: "Late" }, editor)
          : write === "delete"
          ? transactions.delete(at, editor)
          : transactions.restore({ groupId, id, allowance: null }, editor)
        const outcome = writing.then(() => null, (error) => error)

        expect(await stillWaiting(outcome)).toBe(true)
        held.release()
        await held.committed

        const error = await outcome
        expect(error).toBeInstanceOf(TransactionError)
        expect((error as TransactionError).code).toBe(EXPECTED_CODE[change])
        const rows = await sql`
          SELECT memo, version, deleted_at IS NOT NULL AS deleted FROM transactions WHERE id = ${id}
        `
        expect(rows).toEqual(
          write === "create"
            ? []
            : [{ memo: "", version: write === "restore" ? 2 : 1, deleted: write === "restore" }],
        )
      })
    })
  }
}

Deno.test("rename: refused when the admin is demoted while the rename waits", async () => {
  await withSchema(async (sql) => {
    const { repository, groupId, owner, admin } = await team(sql)

    const held = await holdMemberChange(sql, groupId, owner, admin, "demotion")
    const renaming = repository.rename(groupId, "Late", admin)

    expect(await stillWaiting(renaming)).toBe(true)
    held.release()
    await held.committed

    expect(await renaming).toBeNull()
    expect((await repository.getSummaryForMember(groupId, owner))?.name).toBe("Team")
  })
})

/**
 * Holds a transaction after its first statement is answered, until `resume`: the write has taken
 * its first lock and keeps it while the test starts the member change.
 */
function firstStatementGate() {
  let paused!: () => void
  const pausedSignal = new Promise<void>((resolve) => paused = resolve)
  let resume!: () => void
  const resumed = new Promise<void>((resolve) => resume = resolve)
  let statements = 0
  const wrap = (transaction: postgres.TransactionSql) =>
    new Proxy(transaction, {
      apply(target, self, args) {
        const query = Reflect.apply(target, self, args) as Promise<unknown>
        if (++statements !== 1) return query
        return query.then(async (rows) => {
          paused()
          await resumed
          return rows
        })
      },
    })
  return { wrap, paused: pausedSignal, resume }
}

for (const change of ["removal", "demotion"] as const) {
  Deno.test(
    `lock order: a write between its two locks and the real ${change} both commit`,
    async () => {
      await withSchema(async (sql) => {
        const { repository, groupId, owner, editor } = await team(sql)
        const gate = firstStatementGate()
        let role: GroupRole | null = null

        const writing = sql.begin(async (transaction: postgres.TransactionSql) => {
          role = await lockActorRole(gate.wrap(transaction), groupId, editor)
        })
        await Promise.race([gate.paused, writing])

        const changing = change === "removal"
          ? repository.removeMember(groupId, editor, owner)
          : repository.changeMemberRole(groupId, editor, GroupRole.VIEWER, owner)
        expect(await stillWaiting(changing)).toBe(true)
        gate.resume()

        // With the locks the other way round, the two wait for each other and one ends in 40P01.
        await writing
        await changing
        expect(role).toBe(GroupRole.EDITOR)
        const rows = await sql<{ role: GroupRole }[]>`
          SELECT role FROM group_members WHERE group_id = ${groupId} AND user_id = ${editor}
        `
        expect(rows).toEqual(change === "removal" ? [] : [{ role: GroupRole.VIEWER }])
      })
    },
  )
}
