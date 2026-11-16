import { expect } from "@std/expect"
import { describe, it } from "@std/testing/bdd"
import { splitTypedEntry } from "./typed-entry.ts"

describe("splitTypedEntry", () => {
  it("reads the number at the end as the amount and the rest as the memo", () => {
    expect(splitTypedEntry(`coffee 4.50`, `USD`)).toEqual({ memo: `coffee`, amount: 450 })
  })

  it("reads a number in the middle and joins the words around it", () => {
    expect(splitTypedEntry(`  lunch   12.30  with Ann `, `USD`))
      .toEqual({ memo: `lunch with Ann`, amount: 1230 })
    expect(splitTypedEntry(`4.50 coffee`, `USD`)).toEqual({ memo: `coffee`, amount: 450 })
  })

  it("takes the last of two numbers and keeps the first in the memo", () => {
    expect(splitTypedEntry(`2 coffees 9`, `USD`)).toEqual({ memo: `2 coffees`, amount: 900 })
  })

  it("reads a comma as the decimal mark", () => {
    expect(splitTypedEntry(`coffee 4,50`, `EUR`)).toEqual({ memo: `coffee`, amount: 450 })
    expect(splitTypedEntry(`rent 1.234,56`, `EUR`)).toEqual({ memo: `rent`, amount: 123456 })
  })

  it("reads a mark before exactly three digits as grouping in a two-decimal currency", () => {
    expect(splitTypedEntry(`laptop 1,500`, `USD`)).toEqual({ memo: `laptop`, amount: 150000 })
    expect(splitTypedEntry(`laptop 1.500`, `USD`)).toEqual({ memo: `laptop`, amount: 150000 })
    expect(splitTypedEntry(`car 1,500,000.25`, `USD`))
      .toEqual({ memo: `car`, amount: 150000025 })
  })

  it("reads a mark before three digits as decimal in a three-decimal currency", () => {
    expect(splitTypedEntry(`taxi 1.500`, `KWD`)).toEqual({ memo: `taxi`, amount: 1500 })
  })

  it("reads a whole amount in a currency without decimals", () => {
    expect(splitTypedEntry(`ramen 1200`, `JPY`)).toEqual({ memo: `ramen`, amount: 1200 })
    expect(splitTypedEntry(`ramen 1,200`, `JPY`)).toEqual({ memo: `ramen`, amount: 1200 })
  })

  it("keeps the whole text as the memo when the amount has too many decimals", () => {
    expect(splitTypedEntry(`ramen 4.50`, `JPY`)).toEqual({ memo: `ramen 4.50`, amount: null })
    expect(splitTypedEntry(`coffee 4.555`, `KWD`)).toEqual({ memo: `coffee`, amount: 4555 })
    expect(splitTypedEntry(`coffee 4.5555`, `USD`))
      .toEqual({ memo: `coffee 4.5555`, amount: null })
  })

  it("keeps the whole text as the memo for a zero amount", () => {
    expect(splitTypedEntry(`free coffee 0`, `USD`)).toEqual({ memo: `free coffee 0`, amount: null })
  })

  it("fills only the memo when the text has no number", () => {
    expect(splitTypedEntry(`coffee  with   Ann`, `USD`))
      .toEqual({ memo: `coffee with Ann`, amount: null })
    expect(splitTypedEntry(`v2.0beta`, `USD`)).toEqual({ memo: `v2.0beta`, amount: null })
    expect(splitTypedEntry(`. ,`, `USD`)).toEqual({ memo: `. ,`, amount: null })
  })

  it("leaves the memo empty when the text is only a number", () => {
    expect(splitTypedEntry(` 4.50 `, `USD`)).toEqual({ memo: ``, amount: 450 })
  })

  it("drops a leading minus, since the quick entry's kind sets the sign", () => {
    expect(splitTypedEntry(`refund -4.50`, `USD`)).toEqual({ memo: `refund`, amount: 450 })
  })

  it("reads a crypto amount with the coin's own eight decimals", () => {
    expect(splitTypedEntry(`btc buy 0.00012345`, `BTC`))
      .toEqual({ memo: `btc buy`, amount: 12345 })
    expect(splitTypedEntry(`eth 0.005`, `ETH`)).toEqual({ memo: `eth`, amount: 500000 })
  })

  it("keeps the whole text as the memo without a currency or with an unknown one", () => {
    expect(splitTypedEntry(`coffee 4.50`, null)).toEqual({ memo: `coffee 4.50`, amount: null })
    expect(splitTypedEntry(`coffee 4.50`, ` `)).toEqual({ memo: `coffee 4.50`, amount: null })
  })

  it("splits a 10,000-character text quickly, with no backtracking on a near-number", () => {
    const long = `${`9,`.repeat(2_500)}9 ${`9.`.repeat(2_500)}x`
    const started = performance.now()
    const entry = splitTypedEntry(long, `USD`)
    expect(performance.now() - started).toBeLessThan(500)
    expect(long.length).toBeGreaterThan(10_000)
    expect(entry).toEqual({ memo: long, amount: null })
  })
})
