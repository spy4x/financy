import type postgres from "postgres"

/** A dead invitation is kept this long, so a person can still see why a link stopped working. */
export const INVITATION_RETENTION_DAYS = 30

/**
 * Deletes every invitation that has been dead for more than {@link INVITATION_RETENTION_DAYS}
 * days and returns how many. An invitation dies at the earliest of: its expiry, being revoked,
 * being declined, and its last use when every use is taken. A used-up invitation whose acceptors
 * all deleted their accounts has no use left to date, so it falls back to its creation time. Live ones, and ones dead for less
 * than that, stay. The audit events stay: they are tied to the group, not to the invitation. The
 * database removes the invitation's acceptance rows with it, and its link already refuses.
 *
 * It uses the clock of the database, as the invitation checks do.
 */
export async function purgeDeadInvitations(sql: postgres.Sql): Promise<number> {
  const removed = await sql`
    DELETE FROM group_invitations
    WHERE LEAST(
        expires_at,
        revoked_at,
        declined_at,
        CASE WHEN uses >= max_uses THEN COALESCE(
          (
            SELECT max(accepted_at) FROM group_invitation_acceptances
            WHERE invitation_id = group_invitations.id
          ),
          created_at
        ) END
      ) < now() - make_interval(days => ${INVITATION_RETENTION_DAYS})
  `
  return removed.count
}
