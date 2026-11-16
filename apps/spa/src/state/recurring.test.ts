import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { ConnectionLostError } from "@spy4x/realtime"
import { createRecurringStore, type RecurringRuleItem } from "./recurring.ts"

const groupId = `g-1`

function rule(id: string): RecurringRuleItem {
  return {
    id,
    groupId,
    version: 1,
    createdAt: `2026-11-01T00:00:00Z`,
    updatedAt: `2026-11-01T00:00:00Z`,
    deletedAt: null,
  } as RecurringRuleItem
}

/** A store over a fake server holding two rules; `restoreFails` makes the next restore throw. */
function harness() {
  const server = [rule(`r-1`), rule(`r-2`)]
  const state = { restoreFails: null as Error | null }
  const store = createRecurringStore({
    fetchList: () => Promise.resolve([...server]),
    create: () => Promise.reject(new Error(`unused`)),
    update: () => Promise.reject(new Error(`unused`)),
    delete: ({ id }) => Promise.resolve({ rule: { ...rule(id), deletedAt: `now` } }),
    restore({ id }) {
      if (state.restoreFails) return Promise.reject(state.restoreFails)
      return Promise.resolve({ rule: rule(id) })
    },
    skip: ({ id }) => Promise.resolve({ rule: rule(id) }),
    newId: () => `new`,
  })
  return { store, state }
}

describe(`the repeating rules store`, () => {
  it(`offers Undo after a delete, and Undo puts the rule back`, async () => {
    const { store } = harness()
    await store.open(groupId)
    await store.delete({ groupId, id: `r-1`, version: 1 })
    expect(store.rules.value.map((item) => item.id)).toEqual([`r-2`])
    expect(store.undo.value?.rule.id).toBe(`r-1`)
    expect(await store.undoDelete()).toBe(true)
    expect(store.undo.value).toBeNull()
    expect(store.rules.value.map((item) => item.id).sort()).toEqual([`r-1`, `r-2`])
  })

  it(`keeps why Undo failed and leaves the rule deleted`, async () => {
    const { store, state } = harness()
    await store.open(groupId)
    await store.delete({ groupId, id: `r-1`, version: 1 })
    state.restoreFails = new ConnectionLostError(`offline`)
    expect(await store.undoDelete()).toBe(false)
    expect(store.undoError.value).toBe(state.restoreFails)
    expect(store.rules.value.map((item) => item.id)).toEqual([`r-2`])
  })

  it(`forgets the Undo offer when dismissed or on sign-out`, async () => {
    const { store } = harness()
    await store.open(groupId)
    await store.delete({ groupId, id: `r-1`, version: 1 })
    store.dismissUndo()
    expect(store.undo.value).toBeNull()
    expect(await store.undoDelete()).toBe(false)
    await store.delete({ groupId, id: `r-2`, version: 1 })
    store.reset()
    expect(store.undo.value).toBeNull()
  })
})
