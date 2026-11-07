/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { HOUSEHOLD_EVENTS, HouseholdError, HouseholdVersionConflictError } from "@domain/money"
import { recordAccessChange } from "@server/groups/group-change-log.ts"
import { hardDeleteAccount, HardDeleteOutcome } from "@server/auth/account-deletion.ts"
import { readOnboarding } from "@server/auth/onboarding.ts"
import { householdPortable } from "@server/money/household-portable.ts"
import { PostgresHouseholdSettingsRepository } from "@server/money/postgres-household-settings-repository.ts"
import { uuidV7 } from "@spy4x/platform/universal/uuid"
import { team, withSchema } from "./group-team.ts"

/**
 * A household's main currency against a real Postgres built from schema.sql: the default, who may
 * change it, the version check, the audit row and change record, and a save racing the owner who
 * removes the saver. Needs "DB_HOST", "DB_USER", "DB_PASS" and "DB_NAME" (recipe in
 * docs/handoff.md); it fails when they are missing.
 */

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => null, (caught) => caught)
  if (!(error instanceof HouseholdError)) throw new Error(`expected a HouseholdError, got ${error}`)
  return error.code
}

Deno.test("household settings: a new group has the euro, unchosen, at version 0", async () => {
  await withSchema(async (sql) => {
    const { groupId } = await team(sql)
    expect(await new PostgresHouseholdSettingsRepository(sql).get(groupId)).toEqual({
      groupId,
      baseCurrency: `EUR`,
      version: 0,
      chosen: false,
      updatedAt: null,
    })
  })
})

Deno.test("household settings: an admin's save is chosen, versioned, audited and recorded on the group", async () => {
  await withSchema(async (sql) => {
    const { groupId, admin } = await team(sql)
    const settings = new PostgresHouseholdSettingsRepository(sql)
    const saved = await settings.update({ groupId, baseCurrency: `JPY`, expectedVersion: 0 }, admin)
    expect(saved).toMatchObject({ groupId, baseCurrency: `JPY`, version: 1, chosen: true })
    const again = await settings.update({ groupId, baseCurrency: `USD`, expectedVersion: 1 }, admin)
    expect(again).toMatchObject({ baseCurrency: `USD`, version: 2 })

    const audit = await sql<{ actorUserId: number; details: unknown }[]>`
      SELECT actor_user_id, details FROM audit_events
      WHERE group_id = ${groupId} AND event_kind = ${HOUSEHOLD_EVENTS.mainCurrencyChanged}
      ORDER BY id
    `
    expect(audit).toEqual([
      { actorUserId: admin, details: { from: `EUR`, to: `JPY` } },
      { actorUserId: admin, details: { from: `JPY`, to: `USD` } },
    ])
    const changes = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM outbox_events
      WHERE group_id = ${groupId} AND event_kind = ${HOUSEHOLD_EVENTS.settingsUpdated}
    `
    expect(changes[0].count).toBe(2)
  })
})

Deno.test("household settings: an editor or a viewer is refused, a stranger is told there is no group", async () => {
  await withSchema(async (sql) => {
    const { groupId, editor, viewer, stranger } = await team(sql)
    const settings = new PostgresHouseholdSettingsRepository(sql)
    const save = (actor: number) =>
      settings.update({ groupId, baseCurrency: `JPY`, expectedVersion: 0 }, actor)
    expect(await codeOf(save(editor))).toBe(`ROLE_INSUFFICIENT`)
    expect(await codeOf(save(viewer))).toBe(`ROLE_INSUFFICIENT`)
    expect(await codeOf(save(stranger))).toBe(`GROUP_NOT_FOUND`)
    expect((await settings.get(groupId)).version).toBe(0)
  })
})

Deno.test("household settings: a save from a stale version is refused with the settings as they are", async () => {
  await withSchema(async (sql) => {
    const { groupId, owner, admin } = await team(sql)
    const settings = new PostgresHouseholdSettingsRepository(sql)
    await settings.update({ groupId, baseCurrency: `GBP`, expectedVersion: 0 }, owner)
    const error = await settings
      .update({ groupId, baseCurrency: `JPY`, expectedVersion: 0 }, admin)
      .then(() => null, (caught) => caught)
    expect(error).toBeInstanceOf(HouseholdVersionConflictError)
    expect((error as HouseholdVersionConflictError).current).toMatchObject({
      baseCurrency: `GBP`,
      version: 1,
    })
  })
})

Deno.test("household settings: a save waiting on the admin's removal is refused once it commits", async () => {
  await withSchema(async (sql) => {
    const { groupId, owner, admin } = await team(sql)
    let release!: () => void
    const released = new Promise<void>((resolve) => release = resolve)
    let written!: () => void
    const removed = new Promise<void>((resolve) => written = resolve)
    const removal = sql.begin(async (transaction: postgres.TransactionSql) => {
      await transaction`DELETE FROM group_members WHERE group_id = ${groupId} AND user_id = ${admin}`
      await recordAccessChange(transaction, groupId, owner, `group.member_removed`, [admin])
      written()
      await released
    })
    await removed

    const settings = new PostgresHouseholdSettingsRepository(sql)
    const saving = codeOf(
      settings.update({ groupId, baseCurrency: `JPY`, expectedVersion: 0 }, admin),
    )
    const pending = Symbol(`pending`)
    const early = await Promise.race([
      saving,
      new Promise((resolve) => setTimeout(() => resolve(pending), 300)),
    ])
    expect(early).toBe(pending)
    release()
    await removal

    expect(await saving).toBe(`GROUP_NOT_FOUND`)
    expect((await settings.get(groupId)).version).toBe(0)
  })
})

Deno.test("household settings: the currency stays chosen after its saver's account is deleted for good", async () => {
  await withSchema(async (sql) => {
    const { groupId, owner, admin } = await team(sql)
    const settings = new PostgresHouseholdSettingsRepository(sql)
    await settings.update({ groupId, baseCurrency: `JPY`, expectedVersion: 0 }, admin)
    // The account was deleted 7 days ago and its wait is over, as the nightly run finds it.
    await sql`UPDATE users SET deleted_at = now() WHERE id = ${admin}`
    const deletionId = uuidV7()
    await sql`INSERT INTO account_deletions (id, user_id, delete_after)
      VALUES (${deletionId}, ${admin}, now() - INTERVAL '1 second')`
    expect(await hardDeleteAccount(sql, deletionId)).toBe(HardDeleteOutcome.Deleted)
    expect(await sql`SELECT updated_by_user_id FROM household_settings`).toEqual([
      { updatedByUserId: null },
    ])

    expect(await settings.get(groupId)).toMatchObject({ baseCurrency: `JPY`, chosen: true })
    expect((await readOnboarding(sql, owner))?.steps.currencyChosen).toBe(true)
    const exported = []
    for await (const entries of householdPortable.read(sql, groupId)) exported.push(...entries)
    expect(exported).toEqual([{ id: groupId, baseCurrency: `JPY`, chosen: true }])
  })
})

Deno.test("household settings: a later save keeps the time the currency was first chosen", async () => {
  await withSchema(async (sql) => {
    const { groupId, admin } = await team(sql)
    const settings = new PostgresHouseholdSettingsRepository(sql)
    await settings.update({ groupId, baseCurrency: `JPY`, expectedVersion: 0 }, admin)
    await sql`UPDATE household_settings SET chosen_at = '2026-01-01T00:00:00Z'`
    await settings.update({ groupId, baseCurrency: `USD`, expectedVersion: 1 }, admin)

    expect(await sql`SELECT chosen_at FROM household_settings`).toEqual([
      { chosenAt: new Date(`2026-01-01T00:00:00Z`) },
    ])
  })
})

Deno.test("household settings: the migration marks a currency a person saved as chosen, and a rerun changes nothing", async () => {
  await withSchema(async (sql) => {
    const { groupId, owner, admin } = await team(sql)
    const [own] = await sql<{ id: string }[]>`
      SELECT id FROM groups WHERE owner_user_id = ${admin}
    `
    await sql`ALTER TABLE household_settings DROP COLUMN chosen_at`
    await sql`INSERT INTO household_settings (group_id, base_currency, updated_by_user_id, updated_at)
      VALUES (${groupId}, 'JPY', ${owner}, '2026-01-01T00:00:00Z'), (${own.id}, 'EUR', NULL, now())`
    const migration = await Deno.readTextFile(
      `libs/server/db/migrations/2026_12_16_0004_household_chosen_at.sql`,
    )

    await sql.unsafe(migration)
    await sql.unsafe(migration)

    const settings = new PostgresHouseholdSettingsRepository(sql)
    expect(await settings.get(groupId)).toMatchObject({ chosen: true })
    expect(await settings.get(own.id)).toMatchObject({ chosen: false })
    expect(await sql`SELECT chosen_at FROM household_settings WHERE group_id = ${groupId}`).toEqual(
      [
        { chosenAt: new Date(`2026-01-01T00:00:00Z`) },
      ],
    )
  })
})
