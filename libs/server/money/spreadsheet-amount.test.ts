/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { csvField } from "@spy4x/platform/universal/csv"
import { amountCell } from "./spreadsheet-amount.ts"

const cell = (amount: number | string | null, currency: string) =>
  csvField(amountCell(amount, currency))

Deno.test(`a negative amount reads as a plain number with no leading apostrophe`, () => {
  expect(cell(-1250, `USD`)).toBe(`-12.50`)
})

Deno.test(`a bitcoin amount keeps its eight decimals and no exponent`, () => {
  expect(cell(12345, `BTC`)).toBe(`0.00012345`)
  expect(cell(-1, `BTC`)).toBe(`-0.00000001`)
})

Deno.test(`a yen amount has no decimals and a dinar amount has three`, () => {
  expect(cell(1500, `JPY`)).toBe(`1500`)
  expect(cell(1500, `BHD`)).toBe(`1.500`)
})

Deno.test(`a bigint read as text gives the same cell as the number`, () => {
  expect(cell(`-1250`, `USD`)).toBe(`-12.50`)
  expect(cell(`9007199254740991`, `USD`)).toBe(`90071992547409.91`)
})

Deno.test(`a sum past the safe-integer range is an empty cell, never a rounded one`, () => {
  expect(cell(`9007199254740992`, `USD`)).toBe(``)
  expect(cell(`9007199254740993`, `USD`)).toBe(``)
  expect(cell(`-9007199254740993`, `USD`)).toBe(``)
})

Deno.test(`no amount is an empty cell`, () => {
  expect(cell(null, `USD`)).toBe(``)
})
