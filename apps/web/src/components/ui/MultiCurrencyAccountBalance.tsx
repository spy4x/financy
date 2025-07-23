import { computed } from "@preact/signals"
import { CurrencyDisplay } from "./CurrencyDisplay.tsx"
import { currency } from "@web/state/currency.ts"
import { exchangeRate } from "@web/state/exchange-rate.ts"
import { convertAmount } from "@shared/helpers/currency.ts"
import type { Account } from "@shared/types"

interface MultiCurrencyAccountBalanceProps {
  /** Account object with balance information */
  account: Account
  /** Current account balance in cents */
  currentBalance: number
  /** Whether to show balance in group's base currency */
  showInBaseCurrency?: boolean
  /** Group's base currency ID */
  groupBaseCurrencyId?: number
  /** Whether to show both currencies when conversion applies */
  showBothCurrencies?: boolean
  /** Additional CSS classes */
  class?: string
  /** Whether to highlight negative balances */
  highlightNegative?: boolean
}

/**
 * MultiCurrencyAccountBalance - Displays account balance with multi-currency support
 *
 * Features:
 * - Shows balance in account's native currency
 * - Optional conversion to group's base currency
 * - Displays both currencies when different
 * - Real-time exchange rate calculations
 * - Proper formatting and styling
 */
export function MultiCurrencyAccountBalance({
  account,
  currentBalance,
  showInBaseCurrency = false,
  groupBaseCurrencyId,
  showBothCurrencies = true,
  class: className = "",
  highlightNegative = true,
}: MultiCurrencyAccountBalanceProps) {
  // Computed converted balance
  const convertedBalance = computed(() => {
    if (!showInBaseCurrency || !groupBaseCurrencyId || account.currencyId === groupBaseCurrencyId) {
      return null
    }

    try {
      const exchangeRates = exchangeRate.getAll()
      return convertAmount(currentBalance, account.currencyId, groupBaseCurrencyId, exchangeRates)
    } catch (error) {
      console.warn("Balance conversion failed:", error)
      return null
    }
  })

  const accountCurrency = currency.getById(account.currencyId)
  const baseCurrency = groupBaseCurrencyId ? currency.getById(groupBaseCurrencyId) : null

  const showConversion = showBothCurrencies && convertedBalance.value !== null && baseCurrency

  return (
    <div class={`${className}`}>
      {/* Primary balance (account currency or converted currency) */}
      <div class="text-right">
        <CurrencyDisplay
          amount={showInBaseCurrency && convertedBalance.value !== null
            ? convertedBalance.value
            : currentBalance}
          currency={showInBaseCurrency && baseCurrency ? baseCurrency.id : account.currencyId}
          class="font-semibold"
          highlightNegative={highlightNegative}
        />
      </div>

      {/* Secondary balance (when showing conversion) */}
      {showConversion && (
        <div class="text-right text-sm text-gray-500 dark:text-gray-400 mt-1">
          <CurrencyDisplay
            amount={showInBaseCurrency ? currentBalance : convertedBalance.value!}
            currency={showInBaseCurrency ? account.currencyId : baseCurrency!.id}
            highlightNegative={false}
          />
          <span class="ml-1 text-xs">
            ({showInBaseCurrency ? accountCurrency.code : baseCurrency!.code})
          </span>
        </div>
      )}
    </div>
  )
}

interface AccountBalanceSummaryProps {
  /** Array of accounts with their balances */
  accounts: Array<{
    account: Account
    balance: number
  }>
  /** Group's base currency ID for total calculation */
  groupBaseCurrencyId: number
  /** Additional CSS classes */
  class?: string
}

/**
 * AccountBalanceSummary - Shows total balance across all accounts in group's base currency
 */
export function AccountBalanceSummary({
  accounts,
  groupBaseCurrencyId,
  class: className = "",
}: AccountBalanceSummaryProps) {
  // Computed total balance in base currency
  const totalBalance = computed(() => {
    let total = 0
    const exchangeRates = exchangeRate.getAll()

    for (const { account, balance } of accounts) {
      try {
        if (account.currencyId === groupBaseCurrencyId) {
          total += balance
        } else {
          const converted = convertAmount(
            balance,
            account.currencyId,
            groupBaseCurrencyId,
            exchangeRates,
          )
          total += converted
        }
      } catch (error) {
        console.warn(`Failed to convert balance for account ${account.id}:`, error)
        // Skip this account in the total if conversion fails
      }
    }

    return total
  })

  // Group accounts by currency for breakdown
  const currencyBreakdown = computed(() => {
    const breakdown = new Map<number, { currency: number; total: number; count: number }>()

    for (const { account, balance } of accounts) {
      const existing = breakdown.get(account.currencyId)
      if (existing) {
        existing.total += balance
        existing.count += 1
      } else {
        breakdown.set(account.currencyId, {
          currency: account.currencyId,
          total: balance,
          count: 1,
        })
      }
    }

    return Array.from(breakdown.values())
  })

  return (
    <div class={`space-y-3 ${className}`}>
      {/* Total Balance */}
      <div class="border-b border-gray-200 dark:border-gray-700 pb-3">
        <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Balance</div>
        <div class="text-right">
          <CurrencyDisplay
            amount={totalBalance.value}
            currency={groupBaseCurrencyId}
            class="text-xl font-bold"
            highlightNegative
          />
        </div>
      </div>

      {/* Currency Breakdown */}
      {currencyBreakdown.value.length > 1 && (
        <div>
          <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">By Currency</div>
          <div class="space-y-1">
            {currencyBreakdown.value.map(({ currency: currencyId, total, count }) => (
              <div key={currencyId} class="flex justify-between items-center text-sm">
                <span class="text-gray-600 dark:text-gray-400">
                  {currency.getById(currencyId).code} ({count}{" "}
                  {count === 1 ? "account" : "accounts"})
                </span>
                <CurrencyDisplay
                  amount={total}
                  currency={currencyId}
                  class="font-medium"
                  highlightNegative
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
