import { signal } from "@preact/signals"
import type { HouseholdTotal } from "@domain/accounts"
import { callQuery } from "../modules.ts"

/** What the total store needs from the outside. Injected so tests need no socket. */
export interface HouseholdTotalDependencies {
  read(groupId: string): Promise<HouseholdTotal>
}

/**
 * The open household's total in its base currency, as the server computes it (`account.total`).
 * It is read when the accounts page opens and again with every read of the accounts list, so it
 * follows the same hints: an account change, and a change of the base currency, both move the
 * household's change sequence.
 */
export function createHouseholdTotalStore(dependencies: HouseholdTotalDependencies) {
  const groupId = signal<string | null>(null)
  /** The last total read for the open household; `null` until the first answer. */
  const total = signal<HouseholdTotal | null>(null)
  /** Whether the last read failed. The card keeps the last total, or is left out with none. */
  const failed = signal(false)
  let reads = 0

  /** Reads the open household's total again; an answer for another household is dropped. */
  async function refresh(): Promise<void> {
    const id = groupId.value
    if (id === null) return
    const read = ++reads
    try {
      const answer = await dependencies.read(id)
      if (read !== reads) return
      total.value = answer
      failed.value = false
    } catch {
      if (read === reads) failed.value = true
    }
  }

  /** Shows a household's total. Opening the household already open reads it again. */
  function open(nextGroupId: string): Promise<void> {
    if (groupId.value !== nextGroupId) {
      reset()
      groupId.value = nextGroupId
    }
    return refresh()
  }

  /** Forgets the total, as on sign-out. */
  function reset(): void {
    reads++
    groupId.value = null
    total.value = null
    failed.value = false
  }

  return { groupId, total, failed, refresh, open, reset }
}

/** The accounts page's total, read over the calls port. */
export const householdTotalStore = createHouseholdTotalStore({
  read: async (groupId) =>
    (await callQuery<{ total: HouseholdTotal }>(`account.total`, { groupId })).total,
})
