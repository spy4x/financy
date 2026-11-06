/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import type postgres from "postgres"
import { HOUSEHOLD_EVENTS, HouseholdError, HouseholdVersionConflictError } from "@domain/money"
import { recordAccessChange } from "@server/groups/group-change-log.ts"
import { PostgresHouseholdSettingsRepository } from "@server/money/postgres-household-settings-repository.ts"
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
