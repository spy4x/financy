/**
 * Whether a session must be treated as expired. Fails closed: the session is expired unless
 * `expiresAt` is a valid `Date` later than `now`. The column is `TIMESTAMPTZ NOT NULL`, so a
 * missing value, an unparsed string or an invalid date means something upstream went wrong, and
 * signing that session out is safer than keeping it signed in.
 */
export function isSessionExpired(session: { expiresAt: unknown }, now: Date = new Date()): boolean {
  const { expiresAt } = session
  return !(expiresAt instanceof Date) || !(expiresAt.getTime() > now.getTime())
}
