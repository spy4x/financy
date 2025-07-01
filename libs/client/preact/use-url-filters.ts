import { type Signal, useSignal, useSignalEffect } from "@preact/signals"
import { useSearchParams } from "wouter-preact"

interface FilterField<T = string | number | null> {
  signal: Signal<T>
  urlParam: string
  initialValue: T
  parser?: (value: string | null) => T
}

/**
 * Simple hook for managing URL-synced filters using wouter's useSearchParams
 * Much cleaner than the previous approach
 */
export function useUrlFilters<T extends Record<string, FilterField>>(fields: T) {
  const [searchParams, setSearchParams] = useSearchParams()
  const isInitializing = useSignal(true)

  // Initialize filters from URL on mount
  useSignalEffect(() => {
    for (const [_, field] of Object.entries(fields)) {
      const urlValue = searchParams.get(field.urlParam)

      if (urlValue !== null) {
        // URL has a value for this parameter
        if (field.parser) {
          field.signal.value = field.parser(urlValue)
        } else if (typeof field.initialValue === "number") {
          const num = parseInt(urlValue, 10)
          field.signal.value = !isNaN(num) ? num : field.initialValue
        } else {
          field.signal.value = urlValue || field.initialValue
        }
      } else {
        // URL doesn't have this parameter, use default value
        field.signal.value = field.initialValue
      }
    }
    isInitializing.value = false
  })

  // Listen for browser navigation and sync filters
  useSignalEffect(() => {
    const handlePopState = () => {
      isInitializing.value = true
      for (const [_, field] of Object.entries(fields)) {
        const urlValue = searchParams.get(field.urlParam)

        if (urlValue !== null) {
          // URL has a value for this parameter
          if (field.parser) {
            field.signal.value = field.parser(urlValue)
          } else if (typeof field.initialValue === "number") {
            const num = parseInt(urlValue, 10)
            field.signal.value = !isNaN(num) ? num : field.initialValue
          } else {
            field.signal.value = urlValue || field.initialValue
          }
        } else {
          // URL doesn't have this parameter, use default value
          field.signal.value = field.initialValue
        }
        isInitializing.value = false
      }

      globalThis.addEventListener("popstate", handlePopState)
      return () => globalThis.removeEventListener("popstate", handlePopState)
    }
  })

  // Update URL when any filter changes
  useSignalEffect(() => {
    if (isInitializing.value) return

    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev)

      for (const [_, field] of Object.entries(fields)) {
        const value = field.signal.value

        if (value !== field.initialValue && value !== null && value !== "") {
          newParams.set(field.urlParam, String(value))
        } else {
          newParams.delete(field.urlParam)
        }
      }

      return newParams
    })
  })

  const clearFilters = () => {
    for (const [_, field] of Object.entries(fields)) {
      field.signal.value = field.initialValue
    }
  }

  return {
    filters: Object.fromEntries(
      Object.entries(fields).map(([key, field]) => [key, field.signal]),
    ) as { [K in keyof T]: T[K]["signal"] },
    isInitializing,
    clearFilters,
  }
}
