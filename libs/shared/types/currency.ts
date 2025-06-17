export interface Currency {
  code: string
  name: string
  symbol?: string
  type: "fiat" | "crypto"
}

export type CurrencyType = "all" | "fiat" | "crypto"
