import { useSignal } from "@preact/signals"
import { CurrencyDisplay } from "@web/components/ui/CurrencyDisplay.tsx"
import { CurrencySelector } from "@web/components/ui/CurrencySelector.tsx"

export function UIGuideCurrency() {
  const selectedCurrency = useSignal("USD")
  const selectedFiatCurrency = useSignal("EUR")
  const selectedCryptoCurrency = useSignal("BTC")

  return (
    <div>
      <h2 class="border-b-1 pb-1 mb-4">Currency Components</h2>

      <div class="space-y-8">
        {/* CurrencyDisplay Section */}
        <div>
          <h3 class="text-lg font-medium mb-4">CurrencyDisplay</h3>
          <p class="text-sm text-gray-600 mb-4">
            Displays formatted currency amounts with proper symbols and formatting. Automatically
            handles conversion from smallest currency units (cents).
          </p>

          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div class="space-y-2">
              <h4 class="text-sm font-medium text-gray-800">Basic Examples</h4>
              <div class="space-y-1 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600">USD:</span>
                  <CurrencyDisplay amount={123456} currency="USD" />
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">EUR:</span>
                  <CurrencyDisplay amount={98765} currency="EUR" />
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">JPY:</span>
                  <CurrencyDisplay amount={500000} currency="JPY" />
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">GBP:</span>
                  <CurrencyDisplay amount={75432} currency="GBP" />
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <h4 class="text-sm font-medium text-gray-800">Negative Amounts</h4>
              <div class="space-y-1 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600">Default:</span>
                  <CurrencyDisplay amount={-123456} currency="USD" />
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Highlighted:</span>
                  <CurrencyDisplay amount={-123456} currency="USD" highlightNegative />
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">EUR negative:</span>
                  <CurrencyDisplay amount={-98765} currency="EUR" highlightNegative />
                </div>
              </div>
            </div>

            <div class="space-y-2">
              <h4 class="text-sm font-medium text-gray-800">Crypto Currencies</h4>
              <div class="space-y-1 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600">Bitcoin:</span>
                  <CurrencyDisplay amount={100000000} currency="BTC" />
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Ethereum:</span>
                  <CurrencyDisplay amount={1500000000000000000} currency="ETH" />
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">USDT:</span>
                  <CurrencyDisplay amount={50000} currency="USDT" />
                </div>
              </div>
            </div>
          </div>

          <div class="mt-4 p-3 bg-gray-50 rounded-md">
            <h4 class="text-sm font-medium text-gray-800 mb-2">Custom Styling Example</h4>
            <div class="flex items-center gap-4">
              <CurrencyDisplay
                amount={250000}
                currency="USD"
                class="text-lg"
                symbolClass="text-green-600 font-bold"
                amountClass="font-mono"
              />
              <CurrencyDisplay
                amount={-180000}
                currency="EUR"
                class="text-base"
                highlightNegative
                symbolClass="font-semibold"
                amountClass="tracking-wide"
              />
            </div>
          </div>
        </div>

        {/* CurrencySelector Section */}
        <div>
          <h3 class="text-lg font-medium mb-4">CurrencySelector</h3>
          <p class="text-sm text-gray-600 mb-4">
            A comprehensive currency selector with search functionality, supporting both fiat and
            cryptocurrencies.
          </p>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="space-y-4">
              <h4 class="text-sm font-medium text-gray-800">Basic Usage</h4>
              <div class="space-y-3">
                <div>
                  <label class="label mb-2">All Currencies</label>
                  <CurrencySelector
                    value={selectedCurrency.value}
                    onChange={(code) => selectedCurrency.value = code}
                    placeholder="Select any currency..."
                  />
                  <p class="text-xs text-gray-500 mt-1">
                    Selected: {selectedCurrency.value || "None"}
                  </p>
                </div>

                <div>
                  <label class="label mb-2">Fiat Only</label>
                  <CurrencySelector
                    value={selectedFiatCurrency.value}
                    onChange={(code) => selectedFiatCurrency.value = code}
                    filterType="fiat"
                    placeholder="Select fiat currency..."
                  />
                  <p class="text-xs text-gray-500 mt-1">
                    Selected: {selectedFiatCurrency.value || "None"}
                  </p>
                </div>

                <div>
                  <label class="label mb-2">Crypto Only</label>
                  <CurrencySelector
                    value={selectedCryptoCurrency.value}
                    onChange={(code) => selectedCryptoCurrency.value = code}
                    filterType="crypto"
                    placeholder="Select cryptocurrency..."
                  />
                  <p class="text-xs text-gray-500 mt-1">
                    Selected: {selectedCryptoCurrency.value || "None"}
                  </p>
                </div>
              </div>
            </div>

            <div class="space-y-4">
              <h4 class="text-sm font-medium text-gray-800">Configuration Options</h4>
              <div class="space-y-3">
                <div>
                  <label class="label mb-2">Without Search</label>
                  <CurrencySelector
                    value={selectedCurrency.value}
                    onChange={(code) => selectedCurrency.value = code}
                    showSearch={false}
                    placeholder="No search available..."
                  />
                </div>

                <div>
                  <label class="label mb-2">Required Field</label>
                  <CurrencySelector
                    value={selectedCurrency.value}
                    onChange={(code) => selectedCurrency.value = code}
                    required
                    placeholder="Required currency selection..."
                  />
                </div>

                <div>
                  <label class="label mb-2">Disabled</label>
                  <CurrencySelector
                    value="USD"
                    onChange={() => {}}
                    disabled
                    placeholder="Disabled selector..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div class="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
            <h4 class="text-sm font-medium text-blue-800 mb-2">Features</h4>
            <ul class="text-sm text-blue-700 space-y-1">
              <li>
                <strong>60+ Currencies:</strong> Major fiat currencies and popular cryptocurrencies
              </li>
              <li>
                <strong>Real-time Search:</strong> Search by currency code or name
              </li>
              <li>
                <strong>Type Filtering:</strong> Filter by fiat, crypto, or show all
              </li>
              <li>
                <strong>Accessibility:</strong> Full keyboard navigation and ARIA support
              </li>
              <li>
                <strong>Mobile-Friendly:</strong> Touch-optimized with responsive design
              </li>
              <li>
                <strong>Visual Indicators:</strong> Currency symbols and crypto badges
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
