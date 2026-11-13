import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { RealtimeRequestError } from "@spy4x/realtime"
import {
  createHouseholdSettingsStore,
  type HouseholdSettingsDependencies,
} from "./household-settings.ts"

const HOME = "019a5b0e-1af5-7f04-8ae4-b1ee5d111001"
const WORK = "019a5b0e-1af5-7f04-8ae4-b1ee5d111002"

/** The settings as the API sends them: dates are ISO strings. */
const settingsOf = (groupId: string, baseCurrency: string, version: number) => ({
  groupId,
  baseCurrency,
  version,
  chosen: version > 0,
  updatedAt: version > 0 ? "2026-11-06T16:02:00.000Z" : null,
})

const viewOf = (groupId: string, baseCurrency = "EUR", version = 0) => ({
  settings: settingsOf(groupId, baseCurrency, version),
  rates: [],
  ratedCurrencies: ["EUR", "USD"],
  coinPrices: [],
})

/** A server holding one group's settings, which counts the saves it was sent. */
function server(start = viewOf(HOME)) {
  let current = start
  const saves: { baseCurrency: string; version: number }[] = []
  const dependencies: HouseholdSettingsDependencies = {
    read: () => Promise.resolve(current),
    update: (input) => {
      saves.push({ baseCurrency: input.baseCurrency, version: input.version })
      if (input.version !== current.settings.version) {
        return Promise.reject(
          new RealtimeRequestError("conflict", "Changed", {
            code: "VERSION_CONFLICT",
            current: current.settings,
          }),
        )
      }
      const settings = settingsOf(input.groupId, input.baseCurrency, input.version + 1)
      current = { ...current, settings }
      return Promise.resolve({ settings })
    },
  }
  return {
    dependencies,
    saves,
    /** Another member saves `baseCurrency`. */
    savedElsewhere(baseCurrency: string) {
      const version = current.settings.version + 1
      current = { ...current, settings: settingsOf(HOME, baseCurrency, version) }
    },
  }
}

describe("the household settings store", () => {
  it("reads the open group's settings, with the date as a Date", async () => {
    const store = createHouseholdSettingsStore(server(viewOf(HOME, "USD", 3)).dependencies)
    await store.open(HOME)
    expect(store.view.value?.settings.baseCurrency).toBe("USD")
    expect(store.view.value?.settings.updatedAt).toBeInstanceOf(Date)
    expect(store.loadError.value).toBeNull()
  })

  it("saves the chosen currency from the version it holds, and closes the dialog", async () => {
    const api = server()
    const store = createHouseholdSettingsStore(api.dependencies)
    await store.open(HOME)
    store.openDialog()
    const saved = await store.save("USD")
    expect(saved?.baseCurrency).toBe("USD")
    expect(api.saves).toEqual([{ baseCurrency: "USD", version: 0 }])
    expect(store.view.value?.settings).toMatchObject({ baseCurrency: "USD", version: 1 })
    expect(store.dialog.value).toBeNull()
  })

  it("names another member's currency after a refused save, and saves over it on the next try", async () => {
    const api = server()
    const store = createHouseholdSettingsStore(api.dependencies)
    await store.open(HOME)
    store.openDialog()
    api.savedElsewhere("GBP")
    expect(await store.save("USD")).toBeNull()
    expect(store.changedElsewhere.value).toBe("GBP")
    expect(store.dialog.value).not.toBeNull()
    expect(store.saveError.value).toBeNull()
    expect(await store.save("USD")).not.toBeNull()
    expect(api.saves).toEqual([
      { baseCurrency: "USD", version: 0 },
      { baseCurrency: "USD", version: 1 },
    ])
  })

  it("names another member's currency once a read brings it in while the dialog is open", async () => {
    const api = server()
    const store = createHouseholdSettingsStore(api.dependencies)
    await store.open(HOME)
    store.openDialog()
    expect(store.changedElsewhere.value).toBeNull()
    api.savedElsewhere("GBP")
    await store.refresh()
    expect(store.changedElsewhere.value).toBe("GBP")
  })

  it("keeps the dialog open with the server's words when the save is refused", async () => {
    const store = createHouseholdSettingsStore({
      ...server().dependencies,
      update: () =>
        Promise.reject(
          new RealtimeRequestError("forbidden", "Your role in this group doesn't allow this.", {
            code: "ROLE_INSUFFICIENT",
          }),
        ),
    })
    await store.open(HOME)
    store.openDialog()
    expect(await store.save("USD")).toBeNull()
    expect(store.saveError.value).toBe("Your role in this group doesn't allow this.")
    expect(store.dialog.value).not.toBeNull()
    expect(store.saving.value).toBe(false)
  })

  it("says the save failed when the server could not be reached", async () => {
    const store = createHouseholdSettingsStore({
      ...server().dependencies,
      update: () => Promise.reject(new TypeError("Failed to fetch")),
    })
    await store.open(HOME)
    store.openDialog()
    expect(await store.save("USD")).toBeNull()
    expect(store.saveError.value).toBe("Couldn't save the main currency. Try again.")
  })

  it("keeps the last settings and says why when a read fails", async () => {
    let down = false
    const api = server()
    const store = createHouseholdSettingsStore({
      ...api.dependencies,
      read: (id) => down ? Promise.reject(new TypeError("offline")) : api.dependencies.read(id),
    })
    await store.open(HOME)
    down = true
    await store.refresh()
    expect(store.view.value?.settings.baseCurrency).toBe("EUR")
    expect(store.loadError.value).toBe(
      "Couldn't load the main currency. Check your connection and try again.",
    )
  })

  it("drops an answer for a group that is no longer open", async () => {
    const pending: ((value: unknown) => void)[] = []
    const store = createHouseholdSettingsStore({
      read: () => new Promise((resolve) => pending.push(resolve)),
      update: () => Promise.reject(new Error("unused")),
    })
    void store.open(HOME)
    const work = store.open(WORK)
    pending[1](viewOf(WORK, "JPY", 2))
    pending[0](viewOf(HOME, "USD", 1))
    await work
    expect(store.view.value?.settings.groupId).toBe(WORK)
    expect(store.view.value?.settings.baseCurrency).toBe("JPY")
  })

  it("refuses an answer that is not a settings view", async () => {
    const store = createHouseholdSettingsStore({
      read: () => Promise.resolve({ settings: { baseCurrency: 1 } }),
      update: () => Promise.reject(new Error("unused")),
    })
    await store.open(HOME)
    expect(store.view.value).toBeNull()
    expect(store.loadError.value).not.toBeNull()
  })
})
