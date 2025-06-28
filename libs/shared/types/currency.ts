export interface Currency {
  id?: number
  code: string
  name: string
  symbol?: string
  type: "fiat" | "crypto"
  decimal_places?: number
}

export type CurrencyType = "all" | "fiat" | "crypto"
