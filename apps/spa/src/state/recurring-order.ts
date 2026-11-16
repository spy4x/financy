/** Oldest first, as the server lists repeating rules (`ORDER BY created_at, id`). */
export function byCreated(
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string },
): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}
