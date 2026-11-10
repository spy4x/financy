import { computed, signal } from "@preact/signals"
import { describeError, RealtimeRequestError } from "@spy4x/realtime"
import {
  type HouseholdSettings,
  type HouseholdSettingsView,
  readHouseholdSettings,
  readHouseholdSettingsView,
} from "@domain/money"
import { appText } from "../i18n.ts"
import { callCommand, callQuery } from "../modules.ts"

/** What the settings store needs from the outside. Injected so tests need no socket. */
export interface HouseholdSettingsDependencies {
  /** `household.settings`: the answer as sent, checked by the store. */
  read(groupId: string): Promise<unknown>
  /** `household.updateSettings`: the answer as sent, `{ settings }`. */
  update(input: { groupId: string; baseCurrency: string; version: number }): Promise<unknown>
}

/** What the store says went wrong, as keys of the `app` catalog. */
export const HOUSEHOLD_MESSAGES = {
  load: `GroupCurrency.loadFailed`,
  save: `GroupCurrency.failed`,
} as const

/** The open main currency dialog: the settings it was opened over, and a clash it ran into. */
interface CurrencyDialog {
  base: HouseholdSettings
  /** The currency another member saved, which the server named when it refused a save. */
  clash: string | null
}

/** The settings of a refused save's version conflict, or `null` for any other refusal. */
function conflictOf(cause: unknown): HouseholdSettings | null {
  if (!(cause instanceof RealtimeRequestError)) return null
  const details = cause.details as { code?: unknown; current?: unknown } | undefined
  return details?.code === `VERSION_CONFLICT` ? readHouseholdSettings(details.current) : null
}

/**
 * The open group's household settings (its main currency) and the dialog that changes it.
 *
 * The settings are read when the group's page opens and again with every pull that reads its
 * members, since a save moves the group's change sequence. A save names the version the page holds
 * now: when another member's save has already arrived, the dialog says so before the person picks
 * "Use", so saving over it is a choice. When it has not arrived yet, the server refuses the save
 * with the settings as they are now; the store takes them, and the dialog names what was chosen,
 * so the next "Use" saves over it.
 */
export function createHouseholdSettingsStore(dependencies: HouseholdSettingsDependencies) {
  const groupId = signal<string | null>(null)
  /** The last settings read for the open group; `null` until the first answer. */
  const view = signal<HouseholdSettingsView | null>(null)
  /** Why the last read failed, or `null`. The section keeps the last settings it had. */
  const loadError = signal<string | null>(null)
  const dialog = signal<CurrencyDialog | null>(null)
  const saving = signal(false)
  /** Why the last save was refused, in the dialog, or `null`. */
  const saveError = signal<string | null>(null)
  let reads = 0

  /**
   * The currency another member saved while the dialog was open, or `null`: the one a refused save
   * named, else the one a read brought in since the dialog opened.
   */
  const changedElsewhere = computed((): string | null => {
    const open = dialog.value
    const now = view.value?.settings
    if (!open || !now) return null
    if (open.clash !== null) return open.clash
    return now.baseCurrency !== open.base.baseCurrency ? now.baseCurrency : null
  })

  /** Reads the open group's settings again; an answer for another group is dropped. */
  async function refresh(): Promise<void> {
    const id = groupId.value
    if (id === null) return
    const read = ++reads
    try {
      const answer = readHouseholdSettingsView(await dependencies.read(id))
      if (read !== reads) return
      if (!answer) throw new Error(`household.settings answered something else`)
      view.value = answer
      loadError.value = null
    } catch (cause) {
      if (read === reads) loadError.value = describeError(cause, appText(HOUSEHOLD_MESSAGES.load))
    }
  }

  /** Shows a group's settings. Opening the group already open reads them again. */
  function open(nextGroupId: string): Promise<void> {
    if (groupId.value !== nextGroupId) {
      reset()
      groupId.value = nextGroupId
    }
    return refresh()
  }

  /** Opens the dialog over the settings as read; does nothing before the first read. */
  function openDialog(): void {
    const settings = view.value?.settings
    if (!settings) return
    dialog.value = { base: settings, clash: null }
    saveError.value = null
  }

  function closeDialog(): void {
    dialog.value = null
    saveError.value = null
  }

  /**
   * Saves `baseCurrency` as the main currency. Resolves the saved settings, which close the
   * dialog, or `null` when the save was refused or could not be sent; the dialog then says why.
   */
  async function save(baseCurrency: string): Promise<HouseholdSettings | null> {
    const id = groupId.value
    const current = view.value
    if (saving.value || id === null || current === null || dialog.value === null) return null
    saving.value = true
    saveError.value = null
    try {
      const answer = await dependencies.update({
        groupId: id,
        baseCurrency,
        version: current.settings.version,
      })
      const settings = readHouseholdSettings((answer as { settings?: unknown } | null)?.settings)
      if (!settings) throw new Error(`household.updateSettings answered something else`)
      if (groupId.value === id && view.value) view.value = { ...view.value, settings }
      dialog.value = null
      return settings
    } catch (cause) {
      const theirs = conflictOf(cause)
      if (theirs && groupId.value === id && view.value) {
        view.value = { ...view.value, settings: theirs }
        dialog.value = { base: theirs, clash: theirs.baseCurrency }
      } else {
        saveError.value = cause instanceof RealtimeRequestError
          ? describeError(cause, appText(HOUSEHOLD_MESSAGES.save))
          : appText(HOUSEHOLD_MESSAGES.save)
      }
      return null
    } finally {
      saving.value = false
    }
  }

  /** Forgets the settings and closes the dialog, as when the page closes or on sign-out. */
  function reset(): void {
    reads++
    groupId.value = null
    view.value = null
    loadError.value = null
    dialog.value = null
    saveError.value = null
  }

  return {
    groupId,
    view,
    loadError,
    dialog,
    saving,
    saveError,
    changedElsewhere,
    refresh,
    open,
    openDialog,
    closeDialog,
    save,
    reset,
  }
}

/** The open group's settings, read and saved over the calls port. */
export type HouseholdSettingsStore = ReturnType<typeof createHouseholdSettingsStore>

export const householdSettingsStore = createHouseholdSettingsStore({
  read: (groupId) => callQuery(`household.settings`, { groupId }),
  update: (input) => callCommand(`household.updateSettings`, input),
})
