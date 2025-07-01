import { useComputed, useSignal } from "@preact/signals"
import { IconSearch, IconXMark } from "@client/icons"
import type { Currency, CurrencyType } from "@shared/types"
import { currency } from "@web/state/currency.ts"

/**
 * Props for the CurrencySelector component
 */
interface CurrencySelectorProps {
  /** Currently selected currency ID (preferred) or code (legacy) */
  value: number | string | null
  /** Callback function called when a currency is selected */
  onChange: (currencyId: number | null, currencyCode: string) => void
  /** HTML id for the component (defaults to "currency") */
  id?: string
  /** Whether selection is required for form validation */
  required?: boolean
  /** Whether the component is disabled */
  disabled?: boolean
  /** Placeholder text shown when no currency is selected */
  placeholder?: string
  /** Whether to show the search input in the dropdown */
  showSearch?: boolean
  /** Filter currencies by type: CurrencyType.FIAT, CurrencyType.CRYPTO, or undefined for all */
  filterType?: CurrencyType
  /** Whether to show a clear button when a currency is selected */
  showClearButton?: boolean
}

/**
 * CurrencySelector - A reusable currency selector component with search functionality
 *
 * A comprehensive currency selector supporting both fiat currencies and cryptocurrencies
 * with real-time search, type filtering, and full accessibility support.
 *
 * ## Features
 * - **Comprehensive Currency List**: 60+ major fiat currencies and popular cryptocurrencies
 * - **Search Functionality**: Real-time search by currency code or name
 * - **Type Filtering**: Filter by 'fiat', 'crypto', or show 'all'
 * - **Accessible**: Full keyboard navigation and ARIA attributes
 * - **Mobile-Friendly**: Responsive design with touch-friendly interactions
 * - **Visual Indicators**: Shows currency symbols and crypto badges
 *
 * ## Usage Examples
 *
 * ### Basic Usage
 * ```tsx
 * const selectedCurrency = useSignal("USD")
 *
 * <CurrencySelector
 *   value={selectedCurrency.value}
 *   onChange={(code) => selectedCurrency.value = code}
 * />
 * ```
 *
 * ### Fiat Currencies Only
 * ```tsx
 * <CurrencySelector
 *   value={currency.value}
 *   onChange={(id, code) => currency.value = id}
 *   filterType={CurrencyType.FIAT}
 *   placeholder="Select fiat currency..."
 * />
 * ```
 *
 * ### Crypto Currencies Only
 * ```tsx
 * <CurrencySelector
 *   value={currency.value}
 *   onChange={(id, code) => currency.value = id}
 *   filterType={CurrencyType.CRYPTO}
 *   placeholder="Select cryptocurrency..."
 * />
 * ```
 *
 * ### Without Search
 * ```tsx
 * <CurrencySelector
 *   value={currency.value}
 *   onChange={(code) => currency.value = code}
 *   showSearch={false}
 * />
 * ```
 *
 * ## Accessibility
 * - Full keyboard navigation (Arrow keys, Enter, Escape)
 * - ARIA attributes for screen readers
 * - Focus management and visual focus indicators
 * - Semantic HTML structure
 *
 * ## Styling
 * Uses Tailwind CSS classes following the application's design system:
 * - Consistent input styling with the `input` class
 * - Hover and focus states
 * - Responsive design
 * - Dark/light mode support
 *
 * @param props - The component props
 * @returns A currency selector dropdown component
 */

export function CurrencySelector({
  value,
  onChange,
  id = "currency",
  required = false,
  disabled = false,
  placeholder = "Select currency...",
  showSearch = true,
  filterType,
  showClearButton = true,
}: CurrencySelectorProps) {
  const searchQuery = useSignal("")
  const isOpen = useSignal(false)

  /**
   * Computed signal that filters currencies based on type and search query
   */
  const filteredCurrencies = useComputed(() => {
    let filtered = currency.list.value

    // Filter by type
    if (filterType !== undefined) {
      filtered = filtered.filter((curr) => curr.type === filterType)
    }

    // Filter by search query
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()
      filtered = filtered.filter((curr) =>
        curr.code.toLowerCase().includes(query) ||
        curr.name.toLowerCase().includes(query)
      )
    }

    return filtered
  })

  // Find the currently selected currency object
  const selectedCurrency = typeof value === "number"
    ? currency.list.value.find((curr) => curr.id === value)
    : currency.list.value.find((curr) => curr.code === value)

  /**
   * Handles currency selection and closes the dropdown
   */
  function handleSelect(curr: Currency) {
    onChange(curr.id, curr.code)
    isOpen.value = false
    searchQuery.value = ""
  }

  /**
   * Handles the clear button click
   */
  function handleClear(e: Event) {
    e.preventDefault()
    e.stopPropagation()
    onChange(null, "")
  }

  /**
   * Toggles the dropdown open/closed state and manages focus
   */

  function handleToggleOpen(e?: Event) {
    if (disabled) return
    e?.preventDefault()
    isOpen.value = !isOpen.value
    if (isOpen.value && showSearch) {
      // Focus search input after dropdown opens
      setTimeout(() => {
        const searchInput = document.getElementById(`${id}-search`)
        searchInput?.focus()
      }, 50)
    }
  }

  /**
   * Handles keyboard navigation (Escape key to close dropdown)
   */

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      isOpen.value = false
      searchQuery.value = ""
    }
  }

  /**
   * Handles clicks outside the dropdown to close it
   */

  function handleBackdropClick(e: Event) {
    e.stopPropagation()
    isOpen.value = false
    searchQuery.value = ""
  }

  return (
    <div class="relative" onKeyDown={handleKeyDown}>
      {/* Hidden input for form submission */}
      <input
        type="hidden"
        name={id}
        value={selectedCurrency?.code || ""}
        required={required}
      />

      {/* Main container with flex layout */}
      <div class="flex items-center gap-1">
        {/* Trigger button */}
        <button
          type="button"
          id={id}
          class={`input text-left cursor-pointer flex items-center justify-between flex-1 ${
            disabled ? "opacity-50 cursor-not-allowed" : ""
          }`}
          onClick={handleToggleOpen}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen.value}
        >
          <span class="flex items-center gap-2">
            {selectedCurrency
              ? (
                <>
                  <span class="font-mono text-sm font-medium">
                    {selectedCurrency.code}
                  </span>
                  {selectedCurrency.symbol && (
                    <span class="text-gray-500 dark:text-gray-400">
                      {selectedCurrency.symbol}
                    </span>
                  )}
                  <span class="text-gray-700 dark:text-gray-300">
                    {selectedCurrency.name}
                  </span>
                  {selectedCurrency.type === 2 && (
                    <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                      crypto
                    </span>
                  )}
                </>
              )
              : <span class="text-gray-500 dark:text-gray-400">{placeholder}</span>}
          </span>

          {/* Right-aligned controls */}
          <div class="flex items-center gap-1 ml-2">
            {/* Clear button */}
            {showClearButton && selectedCurrency && (
              <button
                type="button"
                class="btn-input-icon text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-lg"
                onClick={handleClear}
                title="Clear currency selection"
                disabled={disabled}
              >
                <IconXMark class="size-5" />
              </button>
            )}
            <svg
              class="w-4 h-4 text-gray-400 dark:text-gray-500"
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
          </div>
        </button>
      </div>

      {/* Dropdown */}
      {isOpen.value && (
        <div
          class="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {showSearch && (
            <div class="p-2 border-b border-gray-200 dark:border-gray-600">
              <div class="relative">
                <IconSearch class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  id={`${id}-search`}
                  class="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  placeholder="Search currencies..."
                  value={searchQuery.value}
                  onInput={(e) => searchQuery.value = e.currentTarget.value}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}

          <div class="max-h-48 overflow-y-auto">
            {filteredCurrencies.value.length === 0
              ? (
                <div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 text-center">
                  No currencies found
                </div>
              )
              : (
                filteredCurrencies.value.map((curr) => (
                  <button
                    key={curr.code}
                    type="button"
                    class={`w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:bg-gray-50 dark:focus:bg-gray-700 focus:outline-none flex items-center gap-2 ${
                      (typeof value === "number" ? curr.id === value : curr.code === value)
                        ? "bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-200"
                        : "text-gray-900 dark:text-gray-100"
                    }`}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      handleSelect(curr)
                    }}
                    onMouseDown={(e) => e.preventDefault()}
                  >
                    <span class="font-mono font-medium min-w-[3rem]">
                      {curr.code}
                    </span>
                    {curr.symbol && (
                      <span class="text-gray-500 dark:text-gray-400 min-w-[1.5rem]">
                        {curr.symbol}
                      </span>
                    )}
                    <span class="flex-1">
                      {curr.name}
                    </span>
                    {curr.type === 2 && (
                      <span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                        crypto
                      </span>
                    )}
                  </button>
                ))
              )}
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
