/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { BANK_STATEMENT_IMPORT_KIND } from "@domain/transactions"
import { checkRows } from "@server/imports/import-kind.ts"
import { statementImportKind, type StatementOptions } from "./statement-import.ts"

const encode = (text: string) => new TextEncoder().encode(text)

const EUR: StatementOptions = {
  accountId: `00000000-0000-7000-8000-000000000001`,
  currency: `EUR`,
  expenseCategoryId: `00000000-0000-7000-8000-000000000002`,
  incomeCategoryId: `00000000-0000-7000-8000-000000000003`,
}

const SIGNED_HEADER = `Date,Description,Amount,Currency,Balance`

async function read(text: string | Uint8Array) {
  return await statementImportKind.read(typeof text === `string` ? encode(text) : text)
}

async function rowsOf(text: string) {
  const result = await read(text)
  if (!result.ok) throw new Error(result.error)
  return result.value
}

function check(rows: readonly (readonly string[])[], options: StatementOptions = EUR) {
  const mapping = { date: 0, amount: 1, currency: 2, payee: 3, memo: 4, reference: 5 }
  return checkRows(statementImportKind, rows, mapping, options)
}

Deno.test("statement read: a CSV of a built-in profile reads into the kind's fixed columns", async () => {
  const value = await rowsOf(
    `${SIGNED_HEADER}\n2026-01-02,Salary,2500.00,EUR,3500.00\n2026-01-03,Grocer,-84.37,EUR,3415.63\n`,
  )
  expect(value.columns).toEqual([`Date`, `Amount`, `Currency`, `Payee`, `Memo`, `Reference`])
  expect(value.rows).toEqual([
    [`2026-01-02`, `2500.00`, `EUR`, ``, `Salary`, ``],
    [`2026-01-03`, `-84.37`, `EUR`, ``, `Grocer`, ``],
  ])
})

Deno.test("statement read: balances that do not add up refuse the file, naming the line and no cell", async () => {
  const result = await read(
    `${SIGNED_HEADER}\n2026-01-02,Secret Payee,2500.00,EUR,3500.00\n2026-01-03,Grocer,-84.37,EUR,9999.00\n`,
  )
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error).toContain(`do not add up on line 3`)
  expect(result.error).not.toContain(`Secret`)
})

Deno.test("statement read: a row that does not read refuses the file by its line, quoting nothing", async () => {
  const result = await read(
    `${SIGNED_HEADER}\n2026-01-02,Salary,Secret Payee,EUR,3500.00\n2026-01-03,Grocer,-84.37,EUR,3415.63\n`,
  )
  expect(result.ok).toBe(false)
  if (result.ok) return
  expect(result.error).toBe(`The statement could not be read on line 2.`)
})

Deno.test("statement read: a file without balances is read", async () => {
  const result = await read(`!Type:Bank\nD01/02'26\nT12.50\nPCafe\n^\n`)
  expect(result.ok).toBe(true)
})

Deno.test("statement read: a CSV whose header matches no built-in profile in full is refused in words", async () => {
  const result = await read(`Date,Text,Sum\n2026-01-02,Salary,2500.00\n`)
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toContain(`match no bank layout`)
  // Four of five header names is not enough: a misread column would save wrong amounts.
  const partial = await read(`Date,Description,Amount,Currency,Saldo\n2026-01-02,A,1.00,EUR,1.00\n`)
  expect(partial.ok).toBe(false)
})

Deno.test("statement read: a PDF, an unknown file and an empty statement are refused in words", async () => {
  for (
    const [file, words] of [
      [`%PDF-1.7\n`, `PDF statements cannot be imported yet`],
      [`just some text`, `not a bank statement`],
      [`${SIGNED_HEADER}\n`, `no entries to import`],
    ] as const
  ) {
    const result = await read(file)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain(words)
  }
})

Deno.test("statement read: a file of more rows than the kind takes is refused before its rows are kept", async () => {
  const line = `2026-01-02,Coffee,-1.00,EUR,\n`
  const result = await read(
    `${SIGNED_HEADER}\n${line.repeat(BANK_STATEMENT_IMPORT_KIND.maxRows + 1)}`,
  )
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error).toContain(`more than 5000 entries`)
})

Deno.test("statement read: an XML file with a DTD is refused", async () => {
  const result = await read(
    `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]>` +
      `<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">&a;</Document>`,
  )
  expect(result.ok).toBe(false)
})

Deno.test("statement check: a row in another currency than the account's is refused", () => {
  const { result, values } = check([[`2026-01-02`, `10.00`, `USD`, ``, `Cafe`, ``]])
  expect(values).toEqual([])
  expect(result.rows[0].errors).toEqual([`The statement is in USD, but the account is in EUR.`])
})

Deno.test("statement check: a QIF amount takes the account's decimals, and digits it lacks are refused", async () => {
  const value = await rowsOf(
    `!Type:Bank\nD01/02'26\nT1,250.50\nPCafe\n^\nD01/03'26\nT-3\nPShop\n^\n`,
  )
  expect(value.rows.map((row) => row[2])).toEqual([``, ``])
  expect(check(value.rows).values).toEqual([
    { date: `2026-01-02`, amount: 125050, memo: `Cafe`, reference: null, payee: `Cafe` },
    { date: `2026-01-03`, amount: -300, memo: `Shop`, reference: null, payee: `Shop` },
  ])
  const yen = check(value.rows, { ...EUR, currency: `JPY` })
  expect(yen.values).toEqual([{
    date: `2026-01-03`,
    amount: -3,
    memo: `Shop`,
    reference: null,
    payee: `Shop`,
  }])
  expect(yen.result.rows[0]).toEqual({ row: 1, errors: [`The amount is not a sum in JPY.`] })
})

Deno.test("statement check: payee and memo join on one line, the payee is kept on one line, and a zero, a bad date or a long reference is refused", () => {
  const { values, result } = check([
    [`2026-01-02`, `-5.00`, `EUR`, `Cafe\nCentral`, `Latte`, `REF-1`],
    [`2026-01-02`, `0.00`, `EUR`, ``, ``, ``],
    [`2026-02-30`, `-1.00`, `EUR`, ``, ``, ``],
    [`2026-01-02`, `-1.00`, `EUR`, ``, ``, `R`.repeat(256)],
    [`2026-01-02`, `-1.00`, `EUR`, `Bad\u0000`, ``, ``],
  ])
  expect(values).toEqual([
    {
      date: `2026-01-02`,
      amount: -500,
      memo: `Cafe Central · Latte`,
      reference: `REF-1`,
      payee: `Cafe Central`,
    },
  ])
  expect(result.rows.map((row) => row.errors)).toEqual([
    [`An entry of zero cannot be saved.`],
    [`The date is not a date like 2026-01-31.`],
    [`The reference is longer than 255 characters.`],
    [`The payee or memo holds control or invisible characters.`],
  ])
})

Deno.test("statement check: a memo past 500 characters is cut, not refused", () => {
  const { values } = check([[`2026-01-02`, `-1.00`, `EUR`, `P`.repeat(400), `M`.repeat(400), ``]])
  expect((values[0] as { memo: string }).memo.length).toBe(500)
})
