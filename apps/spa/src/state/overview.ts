import { type ReadonlySignal, signal } from "@preact/signals"
import type { DateRange } from "@spy4x/time/date"
import type { WidgetDefinition } from "@domain/groups"
import type { OverviewWidgetLoad } from "@ui/overview-screen.tsx"
import { callQuery, type LocalReads, localReads, noLocalReads } from "../modules.ts"
import { READ_KEYS } from "./read-keys.ts"

/** What the overview store needs from the outside. Injected so tests need no socket. */
export interface OverviewDependencies {
  /** Sends a widget's query operation; rejects when the server refuses or cannot be reached. */
  query<T>(name: string, payload: unknown): Promise<T>
}

/** What the overview shows: one group, one range of days, cut in one zone. */
export interface OverviewRequest {
  groupId: string
  range: DateRange
  timeZone: string
}

/**
 * The widgets of the overview that is open. Each widget reads on its own, so one slow or failing
 * widget never holds the others back. An answer for a request the page has moved on from (another
 * group or range), or for an older read of the same widget, is dropped.
 *
 * The device keeps each widget's last answer per group and range: when the server cannot be
 * reached, that copy answers, with the time it was saved (`savedAt`).
 *
 * While the page is open, `groupId` names its group, so the pull calls `refresh` on that group's
 * change hint (`pull.ts`). A refresh keeps the numbers on screen until the new ones arrive.
 */
export function createOverviewStore(
  dependencies: OverviewDependencies,
  device: LocalReads = noLocalReads,
) {
  const loads = signal<Readonly<Record<string, OverviewWidgetLoad>>>({})
  let request: OverviewRequest | null = null
  let requestKey = ""
  let widgets: readonly WidgetDefinition[] = []
  const reads = new Map<string, number>()
  const groupId = signal<string | null>(null)
  /** The refresh round that runs, and the one queued behind it. */
  let running: Promise<void> | null = null
  let queued: Promise<void> | null = null

  function set(id: string, load: OverviewWidgetLoad): void {
    loads.value = { ...loads.value, [id]: load }
  }

  /**
   * Reads one widget for the current request. With `keep`, a widget that has an answer keeps it
   * on screen, and keeps it when the read fails, rather than showing loading or the error.
   */
  async function load(widget: WidgetDefinition, keep = false): Promise<void> {
    const asked = request
    if (!asked) return
    const read = (reads.get(widget.id) ?? 0) + 1
    reads.set(widget.id, read)
    const current = () => request === asked && reads.get(widget.id) === read
    const kept = keep && loads.value[widget.id]?.status === `ready`
    if (!kept) set(widget.id, { status: "loading" })
    const payload = {
      groupId: asked.groupId,
      from: asked.range.from,
      to: asked.range.to,
      timeZone: asked.timeZone,
    }
    try {
      const answer = await device.through(
        READ_KEYS.overviewWidget(asked.groupId, widget.id, requestKey),
        () => dependencies.query<unknown>(widget.operation, payload),
      )
      if (!current()) return
      set(widget.id, {
        status: "ready",
        data: answer.value,
        savedAt: answer.fresh ? null : answer.savedAt,
      })
    } catch (_error) {
      if (current() && !kept) set(widget.id, { status: "error" })
    }
  }

  /**
   * Shows `next` with `shown`, the widgets on screen. The same request again reads only the widgets
   * that have no answer yet, such as one the person just showed again; after `close` it reads
   * every widget again as a refresh, since the data may have changed while the page was closed.
   */
  function open(next: OverviewRequest, shown: readonly WidgetDefinition[]): void {
    widgets = shown
    const key = `${next.range.from}:${next.range.to}:${next.timeZone}`
    const reopened = groupId.value === null
    groupId.value = next.groupId
    if (request?.groupId === next.groupId && key === requestKey) {
      if (reopened) void refresh()
      else for (const widget of shown) if (!loads.value[widget.id]) void load(widget)
      return
    }
    request = next
    requestKey = key
    loads.value = {}
    for (const widget of shown) void load(widget)
  }

  /** Reads one widget again: its "Try again". */
  function retry(id: string): void {
    const widget = widgets.find((candidate) => candidate.id === id)
    if (widget) void load(widget)
  }

  /**
   * Reads every widget on screen again, keeping the answers shown until the new ones arrive: a
   * change hint for the open group. A call while a round runs queues one more round after it, so
   * a burst of hints costs at most two; the promise resolves once a round that began after the
   * call has ended. Does nothing while the page is closed.
   */
  function refresh(): Promise<void> {
    if (!running) {
      running = Promise.all(groupId.value === null ? [] : widgets.map((w) => load(w, true)))
        .then(() => {})
        .finally(() => running = null)
      return running
    }
    queued ??= running.then(() => {
      queued = null
      return refresh()
    })
    return queued
  }

  /** The page closed: hints stop reading until it opens again. The answers stay for that. */
  function close(): void {
    groupId.value = null
  }

  /** Forgets the request, so the next `open` reads everything: after sign-out, say. */
  function reset(): void {
    groupId.value = null
    request = null
    requestKey = ""
    loads.value = {}
  }

  return {
    loads,
    groupId: groupId as ReadonlySignal<string | null>,
    open,
    refresh,
    close,
    retry,
    reset,
  }
}

/** The overview's widgets over the socket (or `POST /api/call`) and the device's copies. */
export const overviewStore = createOverviewStore(
  { query: (name, payload) => callQuery(name, payload) },
  localReads,
)
