import { computed, type ReadonlySignal, signal } from "@preact/signals"
import type { SyncRunner, SyncRunnerState } from "@spy4x/realtime/sync-runner"
import type { OfflineLayer } from "./index.ts"
import { TAGS_COLLECTION } from "./tags-collection.ts"
import { goneReference } from "./transactions-collection.ts"

/**
 * What a sign-out must know about the writes that have not reached the server: how many there are,
 * how many wait on the person's choice, and where that choice is made.
 */
export interface UnsentCounts {
  /** Every queued write (notes, tags and transaction entries), those that wait on a choice included. */
  unsent: number
  /**
   * The writes that never send by themselves: the server refused them (a conflict), or they are
   * held back by a parent in conflict.
   */
  conflicts: number
  /** The group whose page shows the choice: see {@link UnsentCounts.reviewAt}. */
  reviewGroupId: string | null
  /**
   * Where that choice is made: the sync strip, for the first write that waits on a choice and that
   * the strip shows; else the transactions list, when every such write is a transaction entry whose
   * account or category was deleted (the strip leaves those to the list).
   */
  reviewAt: "strip" | "transactions"
}

/** Counts the layer's queued writes as {@link UnsentCounts}. */
export function countUnsent(layer: OfflineLayer): UnsentCounts {
  const notes = layer.entries.value
  const tags = layer.tagEntries.value
  const transactions = layer.transactionEntries.value
  const refused = [...tags, ...notes, ...transactions].filter((entry) =>
    entry.status === "conflict"
  )
  // A write held back by a refused parent is still `pending` in its own queue, so it is not counted
  // twice. Entries name no queued parent, so none is held.
  const held = layer.collections.waiting().filter((waiting) => waiting.onPerson)
    .map((waiting) =>
      (waiting.collection === TAGS_COLLECTION ? tags : notes).find((entry) =>
        entry.entityId === waiting.entityId && entry.status === "pending"
      )
    )
    .filter((entry) => entry !== undefined)
  const stuck = [...refused, ...held]
  const gone = new Set<unknown>(transactions.filter((entry) => goneReference(entry) !== null))
  const onStrip = stuck.find((entry) => !gone.has(entry))
  return {
    unsent: notes.length + tags.length + transactions.length,
    conflicts: stuck.length,
    reviewGroupId: (onStrip ?? stuck[0])?.payload.groupId ?? null,
    reviewAt: onStrip || stuck.length === 0 ? "strip" : "transactions",
  }
}

/** Where the wait for the queue stands, in the words `UnsentChangesDialog` takes. */
export type UnsentState = "ask" | "sending" | "offline" | "retrying"

/** What the sign-out dialog shows. */
export interface UnsentView extends UnsentCounts {
  /** Writes that reached the server since the person chose to send. */
  sent: number
  state: UnsentState
}

/** The queue watched while a sign-out waits for it. */
export interface UnsentWait {
  view: ReadonlySignal<UnsentView>
  /** "Send, then sign out": sends the queue now. The runner keeps retrying with its backoff. */
  send(): void
  /** Stops watching the runner. */
  dispose(): void
}

/** Options of {@link watchUnsent}. */
export interface WatchUnsentOptions {
  layer: OfflineLayer
  /** Whether the browser has a network; a signal, so the view follows it. */
  online: ReadonlySignal<boolean>
  /** Whether the queue may be sent now: the page is signed in as its user, with a network. */
  canSend(): boolean
}

/** Watches the layer's queue for a sign-out, as {@link watchQueue} does. */
export function watchUnsent({ layer, ...rest }: WatchUnsentOptions): UnsentWait {
  return watchQueue({ counts: () => countUnsent(layer), runner: layer.runner, ...rest })
}

/** Options of {@link watchQueue}. */
export interface WatchQueueOptions extends Omit<WatchUnsentOptions, "layer"> {
  /** The queue's counts as they are now; it reads signals, so the view follows them. */
  counts(): UnsentCounts
  /** What sends the queue. */
  runner: Pick<SyncRunner, "getState" | "subscribe" | "kick">
}

/**
 * Watches a queue for a sign-out. Before {@link UnsentWait.send} the state is `ask`; after it,
 * `offline` while nothing can be sent, `retrying` while the runner waits after a failed run, and
 * `sending` otherwise. The runner already sends on reconnect and retries with backoff, so nothing
 * here sends twice: `send` only asks it to run now.
 */
export function watchQueue(
  { counts: read, runner: sender, online, canSend }: WatchQueueOptions,
): UnsentWait {
  const runner = signal<SyncRunnerState>(sender.getState())
  const stop = sender.subscribe((state) => runner.value = state)
  const sendingFrom = signal<number | null>(null)
  const view = computed((): UnsentView => {
    const counts = read()
    const sendable = counts.unsent - counts.conflicts
    const from = sendingFrom.value
    if (from === null) return { ...counts, sent: 0, state: "ask" }
    const sent = Math.max(0, from - sendable)
    // Read both signals on every run, so the view follows the network and the runner.
    const offline = !online.value || !canSend()
    const failing = runner.value.failures > 0 && !runner.value.running
    return {
      ...counts,
      sent,
      state: offline ? "offline" : failing ? "retrying" : "sending",
    }
  })
  return {
    view,
    send() {
      if (sendingFrom.value !== null) return
      const counts = read()
      sendingFrom.value = counts.unsent - counts.conflicts
      void sender.kick()
    },
    dispose: stop,
  }
}
