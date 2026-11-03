import type postgres from "postgres"
import { GroupRole } from "@domain/groups"
import { NotificationKind, type NotificationPayload } from "@domain/notifications"
import { createNotification } from "@server/notifications/create-notification.ts"

/** A role as the inbox words it: `editor`. */
export function roleWord(role: GroupRole): string {
  return GroupRole[role].toLowerCase()
}

/** The page of a group, where its members and settings are. */
function groupLink(groupId: string): string {
  return `/groups/${groupId}`
}

/**
 * Tells `userId` in their inbox that their role in the group changed. Call it in the transaction of
 * the change, after the change, so the notification exists exactly when the change does.
 */
export async function notifyRoleChanged(
  sql: postgres.Sql,
  groupId: string,
  userId: number,
  from: GroupRole,
  to: GroupRole,
): Promise<void> {
  await notifyAboutGroup(sql, groupId, userId, NotificationKind.RoleChanged, groupLink(groupId), {
    from: roleWord(from),
    to: roleWord(to),
  })
}

/**
 * Tells `userId` they were removed from the group. The link is the groups list: the group's own
 * page no longer opens for them.
 */
export async function notifyRemoved(
  sql: postgres.Sql,
  groupId: string,
  userId: number,
): Promise<void> {
  await notifyAboutGroup(sql, groupId, userId, NotificationKind.RemovedFromGroup, "/groups")
}

/** Tells `userId` the group's owner handed the group to them. */
export async function notifyOwnershipReceived(
  sql: postgres.Sql,
  groupId: string,
  userId: number,
): Promise<void> {
  await notifyAboutGroup(
    sql,
    groupId,
    userId,
    NotificationKind.OwnershipReceived,
    groupLink(groupId),
  )
}

/**
 * Tells every account that has proven `email`, and is not a member of the group yet, about an
 * invitation sent to that address. The link is the groups list, where a person's own invitations
 * wait to be accepted or declined. A person with no account yet gets nothing: they have no inbox,
 * and the invitation mail and link reach them.
 */
export async function notifyInvitationReceived(
  sql: postgres.Sql,
  groupId: string,
  email: string,
  role: GroupRole,
): Promise<void> {
  const recipients = await sql<{ userId: number }[]>`
    SELECT DISTINCT auth_email_owners.user_id
    FROM auth_email_owners
    INNER JOIN users ON users.id = auth_email_owners.user_id AND users.deleted_at IS NULL
    WHERE auth_email_owners.email = ${email}
      AND NOT EXISTS (
        SELECT 1 FROM group_members
        WHERE group_members.group_id = ${groupId}
          AND group_members.user_id = auth_email_owners.user_id
      )
  `
  for (const { userId } of recipients) {
    await notifyAboutGroup(
      sql,
      groupId,
      userId,
      NotificationKind.InvitationReceived,
      "/groups",
      { role: roleWord(role) },
    )
  }
}

async function notifyAboutGroup(
  sql: postgres.Sql,
  groupId: string,
  userId: number,
  kind: string,
  link: string,
  facts: NotificationPayload = {},
): Promise<void> {
  const [group] = await sql<{ name: string }[]>`SELECT name FROM groups WHERE id = ${groupId}`
  await createNotification(sql, {
    userId,
    kind,
    link,
    payload: { groupName: group?.name ?? "", ...facts },
  })
}
