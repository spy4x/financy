/** Whether a session's `expiresAt` has passed. A session without one never expires. */
export function isSessionExpired(
  session: { expiresAt: Date | null | undefined },
  now: Date = new Date(),
): boolean {
  return !!session.expiresAt && session.expiresAt < now
}
