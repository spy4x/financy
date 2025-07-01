import { useComputed } from "@preact/signals"
import { account } from "@web/state/account.ts"
import { group } from "@web/state/group.ts"
import { currency } from "@web/state/currency.ts"
import { IconArrowPath, IconChartPie } from "@client/icons"

export function ExchangeRateWidget() {
  // Get unique currencies used in the selected group's accounts
  const usedCurrencies = useComputed(() => {
    const currencies = new Set<string>()

    account.list.value
      .filter((acc) => acc.groupId === group.selectedId.value && !acc.deletedAt)
      .forEach((acc) => currencies.add(currency.getById(acc.currencyId).code))

    return Array.from(currencies)
  })

  // Get the default currency from selected group
  const defaultCurrency = useComputed(() => group.getSelectedCurrency())

  // Filter out the default currency from exchange rates display
  const foreignCurrencies = useComputed(() =>
    usedCurrencies.value.filter((currencyCode) => currencyCode !== defaultCurrency.value.code)
  )

  // Mock exchange rates - in a real app, this would come from an API/service
  const mockExchangeRates = useComputed(() => {
    const rates: Record<string, number> = {
      "EUR": 0.85,
      "GBP": 0.73,
      "JPY": 110.5,
      "CAD": 1.25,
      "AUD": 1.35,
      "CHF": 0.92,
      "CNY": 6.45,
      "INR": 74.2,
    }

    return rates
  })

  const handleRefreshRates = () => {
    // In a real app, this would trigger an API call to refresh exchange rates
    console.log("Refreshing exchange rates...")
  }

  // Don't show widget if only one currency is used
  if (foreignCurrencies.value.length === 0) {
    return null
  }

  return (
    <div class="card">
      <div class="card-header">
        <div class="flex items-center justify-between">
          <h3 class="card-title flex items-center space-x-2">
            <IconChartPie class="w-5 h-5" />
            <span>Exchange Rates</span>
          </h3>{" "}
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={handleRefreshRates}
            title="Refresh rates"
          >
            <IconArrowPath class="w-4 h-4" />
          </button>
        </div>
        <div class="text-sm text-gray-600">
          Base: {defaultCurrency.value.code}
        </div>
      </div>
      <div class="card-body">
        {foreignCurrencies.value.length === 0
          ? (
            <div class="text-center py-4">
              <div class="text-gray-500 text-sm">
                All accounts use {defaultCurrency.value.code}
              </div>
            </div>
          )
          : (
            <div class="space-y-3">
              {foreignCurrencies.value.map((currency) => {
                const rate = mockExchangeRates.value[currency] || 1
                const isUp = Math.random() > 0.5 // Mock trend direction

                return (
                  <div
                    key={currency}
                    class="flex items-center justify-between p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div class="flex items-center space-x-3">
                      <div class="font-medium text-gray-900">
                        {currency}
                      </div>
                      <div class="text-sm text-gray-600">
                        1 {defaultCurrency.value.code} = {rate} {currency}
                      </div>
                    </div>

                    <div class="flex items-center space-x-2">
                      {/* Mock trend indicator */}
                      <div
                        class={`flex items-center text-xs ${
                          isUp ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        <span class={isUp ? "↗" : "↘"} />
                        <span class="ml-1">
                          {(Math.random() * 2).toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        {/* Last updated info */}
        <div class="mt-4 pt-3 border-t border-gray-200">
          <div class="text-xs text-gray-500 text-center">
            Last updated: {new Date().toLocaleDateString()}{" "}
            {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    </div>
  )
}
