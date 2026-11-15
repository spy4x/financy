import type { OutboxEntry } from "@spy4x/realtime/outbox"
import type { TransferItem } from "../state/transfers.ts"
import { databasePrefix } from "./notes-cache.ts"

/** What the person entered in a queued transfer write: the outbox's payload. */
export interface TransferPayload {
  groupId: string
  fromAccountId: string
  toAccountId: string
  /** What left the from account, above zero, in its currency's smallest unit. */
  sentAmount: number
  /**
   * What arrived, when the person stated it (across currencies); `null` lets the server convert at
   * the date's rate, or keep the amount it had.
   */
  receivedAmount: number | null
  memo: string
  date: string
  /**
   * The two accounts' currencies when the write was queued. They stay on the device: the row a
   * queued transfer shows as needs them to tell a converted transfer from one in one currency.
   */
  fromCurrency: string
  toCurrency: string
}

/** One queued transfer write, as the outbox from `@spy4x/realtime/outbox` keeps it. */
export type TransferEntry = OutboxEntry<TransferPayload, TransferItem>

/** The transfers the server sent, kept on this device for one signed-in user, as `NotesCache`. */
export interface TransfersCache {
  /** A household's live transfers on the device, the latest date first. */
  readTransfers(groupId: string): Promise<TransferItem[]>
  putTransfer(transfer: TransferItem): Promise<void>
  removeTransfer(transferId: string): Promise<void>
}

/** The name of the queue database of one user's transfers. */
export function transfersQueueDatabase(userId: number): string {
  return `${databasePrefix(userId)}:transfers-outbox`
}
