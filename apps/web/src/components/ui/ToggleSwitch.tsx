interface ToggleSwitchProps {
  value: boolean
  onToggle: (newValue: boolean) => void
}

export function ToggleSwitch({ value, onToggle }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      class={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-purple-900 focus:ring-offset-2 ${
        value ? "bg-purple-900 dark:bg-purple-700" : "bg-gray-200 dark:bg-gray-600"
      }`}
      role="switch"
      aria-checked={value}
      onClick={() => onToggle(!value)}
    >
      <span
        aria-hidden="true"
        class={`pointer-events-none inline-block rounded-full h-5 w-5 transform bg-white dark:bg-gray-200 shadow-sm ring-0 transition duration-200 ease-in-out ${
          value ? "translate-x-5" : "translate-x-0"
        }`}
      >
      </span>
    </button>
  )
}
