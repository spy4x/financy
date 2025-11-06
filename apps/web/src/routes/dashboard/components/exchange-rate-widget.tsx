import { useComputed } from "@preact/signals"
import { account } from "@web/state/account.ts"
import { group } from "@web/state/group.ts"
import { currency } from "@web/state/currency.ts"
import { exchangeRate } from "@web/state/exchange-rate.ts"
import { IconArrowPath, IconChartPie } from "@client/icons"

export function ExchangeRateWidget() {
  // Get unique currencies used in the selected group's accounts
  const usedCurrencies = useComputed(() => {
    const currencies = new Set<number>()

    account.list.value
      .filter((acc) => acc.groupId === group.selectedId.value && !acc.deletedAt)
      .forEach((acc) => currencies.add(acc.currencyId))

    return Array.from(currencies)
  })

  // Get the default currency from selected group
  const defaultCurrency = useComputed(() => group.getSelectedCurrency())

  // Filter out the default currency from exchange rates display
  const foreignCurrencies = useComputed(() =>
    usedCurrencies.value.filter((currencyId) => currencyId !== defaultCurrency.value.id)
  )

  // Get real exchange rates from state
  const rates = useComputed(() => {
    const baseCurrencyId = defaultCurrency.value.id
    const ratesMap = exchangeRate.getRatesForCurrency(baseCurrencyId)

    return foreignCurrencies.value.map((currencyId) => {
      const curr = currency.getById(currencyId)
      const rate = ratesMap.get(currencyId)

      return {
        currencyId,
        currencyCode: curr.code,
        currencySymbol: curr.symbol || curr.code,
        rate: rate || null,
      }
    })
  })

  // Debug information
  const debugInfo = useComputed(() => {
    const baseCurrencyId = defaultCurrency.value.id
    const baseCurrency = currency.getById(baseCurrencyId)
    const ratesMap = exchangeRate.getRatesForCurrency(baseCurrencyId)

    return {
      defaultCurrency: {
        id: baseCurrencyId,
        code: baseCurrency.code,
        name: baseCurrency.name,
      },
      usedCurrencies: usedCurrencies.value,
      foreignCurrencies: foreignCurrencies.value,
      foreignCurrenciesDetails: foreignCurrencies.value.map((id) => ({
        id,
        code: currency.getById(id).code,
        name: currency.getById(id).name,
      })),
      totalExchangeRatesInState: exchangeRate.list.value.length,
      allExchangeRates: exchangeRate.list.value.map((r) => ({
        id: r.id,
        fromCurrencyId: r.fromCurrencyId,
        fromCurrencyCode: currency.getById(r.fromCurrencyId)?.code || "unknown",
        toCurrencyId: r.toCurrencyId,
        toCurrencyCode: currency.getById(r.toCurrencyId)?.code || "unknown",
        rate: r.rate,
        date: r.date,
      })),
      ratesMapForBaseCurrency: {
        baseCurrencyId,
        size: ratesMap.size,
        entries: Array.from(ratesMap.entries()).map(([currencyId, rate]) => ({
          currencyId,
          currencyCode: currency.getById(currencyId)?.code || "unknown",
          rate,
        })),
      },
      computedRates: rates.value,
    }
  })

  const handleRefreshRates = () => {
    // Exchange rates are automatically synced via WebSocket
    // This could trigger a manual refresh if needed in the future
    console.log("Exchange rates are automatically synced via WebSocket")
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
          </h3>
          <button
            type="button"
            class="btn btn-ghost btn-sm"
            onClick={handleRefreshRates}
            title="Auto-synced via WebSocket"
          >
            <IconArrowPath class="w-4 h-4" />
          </button>
        </div>
        <div class="text-sm text-gray-600">
          Base: {defaultCurrency.value.code}
        </div>
      </div>
      <div class="card-body">
        {
          /* DEBUG INFO
        <div class="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg overflow-auto">
          <h4 class="font-bold text-sm text-black mb-2">Debug Info:</h4>
          <pre class="text-xs text-black whitespace-pre-wrap">{JSON.stringify(debugInfo.value, null, 2)}</pre>
        </div> */
        }
        {rates.value.length === 0
          ? (
            <div class="text-center py-4">
              <div class="text-gray-500 text-sm">
                All accounts use {defaultCurrency.value.code}
              </div>
            </div>
          )
          : (
            <div class="space-y-3">
              {rates.value.map((item) => {
                console.log("Rendering rate item:", item, item.rate)
                return (
                  <div
                    key={item.currencyId}
                    class="flex items-center justify-between p-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div class="flex items-center space-x-3">
                      <div class="font-medium text-gray-900">
                        {item.currencyCode}
                      </div>
                      <div class="text-sm text-gray-600">
                        {item.rate !== null
                          ? (
                            <>
                              1 {defaultCurrency.value.code} = {item.rate} {item.currencyCode}
                            </>
                          )
                          : <span class="text-orange-600">Rate not available</span>}
                      </div>
                    </div>

                    {item.rate !== null && (
                      <div class="flex items-center space-x-2">
                        <div class="text-xs text-gray-500">
                          {item.currencySymbol}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

        {/* Last updated info */}
        {exchangeRate.lastFetchedAt.value && (
          <div class="mt-4 pt-3 border-t border-gray-200">
            <div class="text-xs text-gray-500 text-center">
              Last updated: {new Date(exchangeRate.lastFetchedAt.value).toLocaleDateString()}{" "}
              {new Date(exchangeRate.lastFetchedAt.value).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
