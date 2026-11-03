import type postgres from "postgres"
import {
  listenForGroupAccessLoss,
  listenForGroupChanges,
} from "@server/groups/group-change-notify.ts"
import type { Realtime } from "./realtime.ts"

/** The part of {@link Realtime} the group listeners call. */
export type GroupNewsTarget = Pick<Realtime, "notifyGroupChange" | "notifyAccessLoss">

/**
 * Turns what Postgres announces about groups into hints on the open sockets, and returns a function
 * that stops listening. The API calls it once at start-up.
 *
 * - A change the worker announced reaches the members' sockets as a sequence-stamped hint.
 * - A change that took people's access to a group away names them at its commit: their pages read
 *   again and drop the group. Their sockets stay open, and the group's later hints skip them.
 */
export async function listenForGroupNews(
  sql: postgres.Sql,
  realtime: GroupNewsTarget,
  log: (...data: unknown[]) => void,
): Promise<() => Promise<void>> {
  const stopChanges = await listenForGroupChanges(sql, ({ groupId, sequence }) => {
    realtime.notifyGroupChange(groupId, sequence).catch((error) =>
      log(`error: cannot push the change of group ${groupId}`, error)
    )
  })
  const stopLoss = await listenForGroupAccessLoss(sql, ({ groupId, sequence, userIds }) => {
    realtime.notifyAccessLoss(groupId, sequence, userIds)
  })
  return async () => {
    await stopChanges()
    await stopLoss()
  }
}
