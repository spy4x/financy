import { signal } from "@preact/signals"

export interface DateRange {
  startDate: Date
  endDate: Date
  label: string
  key: string
}

export type DateRangePreset =
  | "current-month"
  | "last-month"
  | "current-quarter"
  | "last-quarter"
  | "current-year"
  | "last-year"
  | "last-30-days"
  | "last-90-days"
  | "last-12-months"
  | "custom"

export function getDateRangeForPreset(
  preset: DateRangePreset,
  customStart?: Date,
  customEnd?: Date,
): DateRange {
  const now = new Date()

  switch (preset) {
    case "current-month": {
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return {
        startDate,
        endDate,
        label: "Current Month",
        key: preset,
      }
    }

    case "last-month": {
      const startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      return {
        startDate,
        endDate,
        label: "Last Month",
        key: preset,
      }
    }

    case "current-quarter": {
      const quarter = Math.floor(now.getMonth() / 3)
      const startDate = new Date(now.getFullYear(), quarter * 3, 1)
      const endDate = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999)
      return {
        startDate,
        endDate,
        label: "Current Quarter",
        key: preset,
      }
    }

    case "last-quarter": {
      const quarter = Math.floor(now.getMonth() / 3) - 1
      const year = quarter < 0 ? now.getFullYear() - 1 : now.getFullYear()
      const adjustedQuarter = quarter < 0 ? 3 : quarter
      const startDate = new Date(year, adjustedQuarter * 3, 1)
      const endDate = new Date(year, adjustedQuarter * 3 + 3, 0, 23, 59, 59, 999)
      return {
        startDate,
        endDate,
        label: "Last Quarter",
        key: preset,
      }
    }

    case "current-year": {
      const startDate = new Date(now.getFullYear(), 0, 1)
      const endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      return {
        startDate,
        endDate,
        label: "Current Year",
        key: preset,
      }
    }

    case "last-year": {
      const startDate = new Date(now.getFullYear() - 1, 0, 1)
      const endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
      return {
        startDate,
        endDate,
        label: "Last Year",
        key: preset,
      }
    }

    case "last-30-days": {
      const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000))
      startDate.setHours(0, 0, 0, 0)
      return {
        startDate,
        endDate,
        label: "Last 30 Days",
        key: preset,
      }
    }

    case "last-90-days": {
      const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
      const startDate = new Date(endDate.getTime() - (90 * 24 * 60 * 60 * 1000))
      startDate.setHours(0, 0, 0, 0)
      return {
        startDate,
        endDate,
        label: "Last 90 Days",
        key: preset,
      }
    }

    case "last-12-months": {
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      const startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1)
      return {
        startDate,
        endDate,
        label: "Last 12 Months",
        key: preset,
      }
    }

    case "custom": {
      const startDate = customStart || new Date(now.getFullYear(), now.getMonth(), 1)
      const endDate = customEnd ||
        new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return {
        startDate,
        endDate,
        label: "Custom Range",
        key: preset,
      }
    }

    default: {
      // Default to current month
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return {
        startDate,
        endDate,
        label: "Current Month",
        key: "current-month",
      }
    }
  }
}

// Available preset options for the dropdown
export const dateRangePresets: Array<{ value: DateRangePreset; label: string }> = [
  { value: "custom", label: "Custom Range" },
  { value: "current-month", label: "Current Month" },
  { value: "last-month", label: "Last Month" },
  { value: "last-30-days", label: "Last 30 Days" },
  { value: "last-90-days", label: "Last 90 Days" },
  { value: "current-quarter", label: "Current Quarter" },
  { value: "last-quarter", label: "Last Quarter" },
  { value: "current-year", label: "Current Year" },
  { value: "last-year", label: "Last Year" },
  { value: "last-12-months", label: "Last 12 Months" },
]

// Global dashboard state
const selectedPreset = signal<DateRangePreset>("current-month")
const customStartDate = signal<Date | null>(null)
const customEndDate = signal<Date | null>(null)

export const dashboard = {
  selectedPreset,
  customStartDate,
  customEndDate,

  // Computed current date range
  get current(): DateRange {
    return getDateRangeForPreset(
      selectedPreset.value,
      customStartDate.value || undefined,
      customEndDate.value || undefined,
    )
  },

  // Set preset
  setPreset(preset: DateRangePreset) {
    selectedPreset.value = preset
  },

  // Set custom dates
  setCustomDates(startDate: Date, endDate: Date) {
    customStartDate.value = startDate
    customEndDate.value = endDate
    selectedPreset.value = "custom"
  },

  // Helper to check if a date is within the current range
  isDateInRange(date: Date): boolean {
    const range = this.current
    return date >= range.startDate && date <= range.endDate
  },

  // Helper to filter transactions by current date range
  filterTransactionsByDateRange<T extends { timestamp: string | Date }>(transactions: T[]): T[] {
    const range = this.current
    return transactions.filter((txn) => {
      const txnDate = new Date(txn.timestamp)
      return txnDate >= range.startDate && txnDate <= range.endDate
    })
  },
}
