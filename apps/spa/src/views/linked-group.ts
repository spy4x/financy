import type { ReadonlySignal } from "@preact/signals"
import { useEffect, useRef } from "preact/hooks"
import { useSearchParams } from "wouter-preact"
import { calendarMonth } from "@domain/budgets"
import { LINKED_GROUP_PARAM, LINKED_MONTH_PARAM } from "@ui/progressive.tsx"
import { groupsStore } from "../state/groups.ts"
import { selectionStore } from "../state/selection.ts"

/** What {@link useLinkedGroup} reads: the person's groups and the selection. */
export interface LinkedGroupDependencies {
  groups: ReadonlySignal<readonly { id: string }[]>
  /** The groups are still loading, so a household the address names may yet turn up. */
  loading: ReadonlySignal<boolean>
  selection: {
    groupId: ReadonlySignal<string | null>
    select(groupId: string): Promise<void>
  }
}

const STORES: LinkedGroupDependencies = {
  groups: groupsStore.groups,
  loading: groupsStore.loading,
  selection: selectionStore,
}

/**
 * The household a page of the selected household shows: the one its address names
 * (`?group=<id>`, {@link LINKED_GROUP_PARAM}) when the person belongs to it, else the selected one.
 * A named household is selected and the parameter dropped, so the address never names a household
 * the switcher no longer shows; one the person is not in is dropped once the groups have loaded.
 * The overview's money cards link to the transactions list this way, so they open the overview's
 * household even when another one is selected.
 */
export function useLinkedGroup(dependencies: LinkedGroupDependencies = STORES): string | null {
  const { groups, loading, selection } = dependencies
  const [params, setParams] = useSearchParams()
  const linked = params.get(LINKED_GROUP_PARAM)
  const member = linked !== null && groups.value.some((group) => group.id === linked)
  const waiting = linked !== null && !member && loading.value
  useEffect(() => {
    if (linked === null || waiting) return
    if (member) void selection.select(linked)
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete(LINKED_GROUP_PARAM)
      return next
    }, { replace: true })
  }, [linked, member, waiting])
  return member ? linked : selection.groupId.value
}

/**
 * The month a page's address names (`?month=YYYY-MM`, {@link LINKED_MONTH_PARAM}), on a page that
 * shows one month of a household: the overview's budgets card links to the Budgets screen this
 * way. Returns the named month while the address holds it, else `null`: the page's first read of a
 * household asks for it. Once the household is known (no `?group=` left to choose), the parameter
 * is dropped, so the page's own stepper moves on from there; an invalid month is dropped unread. A
 * month named later, on a household the page has already read, is passed to `open`.
 */
export function useLinkedMonth(
  groupId: string | null,
  open: (groupId: string, month: string) => void,
): string | null {
  const [params, setParams] = useSearchParams()
  const asked = params.get(LINKED_MONTH_PARAM)
  const linked = asked !== null && calendarMonth.allows(asked) ? asked : null
  const choosing = params.has(LINKED_GROUP_PARAM)
  /** The household and month of the last run: a new household's first read asks for the month. */
  const seen = useRef<{ groupId: string | null; asked: string | null } | null>(null)
  useEffect(() => {
    const later = seen.current?.groupId === groupId && seen.current.asked !== asked
    seen.current = { groupId, asked }
    if (asked === null || groupId === null || choosing) return
    if (linked !== null && later) open(groupId, linked)
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete(LINKED_MONTH_PARAM)
      return next
    }, { replace: true })
  }, [groupId, asked, choosing])
  return linked
}
