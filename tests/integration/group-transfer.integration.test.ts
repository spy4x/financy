/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import postgres from "postgres"
import { sha256Hex } from "@spy4x/platform/tokens"
import { GroupError, GroupRole } from "@domain/groups"
import {
  newInvitationToken,
  PostgresInvitationRepository,
} from "@server/groups/postgres-invitation-repository.ts"
import { revision, team, withSchema } from "./group-team.ts"

/**
 * Transferring a group's ownership against a real Postgres built from schema.sql: what a transfer
 * changes and writes, what it does to the old owner's invitations, and that the group never has
 * zero or two owners, even with two transfers at once. Needs "DB_HOST", "DB_USER", "DB_PASS" and
 * "DB_NAME" (recipe in docs/handoff.md); it fails when they are missing.
 */

async function refusal(write: Promise<unknown>): Promise<string> {
  try {
    await write
  } catch (error) {
    if (error instanceof GroupError) return error.code
    throw error
  }
  throw new Error("The write was not refused")
}

/** Every member of the group with the owner role, and the owner the group row names. */
async function owners(sql: postgres.Sql, groupId: string) {
  const members = await sql<{ userId: number }[]>`
    SELECT user_id FROM group_members WHERE group_id = ${groupId} AND role = ${GroupRole.OWNER}
  `
  const [group] = await sql<{ ownerUserId: number }[]>`
    SELECT owner_user_id FROM groups WHERE id = ${groupId}
  `
  return { members: members.map((row) => row.userId), row: group.ownerUserId }
}

async function memberRole(sql: postgres.Sql, groupId: string, userId: number) {
  return (await sql<{ role: number }[]>`
    SELECT role FROM group_members WHERE group_id = ${groupId} AND user_id = ${userId}
  `)[0]?.role ?? null
}

/** Creates a pending invitation with `role` made by `actorId`, and answers its id. */
async function invite(sql: postgres.Sql, groupId: string, actorId: number, role: GroupRole) {
  const created = await new PostgresInvitationRepository(sql).create(
    {
      groupId,
      role,
      expiresInDays: 7,
      maxUses: 1,
      email: null,
      tokenHash: await sha256Hex(newInvitationToken()),
    },
    actorId,
    { maxMembers: null, memberRoles: true },
  )
  if (!created) throw new Error("The invitation was not created")
  return created.invitation.id
}

async function revoked(sql: postgres.Sql, invitationId: string): Promise<boolean> {
  const [row] = await sql<{ revoked: boolean }[]>`
    SELECT revoked_at IS NOT NULL AS revoked FROM group_invitations WHERE id = ${invitationId}
  `
  return row.revoked
}

Deno.test("transfer: the member becomes the owner and the owner an admin, with an audit row and a raised revision", async () => {
  await withSchema(async (sql) => {
    const { repository, groupId, owner, editor, viewer } = await team(sql)
    const before = BigInt(await revision(sql, groupId))

    expect(await repository.transferOwnership(groupId, editor, owner, "req-transfer")).toBe(true)

    expect(await owners(sql, groupId)).toEqual({ members: [editor], row: editor })
    expect(await memberRole(sql, groupId, owner)).toBe(GroupRole.ADMIN)
    expect(await memberRole(sql, groupId, viewer)).toBe(GroupRole.VIEWER)
    expect(BigInt(await revision(sql, groupId))).toBe(before + 1n)
    const audits = await sql<{ actorUserId: number; requestId: string }[]>`
      SELECT actor_user_id, request_id FROM audit_events
      WHERE group_id = ${groupId} AND event_kind = 'group.ownership_transferred'
    `
    expect(audits.map((row) => ({ ...row }))).toEqual([
      { actorUserId: owner, requestId: "req-transfer" },
    ])
  })
})

Deno.test("transfer: on locked rows only the owner may, to a member, of a live group", async () => {
  await withSchema(async (sql) => {
    const { repository, groupId, owner, admin, editor, stranger } = await team(sql)

    expect(await refusal(repository.transferOwnership(groupId, editor, admin)))
      .toBe("ROLE_INSUFFICIENT")
    expect(await refusal(repository.transferOwnership(groupId, stranger, owner)))
      .toBe("MEMBER_NOT_FOUND")
    expect(await refusal(repository.transferOwnership(groupId, owner, owner)))
      .toBe("INVALID_REQUEST")
    await sql`UPDATE groups SET deleted_at = CURRENT_TIMESTAMP WHERE id = ${groupId}`
    expect(await repository.transferOwnership(groupId, editor, owner)).toBe(false)
    expect(await owners(sql, groupId)).toEqual({ members: [owner], row: owner })
  })
})

Deno.test("transfer: the old owner keeps their viewer and editor links and loses their admin links", async () => {
  await withSchema(async (sql) => {
    const { repository, groupId, owner, admin } = await team(sql)
    const ownerViewer = await invite(sql, groupId, owner, GroupRole.VIEWER)
    const ownerEditor = await invite(sql, groupId, owner, GroupRole.EDITOR)
    const ownerAdmin = await invite(sql, groupId, owner, GroupRole.ADMIN)
    const newOwnerEditor = await invite(sql, groupId, admin, GroupRole.EDITOR)

    await repository.transferOwnership(groupId, admin, owner)

    expect({
      ownerViewer: await revoked(sql, ownerViewer),
      ownerEditor: await revoked(sql, ownerEditor),
      ownerAdmin: await revoked(sql, ownerAdmin),
      newOwnerEditor: await revoked(sql, newOwnerEditor),
    }).toEqual({ ownerViewer: false, ownerEditor: false, ownerAdmin: true, newOwnerEditor: false })
  })
})

Deno.test("transfer: two at once leave exactly one owner and refuse the second as no longer the owner's", async () => {
  await withSchema(async (sql) => {
    const { repository, groupId, owner, admin, editor } = await team(sql)
    // Each role update waits, so the two transfers overlap however fast the machine is.
    await sql.unsafe(`
      CREATE FUNCTION slow_member_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(0.3); RETURN NEW; END $$;
      CREATE TRIGGER slow_member_update BEFORE UPDATE ON group_members
        FOR EACH ROW EXECUTE FUNCTION slow_member_update();
    `)

    const results = await Promise.allSettled([
      repository.transferOwnership(groupId, admin, owner),
      repository.transferOwnership(groupId, editor, owner),
    ])

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"])
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult
    expect(failed.reason).toBeInstanceOf(GroupError)
    expect(failed.reason.code).toBe("ROLE_INSUFFICIENT")
    const winner = results[0].status === "fulfilled" ? admin : editor
    expect(await owners(sql, groupId)).toEqual({ members: [winner], row: winner })
    expect(await memberRole(sql, groupId, owner)).toBe(GroupRole.ADMIN)
  })
})

Deno.test("transfer: the database refuses a second owner whatever writes it", async () => {
  await withSchema(async (sql) => {
    const { groupId, editor } = await team(sql)

    const write = sql`
      UPDATE group_members SET role = ${GroupRole.OWNER}
      WHERE group_id = ${groupId} AND user_id = ${editor}
    `

    await expect(write).rejects.toThrow("group_members_one_owner_key")
  })
})
