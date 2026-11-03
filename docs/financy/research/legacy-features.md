# Financy before the rebuild: what it does and the rules it encodes

This file describes what the old Financy product does, so the rebuild on Seed can keep the
behaviour and drop the code. It was written on 2026-11-03 from the `financy` checkout at commit
`bd3b956` (2026-10-20), by reading its docs, migrations, API handlers, shared helpers and web
screens. Nothing here proposes porting a file. The owner said on 2026-11-03 that the old code
should never be taken blindly: it "was implemented using outdated AI models and the code is
probably shit and full of bugs". Paths below are relative to the `financy` repository root.

Status words:

- **Built**: a person can do it today, end to end.
- **Partly**: some layers exist (a table, a handler or a screen) but a person cannot finish the
  job, or it works with a defect that changes the numbers.
- **Planned**: only the docs describe it.

Where it belongs follows Financy's `AGENTS.md` order (ts-libs, then Seed, then Financy):

- **Seed**: anything any product needs (sign-in, groups, members, roles, sync, notifications,
  the Telegram bot itself).
- **ts-libs**: code with no UI that another project could use (money maths, rate maths).
- **preact-components**: generic UI (an amount input, a meter, charts).
- **Financy**: the finance domain itself.

## 1. Feature inventory

### Accounts and access

| #  | What a person can do                                   | Status  | Evidence                                                                     | Home           |
| -- | ------------------------------------------------------ | ------- | ---------------------------------------------------------------------------- | -------------- |
| A1 | Sign up and sign in with a username and password       | Built   | `apps/api/services/auth/password.ts`; e2e notes in `DASHBOARD_ISSUES.md:121` | Seed           |
| A2 | Turn on two-factor sign-in with an authenticator app   | Built   | `apps/web/src/routes/profile/page.tsx:40-60`, `apps/api/services/auth/totp.ts` | Seed         |
| A3 | Change the password                                    | Built   | `apps/web/src/routes/profile/page.tsx:18-19`                                 | Seed           |
| A4 | Reset a forgotten password                             | Planned | `README.md`, `docs/roadmap.md` "Account Recovery"                            | Seed           |
| A5 | Sign up or sign in from Telegram with `/start`         | Built   | `apps/api/services/auth/telegram.ts:49-160`                                  | Seed           |
| A6 | Link Telegram to an existing account with a code       | Built   | `apps/api/services/auth/telegram.ts:194-300`; profile page                   | Seed           |
| A7 | Choose a light, dark or system theme                   | Built   | `libs/server/db/schema.sql:277-283`                                          | Seed           |
| A8 | Receive push notifications                             | Partly  | Subscribing works; nothing calls `send` (`apps/api/services/webPush.ts:132`) | Seed sends; Financy decides when |

### Groups and members

| #  | What a person can do                                         | Status  | Evidence                                                                  | Home    |
| -- | ------------------------------------------------------------ | ------- | ------------------------------------------------------------------------- | ------- |
| G1 | Create, rename, delete and restore a group                   | Built   | `apps/api/cqrs/command-handlers/group-{create,update,delete,undelete}.ts` | Seed    |
| G2 | Give a group a base currency and a default account           | Built   | `libs/server/db/schema.sql:246-249`                                       | Financy |
| G3 | Switch between groups                                        | Built   | `user_settings.selected_group_id`, `schema.sql:280`                       | Seed    |
| G4 | Invite members, change their roles, remove them, hand over ownership | Planned | `docs/roadmap.md` "Member Invitations"; no member screen in `apps/web/src/routes/groups/` | Seed |
| G5 | Rely on roles: a viewer only reads, an editor writes         | Partly  | Only `group-update.ts:25` and `group-delete.ts`/`group-undelete.ts:25` check a role | Seed shape, Financy handlers |
| G6 | Share one account between several groups                     | Planned | `docs/2.features.md` "Accounts across Groups"                             | Financy, if kept |

### Money

| #   | What a person can do                                                         | Status  | Evidence                                                                 | Home    |
| --- | ---------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------ | ------- |
| M1  | Create, edit, archive and restore accounts, each with a currency and a starting balance | Built | `apps/api/cqrs/command-handlers/account-*.ts`                 | Financy |
| M2  | See each account's current balance                                           | Built   | `libs/shared/helpers/account-balance.ts:9-17` (computed in the browser)  | Financy |
| M3  | Record an expense or income: amount, account, category, memo, time           | Built   | `apps/api/cqrs/command-handlers/transaction-create.ts`                   | Financy |
| M4  | Record a purchase made in another currency and correct what the bank charged | Built   | `apps/web/src/components/ui/EnhancedMultiCurrencyInput.tsx:288-302`      | Financy; the amount input in preact-components |
| M5  | Edit, delete and restore a transaction; a transfer's two legs go together    | Built   | `transaction-delete.ts:40-56`, `transaction-undelete.ts:43-56`           | Financy |
| M6  | Move money between two accounts, also across currencies                      | Partly  | Works, but uses today's rate and drops the date (section 4, items 5 and 6) | Financy |
| M7  | Search and filter transactions by text, account, category, currency, type, status and dates, kept in the URL | Built | `apps/web/src/routes/transactions/list.tsx:18-110` | Financy; filter bar from preact-components |
| M8  | Keep expense and income categories with an icon and a colour                 | Built   | `apps/api/cqrs/command-handlers/category-*.ts`, `schema.sql:306-318`     | Financy |
| M9  | Set a monthly spending limit per expense category and watch a coloured bar   | Partly  | `apps/web/src/routes/dashboard/components/budget-progress-bars.tsx:17-60`; wrong period and mixed currencies | Financy; the meter from preact-components |
| M10 | Tag transactions                                                             | Partly  | Tables only, tags are global (`schema.sql:151-153`); no screen           | Financy |
| M11 | Start with a ready "Personal" group, two USD accounts and 12 categories with limits | Built | `apps/api/cqrs/event-handlers/seed-preset-entities-on-user-signed-up.ts:13-120` | Financy, on Seed's sign-up event |

### Dashboard and reports

| #  | What a person can do                                                       | Status  | Evidence                                                         | Home    |
| -- | -------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------- | ------- |
| D1 | See total balance, income, expenses and net worth in the group's currency  | Built   | `routes/dashboard/components/financial-overview-cards.tsx:40-133` | Financy |
| D2 | Compare cash flow with the previous period                                 | Built   | `cash-flow-summary.tsx:52-132`                                   | Financy |
| D3 | See six months of income and spending                                      | Partly  | `monthly-spending-trends.tsx:14-37` adds up different currencies | Financy; charts from `@spy4x/preact-charts` |
| D4 | See spending and income by category                                        | Partly  | `category-spending-breakdown.tsx:66`, `income-by-category-widget.tsx`; mixed currencies | Financy; donut and bars from preact-charts |
| D5 | See the largest transactions of the period                                 | Built   | `top-transactions-list.tsx`                                      | Financy |
| D6 | See each account's balance and its change over the period                  | Built   | `account-balances-overview.tsx:9-61`                             | Financy |
| D7 | See current exchange rates for the group's currencies                      | Built   | `exchange-rate-widget.tsx`                                       | Financy |
| D8 | Pick the period: this or last month, quarter or year, last 30 days, last 12 months, custom | Built | `apps/web/src/state/dashboard.ts:31-150` | Financy; date maths in preact-charts `DateRange` |
| D9 | Read monthly and yearly reports, set and track goals                       | Planned | `docs/roadmap.md` "Advanced Reports", "Goal Setting"             | Financy |

All dashboard paths above are under `apps/web/src/routes/dashboard/components/`.

### Exchange rates

| #  | What a person can do                                               | Status  | Evidence                                                                 | Home    |
| -- | ------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------ | ------- |
| X1 | Get rates fetched once a day, with a second provider as fallback   | Partly  | Production only: `apps/api/workers/exchange-rate-fetcher.ts:33-40,110-116`; `apps/api/services/exchange-rate-provider.ts:405-460` | Financy; the job runs on Seed's worker |
| X2 | Let an operator override a rate for a period                       | Partly  | Table and use at fetch time (`exchange-rate-provider.ts:497-516`); no screen | Financy admin |
| X3 | Be told when a rate moves 2, 5 or 10 percent                       | Partly  | Rows written (`exchange-rate-provider.ts:393-395,527-560`); never delivered | Financy |
| X4 | Use the rate of the day a transaction happened                     | Partly  | Rates are stored per date (`schema.sql:159-175`) but read without one    | Financy |
| X5 | Watch rates and provider usage on an admin page                    | Planned | `MULTI_CURRENCIES_FEATURE.md`                                            | Financy admin |

### Telegram

| #  | What a person can do                                          | Status  | Evidence                                                              | Home    |
| -- | ------------------------------------------------------------- | ------- | --------------------------------------------------------------------- | ------- |
| T1 | Open a menu with accounts, categories and the last 10 transactions | Built | `apps/api/handlers/telegram/updates.ts:318-336`                     | Financy commands on Seed's bot |
| T2 | Add an expense, an income or a transfer step by step          | Built   | `apps/api/services/telegram/transaction-wizard.ts:67-78,521-540` (`docs/telegram-bot.md` says no transfers; the code has them) | Financy |
| T3 | Read this month's totals in the chat                          | Partly  | `apps/api/cqrs/query-handlers/analytics.ts:25-56` mixes currencies and assumes USD | Financy |
| T4 | Type "Add $25 for McDonald's" and get a categorised entry     | Planned | `docs/2.features.md` section 3                                        | Financy |

### Platform

| #  | What a person can do                                         | Status  | Evidence                                                              | Home |
| -- | ------------------------------------------------------------ | ------- | --------------------------------------------------------------------- | ---- |
| P1 | See changes from other devices and members live              | Built   | WebSocket; every connect downloads everything (`apps/web/src/state/ws.ts:282`) | Seed |
| P2 | Install the web app on a phone                               | Built   | `apps/web/public/manifest.json`; the service worker only handles push (`sw.js:1-14`) | Seed |
| P3 | Read data and add transactions offline                       | Planned | `docs/1.principles.md` section 3; no fetch handler or local database  | Seed and the shared offline package |

### Planned only, from the docs

Each row is one feature that no code implements yet. Sources are `docs/2.features.md`,
`docs/roadmap.md` and Financy's `AGENTS.md`.

| #   | Feature                                                        | Home                       |
| --- | -------------------------------------------------------------- | -------------------------- |
| N1  | Import bank statements and CSV files                           | Financy                    |
| N2  | Export everything and restore it into new groups               | Seed (export), Financy (data) |
| N3  | Recurring transactions                                         | Financy                    |
| N4  | Transaction templates                                          | Financy                    |
| N5  | Bill reminders                                                 | Financy, on Seed's notifications |
| N6  | Split an expense between members                               | Financy                    |
| N7  | Track debts owed and lent                                      | Financy                    |
| N8  | Track investments and crypto holdings                          | Financy                    |
| N9  | Scan receipts                                                  | Financy                    |
| N10 | Public API with tokens                                         | Seed (tokens), Financy (endpoints) |
| N11 | History of who changed what                                    | Seed                       |
| N12 | Notify members when someone adds to a shared account           | Financy, on Seed's notifications |
| N13 | Several languages                                              | Seed                       |
| N14 | Keyboard shortcuts                                             | Seed and preact-components |
| N15 | Mobile apps                                                    | Seed                       |

**Counts.** Out of 61 features, 27 are built, 12 partly built and 22 planned only. "Built" means
a person can finish the job, not that the numbers are right: D1, D2 and M2 show correct maths
only when every account shares one currency (section 4).

## 2. Domain rules worth keeping

Each rule is written so a test can check it. "Old" says where the old docs or code state the rule
and whether the code kept it.

**R1. Money is a whole number of the currency's smallest unit.** 12.34 USD is stored as 1234, 500
JPY as 500, 1.234 BHD as 1234. Every write rejects a non-integer amount. Old: stated in
`docs/3.architecture.md` and `AGENTS.md`; the code accepts floats (`libs/shared/types/+index.ts:602-618`
types amounts as `number`, `apps/api/services/websockets.ts:900-935` accepts any number).

**R2. Each currency's exponent is a fixed value stored with the currency.** Fiat currencies use
the ISO 4217 minor unit: JPY 0, USD 2, BHD 3, ISK 0. Every format, parse and conversion takes the
exponent from that stored value and never from a default of 2 or from `Intl`. `Intl` disagrees
with ISO 4217 for at least RSD, YER, ALL, MGA, SYP, SOS, AFN, IRR, LAK, MMK, IQD and LBP (checked
in Deno 2.9.7), and an ICU update can change it, which would rescale stored amounts. ts-libs'
`@spy4x/platform/universal/money` takes a `decimals` option for this. Old: the column exists
(`schema.sql:135`), but `libs/shared/helpers/format.ts:84-130` divides by 100 for every
currency, the Telegram wizard multiplies by 100 (`transaction-wizard.ts:460`), and the seed data
gives ISK 2 decimals (`libs/server/db/migrations/2025_06_28_1400_currencies_table.sql:68`).

**R3. Every stored amount fits.** Postgres stores money as `BIGINT`, and code keeps it within
`Number.MAX_SAFE_INTEGER` or uses `BigInt`. A currency whose exponent would overflow that range
(ETH at 18 decimals, SHIB) is either stored at a capped exponent or not offered. Old: `INT4`
everywhere (`schema.sql:295,334,336`), which caps a USD account near 21 million dollars, a BTC
account at 21.47 BTC and an IDR account near 1,300 dollars' worth.

**R4. A transaction keeps two facts: what moved in the account, and what was paid.** The account
amount is in the account's currency. When the payment was in another currency, the original
amount and currency are kept too. Both are what the person stated, so a later rate never changes
either. The rate is derived (account amount divided by original amount) and is shown, not
stored separately. When the person gives only the original amount, the server fills the account
amount from the rate of the transaction's date (R6) and the person can correct it. Old: the rule
is in `AGENTS.md` and `MULTI_CURRENCIES_FEATURE.md`; the screen follows it
(`EnhancedMultiCurrencyInput.tsx:288-302`); the server accepts both amounts without checking that
they are integers of the right exponent.

**R5. The sign follows the kind.** An expense and a transfer's source leg are negative; an income
and a transfer's destination leg are positive. The server sets the sign; the client cannot.
Old: kept (`transaction-create.ts:23-45`), but `TransactionUtils.getDirectionFromType` defaults
a transfer to money out, so a single transfer leg could only be outgoing.

**R6. Every conversion names the date of its rate.** A conversion for a transaction uses the rate
for the transaction's date, or the latest earlier date when that day has none. A total for
"today" uses today's rate. The rate's date and source are shown next to any converted figure.
Old: rates are stored per day (`schema.sql:159-175`) but every reader takes the newest one, and
transfers ignore their date (`account-transfer.ts:101,146-166`).

**R7. Rates pivot on USD.** The provider gives "1 USD = x units" per day. A cross rate from A to
B on a day is `rate(USD→B) / rate(USD→A)` for that same day; an inverse is `1 / rate`. Rates are
kept as decimals (`NUMERIC`, or a decimal string in code) and converted once, rounding at the
end with one rule used everywhere. Old: USD pivot kept; two different implementations exist
(`libs/shared/helpers/currency.ts` and `currency-converter.ts`); the server reads rates through
`parseFloat` (`apps/api/services/db.ts:694-706`).

**R8. A missing rate is visible.** A total that cannot convert an amount says which currency has
no rate. It never adds zero for it. Old: amounts without a rate are silently left out
(`financial-overview-cards.tsx:43-44`, `cash-flow-summary.tsx:72-73`).

**R9. An account's balance is derived.** Balance = starting balance + the sum of its non-deleted
transactions, in the account's currency. The balance on day D counts transactions that happened
on or before the end of D in the group's timezone (R14). A group total converts each account
balance to the group's currency at the rate of D (R6). Old: the same formula
(`account-balance.ts:9-38`), computed in the browser over the full transaction list.

**R10. An account's currency is fixed once it has a transaction.** Changing it would reinterpret
every stored amount. Old: the server allows it (`account-update.ts:17-35`); the editor only warns
(`apps/web/src/routes/accounts/editor.tsx:37-60`).

**R11. A transfer is one action with two legs.** These hold together:

- The two accounts differ and belong to the same group.
- Each leg is in its own account's currency: the source leg is minus the sent amount, the
  destination leg plus the received amount.
- Both legs share one occurrence time and one memo.
- Neither leg has a category, and transfers count in no income or expense figure.
- In one currency the group's total does not change; across currencies it changes only by the
  rate difference.
- Creating, editing, deleting and restoring always touch both legs in one database transaction.
- A transfer cannot exist with one leg, and only the server sets the link between legs.
- Editing the sent amount recomputes the received amount in the destination currency, unless
  the person states it.

Old: stated in `docs/features/transfer-accounting-overview.md`; the code breaks the last three
points (section 4).

**R12. A category is either for expenses or for income.** An expense takes an expense category,
an income takes an income category, and a transfer takes none. Only expense categories have a
monthly limit. Old: kept (`docs/features/income-categories-*.md`, the `transfer_logic_check` at
`schema.sql:346-349`). Open question for the owner: a refund is money in to an expense category.
The old rules forbid it, so a refund must be booked as income and inflates income.

**R13. Categories are flat.** The old product has no parent category, in schema or docs. If the
rebuild adds one, a parent's spending and limit include its children, and a child's kind equals
its parent's. Old: no hierarchy (`schema.sql:306-318`).

**R14. Months and days are cut in the group's timezone.** A transaction stores the instant it
happened. "This month", "today", budgets and reports use the group's timezone, a group setting,
so every member, the server and the Telegram bot see the same month. Old: no timezone is stored
(`schema.sql:277-283`). The browser cuts months in its own zone (`apps/web/src/state/dashboard.ts:31-150`),
and the Telegram summary in the server process's zone (`analytics.ts:26-28`), so a 23:30
expense in Singapore lands in a different month for a member in Berlin.

**R15. A monthly limit is compared with that calendar month.** Spent = the sum of expenses in
the category during the month (R14), converted to the limit's currency at each transaction's
rate (R6). The limit stores its own currency. The bar is green below 80 percent, yellow from 80
to 95, orange from 95 to 100, red above 100 (`docs/features/budget-progress-bars.md`). There is
no rollover. Old: compared with whatever period the dashboard shows, a year included
(`budget-progress-bars.tsx:17-32`); adds raw amounts of different currencies (line 56); the
limit's currency is implicit (`schema.sql:311`).

**R16. Roles decide what a member may do.** Viewer reads; editor adds, edits and deletes
transactions, accounts and categories; admin manages members; owner can delete the group and
hand it over, staying an admin (`docs/2.features.md` section 2). A removed member loses all
access at once. Old: stated in `libs/shared/types/+index.ts:202-236`; never enforced outside the
group handlers.

**R17. Everything a record points at is in its group.** A transaction's account and category,
and a group's default account, belong to that group. Old: `transaction.verifyLegitimacy` checks
only that each belongs to some group of the user (`apps/api/services/db.ts:629-663`).

**R18. The server decides the derived fields.** The group (from the account), the sign (R5), the
transfer link (R11), the author and the converted amount when not given (R4) are set by the
server. Old: stated in `docs/1.principles.md` section 4; the client can set the link, the
account and the direction on update (`+index.ts:626-638`).

**R19. Most entries need only the amount.** The account, currency, time and category are
prefilled from the group's defaults (`docs/1.principles.md` section 3). This is the product's
main promise for quick entry and holds on the web, in Telegram and offline.

## 3. Data model sketch for the rebuild

Every row carries Seed's columns: a UUID version 7 `id`, `group_id` where scoped, `version`,
`created_at`, `updated_at`, `deleted_at` (`docs/aggregates.md` in Seed). The table lists only
what Financy adds. "Old got wrong" names what the old schema did that the rebuild should not.

| Entity | Scope | Key fields | Relations | Old got wrong |
| --- | --- | --- | --- | --- |
| Currency | Global reference data | `code` (3 letters, ISO 4217 for fiat), `kind` (fiat or crypto), `exponent`, `name` | none | `code` was `VARCHAR(10)`; ISK exponent 2; HRK still listed; ETH 8 instead of 18; deleting a currency cascades to groups, accounts and transactions (`schema.sql:249,294`) |
| Exchange rate | Global | `base` (USD), `quote`, `rate` (`NUMERIC`), `rate_date`, `source`, `fetched_at`; unique on base, quote, date, source | currency | no `source`; overrides overwrite the fetched row (`exchange-rate-provider.ts:497-522`) |
| Rate override | Global, operator only | pair, `rate`, `valid_from`, `valid_until`, `reason`, operator | currency, Seed user | applied by rewriting history instead of at read time |
| Group finance settings | Per group (Seed owns the group) | `base_currency`, `timezone`, `default_account_id` | account | no timezone; `user_settings` held the selected group only |
| Account | Group | `name`, `currency` (fixed after the first transaction), `starting_balance` (`BIGINT`), `kind` if wanted (cash, card, savings) | currency | `INT4` balance; currency change allowed |
| Category | Group | `name`, `kind` (expense or income), `icon`, `color`, optional `parent_id` (R13) | category | the limit lived on the category with no currency; a hard delete cascades to transactions (`schema.sql:337`) |
| Budget | Group | `category_id`, `amount` (`BIGINT`), `currency`, `period` (month) | category | had no entity: changing a limit silently changed every past month's bar. Keeping the limit on the category is the smaller option; then the limit needs its currency |
| Transaction | Group | `account_id`, `kind` (expense, income, transfer), `amount` (`BIGINT`, signed, account currency), `original_amount` and `original_currency` (always filled; equal to the account's when same), `category_id` (null only for transfers), `memo` (up to 500 characters), `occurred_at` (instant), `created_by`, `transfer_id` | account, category, transfer, Seed user | `INT4` amounts; `original_currency` null meant "same", so every reader branched; `original_amount` 0 on a transfer's source leg |
| Transfer | Group | `id` shared by both legs (server-set, unique), and the rate and its date when currencies differ | two transactions | link was a random 10-character string, not unique, writable by the client; the rate used was not stored |
| Tag | Group | `name`, unique within the group | transaction tags | global table with a globally unique name, sent to every connected user (`schema.sql:151-153`) |
| Transaction tag | Group | `transaction_id`, `tag_id` | transaction, tag | none beyond the global tag |

Seed already owns users, sessions, two-factor keys, Telegram links, push subscriptions, groups,
memberships and roles. The old schema put a global `role` and `mfa` on `users` and let a user
update them (section 4, item 10); the rebuild keeps them out of Financy entirely.

Offline: the rebuild's default is offline-readable (Seed's level 2) for accounts, categories,
transactions and rates, and offline-writable (level 3) for adding a transaction, since the old
principles promise offline entry (`docs/1.principles.md` section 3).

**Importing the old database.** Financy's `AGENTS.md` says production data is real, so the
rebuild needs a one-time import from the old schema. It has to map integer ids to new UUID
version 7 ids, widen amounts to `BIGINT`, rescale amounts stored with a wrong exponent (ISK
amounts are in hundredths), turn the global tags into per-group tags, fill `original_*` where it
was null, replace `linked_transaction_code` pairs with a transfer id, and set each group's
timezone (the old `TIMEZONE` env value is the only hint). Pairs whose code matches more or fewer
than two legs need a report, not a guess.

## 4. Defects and smells not to repeat

Each item names the rule it teaches. All were confirmed by reading the code at `bd3b956`.

1. **Amounts shown 100 times too large or too small.** The format helpers in
   `libs/shared/helpers/format.ts:84-130` divide by 100 for every currency, the budget bar uses
   them (`apps/web/src/components/ui/BudgetProgress.tsx:22-66`), and the Telegram wizard
   multiplies by 100 (`transaction-wizard.ts:460`). `DASHBOARD_ISSUES.md` records ¥100,000 shown
   as ¥10,000,000 and $5,000 shown as $50, while the helpers' unit tests passed. Rule: one money
   module (ts-libs) takes the exponent on every call (R2), and a test enters JPY, USD and BHD
   amounts through the real screen and reads them back.
2. **Widgets add yen to dollars.** Trends, category breakdown, budget bars and the Telegram
   summary sum `txn.amount` across accounts without converting
   (`monthly-spending-trends.tsx:25-37`, `category-spending-breakdown.tsx:66`,
   `budget-progress-bars.tsx:56`, `analytics.ts:45-56`). One expense showed as -$9,049.77,
   $10,000 and ¥1,000,000 on one screen (`DASHBOARD_ISSUES.md` issue 4). Rule: one aggregation
   function, shared by every widget, report and bot reply, tested with mixed currencies.
3. **A missing rate counts as zero.** `financial-overview-cards.tsx:43-44` and
   `cash-flow-summary.tsx:72-73` skip what they cannot convert. Rule: R8.
4. **The monthly limit is checked against any period.** `budget-progress-bars.tsx:17-32` uses
   the dashboard's selected range, so "this year" compares a year's spending with one month's
   limit. Rule: R15.
5. **Transfers take today's rate and the current time.** `account-transfer.ts:101` ignores the
   conversion date, `:146-166` picks the newest rate, and the WebSocket dispatcher never passes
   the transfer's time (`apps/api/services/websockets.ts:900-935`), so every transfer is dated
   now. The rate used is not stored. Rule: R6 and R11.
6. **Editing a transfer copies the number, not the value.** `transaction-update.ts:108-130`
   writes the same minor-unit amount to the other leg, so changing a 100 USD leg makes the JPY
   leg ¥100. Rule: R11.
7. **A transfer can have one leg, and anyone can relink legs.** `transaction-create.ts:48-50`
   checks only access, so a single type-3 transaction is accepted; the update schema lets the
   client set `linkedTransactionCode`, `accountId` and `direction`
   (`libs/shared/types/+index.ts:626-638`). Rule: R11 and R18.
8. **Viewers can write, and removed members still can.** Only the group handlers check a role;
   `GroupRoleUtils.canEdit` is never called (`+index.ts:202-236`). The membership lookup used
   for writes ignores `deleted_at` (`apps/api/services/db.ts:346-354`). Rule: R16, with one
   authorization check per handler as Seed's notes aggregate does.
9. **Records can point into another group.** `db.ts:629-663` checks that the account and the
   category belong to some group of the user, not to the transaction's group. Rule: R17.
10. **A user can make themselves an admin.** The user update validates with the full user schema
    (`websockets.ts:967`), so `role`, `mfa` and `deletedAt` pass through to `user-update.ts:17-20`.
    Rule: each command has its own input schema with only the fields a person may change.
11. **Tags leak between tenants.** Tag reads are unscoped (`db.ts:502-523`) and tag changes go to
    every connected user (`websockets.ts:1190-1196`). Rule: every finance entity is group-scoped;
    nothing is broadcast outside a group.
12. **Currency ids are guessed.** Code assumes USD is id 1 (`seed-preset-entities-on-user-signed-up.ts:16,116`,
    `analytics.ts:55`) or one of ids 1 to 3 (`libs/shared/helpers/currency.ts:55-58`). Rule:
    refer to currencies by ISO code.
13. **Deleting reference data destroys finance data.** `ON DELETE CASCADE` runs from currencies to
    groups and accounts, and from categories to transactions (`schema.sql:249,294,337`). Rule:
    reference data is never hard-deleted; foreign keys from finance rows restrict.
14. **Rates exist only in production.** The fetcher starts only when `isProd`, inside the API
    process, on a 24-hour `setInterval` (`exchange-rate-fetcher.ts:33-40,110-116`); development
    runs on rates hard-coded in a migration (`2025_07_04_1710`). Rule: the rate job is a scheduled
    worker job that runs in every environment, with a recorded fixture for tests.
15. **Sync always downloads everything.** `apps/web/src/state/ws.ts:282` sends a start sequence
    of 0 on every connect. Rule: use Seed's change sequence and pull (Seed's aggregates doc).
16. **Docs describe something else.** The roadmap lists automatic rates and the Telegram bot as
    not started; both exist. The transfer doc calls cross-currency transfers future work and
    describes reverted fields; the bot doc says it cannot transfer. Two `0`-line query handlers
    pretend to exist (`cqrs/query-handlers/currencies-get.ts`, `exchange-rates-get.ts`). Rule:
    docs describe current behaviour only, in the change that alters it.
17. **The Telegram link code is weak.** Six characters from `Math.random`, valid ten minutes
    (`apps/api/services/auth/telegram.ts:391-397`), and a correct guess links the guesser's chat
    to someone else's account. Seed owns linking now; its code should come from
    `crypto.getRandomValues` with an attempt limit.

## 5. Exchange-rate source and other external services

**Primary: exchangerate-api.com**, API version 6, `GET https://v6.exchangerate-api.com/v6/<key>/latest/USD`
(`apps/api/services/exchange-rate-provider.ts:50-58`). Variable: `EXCHANGE_RATE_API_KEY`. The
pricing page, read on 2026-11-03, lists Free at $0 for 1,500 requests a month with one update a
day, Pro at $10 a month for 30,000 requests updated hourly, and Business at $30 a month. Its terms
allow commercial use on the free plan but forbid using the data "in any product or service that
offers programmatic or automatic access to exchange rate data" and forbid redistributing it. Two
consequences for the rebuild:

- The planned public API and MCP server must not hand out rates from this provider.
- A self-hosted copy cannot ship the cloud's rates; each self-hoster brings a key.

Whether the free plan includes historical rates (needed to backfill R6) was not confirmed.

**Fallback: fixer.io through apilayer**, `https://api.apilayer.com/fixer`
(`exchange-rate-provider.ts:218-227`). Variable: `FIXER_IO_API_KEY`. The old docs give its free
tier as 100 requests a month; not re-checked.

**Old behaviour around the providers** (`exchange-rate-provider.ts:393-560`):

- Three tries with 2, 4 and 8 second waits, then the fallback provider.
- A rate is rejected unless it is positive and below 1,000,000.
- Each call is counted in `exchange_rate_api_usage`.
- Valkey caches rates for an hour.

Both providers' free tiers stop at their cap instead of billing, which fits the fixed-cost rule.
The European Central Bank's free daily reference rates (about 30 currencies) are worth comparing
before choosing; not checked here.

**Other services the old app uses**, variable names only, from `infra/envs/.env.example`:

| Service | Variables | Rebuild home |
| --- | --- | --- |
| Telegram bot | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET` | Seed |
| Web push | VAPID key pair read from the file at `config.vapidKeysPath` (`apps/api/services/webPush.ts:29`) | Seed |
| Sign-in secrets | `AUTH_COOKIE_SECRET`, `AUTH_PEPPER`, `AUTH_TOTP` | Seed |
| Database and cache | `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `KV_HOSTNAME`, `KV_PORT` | Seed |
| Backups to S3 | `S3_BUCKET_BACKUPS_NAME`, `S3_BUCKET_BACKUPS_DB_FOLDER`, `S3_BUCKET_BACKUPS_ACCESS_KEY_ID`, `S3_BUCKET_BACKUPS_SECRET_ACCESS_KEY`, `S3_BUCKET_BACKUPS_REGION`, `S3_BUCKET_BACKUPS_ENDPOINT` | Seed |
| Alerts to Slack | `SLACK_SYSTEM_URL` | Seed |
| DNS for certificates | `PROXY_CF_API_KEY` | Seed and the shared Traefik |
| Monitoring and storage | `GRAFANA_PASS`, `MINIO_USER`, `MINIO_PASS` | Shared monitoring |
| Server timezone | `TIMEZONE` | Replaced by the group timezone (R14) |
| Request limits | `RATE_LIMITER_WINDOW_MS`, `RATE_LIMITER_STRICT_LIMIT`, `RATE_LIMITER_LIMIT` | Seed |
