import type { Currency, CurrencyType } from "@shared/types"

/**
 * A comprehensive list of supported currencies including major fiat currencies and popular cryptocurrencies.
 *
 * Includes 60+ currencies:
 * - **Major Fiat**: USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY, SEK, NZD, etc.
 * - **Asian**: SGD, HKD, KRW, INR, THB, MYR, PHP, IDR, VND
 * - **European**: PLN, CZK, HUF, RON, BGN, HRK, DKK, NOK, ISK
 * - **Others**: BRL, MXN, RUB, ZAR, TRY, AED, SAR, ILS, EGP, NGN, KES
 * - **Crypto**: BTC, ETH, USDT, USDC, BNB, ADA, SOL, DOT, MATIC, AVAX
 */
export const CURRENCIES: Currency[] = [
  // Major Fiat Currencies
  { code: "USD", name: "US Dollar", symbol: "$", type: "fiat" },
  { code: "EUR", name: "Euro", symbol: "€", type: "fiat" },
  { code: "GBP", name: "British Pound", symbol: "£", type: "fiat" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥", type: "fiat" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$", type: "fiat" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$", type: "fiat" },
  { code: "CHF", name: "Swiss Franc", symbol: "Fr", type: "fiat" },
  { code: "CNY", name: "Chinese Yuan", symbol: "¥", type: "fiat" },
  { code: "SEK", name: "Swedish Krona", symbol: "kr", type: "fiat" },
  { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", type: "fiat" },

  // Asian Currencies
  { code: "SGD", name: "Singapore Dollar", symbol: "S$", type: "fiat" },
  { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", type: "fiat" },
  { code: "KRW", name: "South Korean Won", symbol: "₩", type: "fiat" },
  { code: "INR", name: "Indian Rupee", symbol: "₹", type: "fiat" },
  { code: "THB", name: "Thai Baht", symbol: "฿", type: "fiat" },
  { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", type: "fiat" },
  { code: "PHP", name: "Philippine Peso", symbol: "₱", type: "fiat" },
  { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", type: "fiat" },
  { code: "VND", name: "Vietnamese Dong", symbol: "₫", type: "fiat" },

  // Other Major Currencies
  { code: "BRL", name: "Brazilian Real", symbol: "R$", type: "fiat" },
  { code: "MXN", name: "Mexican Peso", symbol: "Mex$", type: "fiat" },
  { code: "RUB", name: "Russian Ruble", symbol: "₽", type: "fiat" },
  { code: "ZAR", name: "South African Rand", symbol: "R", type: "fiat" },
  { code: "TRY", name: "Turkish Lira", symbol: "₺", type: "fiat" },
  { code: "PLN", name: "Polish Zloty", symbol: "zł", type: "fiat" },
  { code: "CZK", name: "Czech Koruna", symbol: "Kč", type: "fiat" },
  { code: "HUF", name: "Hungarian Forint", symbol: "Ft", type: "fiat" },
  { code: "RON", name: "Romanian Leu", symbol: "lei", type: "fiat" },
  { code: "BGN", name: "Bulgarian Lev", symbol: "лв", type: "fiat" },
  { code: "HRK", name: "Croatian Kuna", symbol: "kn", type: "fiat" },
  { code: "DKK", name: "Danish Krone", symbol: "kr", type: "fiat" },
  { code: "NOK", name: "Norwegian Krone", symbol: "kr", type: "fiat" },
  { code: "ISK", name: "Icelandic Krona", symbol: "kr", type: "fiat" },

  // Middle East & Africa
  { code: "AED", name: "UAE Dirham", symbol: "د.إ", type: "fiat" },
  { code: "SAR", name: "Saudi Riyal", symbol: "﷼", type: "fiat" },
  { code: "ILS", name: "Israeli Shekel", symbol: "₪", type: "fiat" },
  { code: "EGP", name: "Egyptian Pound", symbol: "£", type: "fiat" },
  { code: "NGN", name: "Nigerian Naira", symbol: "₦", type: "fiat" },
  { code: "KES", name: "Kenyan Shilling", symbol: "KSh", type: "fiat" },

  // Cryptocurrencies
  { code: "BTC", name: "Bitcoin", symbol: "₿", type: "crypto" },
  { code: "ETH", name: "Ethereum", symbol: "Ξ", type: "crypto" },
  { code: "USDT", name: "Tether", symbol: "₮", type: "crypto" },
  { code: "USDC", name: "USD Coin", symbol: "USDC", type: "crypto" },
  { code: "BNB", name: "Binance Coin", symbol: "BNB", type: "crypto" },
  { code: "ADA", name: "Cardano", symbol: "ADA", type: "crypto" },
  { code: "SOL", name: "Solana", symbol: "SOL", type: "crypto" },
  { code: "DOT", name: "Polkadot", symbol: "DOT", type: "crypto" },
  { code: "MATIC", name: "Polygon", symbol: "MATIC", type: "crypto" },
  { code: "AVAX", name: "Avalanche", symbol: "AVAX", type: "crypto" },
]

/**
 * Create a lookup map for faster currency retrieval by code
 */
export const CURRENCY_MAP = new Map(CURRENCIES.map((currency) => [currency.code, currency]))

/**
 * Get currency information by currency code
 * @param currencyCode - The currency code (e.g., "USD", "EUR")
 * @returns Currency object or fallback object if not found
 */
export function getCurrencyDisplay(currencyCode: string): Currency {
  return CURRENCY_MAP.get(currencyCode) || {
    code: currencyCode,
    name: currencyCode,
    symbol: undefined,
    type: "fiat",
  }
}

/**
 * Filter currencies by type
 * @param filterType - Type of currencies to return ('all', 'fiat', 'crypto')
 * @returns Filtered array of currencies
 */
export function getCurrenciesByType(filterType: CurrencyType | "all" = "all"): Currency[] {
  if (filterType === "all") return CURRENCIES
  return CURRENCIES.filter((currency) => currency.type === filterType)
}

/**
 * Search currencies by code or name
 * @param searchTerm - Search term to match against code or name
 * @param filterType - Optional type filter
 * @returns Filtered array of currencies matching the search term
 */
export function searchCurrencies(
  searchTerm: string,
  filterType: CurrencyType | "all" = "all",
): Currency[] {
  const normalizedSearch = searchTerm.toLowerCase().trim()
  if (!normalizedSearch) return getCurrenciesByType(filterType)

  return getCurrenciesByType(filterType).filter((currency) =>
    currency.code.toLowerCase().includes(normalizedSearch) ||
    currency.name.toLowerCase().includes(normalizedSearch)
  )
}
