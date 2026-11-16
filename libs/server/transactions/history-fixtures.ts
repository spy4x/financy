/**
 * Small synthetic exports of the apps the history import reads, for its unit and integration
 * tests: Firefly III's transactions CSV, YNAB's register as CSV and as a zip, and Actual Budget's
 * export zip with a SQLite database built here. Every name and number is made up.
 *
 * @module
 */

import { zipSync } from "fflate"
import initSqlJs from "npm:sql.js@1.16.0/dist/sql-wasm-inline.js"

const encode = (text: string) => new TextEncoder().encode(text)

/** The IBAN of the Firefly III export's checking account. */
export const FIREFLY_IBAN = `DE00123456780000000001`

const FIREFLY_HEADER = [
  `group_id`,
  `journal_id`,
  `type`,
  `currency_code`,
  `amount`,
  `foreign_currency_code`,
  `foreign_amount`,
  `description`,
  `date`,
  `source_name`,
  `source_iban`,
  `source_type`,
  `destination_name`,
  `destination_iban`,
  `destination_type`,
  `category`,
  `tags`,
  `notes`,
]

/** A Firefly III export of `rows`, each a record of its header's cells. */
export function fireflyCsv(rows: readonly Record<string, string>[]): Uint8Array {
  const lines = [FIREFLY_HEADER.join(`,`)]
  for (const row of rows) lines.push(FIREFLY_HEADER.map((name) => row[name] ?? ``).join(`,`))
  return encode(lines.join(`\n`) + `\n`)
}

const checking = {
  source_name: `Checking`,
  source_iban: FIREFLY_IBAN,
  source_type: `Asset account`,
}

/**
 * Four rows in euros: lunch paid to the Cafe (an expense account) in Food, a salary from the
 * Employer (a revenue account) in Salary, a transfer to Savings, and a book paid in dollars.
 */
export const FIREFLY_ROWS: readonly Record<string, string>[] = [
  {
    group_id: `1`,
    journal_id: `1`,
    type: `Withdrawal`,
    currency_code: `EUR`,
    amount: `'-12.34`,
    description: `Lunch`,
    date: `2024-03-01T00:00:00+01:00`,
    ...checking,
    destination_name: `Cafe`,
    destination_type: `Expense account`,
    category: `Food`,
    tags: `work`,
  },
  {
    group_id: `2`,
    journal_id: `2`,
    type: `Deposit`,
    currency_code: `EUR`,
    amount: `2500.00`,
    description: `March salary`,
    date: `2024-03-02T00:00:00+01:00`,
    source_name: `Employer`,
    source_type: `Revenue account`,
    destination_name: `Checking`,
    destination_iban: FIREFLY_IBAN,
    destination_type: `Asset account`,
    category: `Salary`,
  },
  {
    group_id: `3`,
    journal_id: `3`,
    type: `Transfer`,
    currency_code: `EUR`,
    amount: `100.00`,
    description: `Saving`,
    date: `2024-03-03T00:00:00+01:00`,
    ...checking,
    destination_name: `Savings`,
    destination_type: `Asset account`,
  },
  {
    group_id: `4`,
    journal_id: `4`,
    type: `Withdrawal`,
    currency_code: `EUR`,
    amount: `'-9.20`,
    foreign_currency_code: `USD`,
    foreign_amount: `'-10.00`,
    description: `Book`,
    date: `2024-03-04T00:00:00+01:00`,
    ...checking,
    destination_name: `Bookshop`,
    destination_type: `Expense account`,
    category: `Books`,
    notes: `paid in dollars`,
  },
]

const YNAB_HEADER = `"Account","Flag","Date","Payee","Category Group/Category","Category Group",` +
  `"Category","Memo","Outflow","Inflow","Cleared"`

/**
 * A YNAB register: lunch at the Cafe in "Food: Eating out", a transfer from Checking to Savings
 * (its two rows), and income to Checking. `outflow` writes the lunch's amount.
 */
export function ynabCsv(outflow = `$12.34`, inflow = `$1,500.00`): Uint8Array {
  return encode(
    [
      YNAB_HEADER,
      `"Checking","","03/15/2024","Cafe","Food: Eating out","Food","Eating out","","${outflow}",` +
      `"$0.00","Cleared"`,
      `"Checking","","03/16/2024","Transfer : Savings","","","","","$100.00","$0.00","Cleared"`,
      `"Savings","","03/16/2024","Transfer : Checking","","","","","$0.00","$100.00","Cleared"`,
      `"Checking","","03/17/2024","Employer","Inflow: Ready to Assign","Inflow",` +
      `"Ready to Assign","","$0.00","${inflow}","Cleared"`,
    ].join(`\n`) + `\n`,
  )
}

/** YNAB's "Export budget" zip around `register`, with its plan beside it as YNAB writes it. */
export function ynabZip(register: Uint8Array = ynabCsv()): Uint8Array {
  return zipSync({
    "Home as of 2024-03-20 Plan.csv": encode(`"Month","Category"\n`),
    "Home as of 2024-03-20 Register.csv": register,
  })
}

/** Actual Budget's tables, cut to the columns its reader uses. */
const ACTUAL_SCHEMA = `
  CREATE TABLE accounts (id TEXT PRIMARY KEY, name TEXT, offbudget INTEGER DEFAULT 0,
    closed INTEGER DEFAULT 0, sort_order REAL, tombstone INTEGER DEFAULT 0);
  CREATE TABLE payees (id TEXT PRIMARY KEY, name TEXT, category TEXT,
    tombstone INTEGER DEFAULT 0, transfer_acct TEXT);
  CREATE TABLE payee_mapping (id TEXT PRIMARY KEY, targetId TEXT);
  CREATE TABLE categories (id TEXT PRIMARY KEY, name TEXT, is_income INTEGER DEFAULT 0,
    cat_group TEXT, sort_order REAL, tombstone INTEGER DEFAULT 0);
  CREATE TABLE category_groups (id TEXT PRIMARY KEY, name TEXT, is_income INTEGER DEFAULT 0,
    sort_order REAL, tombstone INTEGER DEFAULT 0);
  CREATE TABLE category_mapping (id TEXT PRIMARY KEY, transferId TEXT);
  CREATE TABLE transactions (id TEXT PRIMARY KEY, isParent INTEGER DEFAULT 0,
    isChild INTEGER DEFAULT 0, acct TEXT, category TEXT, amount INTEGER, description TEXT,
    notes TEXT, date INTEGER, starting_balance_flag INTEGER DEFAULT 0, transferred_id TEXT,
    sort_order REAL, tombstone INTEGER DEFAULT 0, parent_id TEXT);
  CREATE TABLE preferences (id TEXT PRIMARY KEY, value TEXT);
`

/** A budget: rent paid from Checking in Rent, and a transfer from Checking to Savings. */
const ACTUAL_BUDGET = `
  INSERT INTO accounts (id, name, sort_order) VALUES ('a1', 'Checking', 1), ('a2', 'Savings', 2);
  INSERT INTO category_groups (id, name, sort_order) VALUES ('g1', 'Home', 1);
  INSERT INTO categories (id, name, cat_group, sort_order) VALUES ('c1', 'Rent', 'g1', 1);
  INSERT INTO category_mapping VALUES ('c1', 'c1');
  INSERT INTO payees (id, name, transfer_acct) VALUES
    ('p1', 'Landlord', NULL), ('pt1', '', 'a2'), ('pt2', '', 'a1');
  INSERT INTO payee_mapping VALUES ('p1', 'p1'), ('pt1', 'pt1'), ('pt2', 'pt2');
  INSERT INTO transactions
    (id, acct, category, amount, description, notes, date, transferred_id) VALUES
    ('t1', 'a1', 'c1', -150000, 'p1', 'March', 20240301, NULL),
    ('t2', 'a1', NULL, -10000, 'pt1', NULL, 20240303, 't3'),
    ('t3', 'a2', NULL, 10000, 'pt2', NULL, 20240303, 't2');
`

const SQL = await initSqlJs()

/** Actual Budget's "Export data" zip of the budget above. */
export function actualZip(): Uint8Array {
  const db = new SQL.Database()
  try {
    db.run(ACTUAL_SCHEMA + ACTUAL_BUDGET)
    return zipSync({ "db.sqlite": db.export(), "metadata.json": encode(`{}`) })
  } finally {
    db.close()
  }
}
