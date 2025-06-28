import { IconMoon, IconSun } from "@client/icons"
import { theme, ThemeValue } from "@web/state/theme.ts"

interface Props {
  className?: string
}

export function ThemeToggle({ className = "" }: Props) {
  const opposite = theme.actual.value === ThemeValue.DARK ? ThemeValue.LIGHT : ThemeValue.DARK
  return (
    <button
      type="button"
      onClick={theme.toggle}
      class={`btn-input-icon ${className}`}
      title={`Switch to ${opposite} mode`}
      aria-label={`Switch to ${opposite} mode`}
    >
      {theme.actual.value === ThemeValue.DARK
        ? <IconSun class="size-5" />
        : <IconMoon class="size-5" />}
    </button>
  )
}
