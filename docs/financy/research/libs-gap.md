# Financy on the shared libraries: what exists, what is missing

Checked on 2026-11-03 against `origin/main` of `spy4x/ts-libs` and `spy4x/preact-components`
(their `llms.txt` export lists, the source of the modules named below, and their open issues),
plus Seed's imports and the MVP list in `product.md` beside this file.

## In short

The libraries already cover the base of a money product well: integer minor units with exact
formatting and strict parsing (`@spy4x/platform/universal/money`), `MoneyInput` and
`MoneyDisplay`, a line chart, horizontal and stacked bars with a target line, a donut, KPI cards,
a date-range picker, a sortable table, CSV export, repeat rules and a forgiving search. What is
missing is everything between two currencies (a currency list, conversion, a rates client), safe
sums and splits, budget-style periods, reading files in (CSV parsing, column formats, bank
formats) and a few pickers and charts. 37 concepts: **12 exist, 13 partial, 12 missing.**

## The table

ts-libs packages are `@spy4x/<pkg>`; UI packages are `@spy4x/preact-<pkg>`.

| Concept | Library | Status | Export (package) | What is missing |
| --- | --- | --- | --- | --- |
| Money as integer minor units | ts-libs | exists | `formatMoney`, `moneyDecimalString` (`platform/universal/money`) | Nothing for fiat. 18-decimal crypto (ETH) does not fit a safe integer. |
| ISO 4217 list with exponents | ts-libs | partial | `currencyDecimals` (money) | No list, names, symbols or validation. `Intl` accepts any 3 letters: `currencyDecimals("XYZ")` returns 2. |
| Currency formatting | ts-libs | partial | `formatMoney`, `formatMoneyParts` (money) | Options are only `decimals`: no `signDisplay` (`+€12`), no compact (`€24K`). |
| Parsing a typed amount | ts-libs | partial | `parseMoney` (money) | `"1 234,56"` (fr), `"-12.5"` work. `"€12"`, `"12 EUR"`, `"(12.50)"`, `"12.50-"` are refused. |
| Safe arithmetic, allocation | ts-libs | missing | — | `sumMoney`, `allocate`, `splitEvenly`, rounding modes. |
| Conversion with rate date and rounding | ts-libs | missing | — | `ExchangeRate`, `convertMoney`, `crossRate`, `rateOn`. |
| Exchange-rate provider client | ts-libs | missing | — | Nothing. Old Financy has its own ExchangeRate-API and Fixer clients (`apps/api/services/exchange-rate-provider.ts`). |
| Date ranges and periods | both | partial | `DateRange`, `startOfMonth`…`endOfYear`, `startOfWeek`, `shiftMonth` (`time/date`); `rangeForPreset` (`preact-ui`); `previousPeriod` (`preact-charts`) | No month starting on day N (the salary month), no stepping or listing periods, no period label. Open: ts-libs#691 moves `rangeForPreset` into `@spy4x/time` (p4-low). |
| Repeat rules (RRULE) | ts-libs | partial | `parseRrule`, `formatRrule`, `nextOccurrence`, `describeRrule` (`time/rrule`) | No occurrences in a range. Description is English only. |
| CSV writing | ts-libs | exists | `toCsvText`, `toCsvBytes`, `downloadCsv` (`platform/universal/csv`, `platform/browser`) | — |
| CSV parsing | ts-libs | missing | — | Parse, guess the delimiter and header, decode a file's text encoding, size limits. |
| Dates and numbers in imported columns | ts-libs | missing | `normalizeCalendarDate` reads only `YYYY.MM.DD` and `YYYY-MM-DD` | Guess and parse `DD.MM.YYYY` / `MM/DD/YYYY`, guess the decimal mark of a column. |
| Bank formats (OFX, QIF, CAMT.053, MT940) | ts-libs | missing | `parseXml` exists, but in `@spy4x/caldav/xml` | All four parsers. |
| Dedup / fingerprint of imported rows | ts-libs | partial | `sha256Hex` (`platform/tokens`), `similarity`, `levenshtein` (`platform/universal/text`), `fingerprint` (`server/idempotency`) | The hashing parts exist. The match rule (same amount, date ± n days, similar payee) is Financy's. |
| Number and date format per person | both | partial | `FormatSettings`, `createFormatters` (`time/format`); `FormatContext`, `useFormat` (`preact-ui`) | `Formatters` has `number()` but no `money()`. `MoneyDisplay` and `MoneyInput` use the interface language instead of the person's region format. |
| Forgiving search (aliases, typo, layout, Cyrillic/Latin) | ts-libs | exists | `searchEntries`, `matchEntry` (`platform/universal/text`) | — |
| Sort rules | ts-libs | exists | `sortRows`, `toggleSort`, `parseSort` (`platform/universal/sort`) | — |
| Amount input | UI | partial | `MoneyInput` (`preact-ui`) | No currency shown in the field, no `decimals` (crypto), no pasting `"€12"`, locale from the interface language. |
| Currency picker | UI | missing | — | A searchable field over a currency list. |
| Account / category picker with search and tree | UI | partial | `Combobox` (`preact-ui`) | Substring match only, no groups, no "Create …" row, no tree. |
| Colour picker | UI | exists | `ColorField`, `COLOR_PRESETS`, `SwatchChips` (`preact-ui`) | — |
| Icon picker | UI | missing | 126 fixed icon components (`preact-icons`) | No name registry, no picker, few spending-category icons (no cart, food, car, plane, gift, health). |
| Date range picker | UI | partial | `DateRangePicker` (`preact-ui`) | No week presets, no ‹ › stepping, no month starting on day N. Open: #980, #981. |
| Line chart | UI | exists | `LineChart` (`preact-charts`) | Several series, `yFormat` takes `formatMoney`. Parked bugs: #708. |
| Horizontal, stacked bars with a target | UI | exists | `Bars`, `StackedBarDatum`, `BarReference`, `RankedBars` (`preact-charts`) | No negative values (`barPercent` clamps to 0–100). |
| Columns over time (vertical, negative) | UI | missing | — | Income vs. spending per month, a net bar below zero. |
| Donut | UI | exists | `DonutChart` (`preact-charts`) | — |
| Sparkline | UI | missing | — | A tiny trend line for a KPI or an account row. |
| KPI cards | UI | exists | `Kpi`, `KpiGrid`, `changeText` (`preact-charts`); `WidgetStat` (`preact-ui`) | — |
| Budget progress bar | UI | partial | `Progress` (`preact-ui`) | Over 100 % is clamped, so "€12 over" cannot show. No "left" / "over" text, no tone that changes by itself. |
| Data table with sorting | UI | partial | `DataTable`, `Table` (`preact-ui`) | Sort and paging exist. No totals row, no row selection. |
| Virtualised list | UI | missing | — | Only paging (`Pagination`, `createKeysetCursorCodec`). |
| Empty states | UI | exists | `EmptyState`, `ErrorState` (`preact-ui`) | Open: #1103 (border too faint). |
| Money display with sign colour | UI | partial | `MoneyDisplay` (`preact-ui`) | Only `colorNegative` (red, 4.33:1, #776). No green income, no `+` sign, no "about", no compact. |
| Command palette | UI | exists | `CommandPalette` (`preact-ui`) | Launcher mode is open in #878 (p3). |
| CSV import column mapping | UI | missing | — | Map file columns to fields with a preview. |
| File picker with drop zone | UI | exists | `FileInput` (`preact-ui`) | — |

## Library issues, in the order Financy needs them

Order follows the MVP list in `product.md`. Items 1–9 block MVP features, 10–11 make them better,
and 12–16 are for phase 2 and later. Every item passes the test "a future non-finance project would use it",
except where marked. Signatures are sketches: names and shapes, not final.

### 1. ts-libs: currencies, safe sums, conversion (`@spy4x/platform/universal/money`)

Blocks: accounts in any currency, the household total, a transfer between currencies.

```ts
function currencyCodes(): string[]                    // Intl.supportedValuesOf(`currency`)
function isCurrencyCode(code: string): boolean        // refuses `XYZ`
const currencyCode: Type<string>                      // arktype, like `hexColor`
interface CurrencyOption { code: string; name: string; symbol: string; decimals: number; aliases: string[] }
interface CustomCurrency { code: string; name: string; decimals: number } // BTC, USDT
function currencyOptions(displayLocale: string, extra?: readonly CustomCurrency[]): CurrencyOption[]
interface MoneyOptions { decimals?: number; signDisplay?: `auto` | `always` | `exceptZero`; notation?: `standard` | `compact`; allowSymbol?: boolean }
enum Rounding { HalfEven = 1, HalfUp, Down, Up }
function sumMoney(amounts: readonly number[]): number                  // throws past MAX_SAFE_INTEGER
function allocate(amount: number, weights: readonly number[]): number[] // largest remainder, sums exactly
function splitEvenly(amount: number, parts: number): number[]
interface ExchangeRate { base: string; quote: string; rate: string; date: string; source: string } // rate `"1.0856"`
function convertMoney(amount: number, rate: ExchangeRate, options?: { rounding?: Rounding } & MoneyOptions): number
function invertRate(rate: ExchangeRate, digits?: number): ExchangeRate
function crossRate(a: ExchangeRate, b: ExchangeRate): ExchangeRate       // USD→EUR + EUR→VND
function rateOn(rates: readonly ExchangeRate[], base: string, quote: string, date: string): ExchangeRate | undefined
```

The rate is a decimal string so `convertMoney` stays in `BigInt`, like `parseMoney` today.
Why other projects need it: Seed's catalog currency setting (`libs/domain/catalog/+lib.ts:81`
accepts `XYZ` today), a pricing page that shows local prices, invoice tax lines and seat
proration (`allocate`), and splitting a group bill.

### 2. preact-components: `CurrencyField`, and fixes to `MoneyInput` and `MoneyDisplay` (`preact-ui`)

Blocks: the account form, the five-second entry form, the totals. Needs 1.

```tsx
<CurrencyField value={code | null} onChange={(code) => void} options={CurrencyOption[]}
  recent?={readonly string[]} label="Currency" />  // Combobox, matched by code, name, symbol, aliases
// MoneyInput: + decimals?: number, + adornment?: `symbol` | `code` | `none`, paste `"€12"` via allowSymbol
// MoneyDisplay: + tone?: `none` | `negative` | `signed`, + signDisplay, + approximate?: boolean,
//   + notation?: `compact`, + decimals?: number
// Both: locale defaults to useFormat().locale (region format), not useT().language
```

Fold in #776 (negative-red contrast) or build on it. Why other projects need it: Seed's admin
catalog settings, and any SaaS that prices in more than one currency.

### 3. ts-libs: exchange-rate sources (`@spy4x/integrations/exchange-rates`, new subpath)

Blocks: "about €24,177 at today's rates" with the rate date. Needs 1's `ExchangeRate`.

```ts
interface ExchangeRateSource {
  id: string
  daily(date: string, base: string): Promise<Result<ExchangeRate[], RatesError>>
  between?(from: string, to: string, base: string): Promise<Result<ExchangeRate[], RatesError>>
}
function createFrankfurterRates(options: { baseUrl?: string; fetch?: typeof fetch }): ExchangeRateSource // ECB data, no key, self-hostable
function createOpenExchangeRates(options: { appId: string; fetch?: typeof fetch }): ExchangeRateSource   // wide coverage, keyed
function withFallback(...sources: ExchangeRateSource[]): ExchangeRateSource
```

Built on `@spy4x/net/safe-fetch` and the bounded body readers. ECB data covers about 30
currencies, without VND (the MVP's own example is a dong card), so a second source is needed.
Which one is a vendor choice: see "Questions" below. Storing and caching rates is Financy's.
Why other projects need it: any app that shows a price or a cost in the viewer's currency.

### 4. ts-libs: periods (`@spy4x/time/period`, new subpath)

Blocks: the this-month screen and each category's monthly limit.

```ts
enum PeriodUnit { Day = 1, Week, Month, Quarter, Year }
interface Period extends DateRange { unit: PeriodUnit }
interface PeriodOptions { firstWeekday?: number; monthStartDay?: number; yearStartMonth?: number }
function periodOf(date: string, unit: PeriodUnit, options?: PeriodOptions): Period // monthStartDay 25 → 25 Oct–24 Nov
function shiftPeriod(period: Period, by: number, options?: PeriodOptions): Period
function periodsIn(range: DateRange, unit: PeriodUnit, options?: PeriodOptions): Period[]
function periodLabel(period: Period, locale: string): string // "November 2026", "25 Oct – 24 Nov 2026"
```

ts-libs#691 (moving `rangeForPreset` into `@spy4x/time`) touches the same code. Do both in one
PR, or #691 right after. Why other projects need it: a subscription's billing period anchored on
its signup day, and Seed's admin stats per week and month.

### 5. preact-components: `UsageMeter` (`preact-ui`)

Blocks: "left in each limit" on the this-month screen.

```tsx
<UsageMeter used={number} limit={number} label="Groceries" format={(n: number) => string}
  warnAt?={0.8} />  // shows the overage past 100 %, "€40 left" / "€12 over", role="meter", aria-valuetext
```

Why other projects need it: Seed's storage quota (`@spy4x/server/quota`), plan seats, any usage
limit.

### 6. preact-components: `PeriodStepper` and more `DateRangePicker` presets (`preact-ui`)

Blocks: moving between months on the this-month screen. Needs 4.

```tsx
<PeriodStepper period={Period} onChange={(p: Period) => void} options?={PeriodOptions}
  label={(p) => string} />  // ‹ November 2026 ›, keys [ and ], no step past today unless allowed
// DateRangePicker: + `this-week`, `last-week` presets, + monthStartDay for month presets
```

Why other projects need it: every report or dashboard screen (Seed's admin stats and overview).

### 7. ts-libs: CSV parsing (`@spy4x/platform/universal/csv`)

Blocks: importing a bank statement.

```ts
interface CsvDialect { delimiter: `,` | `;` | `\t` | `|`; hasHeader: boolean }
function sniffCsv(sample: string): CsvDialect
function parseCsv(text: string, options?: Partial<CsvDialect> & { maxRows?: number; maxFieldLength?: number }):
  Result<{ header: string[] | null; rows: string[][] }, CsvParseError>
function decodeTextFile(bytes: Uint8Array, fallback?: `windows-1252` | `windows-1251`): { text: string; encoding: string }
```

The limits matter: the input is a file a person uploaded. Why other projects need it: importing
newsletter subscribers or catalog items in Seed, contacts in any client MVP.

### 8. ts-libs: guessing dates and amounts in imported columns (`@spy4x/time/date` and `money`)

Blocks: importing a bank statement. Needs 1 and 7.

```ts
type DatePattern = `YYYY-MM-DD` | `DD.MM.YYYY` | `DD/MM/YYYY` | `MM/DD/YYYY` | `DD.MM.YY` // …
function parseDateWithPattern(text: string, pattern: DatePattern): string | null // → YYYY-MM-DD
function detectDatePatterns(samples: readonly string[]): DatePattern[] // all that fit; several = ask
interface NumberFormatGuess { decimal: `.` | `,`; group: `` | `,` | `.` | ` ` | `'` }
function detectNumberFormat(samples: readonly string[]): NumberFormatGuess[]
function parseAmount(text: string, currency: string, format: NumberFormatGuess,
  options?: { negatives?: (`minus` | `parentheses` | `trailing-minus`)[] } & MoneyOptions):
  Result<number, ParseMoneyError>
```

Why other projects need it: any spreadsheet import with dates or prices.

### 9. preact-components: `ImportMapper` (`preact-ui`)

Blocks: the import screen. Needs 7 and 8.

```tsx
interface ImportField { key: string; label: string; required?: boolean; guess?: (header: string, samples: readonly string[]) => number }
type ColumnMap = Record<string, number | null> // field key → column index
<ImportMapper header={string[] | null} rows={readonly string[][]} fields={readonly ImportField[]}
  value={ColumnMap} onChange={(map: ColumnMap) => void} settings={ImportSettings}
  onSettingsChange={…} preview={(row: string[]) => ComponentChildren} />
// settings shows the guessed delimiter, date pattern and number format, each one changeable
```

Why other projects need it: the same imports as 7.

### 10. preact-components: `IconPicker` and category icons (`preact-icons`, `preact-ui`)

Better categories in the MVP; not a blocker.

```tsx
const ICONS: Readonly<Record<IconName, ComponentType<IconProps>>> // `@spy4x/preact-icons/registry`, separate entry
<IconPicker value={IconName | null} onChange={(name) => void} icons={readonly IconName[]}
  aliases?={Partial<Record<IconName, string[]>>} label="Icon" />
// new icons: cart, shopping-bag, receipt, banknotes, bank, car, plane, home, bolt, phone, heart,
// gift, academic-cap, food, paw
```

Fix #111 (icons published without their licence notices, p2-high) first or together. Why other
projects need it: task lists, note folders, Seed groups, anything a person labels.

### 11. preact-components: `Combobox` groups, forgiving search, "Create …" (`preact-ui`)

Better pickers in the MVP: accounts grouped by owner or currency, a new category created from the
entry form.

```tsx
// Combobox props: + groupOf?: (item: T) => string
//   + aliasesOf?: (item: T) => readonly string[]   // default filter becomes searchEntries
//   + onCreate?: (query: string) => void, createLabel?: (query: string) => string
```

Why other projects need it: every picker: time zones by region, people by team.

### 12. preact-charts: `Columns` and `Sparkline` (phase 2: yearly report)

```tsx
<Columns data={readonly ColumnDatum[]} stacked?={boolean} yFormat={(n) => string}
  reference?={BarReference} title="…" />  // vertical bars on a category or time axis, negatives below zero
<Sparkline points={readonly (number | null)[]} label="Balance, last 30 days" />
```

Mind #1154 (inline styles under a strict CSP) and the parked chart bugs in #708. Why other
projects need it: signups or revenue per month, refunds as negative bars, a trend on a KPI card.

### 13. ts-libs: repeat rules in a range, in every language (`@spy4x/time/rrule`, phase 2)

```ts
function occurrencesBetween(rule: Rrule, options: { start: IcalDateValue; from: Date; to: Date; timeZone?: string; limit?: number }):
  RruleResult<IcalDateValue[]>
function describeRrule(rule: Rrule, translator?: Translator): string // catalogs via platform/universal/i18n
```

Why other projects need it: the calendar view of caldav-tasks-web, mig's repeating meetings.

### 14. preact-components: `DataTable` totals and selection (phase 2)

```tsx
// DataTable props: + footer?: Partial<Record<K, ComponentChildren>>   // a totals row
//   + selection?: { selected: ReadonlySet<string>; onChange(next: ReadonlySet<string>): void; rowId(row: T): string }
```

Why other projects need it: bulk actions in Seed's admin lists.

### 15. preact-components: `VirtualList` (later, when lists outgrow paging)

```tsx
<VirtualList items={readonly T[]} itemHeight={number | ((item: T) => number)}
  renderItem={(item: T, index: number) => ComponentChildren} label="Transactions" />
```

Why other projects need it: audit logs and long admin lists. Paging and month grouping carry the
MVP, so this waits.

### 16. ts-libs: bank statement formats (`@spy4x/bank-statements`, new package, phase 2–3)

```ts
interface StatementRow { date: string; amount: number; currency: string; payee?: string; memo?: string; reference?: string; balance?: number }
function parseOfx(text: string): Result<StatementRow[], StatementError>
function parseQif(text: string, format: NumberFormatGuess, datePattern: DatePattern): Result<StatementRow[], StatementError>
function parseCamt053(xml: string): Result<StatementRow[], StatementError>
function parseMt940(text: string): Result<StatementRow[], StatementError>
```

Borderline. The only future users are a bookkeeping or invoice-reconciliation product or client
MVP. ts-libs' AGENTS.md welcomes a domain package named for its domain, so it belongs there, but
not before CSV import ships. `parseXml` lives in `@spy4x/caldav/xml` today. CAMT.053 needs it
outside the CalDAV package.

### Stays in Financy

These pieces pass no other project's test: the duplicate rule for imported rows (built from
`sha256Hex` and `similarity`), the transfer that records sent and received amounts, account
balances, budget limits and rollover, default categories, and storing and caching daily rates.
The "about … at today's rates" wording also stays.

## Questions and side findings for the lead

- **Vendor choice (needs-decision on item 3):** a source that covers VND. Candidates:
  openexchangerates.org (free tier, 1,000 requests a month, key) and exchangerate-api.com
  (1,500 a month, key; old Financy used it, with Fixer as fallback). Both have capped free tiers.
- **Crypto precision:** old Financy supports crypto (`libs/shared/types/currency.ts`, `type:
  "fiat" | "crypto"`). A safe-integer amount holds 8 decimals (BTC) but not 18 (1 ETH = 10^18 wei,
  above `MAX_SAFE_INTEGER`). Either cap crypto at 8 to 9 decimals or move amounts to `bigint`. The
  owner decides; it changes the money API.
- **Seed:** `parseCatalogCurrency` (`libs/domain/catalog/+lib.ts:81-90`) accepts `XYZ` because
  `Intl.NumberFormat` formats any well-formed code (checked: `Intl.supportedValuesOf("currency")`
  has 159 codes, without `XYZ`). Seed should use `isCurrencyCode` once item 1 ships.
- **Region format vs. language:** `MoneyDisplay` and `MoneyInput` take their locale from
  `useT().language` (`ui/money-input.tsx:241`), while `OnDay` uses the person's region format
  from `FormatContext`. A person with an English interface and a German region format sees German
  dates and English amounts, and typing `12,50` fails. The docs describe it, so this is a design
  gap, covered in item 2.
- **Open issues to build on, not duplicate:** ts-libs#691; preact-components #776, #878, #980,
  #981, #1103, #1154, #708, #111.
