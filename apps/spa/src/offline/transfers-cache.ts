import type { TransferItem, TransfersDependencies } from "../state/transfers.ts"
import { type DeviceCopy, pullOrKeep } from "./device-copy.ts"

/**
 * The transfers the server sent, kept on this device for one signed-in user, as
 * `TransactionsCache`. Transfers are offline-readable only (ADR 003 level 2): there is no queue.
 */
export interface TransfersCache {
  /** A household's live transfers on the device, the latest date first. */
  readTransfers(groupId: string): Promise<TransferItem[]>
  putTransfer(transfer: TransferItem): Promise<void>
  removeTransfer(transferId: string): Promise<void>
}

/** What the transfers dependencies need of the running layer. */
export interface TransfersLayer {
  copy: Pick<DeviceCopy, "pull" | "drop">
  transfersCache: TransfersCache
}

/**
 * Puts the device's copy in front of the transfers store's reads: a read pulls what changed and
 * answers from the copy, so the list shows with no network. A write goes to the server, and the
 * transfer it answers with is put in the copy at once, so the list shows it before the next pull.
 * Without a running layer every call goes to `online` untouched.
 */
export function offlineTransfers(
  online: TransfersDependencies,
  current: () => TransfersLayer | null,
): TransfersDependencies {
  async function kept<T extends { transfer: TransferItem }>(result: T): Promise<T> {
    await current()?.transfersCache.putTransfer(result.transfer)
    return result
  }
  return {
    ...online,
    async fetchList(groupId) {
      const layer = current()
      if (!layer) return await online.fetchList(groupId)
      await pullOrKeep(layer, groupId)
      return await layer.transfersCache.readTransfers(groupId)
    },
    create: async (input) => await kept(await online.create(input)),
    update: async (input) => await kept(await online.update(input)),
    async delete(input) {
      await online.delete(input)
      await current()?.transfersCache.removeTransfer(input.id)
    },
    restore: async (input) => await kept(await online.restore(input)),
  }
}
