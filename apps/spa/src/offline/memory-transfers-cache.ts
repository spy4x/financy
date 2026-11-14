import type { TransferItem } from "../state/transfers.ts"
import type { TransfersCache } from "./transfers-cache.ts"
import { byDate } from "../state/transaction-order.ts"

/** A `TransfersCache` in memory: the queue sent without a layer keeps no copy on the device. */
export function createMemoryTransfersCache(): TransfersCache {
  let rows: TransferItem[] = []
  return {
    readTransfers: (groupId) =>
      Promise.resolve(
        rows.filter((row) => row.groupId === groupId).map((row) => ({ ...row })).sort(byDate),
      ),
    putTransfer(transfer) {
      rows = [{ ...transfer }, ...rows.filter((row) => row.id !== transfer.id)]
      return Promise.resolve()
    },
    removeTransfer(transferId) {
      rows = rows.filter((row) => row.id !== transferId)
      return Promise.resolve()
    },
  }
}
