/// <reference lib="deno.ns" />
import { expect } from "@std/expect"
import { zipSync } from "fflate"
import { AccountKind } from "@domain/accounts"
import { CategoryKind } from "@domain/categories"
import { APP_HISTORY_IMPORT_KIND } from "@domain/transactions"
import { checkRows } from "@server/imports/import-kind.ts"
import {
  actualZip,
  FIREFLY_IBAN,
  FIREFLY_ROWS,
  fireflyCsv,
  ynabCsv,
  ynabZip,
} from "./history-fixtures.ts"
import {
  ACTUAL_DATABASE_MAX_BYTES,
  detectHistoryFormat,
  historyImportKind,
  historyReads,
  type HistoryValue,
  planHistory,
  type StoredAccount,
  type StoredCategory,
  UNCATEGORIZED,
} from "./history-import.ts"

const encode = (text: string) => new TextEncoder().encode(text)
const MAPPING = Object.fromEntries(
  historyImportKind.fields.map((field, index) => [field.key, index]),
)

async function rowsOf(bytes: Uint8Array) {
  const read = await historyImportKind.read(bytes)
  if (!read.ok) throw new Error(read.error)
  return read.value.rows
}

async function refusalOf(bytes: Uint8Array): Promise<string> {
  const read = await historyImportKind.read(bytes)
  if (read.ok) throw new Error(`the file was read`)
  return read.error
}

/** The values and refusals of `bytes`, checked with `currency` as the upload's option. */
async function checked(bytes: Uint8Array, currency = `EUR`) {
  return checkRows(historyImportKind, await rowsOf(bytes), MAPPING, { currency })
}

async function valuesOf(bytes: Uint8Array, currency = `EUR`): Promise<HistoryValue[]> {
  const result = await checked(bytes, currency)
  expect(result.result.rows).toEqual([])
  return result.values as HistoryValue[]
}

Deno.test("history format: a zip, Firefly III's header and YNAB's header are told apart by bytes", async () => {
  expect(detectHistoryFormat(ynabZip())).toBe(`zip`)
  expect(detectHistoryFormat(actualZip())).toBe(`zip`)
  expect(detectHistoryFormat(fireflyCsv(FIREFLY_ROWS))).toBe(`firefly-iii`)
  expect(detectHistoryFormat(ynabCsv())).toBe(`ynab`)
  expect(detectHistoryFormat(encode(`Date,Amount\n2024-01-01,1\n`))).toBe(`unknown`)
})

Deno.test("history read: a file of no app Financy reads is refused, quoting nothing from it", async () => {
  const error = await refusalOf(encode(`Secret,Columns\n1,2\n`))
  expect(error).toContain(`not an export Financy reads`)
  expect(error).not.toContain(`Secret`)
})

Deno.test("history read: a zip of neither YNAB nor Actual Budget is refused", async () => {
  const error = await refusalOf(zipSync({ "notes.txt": encode(`Secret`) }))
  expect(error).toContain(`not a YNAB or Actual Budget export`)
  expect(error).not.toContain(`Secret`)
})

Deno.test("history read: Firefly III rows keep their currency and amounts in it, in line order", async () => {
  const rows = await rowsOf(fireflyCsv(FIREFLY_ROWS))
  expect(rows.map((row) => [row[0], row[2], row[4], row[5], row[17]])).toEqual([
    [`entry`, `-12.34`, `EUR`, `Checking`, `2`],
    [`entry`, `2500.00`, `EUR`, `Checking`, `3`],
    [`transfer`, `100.00`, `EUR`, `Checking`, `4`],
    [`entry`, `-9.20`, `EUR`, `Checking`, `5`],
  ])
  expect(rows[0][6]).toBe(FIREFLY_IBAN)
  expect([rows[3][11], rows[3][12]]).toEqual([`-10.00`, `USD`])
})

Deno.test("history read: YNAB and Actual Budget amounts are read in four decimals, with no currency", async () => {
  for (const file of [ynabCsv(), ynabZip()]) {
    const rows = await rowsOf(file)
    expect(rows.map((row) => [row[0], row[2], row[4]])).toEqual([
      [`entry`, `-12.3400`, ``],
      [`transfer`, `100.0000`, ``],
      [`entry`, `1500.0000`, ``],
    ])
  }
  const actual = await rowsOf(actualZip())
  expect(actual.map((row) => [row[0], row[2], row[4], row[13]])).toEqual([
    [`entry`, `-1500.0000`, ``, `Rent`],
    [`transfer`, `100.0000`, ``, ``],
  ])
})

Deno.test("history check: a placeholder amount is read again in the upload's currency", async () => {
  const values = await valuesOf(ynabCsv(), `USD`)
  expect(values.map(({ kind, amount, currency }) => ({ kind, amount, currency }))).toEqual([
    { kind: `entry`, amount: -1234, currency: `USD` },
    { kind: `transfer`, amount: 10000, currency: `USD` },
    { kind: `entry`, amount: 150000, currency: `USD` },
  ])
})

Deno.test("history check: an amount with more decimals than the upload's currency has is refused", async () => {
  const result = await checked(ynabCsv(`$12.345`), `EUR`)
  expect(result.result.rows).toEqual([
    { row: 1, errors: [`The amount has more decimal places than EUR has.`] },
  ])
  expect(result.values).toHaveLength(2)
})

Deno.test("history check: YNAB's thousands in a currency without decimals read as whole amounts", async () => {
  const yen = encode(
    new TextDecoder().decode(ynabCsv(`¥1,000`, `¥5,000`)).replaceAll(`$0.00`, `¥0`)
      .replaceAll(`$100.00`, `¥100`),
  )
  const values = await valuesOf(yen, `JPY`)
  expect(values.map(({ amount }) => amount)).toEqual([-1000, 100, 5000])
})

Deno.test("history check: a YNAB amount that does not read without decimals is refused in such a currency", async () => {
  const result = await checked(ynabCsv(), `JPY`)
  expect(result.result.rows[0]).toEqual({ row: 1, errors: [`The amount is not a sum in JPY.`] })
})

Deno.test("history check: an export that names no currency needs the upload's", async () => {
  const result = checkRows(historyImportKind, await rowsOf(ynabCsv()), MAPPING, null)
  expect(result.result.rows[0].errors).toEqual([`Choose the currency the export is in.`])
})

Deno.test("history check: a Firefly III currency beats the upload's, the payee goes into the memo, a foreign amount is kept", async () => {
  const values = await valuesOf(fireflyCsv(FIREFLY_ROWS), `JPY`)
  expect(values[0]).toEqual({
    kind: `entry`,
    date: `2024-03-01`,
    amount: -1234,
    currency: `EUR`,
    account: { name: `Checking`, iban: FIREFLY_IBAN, type: `asset` },
    to: null,
    foreignAmount: null,
    foreignCurrency: null,
    category: `Food`,
    memo: `Cafe · Lunch`,
  })
  expect(values[3]).toMatchObject({ foreignAmount: -1000, foreignCurrency: `USD` })
  expect(values[2]).toMatchObject({
    kind: `transfer`,
    amount: 10000,
    to: { name: `Savings`, iban: null, type: `asset` },
    category: null,
  })
})

Deno.test("history check: a transfer with a negative amount is refused", async () => {
  const rows = await rowsOf(fireflyCsv(FIREFLY_ROWS))
  const transfer = [...rows[2]]
  expect(transfer[0]).toBe(`transfer`)
  transfer[2] = `-${transfer[2]}`
  const result = checkRows(historyImportKind, [transfer], MAPPING, { currency: `EUR` })
  expect(result.result.rows).toEqual([{ row: 1, errors: [`A transfer's amount is negative.`] }])
})

Deno.test("history check: a foreign amount going the other way from the amount is refused", async () => {
  const rows = await rowsOf(fireflyCsv(FIREFLY_ROWS))
  const foreign = [...rows[3]]
  expect(foreign[11].startsWith(`-`)).toBe(true)
  foreign[11] = foreign[11].slice(1)
  const result = checkRows(historyImportKind, [foreign], MAPPING, { currency: `EUR` })
  expect(result.result.rows).toEqual([{
    row: 1,
    errors: [`The foreign amount does not go the same way as the amount.`],
  }])
})

Deno.test("history check: a row on the export's expense or revenue account is refused: it is a payee", async () => {
  const rows = await rowsOf(fireflyCsv(FIREFLY_ROWS))
  const row = [...rows[0]]
  row[7] = `expense`
  const result = checkRows(historyImportKind, [row], MAPPING, { currency: `EUR` })
  expect(result.result.rows[0].errors).toEqual([
    `The account is a payee in the export, not an account.`,
  ])
})

Deno.test("history check: a transfer to its own account and a row the reader could not read are refused", async () => {
  const rows = await rowsOf(fireflyCsv(FIREFLY_ROWS))
  const loop = [...rows[2]]
  loop[8] = ` checking `
  const unread = Array.from({ length: 18 }, () => ``)
  unread[0] = `unreadable`
  unread[17] = `7`
  const result = checkRows(historyImportKind, [loop, unread], MAPPING, { currency: `EUR` })
  expect(result.result.rows).toEqual([
    { row: 1, errors: [`A transfer needs two different accounts.`] },
    { row: 2, errors: [`Line 7 of the export could not be read.`] },
  ])
})

Deno.test("history read: a Firefly III row that does not read becomes a refused row, the rest stay", async () => {
  const rows = await rowsOf(fireflyCsv([...FIREFLY_ROWS, { ...FIREFLY_ROWS[0], type: `Secret` }]))
  expect(rows).toHaveLength(5)
  const result = checkRows(historyImportKind, rows, MAPPING, { currency: `EUR` })
  expect(result.result.rows).toEqual([{
    row: 5,
    errors: [`Line 6 of the export could not be read.`],
  }])
  expect(result.values).toHaveLength(4)
})

Deno.test("history read: a file over the row cap is refused whole", async () => {
  const header = `type,amount,currency_code,date,source_name,destination_name,description`
  const line = `Withdrawal,'-1,EUR,2024-01-01,A,B,x`
  const text = [header, ...Array(APP_HISTORY_IMPORT_KIND.maxRows + 1).fill(line)].join(`\n`)
  const error = await refusalOf(encode(text))
  expect(error).toContain(`more than ${APP_HISTORY_IMPORT_KIND.maxRows} rows`)
})

Deno.test("history read: an Actual Budget database that inflates past 32 MiB is refused before it is read", async () => {
  expect(ACTUAL_DATABASE_MAX_BYTES).toBe(32 * 1024 * 1024)
  const bomb = zipSync({ "db.sqlite": new Uint8Array(ACTUAL_DATABASE_MAX_BYTES + 1) })
  expect(bomb.length).toBeLessThan(APP_HISTORY_IMPORT_KIND.maxBytes)
  const error = await refusalOf(bomb)
  expect(error).toContain(`larger than Financy reads`)
})

Deno.test("history read: two Actual Budget reads at once run one after the other", async () => {
  const zip = actualZip()
  const first = historyImportKind.read(zip)
  const second = historyImportKind.read(zip)
  expect(historyReads.locked).toBe(true)
  expect(historyReads.queued).toBe(1)
  const reads = await Promise.all([first, second])
  expect(reads.map((read) => read.ok)).toEqual([true, true])
  expect(historyReads.locked).toBe(false)
})

/**
 * Runs `run` with every `DecompressionStream` logged: `+` when one starts, then the bytes it
 * inflated when it ends. The zip readers inflate through it, so the log shows which reads were in
 * flight at once.
 */
async function withInflations(run: (log: (string | number)[]) => Promise<void>) {
  const Inflate = globalThis.DecompressionStream
  const log: (string | number)[] = []
  globalThis.DecompressionStream = class {
    readonly writable: WritableStream<BufferSource>
    readonly readable: ReadableStream<Uint8Array>
    constructor(format: CompressionFormat) {
      const inflate = new Inflate(format)
      let bytes = 0
      log.push(`+`)
      this.writable = inflate.writable
      this.readable = inflate.readable.pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            bytes += chunk.length
            controller.enqueue(chunk)
          },
          flush() {
            log.push(bytes)
          },
        }),
      )
    }
  } as unknown as typeof DecompressionStream
  try {
    await run(log)
  } finally {
    globalThis.DecompressionStream = Inflate
  }
}

Deno.test("history read: two YNAB zip reads at once never overlap: one inflates its register twice, then the other", async () => {
  const [small, large] = [ynabCsv(), ynabCsv(`$1,012.34`)]
  await withInflations(async (log) => {
    const reads = await Promise.all([
      historyImportKind.read(ynabZip(small)),
      historyImportKind.read(ynabZip(large)),
    ])
    expect(reads.map((read) => read.ok)).toEqual([true, true])
    const twice = (register: Uint8Array) => [`+`, register.length, `+`, register.length]
    expect(log).toEqual([...twice(small), ...twice(large)])
  })
})

Deno.test("history read: a Firefly III read waits until a YNAB zip read in flight has finished", async () => {
  const register = ynabCsv()
  await withInflations(async (log) => {
    const logged = async (name: string, read: ReturnType<typeof historyImportKind.read>) => {
      const result = await read
      log.push(name)
      return result
    }
    const reads = await Promise.all([
      logged(`ynab`, historyImportKind.read(ynabZip(register))),
      logged(`firefly`, historyImportKind.read(fireflyCsv(FIREFLY_ROWS))),
    ])
    expect(reads.map((read) => read.ok)).toEqual([true, true])
    expect(log).toEqual([`+`, register.length, `+`, register.length, `ynab`, `firefly`])
  })
})

Deno.test("history read: every app's export is read under the lock, and only its rows leave it", async () => {
  const runExclusive = historyReads.runExclusive.bind(historyReads)
  const left: unknown[] = []
  historyReads.runExclusive = (async (fn: () => unknown) => {
    const value = await runExclusive(fn)
    left.push(value)
    return value
  }) as typeof historyReads.runExclusive
  try {
    for (const file of [fireflyCsv(FIREFLY_ROWS), ynabCsv(), ynabZip(), actualZip()]) {
      left.length = 0
      const read = await historyImportKind.read(file)
      expect(read.ok && read.value.rows.length).toBeGreaterThan(0)
      expect(left).toHaveLength(1)
      expect(left[0]).toBe(read)
    }
  } finally {
    historyReads.runExclusive = runExclusive
  }
})

const STORED_ACCOUNTS: StoredAccount[] = [
  { id: `a-iban`, name: `Main`, currency: `EUR`, aliases: [`de00 1234 5678 0000 0000 01`] },
  { id: `a-name`, name: `SAVINGS`, currency: `EUR`, aliases: [] },
  { id: `a-usd`, name: `Dollars`, currency: `USD`, aliases: [] },
]

const STORED_CATEGORIES: StoredCategory[] = [
  { id: `c-food`, name: `food`, kind: CategoryKind.EXPENSE, archived: false },
  { id: `c-salary`, name: `Salary`, kind: CategoryKind.INCOME, archived: false },
  { id: `c-books`, name: `Books`, kind: CategoryKind.INCOME, archived: false },
]

Deno.test("history plan: an account matches by IBAN alias, then by name in any case, else is created once", async () => {
  const values = await valuesOf(fireflyCsv(FIREFLY_ROWS))
  const plan = planHistory(values, STORED_ACCOUNTS, STORED_CATEGORIES)
  // Checking's IBAN is Main's alias, written with spaces; Savings is "SAVINGS".
  expect(plan.rows.map((row) => row.account)).toEqual(Array(4).fill({ existing: `a-iban` }))
  expect(plan.rows[2].to).toEqual({ existing: `a-name` })
  const unknown = planHistory(values, [], [])
  expect(unknown.accounts).toEqual([
    { name: `Checking`, kind: AccountKind.BANK, currency: `EUR`, iban: FIREFLY_IBAN },
    { name: `Savings`, kind: AccountKind.BANK, currency: `EUR`, iban: null },
  ])
  expect(unknown.rows.map((row) => row.account)).toEqual(Array(4).fill({ created: 0 }))
})

Deno.test("history plan: a category matches by name and kind, takes a refund, else is created per kind", async () => {
  const values = await valuesOf(fireflyCsv(FIREFLY_ROWS))
  const plan = planHistory(values, STORED_ACCOUNTS, STORED_CATEGORIES)
  // Food matches "food"; Salary matches; the Books expense cannot go to an income category.
  expect(plan.rows.map((row) => row.category)).toEqual([
    { existing: `c-food` },
    { existing: `c-salary` },
    null,
    { created: 0 },
  ])
  expect(plan.categories).toEqual([{ name: `Books`, kind: CategoryKind.EXPENSE }])
  const refund = planHistory(
    [{ ...values[0], amount: 500 }, { ...values[0], amount: 700 }],
    STORED_ACCOUNTS,
    STORED_CATEGORIES,
  )
  // Money back in an expense category is a refund: it fits, and nothing is created.
  expect(refund.rows.map((row) => row.category)).toEqual([
    { existing: `c-food` },
    { existing: `c-food` },
  ])
  expect(refund.categories).toEqual([])
})

Deno.test("history plan: an entry without a category goes to one Uncategorized of its kind", async () => {
  const values = await valuesOf(ynabCsv(), `EUR`)
  const plan = planHistory(values, [], [])
  expect(plan.categories).toEqual([
    { name: `Food: Eating out`, kind: CategoryKind.EXPENSE },
    { name: UNCATEGORIZED, kind: CategoryKind.INCOME },
  ])
})

Deno.test("history plan: a row in another currency than its account has a problem, the rest none", async () => {
  const values = await valuesOf(fireflyCsv(FIREFLY_ROWS))
  const dollars = { ...values[0], account: { name: `Dollars`, iban: null, type: null } }
  const intoDollars = { ...values[2], to: { name: `Dollars`, iban: null, type: null } }
  const plan = planHistory([values[0], dollars, intoDollars], STORED_ACCOUNTS, [])
  expect(plan.rows.map((row) => row.problem)).toEqual([
    null,
    `The account is in USD, the row in EUR`,
    `The account it went to is in USD, the row in EUR`,
  ])
})

Deno.test("history plan: a transfer whose sides resolve to one stored account has a problem", async () => {
  const values = await valuesOf(fireflyCsv(FIREFLY_ROWS))
  const sameIban = { ...values[2], to: { name: `Other`, iban: FIREFLY_IBAN, type: null } }
  const plan = planHistory([sameIban], STORED_ACCOUNTS, [])
  expect(plan.rows[0].problem).toBe(`Both sides are the same account`)
})

Deno.test("history plan: a new account takes the currency of the first row naming it", async () => {
  const values = await valuesOf(fireflyCsv(FIREFLY_ROWS))
  const inDollars = { ...values[0], currency: `USD` }
  const plan = planHistory([inDollars, values[0]], [], [])
  expect(plan.accounts[0].currency).toBe(`USD`)
  expect(plan.rows[1].problem).toBe(`The account is in USD, the row in EUR`)
})
