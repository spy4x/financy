import { useState } from "preact/hooks"
import { useSignal } from "@preact/signals"
import { dashboard, DateRangePreset, dateRangePresets } from "../../state/dashboard.ts"

export function DateRangeSelector() {
  const [showCustomDates, setShowCustomDates] = useState(false)
  const isOpen = useSignal(false)
  const startDateInput = useSignal("")
  const endDateInput = useSignal("")
  const startTimeInput = useSignal("00:00")
  const endTimeInput = useSignal("23:59")

  const handlePresetSelect = (preset: DateRangePreset) => {
    if (preset === "custom") {
      setShowCustomDates(true)
      isOpen.value = false
      // Initialize with current range if not already set
      if (!dashboard.customStartDate.value || !dashboard.customEndDate.value) {
        const current = dashboard.current
        startDateInput.value = current.startDate.toISOString().split("T")[0]
        endDateInput.value = current.endDate.toISOString().split("T")[0]
        startTimeInput.value = current.startDate.toTimeString().slice(0, 5)
        endTimeInput.value = current.endDate.toTimeString().slice(0, 5)
      } else {
        startDateInput.value = dashboard.customStartDate.value.toISOString().split("T")[0]
        endDateInput.value = dashboard.customEndDate.value.toISOString().split("T")[0]
        startTimeInput.value = dashboard.customStartDate.value.toTimeString().slice(0, 5)
        endTimeInput.value = dashboard.customEndDate.value.toTimeString().slice(0, 5)
      }
    } else {
      setShowCustomDates(false)
      isOpen.value = false
      dashboard.setPreset(preset)
    }
  }

  const handleToggleOpen = () => {
    isOpen.value = !isOpen.value
  }

  const handleCustomDateApply = () => {
    if (startDateInput.value && endDateInput.value) {
      const startDate = new Date(`${startDateInput.value}T${startTimeInput.value}:00`)
      const endDate = new Date(`${endDateInput.value}T${endTimeInput.value}:59`)

      if (startDate <= endDate) {
        dashboard.setCustomDates(startDate, endDate)
        setShowCustomDates(false)
      }
    }
  }

  const handleCustomDateCancel = () => {
    setShowCustomDates(false)
    // If we were already on custom, keep it, otherwise go back to previous preset
    if (dashboard.selectedPreset.value !== "custom") {
      // Reset to previously selected preset
    }
  }

  const getCurrentLabel = () => {
    const current = dashboard.current
    if (dashboard.selectedPreset.value === "custom") {
      const startStr = current.startDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: current.startDate.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
      })
      const endStr = current.endDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: current.endDate.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
      })

      // Check if times are not default (00:00 and 23:59)
      const startTime = current.startDate.toTimeString().slice(0, 5)
      const endTime = current.endDate.toTimeString().slice(0, 5)
      const hasCustomTimes = startTime !== "00:00" || endTime !== "23:59"

      if (hasCustomTimes) {
        return `${startStr} ${startTime} - ${endStr} ${endTime}`
      }

      return `${startStr} - ${endStr}`
    }
    return current.label
  }

  const handleBackdropClick = () => {
    isOpen.value = false
  }

  return (
    <div class="relative">
      {/* Main selector button */}
      <button
        type="button"
        class="input text-left cursor-pointer flex items-center justify-between min-w-48"
        onClick={handleToggleOpen}
        data-e2e="date-range-selector"
        aria-haspopup="listbox"
        aria-expanded={isOpen.value}
      >
        <span class="flex-1 text-gray-900 dark:text-gray-100">
          {getCurrentLabel()}
        </span>
        <svg
          class="w-4 h-4 text-gray-400 dark:text-gray-500 ml-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen.value && (
        <div class="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-50 min-w-48">
          <div class="max-h-60 overflow-y-auto">
            {dateRangePresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                class={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none ${
                  dashboard.selectedPreset.value === preset.value
                    ? "bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-200"
                    : "text-gray-900 dark:text-gray-100"
                }`}
                onClick={() => handlePresetSelect(preset.value)}
                data-e2e={`date-range-option-${preset.value}`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom date range modal */}
      {showCustomDates && (
        <div class="absolute top-full right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 z-50 min-w-80">
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDateInput.value}
                  onChange={(e) => startDateInput.value = (e.target as HTMLInputElement).value}
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  data-e2e="custom-start-date"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Time
                </label>
                <input
                  type="time"
                  value={startTimeInput.value}
                  onChange={(e) => startTimeInput.value = (e.target as HTMLInputElement).value}
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  data-e2e="custom-start-time"
                />
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={endDateInput.value}
                  onChange={(e) => endDateInput.value = (e.target as HTMLInputElement).value}
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  data-e2e="custom-end-date"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  End Time
                </label>
                <input
                  type="time"
                  value={endTimeInput.value}
                  onChange={(e) => endTimeInput.value = (e.target as HTMLInputElement).value}
                  class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  data-e2e="custom-end-time"
                />
              </div>
            </div>

            <div class="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleCustomDateCancel}
                class="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded-md transition-colors"
                data-e2e="custom-date-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCustomDateApply}
                disabled={!startDateInput.value || !endDateInput.value ||
                  new Date(`${startDateInput.value}T${startTimeInput.value}:00`) >
                    new Date(`${endDateInput.value}T${endTimeInput.value}:59`)}
                class="px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed rounded-md transition-colors"
                data-e2e="custom-date-apply"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop to close dropdown */}
      {isOpen.value && (
        <div
          class="fixed inset-0 z-40"
          onClick={handleBackdropClick}
        />
      )}
    </div>
  )
}
