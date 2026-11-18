import { amountDecimals } from "@domain/money"
import { type CsvDecimal, csvDecimal } from "@spy4x/platform/universal/csv"
import { moneyDecimalString } from "@spy4x/platform/universal/money"

/**
 * An amount in `currency`'s smallest unit as a spreadsheet cell: the exact decimal, in the
 * currency's own decimals, that opens as a number. `amount` is a number or a Postgres bigint read
 * as text. A sum past the safe-integer range, or `null`, is an empty cell, because a `number`
 * cannot hold its digits and one wrong digit is worse than none.
 */
export function amountCell(amount: number | string | null, currency: string): CsvDecimal | string {
  const value = amount === null ? NaN : Number(amount)
  if (!Number.isSafeInteger(value)) return ``
  return csvDecimal(moneyDecimalString(value, amountDecimals(currency)))
}
