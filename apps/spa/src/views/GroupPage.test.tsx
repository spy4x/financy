/**
 * The group page's route: the addresses it takes over from before the tabs, what it does with one
 * it does not know, and the link that opens the main currency dialog.
 */
import { expect } from "@std/expect"
import { afterAll, afterEach, beforeAll, describe, it } from "@std/testing/bdd"
import { Window } from "happy-dom"
import { render } from "preact"
import { act } from "preact/test-utils"
import { Router } from "wouter-preact"
import { memoryLocation } from "wouter-preact/memory-location"
import { GroupRole } from "@domain/groups"
import { createHouseholdSettingsStore } from "../state/household-settings.ts"
import { GroupCurrency, GroupPage } from "./GroupEditorView.tsx"

const window = new Window({ url: "http://app.localhost/" })
const own = {
  document: globalThis.document,
  window: globalThis.window,
  getComputedStyle: globalThis.getComputedStyle,
}

beforeAll(() => {
  // A dialog reads the page's style to lock its scroll.
  Object.assign(globalThis, {
    document: window.document,
    window,
    getComputedStyle: window.getComputedStyle.bind(window),
  })
})

afterAll(async () => {
  Object.assign(globalThis, own)
  await window.happyDOM.close()
})

let root: HTMLElement | null = null

afterEach(async () => {
  if (root) await act(() => render(null, root!))
  document.body.innerHTML = ""
  root = null
})

const groupId = "019a0000-0000-7000-8000-000000000001"

/** Opens `/groups/:groupId/<tab>` and resolves on the addresses the page went through. */
async function open(tab: string): Promise<string[]> {
  const path = `/groups/${groupId}/${tab}`
  const location = memoryLocation({ path, record: true })
  root = document.createElement("div")
  document.body.append(root)
  await act(() =>
    render(
      <Router hook={location.hook}>
        <GroupPage groupId={groupId} tab={tab} />
      </Router>,
      root!,
    )
  )
  return location.history!
}

describe("GroupPage", () => {
  it("opens the old plans page's address on the Billing tab, in its place", async () => {
    expect(await open("pricing")).toEqual([`/groups/${groupId}/billing`])
  })

  it("opens an address with an unknown last part on the General tab, in its place", async () => {
    expect(await open("nonsense")).toEqual([`/groups/${groupId}`])
  })
})

/** A group's settings as the server sends them, never chosen yet. */
const unchosen = {
  settings: { groupId, baseCurrency: "EUR", version: 0, chosen: false, updatedAt: null },
  rates: [],
  ratedCurrencies: ["EUR"],
}

/**
 * Opens the General tab at `/groups/:groupId?currency=choose` for a member with `role`, once the
 * settings are read. Resolves on whether the dialog is open and the addresses it went through.
 */
async function chooseCurrency(role: GroupRole) {
  // The location hook carries its own search hook, which the router takes.
  const location = memoryLocation({ path: `/groups/${groupId}?currency=choose`, record: true })
  const household = createHouseholdSettingsStore({
    read: () => Promise.resolve(unchosen),
    update: () => Promise.reject(new Error("unused")),
  })
  const group = {
    id: groupId,
    name: "Home",
    role,
    authorizationRevision: "1",
    changeSequence: "1",
    updatedAt: "2026-11-01T00:00:00.000Z",
  }
  root = document.createElement("div")
  document.body.append(root)
  await act(async () => {
    render(
      <Router hook={location.hook}>
        <GroupCurrency groupId={groupId} group={group} household={household} />
      </Router>,
      root!,
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  // The read's answer re-renders the section, and its effect then opens the dialog.
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
  return { dialog: household.dialog.value !== null, history: location.history! }
}

describe("GroupCurrency", () => {
  it("opens the main currency dialog for an admin from ?currency=choose, then drops the query", async () => {
    const { dialog, history } = await chooseCurrency(GroupRole.ADMIN)
    expect(dialog).toBe(true)
    expect(history.at(-1)).toBe(`/groups/${groupId}`)
  })

  it("opens no dialog for a viewer from ?currency=choose, and still drops the query", async () => {
    const { dialog, history } = await chooseCurrency(GroupRole.VIEWER)
    expect(dialog).toBe(false)
    expect(history.at(-1)).toBe(`/groups/${groupId}`)
  })
})
