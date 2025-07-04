import { signal } from "@preact/signals"
import { ws } from "./ws.ts"
import { Theme, UserSettings, WebSocketMessageType } from "@shared/types"
import { auth } from "./auth.ts"
import { group } from "./group.ts"
import { theme, ThemeValue } from "./theme.ts"

// Holds the user settings
const settings = signal<UserSettings | null>(null)

const ops = {
  upsert: signal<{ inProgress: boolean; error?: string | null }>({
    inProgress: false,
    error: null,
  }),
}

export const userSettings = {
  settings,
  ops,

  init() {
    // Listen for user settings updates from the server
    ws.onMessage((msg) => {
      if (msg.e !== "userSettings") return
      switch (msg.t) {
        case WebSocketMessageType.LIST: {
          const settingsList = Array.isArray(msg.p) ? (msg.p as UserSettings[]) : []
          userSettings.settings.value = settingsList.length > 0 ? settingsList[0] : null

          // Apply settings when received
          if (userSettings.settings.value) {
            userSettings.applySettings(userSettings.settings.value)
          }
          break
        }
        case WebSocketMessageType.UPDATED: {
          const p = Array.isArray(msg.p) ? msg.p : []
          const updatedSettings = p.filter((item): item is UserSettings => !!item)
          if (updatedSettings.length > 0) {
            userSettings.settings.value = updatedSettings[0]
            userSettings.applySettings(updatedSettings[0])
          }
          userSettings.ops.upsert.value = { inProgress: false, error: null }
          break
        }
        case WebSocketMessageType.ERROR_VALIDATION: {
          const errorMsg = Array.isArray(msg.p) && typeof msg.p[0] === "string"
            ? msg.p[0]
            : "Validation error"
          if (userSettings.ops.upsert.value.inProgress) {
            userSettings.ops.upsert.value = { inProgress: false, error: errorMsg }
          }
          break
        }
      }
    })

    theme.actual.subscribe((newTheme) => {
      if (settings.value?.theme === getThemeByUIValue(newTheme)) return
      userSettings.updateTheme(
        newTheme === ThemeValue.LIGHT ? 1 : newTheme === ThemeValue.DARK ? 2 : 3,
      )
    })

    group.selectedId.subscribe((newGroupId) => {
      if (settings.value?.selectedGroupId === newGroupId) return
      userSettings.updateSelectedGroup(newGroupId)
    })
  },

  /**
   * Apply user settings to the application state
   */
  applySettings(settings: UserSettings) {
    // Only update theme if it's different to avoid loops
    const themePreference = getThemeByDBValue(settings.theme)
    if (theme.preference.value !== themePreference) {
      theme.set(themePreference)
    }

    // Apply selected group setting
    if (group.selectedId.value !== settings.selectedGroupId) {
      group.selectedId.value = settings.selectedGroupId
    }
  },

  /**
   * Update theme preference in the database
   */
  updateTheme(themeEnum: number) {
    if (!auth.user.value || !userSettings.settings.value) return

    userSettings.ops.upsert.value = { inProgress: true, error: null }
    ws.request({
      message: {
        e: "userSettings",
        t: WebSocketMessageType.UPDATE,
        p: [{
          theme: themeEnum,
          selectedGroupId: userSettings.settings.value.selectedGroupId,
        }],
      },
    })
  },

  /**
   * Update selected group in the database
   */
  updateSelectedGroup(selectedGroupId: number) {
    if (!auth.user.value || !userSettings.settings.value) return

    userSettings.ops.upsert.value = { inProgress: true, error: null }
    ws.request({
      message: {
        e: "userSettings",
        t: WebSocketMessageType.UPDATE,
        p: [{
          theme: userSettings.settings.value.theme,
          selectedGroupId: selectedGroupId,
        }],
      },
    })
  },
}

function getThemeByDBValue(t: Theme): ThemeValue {
  switch (t) {
    case Theme.LIGHT:
      return ThemeValue.LIGHT
    case Theme.DARK:
      return ThemeValue.DARK
    default:
      return ThemeValue.SYSTEM
  }
}

function getThemeByUIValue(t: ThemeValue): Theme {
  switch (t) {
    case ThemeValue.LIGHT:
      return Theme.LIGHT
    case ThemeValue.DARK:
      return Theme.DARK
    default:
      return Theme.SYSTEM
  }
}
