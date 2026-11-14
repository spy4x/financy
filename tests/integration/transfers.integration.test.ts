/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { householdTotal } from "@domain/accounts"
import { AccountKind } from "@domain/accounts"
import { PlanError } from "@domain/billing"
import { type CategoryIcon, CategoryKind } from "@domain/categories"
import { RATE_SOURCES } from "@domain/money"
import { TransactionKind } from "@domain/transactions"
import { TRANSFER_RESTORE_DAYS, TransferError } from "@domain/transfers"
import type { ExchangeRate } from "@spy4x/platform/universal/money"
import { PostgresAccountRepository } from "@server/accounts/postgres-account-repository.ts"
import { PostgresCategoryRepository } from "@server/categories/postgres-category-repository.ts"
import { cleanupSteps } from "@server/jobs/cleanup.ts"
import { PostgresRateRepository } from "@server/money/postgres-rate-repository.ts"
import { PostgresTransactionRepository } from "@server/transactions/postgres-transaction-repository.ts"
import { PostgresTransferRepository } from "@server/transfers/postgres-transfer-repository.ts"
import { purgeDeletedTransfers } from "@server/transfers/purge-deleted-transfers.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { team, withSchema } from "./group-team.ts"
import { expectVersion7Ids } from "./ids.ts"

/**
 * Transfers against a real Postgres built from schema.sql: the stored amounts and the rate each
 * one used, the balances on both sides and the household's total, the locks transfers put on their
 * accounts, the ledger that never sees them, the plan's shared cap, the purge and the tenant
 * boundary. The transports and the gates are in `apps/api/features/transfers/`; a write racing a
 * member's removal is in `group-write-race.integration.test.ts`. Needs `DB_HOST`, `DB_USER`,
 * `DB_PASS` and `DB_NAME` (recipe in docs/handoff.md); it fails when they are missing rather than
 * skipping.
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

/** Rates against the euro, as the daily fetch stores them. */
async function rates(sql: postgres.Sql, date: string, quotes: Record<string, string>) {
  await new PostgresRateRepository(sql).insert(
    Object.entries(quotes).map(([quote, rate]) => ({
      base: "EUR",
      quote,
      rate,
      date,
      source: RATE_SOURCES.ecb,
    })),
    new Date(),
    (_rate, problem) => {
      throw new Error(problem)
    },
  )
}

Deno.test("transfers against Postgres", async (t) => {
  await withSchema(async (sql) => {
    const accounts = new PostgresAccountRepository(sql)
    const transfers = new PostgresTransferRepository(sql)
    const transactions = new PostgresTransactionRepository(sql)
    // 5 November: 150 yen to the dollar. 10 November: 160.
    await rates(sql, "2026-11-05", { USD: "1.1", JPY: "165" })
    await rates(sql, "2026-11-10", { USD: "1", JPY: "160" })

    /** A household with a card and cash in dollars and a yen account, made by its owner. */
    async function household() {
      const members = await team(sql)
      const account = async (name: string, currency: string, startingBalance = 0) =>
        (await accounts.create({
          groupId: members.groupId,
          id: uuidV7(),
          name,
          kind: AccountKind.BANK,
          currency,
          startingBalance,
          allowance: null,
        }, members.owner)).account
      const card = await account("Card", "USD", 100000)
      const cash = await account("Cash", "USD")
      const yen = await account("Yen", "JPY")
      /** Writes a transfer as the owner, 100.00 USD from the card to cash on 5 November by default. */
      const transfer = async (more: Record<string, unknown> = {}, actor = members.owner) =>
        (await transfers.create(
          {
            groupId: members.groupId,
            id: uuidV7(),
            fromAccountId: card.id,
            toAccountId: cash.id,
            sentAmount: 10000,
            memo: "",
            date: "2026-11-05",
            allowance: null,
            ...more,
          } as Parameters<typeof transfers.create>[0],
          actor,
        )).transfer
      /** Each account's balance on `on`, by name. */
      const balances = async (on?: string) =>
        Object.fromEntries(
          (await accounts.list(members.groupId, false, on)).map((row) => [row.name, row.balance]),
        )
      return { ...members, card, cash, yen, account, transfer, balances }
    }

    await t.step(
      "every transfer write moves the household's sequence once and leaves its outbox row; a retry writes nothing",
      async () => {
        const h = await household()
        const before = await nextSequence(sql, h.groupId)
        const id = uuidV7()
        const fields = {
          groupId: h.groupId,
          id,
          fromAccountId: h.card.id,
          toAccountId: h.yen.id,
          sentAmount: 10000,
          memo: "",
          date: "2026-11-05",
        }

        const first = await transfers.create({ ...fields, allowance: null }, h.editor)
        const retry = await transfers.create({ ...fields, allowance: null }, h.editor)
        // Another member resending the same id and content is not a retry of theirs.
        expect(await codeOf(transfers.create({ ...fields, allowance: null }, h.owner)))
          .toBe("ID_ALREADY_EXISTS")
        await transfers.update({ ...fields, memo: "ATM", expectedVersion: 1 }, h.editor)
        await transfers.delete({ groupId: h.groupId, id, expectedVersion: 2 }, h.editor)
        const restored = await transfers.restore(
          { groupId: h.groupId, id, allowance: null },
          h.owner,
        )

        expect(first.created).toBe(true)
        expect(retry).toMatchObject({ created: false, transfer: { id, version: 1 } })
        expect(await nextSequence(sql, h.groupId)).toBe(before + 4n)
        const outbox = await sql<{ eventKind: string }[]>`
          SELECT event_kind FROM outbox_events
          WHERE group_id = ${h.groupId} AND event_kind LIKE 'transfer.%'
          ORDER BY aggregate_version
        `
        expect(outbox.map((row) => row.eventKind)).toEqual([
          "transfer.created",
          "transfer.updated",
          "transfer.deleted",
          "transfer.restored",
        ])
        expect(restored).toMatchObject({
          sentAmount: 10000,
          receivedAmount: 15000,
          converted: true,
          memo: "ATM",
          version: 4,
          createdByUserId: h.editor,
          updatedByUserId: h.owner,
          deletedAt: null,
        })
        expectVersion7Ids([restored])
        expect(
          await codeOf(
            transfers.create({ ...fields, sentAmount: 99, allowance: null }, h.editor),
          ),
        ).toBe("ID_ALREADY_EXISTS")
      },
    )

    await t.step(
      "in one currency, moves the sent amount from one account to the other and leaves the household's total as it was (R5)",
      async () => {
        const h = await household()
        const before = await accounts.list(h.groupId, false, "2026-11-30")

        const moved = await h.transfer({ sentAmount: 2500 })
        const stated = await h.transfer({ sentAmount: 500, receivedAmount: 500 })

        expect(moved).toMatchObject({ sentAmount: 2500, receivedAmount: 2500, converted: false })
        expect(stated).toMatchObject({ receivedAmount: 500, converted: false })
        expect(await h.balances("2026-11-30")).toEqual({ Card: 97000, Cash: 3000, Yen: 0 })
        const after = await accounts.list(h.groupId, false, "2026-11-30")
        const total = (rows: typeof before) =>
          householdTotal(rows, "USD", new Map([["JPY", null]])).amount
        expect(total(after)).toBe(total(before))
        expect(await codeOf(h.transfer({ sentAmount: 500, receivedAmount: 499 })))
          .toBe("INVALID_REQUEST")
        expect(await transfers.count(h.groupId)).toBe(2)
      },
    )

    await t.step(
      "across currencies, fills the received amount at the rate of the transfer's date, not today's, and keeps the date chosen (R6)",
      async () => {
        const h = await household()
        // 7 November has no rate of its own: 5 November's 150 is the latest on or before it.
        const filled = await h.transfer({ toAccountId: h.yen.id, date: "2026-11-07" })
        const later = await h.transfer({ toAccountId: h.yen.id, date: "2026-11-12" })

        expect(filled).toMatchObject({
          sentAmount: 10000,
          receivedAmount: 15000,
          converted: true,
          date: "2026-11-07",
        })
        expect(later).toMatchObject({ receivedAmount: 16000, date: "2026-11-12" })
        expect(await h.balances("2026-11-30")).toEqual({ Card: 80000, Cash: 0, Yen: 31000 })
        // A balance asked for a day counts only the transfers dated on or before it.
        expect(await h.balances("2026-11-10")).toEqual({ Card: 90000, Cash: 0, Yen: 15000 })
      },
    )

    await t.step(
      "keeps a stated received amount, and the household's total moves only by its gap to the day's rate",
      async () => {
        const h = await household()
        const day = "2026-11-05"
        const rate = new PostgresRateRepository(sql)
        const toEuro = new Map<string, ExchangeRate | null>()
        for (const currency of ["USD", "JPY"]) {
          const found = await rate.lookup(currency, "EUR", day)
          toEuro.set(currency, found.found ? found.rate : null)
        }
        const total = async () =>
          householdTotal(await accounts.list(h.groupId, false, day), "EUR", toEuro).amount
        // 1000.00 USD at 1.1 is 909.09 EUR.
        expect(await total()).toBe(90909)

        await h.transfer({ toAccountId: h.yen.id })
        // 900.00 USD is 818.18 EUR, ¥15000 is 90.91 EUR: the total is unchanged.
        expect(await total()).toBe(90909)

        const charged = await h.transfer({ toAccountId: h.yen.id, receivedAmount: 14000 })
        expect(charged).toMatchObject({ receivedAmount: 14000, converted: false })
        // ¥1000 less than the day's rate gives, 6.06 EUR: 800.00 USD is 727.27 EUR, ¥29000 175.76.
        expect(await total()).toBe(90909 - 606)
      },
    )

    await t.step(
      "recomputes the yen at the transfer date's rate when the sent dollars change, and never stores ¥200 (legacy §4 item 6)",
      async () => {
        const h = await household()
        const first = await h.transfer({ toAccountId: h.yen.id })
        const edit = {
          groupId: h.groupId,
          id: first.id,
          fromAccountId: h.card.id,
          toAccountId: h.yen.id,
          memo: "",
          date: "2026-11-05",
        }

        const doubled = await transfers.update(
          { ...edit, sentAmount: 20000, expectedVersion: 1 },
          h.owner,
        )
        expect(doubled).toMatchObject({ sentAmount: 20000, receivedAmount: 30000, converted: true })

        const memo = await transfers.update(
          { ...edit, sentAmount: 20000, memo: "ATM", expectedVersion: 2 },
          h.owner,
        )
        expect(memo).toMatchObject({ receivedAmount: 30000, converted: true })

        const stated = await transfers.update(
          { ...edit, sentAmount: 20000, receivedAmount: 29500, expectedVersion: 3 },
          h.owner,
        )
        expect(stated).toMatchObject({ receivedAmount: 29500, converted: false })
        const kept = await transfers.update(
          { ...edit, sentAmount: 20000, memo: "kept", expectedVersion: 4 },
          h.owner,
        )
        expect(kept).toMatchObject({ receivedAmount: 29500, converted: false })

        const moved = await transfers.update(
          { ...edit, sentAmount: 20000, date: "2026-11-10", expectedVersion: 5 },
          h.owner,
        )
        expect(moved).toMatchObject({ receivedAmount: 32000, converted: true, date: "2026-11-10" })

        const sameCurrency = await transfers.update(
          { ...edit, toAccountId: h.cash.id, sentAmount: 20000, expectedVersion: 6 },
          h.owner,
        )
        expect(sameCurrency).toMatchObject({ receivedAmount: 20000, converted: false })
        expect(await h.balances("2026-11-30")).toEqual({ Card: 80000, Cash: 20000, Yen: 0 })
      },
    )

    await t.step(
      "re-converts the received amount when an edit changes only the to account, to another currency",
      async () => {
        const h = await household()
        const euro = await h.account("Euro", "EUR")
        const first = await h.transfer({ toAccountId: h.yen.id })
        expect(first).toMatchObject({ receivedAmount: 15000, converted: true })

        // Same dollars, same day; only the to account moves from yen to euros (1.1 USD per euro).
        const moved = await transfers.update(
          {
            groupId: h.groupId,
            id: first.id,
            fromAccountId: h.card.id,
            toAccountId: euro.id,
            sentAmount: 10000,
            memo: "",
            date: "2026-11-05",
            expectedVersion: 1,
          },
          h.owner,
        )

        expect(moved).toMatchObject({ toAccountId: euro.id, receivedAmount: 9091, converted: true })
        expect(await h.balances("2026-11-30")).toEqual({
          Card: 90000,
          Cash: 0,
          Yen: 0,
          Euro: 9091,
        })
      },
    )

    await t.step(
      "refuses a transfer across currencies with no rate on its date, and stores nothing",
      async () => {
        const h = await household()
        const pound = await h.account("Pounds", "GBP")
        expect(await codeOf(h.transfer({ toAccountId: pound.id }))).toBe("NO_RATE")
        expect(await codeOf(h.transfer({ toAccountId: h.yen.id, date: "2020-01-01" })))
          .toBe("NO_RATE")
        expect(await transfers.count(h.groupId)).toBe(0)
      },
    )

    await t.step(
      "refuses a transfer to the same account, and in the table too",
      async () => {
        const h = await household()
        const error = await refusal(h.transfer({ toAccountId: h.card.id }))
        expect(error).toBeInstanceOf(TransferError)
        expect((error as TransferError).code).toBe("TRANSFER_SAME_ACCOUNT")
        const direct = await refusal(sql`
          INSERT INTO transfers (
            id, group_id, from_account_id, to_account_id, sent_amount, received_amount, date,
            change_sequence
          ) VALUES (
            ${uuidV7()}, ${h.groupId}, ${h.card.id}, ${h.card.id}, 1, 1, '2026-11-05', 1
          )
        `)
        expect((direct as { constraint_name?: string }).constraint_name)
          .toBe("transfers_accounts_differ_check")
      },
    )

    await t.step(
      "answers another household's account or a deleted one as not found, takes an archived one, and the table refuses another household's account (R17)",
      async () => {
        const h = await household()
        const other = await household()
        const gone = await h.account("Gone", "USD")
        await accounts.delete({ groupId: h.groupId, id: gone.id, expectedVersion: 1 }, h.owner)
        const archived = await h.account("Old", "USD")
        await accounts.archive(
          { groupId: h.groupId, id: archived.id, expectedVersion: 1, archived: true },
          h.owner,
        )

        for (const more of [{ fromAccountId: other.card.id }, { toAccountId: other.cash.id }]) {
          expect(await codeOf(h.transfer(more))).toBe("ACCOUNT_NOT_FOUND")
        }
        expect(await codeOf(h.transfer({ toAccountId: gone.id }))).toBe("ACCOUNT_NOT_FOUND")
        expect(await h.transfer({ toAccountId: archived.id })).toMatchObject({
          receivedAmount: 10000,
        })
        const direct = await refusal(sql`
          INSERT INTO transfers (
            id, group_id, from_account_id, to_account_id, sent_amount, received_amount, date,
            change_sequence
          ) VALUES (
            ${uuidV7()}, ${h.groupId}, ${h.card.id}, ${other.cash.id}, 1, 1, '2026-11-05', 1
          )
        `)
        expect((direct as { constraint_name?: string }).constraint_name)
          .toBe("transfers_to_account_fkey")
      },
    )

    await t.step(
      "answers another household's transfer as not found, for a read and every write",
      async () => {
        const h = await household()
        const other = await household()
        const theirs = await other.transfer()
        const fields = {
          groupId: h.groupId,
          id: theirs.id,
          fromAccountId: h.card.id,
          toAccountId: h.cash.id,
          sentAmount: 1,
          memo: "",
          date: "2026-11-05",
        }

        expect(await transfers.get(h.groupId, theirs.id)).toBeNull()
        expect(await codeOf(transfers.update({ ...fields, expectedVersion: 1 }, h.owner)))
          .toBe("TRANSFER_NOT_FOUND")
        expect(
          await codeOf(
            transfers.delete({ groupId: h.groupId, id: theirs.id, expectedVersion: 1 }, h.owner),
          ),
        ).toBe("TRANSFER_NOT_FOUND")
        expect(
          await codeOf(
            transfers.restore({ groupId: h.groupId, id: theirs.id, allowance: null }, h.owner),
          ),
        ).toBe("TRANSFER_NOT_FOUND")
        expect(await codeOf(transfers.create({ ...fields, allowance: null }, h.owner)))
          .toBe("ID_ALREADY_EXISTS")
        expect(await transfers.get(other.groupId, theirs.id)).toMatchObject({ version: 1 })
      },
    )

    await t.step(
      "answers a stale version with the current one, and leaves out deleted transfers from balances",
      async () => {
        const h = await household()
        const first = await h.transfer()
        const stale = await refusal(
          transfers.delete({ groupId: h.groupId, id: first.id, expectedVersion: 5 }, h.owner),
        )
        expect(stale).toMatchObject({ code: "VERSION_CONFLICT", currentVersion: 1 })
        await transfers.delete({ groupId: h.groupId, id: first.id, expectedVersion: 1 }, h.owner)

        expect(await transfers.get(h.groupId, first.id)).toBeNull()
        expect(await h.balances("2026-11-30")).toEqual({ Card: 100000, Cash: 0, Yen: 0 })
        expect(
          await codeOf(
            transfers.delete({ groupId: h.groupId, id: first.id, expectedVersion: 2 }, h.owner),
          ),
        ).toBe("TRANSFER_NOT_FOUND")
      },
    )

    await t.step(
      "refuses a viewer's writes and tells a stranger the household does not exist (R16)",
      async () => {
        const h = await household()
        const first = await h.transfer()
        expect(await codeOf(h.transfer({}, h.viewer))).toBe("ROLE_INSUFFICIENT")
        expect(
          await codeOf(
            transfers.delete({ groupId: h.groupId, id: first.id, expectedVersion: 1 }, h.viewer),
          ),
        ).toBe("ROLE_INSUFFICIENT")
        expect(await codeOf(h.transfer({}, h.stranger))).toBe("GROUP_NOT_FOUND")
        expect(await transfers.count(h.groupId)).toBe(1)
      },
    )

    await t.step(
      "adds nothing to the ledger's income or spending, and has no category (R12)",
      async () => {
        const h = await household()
        const categories = new PostgresCategoryRepository(sql)
        const food = (await categories.create({
          groupId: h.groupId,
          id: uuidV7(),
          name: "Food",
          kind: CategoryKind.EXPENSE,
          icon: "utensils" as CategoryIcon,
          color: "#c2410c",
          parentId: null,
          allowance: null,
        }, h.owner)).category.id
        await transactions.create({
          groupId: h.groupId,
          id: uuidV7(),
          accountId: h.cash.id,
          categoryId: food,
          kind: TransactionKind.EXPENSE,
          amount: 1234,
          currency: "USD",
          memo: "",
          date: "2026-11-05",
          allowance: null,
        }, h.owner)
        const before = await transactions.ledger(h.groupId, "USD", "2026-11-01", "2026-11-30")

        await h.transfer()
        await h.transfer({ toAccountId: h.yen.id })
        await h.transfer({ fromAccountId: h.yen.id, toAccountId: h.cash.id, sentAmount: 1500 })

        const after = await transactions.ledger(h.groupId, "USD", "2026-11-01", "2026-11-30")
        expect(after).toEqual(before)
        expect(after).toMatchObject({ income: 0, spending: 1234, net: -1234 })
        expect(
          await transactions.ledgerMonths(h.groupId, "USD", "2026-11-01", "2026-11-30"),
        ).toEqual([before])
        const columns = await sql<{ name: string }[]>`
          SELECT column_name AS name FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'transfers'
        `
        expect(columns.map((column) => column.name).filter((name) => name.includes("categor")))
          .toEqual([])
      },
    )

    await t.step(
      "locks the currency of both accounts and keeps either from being deleted, for a live or a trashed transfer",
      async () => {
        for (const trashed of [false, true]) {
          const h = await household()
          const sent = await h.transfer({ toAccountId: h.yen.id })
          if (trashed) {
            await transfers.delete({ groupId: h.groupId, id: sent.id, expectedVersion: 1 }, h.owner)
          }
          for (const account of [h.card, h.yen]) {
            const at = { groupId: h.groupId, id: account.id, expectedVersion: 1 }
            expect(
              await codeOf(
                accounts.update({
                  ...at,
                  name: account.name,
                  kind: AccountKind.BANK,
                  currency: "EUR",
                  startingBalance: account.startingBalance,
                }, h.owner),
              ),
            ).toBe("CURRENCY_LOCKED")
            expect(await codeOf(accounts.delete(at, h.owner))).toBe("ACCOUNT_HAS_TRANSACTIONS")
          }
          // The account no transfer names keeps both.
          expect(
            await accounts.delete(
              { groupId: h.groupId, id: h.cash.id, expectedVersion: 1 },
              h.owner,
            ),
          ).toMatchObject({ id: h.cash.id })
        }
      },
    )

    await t.step(
      "counts entries and transfers together against the plan's transaction cap",
      async () => {
        const h = await household()
        const categories = new PostgresCategoryRepository(sql)
        const food = (await categories.create({
          groupId: h.groupId,
          id: uuidV7(),
          name: "Food",
          kind: CategoryKind.EXPENSE,
          icon: "utensils" as CategoryIcon,
          color: "#c2410c",
          parentId: null,
          allowance: null,
        }, h.owner)).category.id
        const entry = (allowance: number) =>
          transactions.create({
            groupId: h.groupId,
            id: uuidV7(),
            accountId: h.cash.id,
            categoryId: food,
            kind: TransactionKind.EXPENSE,
            amount: 100,
            currency: "USD",
            memo: "",
            date: "2026-11-05",
            allowance,
          }, h.owner)

        expect(await refusal(h.transfer({ allowance: 0 }))).toBeInstanceOf(PlanError)
        await entry(2)
        const first = await h.transfer({ allowance: 2 })
        expect(await refusal(h.transfer({ allowance: 2 }))).toBeInstanceOf(PlanError)
        expect(await refusal(entry(2))).toBeInstanceOf(PlanError)
        await transfers.delete({ groupId: h.groupId, id: first.id, expectedVersion: 1 }, h.owner)
        await entry(2)
        expect(
          await refusal(
            transfers.restore({ groupId: h.groupId, id: first.id, allowance: 2 }, h.owner),
          ),
        ).toBeInstanceOf(PlanError)
        expect(await transfers.count(h.groupId)).toBe(0)
        expect(await transactions.count(h.groupId)).toBe(2)
        expect(await h.transfer({ allowance: null })).toMatchObject({ version: 1 })
      },
    )

    await t.step(
      `purges transfers deleted more than ${TRANSFER_RESTORE_DAYS} days ago, before the accounts' purge`,
      async () => {
        const h = await household()
        const old = await h.transfer()
        const recent = await h.transfer()
        const live = await h.transfer()
        for (const transfer of [old, recent]) {
          await transfers.delete(
            { groupId: h.groupId, id: transfer.id, expectedVersion: 1 },
            h.owner,
          )
        }
        await sql`
          UPDATE transfers SET deleted_at = now() - make_interval(days => ${
          TRANSFER_RESTORE_DAYS + 1
        })
          WHERE id = ${old.id}
        `
        await sql`
          UPDATE transfers SET deleted_at = now() - make_interval(days => ${
          TRANSFER_RESTORE_DAYS - 1
        })
          WHERE id = ${recent.id}
        `

        expect(await purgeDeletedTransfers(sql)).toEqual({ removed: 1 })
        const left = await sql<{ id: string }[]>`
          SELECT id FROM transfers WHERE group_id = ${h.groupId} ORDER BY id
        `
        expect(left.map((row) => row.id)).toEqual([recent.id, live.id].sort())

        // A deleted account whose old transfer is still in the trash goes in the same cleanup,
        // because the transfers are purged first.
        const g = await household()
        const gone = await g.transfer({ toAccountId: g.yen.id })
        await transfers.delete({ groupId: g.groupId, id: gone.id, expectedVersion: 1 }, g.owner)
        await sql`
          UPDATE transfers SET deleted_at = now() - make_interval(days => 400) WHERE id = ${gone.id}
        `
        await sql`
          UPDATE accounts SET deleted_at = now() - make_interval(days => 400) WHERE id = ${g.yen.id}
        `
        for (const [name, run] of cleanupSteps(sql, null, () => {})) {
          if (name.startsWith("purge deleted")) await run()
        }
        expect(await sql`SELECT id FROM accounts WHERE id = ${g.yen.id}`).toEqual([])
        expect(await sql`SELECT id FROM transfers WHERE id = ${gone.id}`).toEqual([])
      },
    )
  })
})
