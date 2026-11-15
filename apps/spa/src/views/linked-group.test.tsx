/**
 * A link that names a household (`?group=`) opens that household's page, not the selected one's:
 * the overview's money cards link to the transactions list this way.
 */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { signal } from "@preact/signals"
import { Window } from "happy-dom"
import { render } from "preact"
import { act } from "preact/test-utils"
import { Router } from "wouter-preact"
import { memoryLocation } from "wouter-preact/memory-location"
import { type LinkedGroupDependencies, useLinkedGroup } from "./linked-group.ts"

const window = new Window({ url: "http://app.localhost/" })
const own = { document: globalThis.document }

beforeAll(() => {
  Object.assign(globalThis, { document: window.document })
})

afterAll(async () => {
  Object.assign(globalThis, own)
  await window.happyDOM.close()
})

let root: HTMLElement | null = null

afterEach(async () => {
  if (root) await act(() => render(null, root!))
  root = null
})

const A = "019a0000-0000-7000-8000-00000000000a"
const B = "019a0000-0000-7000-8000-00000000000b"
const STRANGER = "019a0000-0000-7000-8000-00000000000c"

/**
 * Opens `path` with household B selected and the person in A and B. Resolves on each household the
 * page showed, the households selected and the address the page ended on.
 */
async function open(path: string, loading = false) {
  const shown: (string | null)[] = []
  const selected: string[] = []
  const groupId = signal<string | null>(B)
  const dependencies: LinkedGroupDependencies = {
    groups: signal([{ id: A }, { id: B }]),
    loading: signal(loading),
    selection: {
      groupId,
      select: (next) => {
        selected.push(next)
        groupId.value = next
        return Promise.resolve()
      },
    },
  }
  function Page() {
    shown.push(useLinkedGroup(dependencies))
    return null
  }
  const location = memoryLocation({ path, record: true })
  root = document.createElement("div")
  await act(() =>
    render(
      <Router hook={location.hook}>
        <Page />
      </Router>,
      root!,
    )
  )
  // Every check of `shown` below reads at least one render.
  expect(shown.length).toBeGreaterThan(0)
  return { shown, selected, address: location.history.at(-1) }
}

describe("a link that names a household", () => {
  it("opens that household, selects it, and drops the name from the address", async () => {
    const page = await open(`/transactions?group=${A}&kind=2&from=2026-11-01&to=2026-11-30`)

    // Never the selected household first: the list must not flash B's entries.
    expect(page.shown.every((group) => group === A)).toBe(true)
    expect(page.selected).toEqual([A])
    expect(page.address).toBe("/transactions?kind=2&from=2026-11-01&to=2026-11-30")
  })

  it("opens the selected household when the person is not in the named one, and drops the name", async () => {
    const page = await open(`/transactions?group=${STRANGER}&kind=1`)

    expect(page.shown.every((group) => group === B)).toBe(true)
    expect(page.selected).toEqual([])
    expect(page.address).toBe("/transactions?kind=1")
  })

  it("keeps the name while the groups load, as the household may yet turn up", async () => {
    const page = await open(`/transactions?group=${STRANGER}`, true)

    expect(page.selected).toEqual([])
    expect(page.address).toBe(`/transactions?group=${STRANGER}`)
  })

  it("leaves a page with no household named on the selected one", async () => {
    const page = await open(`/transactions?kind=1`)

    expect(page.shown.every((group) => group === B)).toBe(true)
    expect(page.selected).toEqual([])
  })
})
