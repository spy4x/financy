import type { ReadonlySignal } from "@preact/signals"
import { useEffect } from "preact/hooks"
import { useSearchParams } from "wouter-preact"
import { LINKED_GROUP_PARAM } from "@ui/progressive.tsx"
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
