import { computed, effect, signal } from "@preact/signals"
import { makeStorage } from "@shared/local-storage"

export enum ThemeValue {
  LIGHT = "light",
  DARK = "dark",
  SYSTEM = "system",
}

export type Theme = ThemeValue.LIGHT | ThemeValue.DARK
export type ThemePreference = Theme | ThemeValue.SYSTEM

const DARK_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)"

const themeStorage = makeStorage<ThemePreference>(localStorage, "theme")

// Detect system preference
const getSystemTheme = (): Theme => {
  if (typeof globalThis.window === "undefined") return ThemeValue.LIGHT
  return globalThis.window.matchMedia(DARK_THEME_MEDIA_QUERY).matches
    ? ThemeValue.DARK
    : ThemeValue.LIGHT
}

// System theme detection as a signal
const systemTheme = signal<Theme>(getSystemTheme())

// Current theme preference (light/dark/system)
const preference = signal<ThemePreference>(themeStorage.get() || ThemeValue.SYSTEM)

// Computed actual theme (light/dark only) - reactive to themePreference and systemTheme changes
const actual = computed<Theme>(() =>
  preference.value === ThemeValue.SYSTEM ? systemTheme.value : preference.value
)

// Apply theme to document
const applyTheme = (theme: Theme) => {
  if (typeof globalThis.document === "undefined") return

  const root = globalThis.document.documentElement

  if (theme === ThemeValue.DARK) {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
}

// Set theme preference
const set = (theme: ThemePreference) => {
  preference.value = theme
  themeStorage.set(theme)
}

// Toggle between light and dark (skip system)
const toggle = () => {
  const current = preference.value
  if (current === ThemeValue.LIGHT) {
    set(ThemeValue.DARK)
  } else if (current === ThemeValue.DARK) {
    set(ThemeValue.LIGHT)
  } else {
    // If on system, switch to the opposite of current system preference
    const systemTheme = getSystemTheme()
    set(systemTheme === ThemeValue.LIGHT ? ThemeValue.DARK : ThemeValue.LIGHT)
  }
}

// Apply theme to document when actualTheme changes
effect(() => applyTheme(actual.value))

// Initialize theme on load
if (typeof globalThis.window !== "undefined") {
  // Listen for system theme changes and update systemTheme signal
  const mediaQuery = globalThis.window.matchMedia(DARK_THEME_MEDIA_QUERY)
  mediaQuery.addEventListener(
    "change",
    (e) => systemTheme.value = e.matches ? ThemeValue.DARK : ThemeValue.LIGHT,
  )
}

export const theme = {
  actual,
  preference,
  set,
  toggle,
}
