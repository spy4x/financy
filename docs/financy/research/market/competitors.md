# Financy competitors

Financy is a finance tracker for a person, a couple or a household. It is free to self-host
(AGPL-3.0) or paid in the cloud, works in any mix of currencies, works offline and syncs in real
time, and is built for expats first. This file compares it with the apps people would otherwise
use.

**How to read it.** Every page below was read on **2026-11-03**, so every link carries that date
unless a line says otherwise. GitHub numbers come from the GitHub API on the same day. Prices are as
the vendor's own page showed them, in the currency shown. A claim marked **unconfirmed** came from a
third-party site or a search snippet that I could not check on the vendor's own page.

## In short

- **The open-source field has two leaders, and neither does what Financy does.** Firefly III
  handles many currencies but cannot be shared without sharing one password. Actual Budget can be
  shared but does not support more than one currency.
- **Sure is the closest rival.** It is a fork of the shut-down Maybe Finance, also AGPL, with
  households and a $5-a-month hosted plan.
- **The paid US apps do not serve expats.** Monarch, Copilot and YNAB are built around US bank
  feeds and one currency.
- **The paid multi-currency apps are closed and mostly mobile-only.** Lunch Money, PocketSmith,
  Toshl, Wallet and Spendee charge more than Financy for households, and none can be self-hosted.

## The twelve most relevant

Comparison matrix. "Self-host" means the owner can run it on their own server. Prices are monthly
unless noted.

| App | Kind | Multi-currency | Household sharing | Offline | Self-host | Price (household) |
| --- | --- | --- | --- | --- | --- | --- |
| Firefly III | open source, web | yes, weak rates | no: one login per data set | no | yes | free |
| Actual Budget | open source, local-first | no (experimental PR open) | yes, needs an OpenID provider | yes | yes | free |
| Sure (Maybe fork) | open source + hosted | yes | yes (families, shared accounts) | no | yes | free, or $5–$9 hosted |
| ezBookkeeping | open source, PWA | yes, several rate sources | no (open request) | partial (PWA) | yes | free |
| Cashew | free mobile app | yes, automatic rates | no | yes (on device) | no | free |
| YNAB | paid web + mobile | no: one currency per budget | yes, up to 6 people | no | no | $14.99, or $109 a year |
| Monarch Money | paid web + mobile | no plans to expand (snippet) | not checked | no | no | $14.99, or $99.99 a year |
| Lunch Money | paid web + companion app | yes, 160+ currencies | not checked | no | no | $10, or $60–$100+ a year |
| PocketSmith | paid web + mobile | yes, every plan | yes, every plan | no | no | $9.99–$26.66 billed yearly |
| Toshl Finance | paid mobile + web | yes, built for it | not checked | yes (apps) | no | price not shown without JS |
| Wallet (BudgetBakers) | paid mobile + web | yes | yes | yes (apps) | no | around $5.99 (unconfirmed) |
| Zenmoney | paid mobile + web | yes | yes (family) | yes (apps) | no | varies by country (unconfirmed) |

### 1. Firefly III

- **What it is.** A self-hosted personal finance manager, web only, run by one main developer.
  Accounts, budgets, categories, piggy banks, rules and recurring transactions, with double-entry
  under the hood. Source: [GitHub](https://github.com/firefly-iii/firefly-iii).
- **Currencies.** Strong on paper: each data set (Firefly calls it an "administration") has a
  primary currency, and any transaction can carry a foreign amount. Weak in practice:
  - Rates download weekly, only for the built-in currencies, and Firefly keeps no history of them.
  - A missing rate counts as 1.
  - Source: docs pages
    [currencies](https://github.com/firefly-iii/docs/blob/main/docs/docs/explanation/financial-concepts/currencies.md)
    and
    [exchange rates](https://github.com/firefly-iii/docs/blob/main/docs/docs/explanation/financial-concepts/exchange-rates.md),
    read from the docs' GitHub source because docs.firefly-iii.org refused the request.
- **Sharing.** None. Each data set belongs to one user, and the docs tell couples to share the
  username and password. They call a sharing model a big project that will take a while. Source:
  [multi-user doc](https://github.com/firefly-iii/docs/blob/main/docs/docs/how-to/firefly-iii/features/multi-user.md).
- **Mobile and offline.** No official app; the server must be reachable. Mobile access is through
  third-party apps (Waterfly III on F-Droid).
- **Bank sync and import.** A separate Data Importer handles:
  - CSV and CAMT.053 files;
  - Enable Banking, SimpleFIN and Lunch Flow;
  - GoCardless, which the docs say Firefly is moving away from.
  Source:
  [providers doc](https://github.com/firefly-iii/docs/blob/main/docs/docs/how-to/data-importer/import/third-party-providers.md).
- **Price and licence.** Free; AGPL-3.0. The developer is not interested in turning it into a
  business, and the FAQ argues against hosting it for others. Source:
  [FAQ](https://github.com/firefly-iii/docs/blob/main/docs/docs/references/faq/firefly-iii/general.md).
  Managed hosting exists elsewhere: PikaPods runs it [from $2.66 a month](https://www.pikapods.com/apps/firefly-iii).
- **Activity.** 25,063 stars, v6.7.9 released 2026-10-11, 204 contributors.
- **Main complaints.**
  - Too complex for a partner.
  - No sharing.
  - No good mobile app.
  - Sources: HN threads [39392428](https://news.ycombinator.com/item?id=39392428) and
    [20916920](https://news.ycombinator.com/item?id=20916920); Lemmy users compare it with Actual
    as "for really detailed" use against Actual's simplicity.

### 2. Actual Budget

- **What it is.** Local-first envelope budgeting, the method YNAB uses. It runs in the browser or as a
  desktop app with an optional sync server. Source: [GitHub](https://github.com/actualbudget/actual).
- **Currencies.** Not supported. The docs say it is currency agnostic and offer a rule-template
  workaround ([docs](https://actualbudget.org/docs/budgeting/multi-currency)).
  - The request ["Budget Currency and Category Currencies" (#1132)](https://github.com/actualbudget/actual/issues/1132)
    has 347 reactions. It was closed in 2023 but is still one of the most-reacted.
  - **Watch this.** An open PR, ["[AI] Add multi-currency support (experimental)" (#9356)](https://github.com/actualbudget/actual/pull/9356),
    opened 2026-10-27, adds currencies behind a feature flag with a table of dated rates. If it
    merges, Financy's clearest edge over Actual narrows.
- **Sharing.** Several users per server, but only after setting up an OpenID provider
  ([docs](https://actualbudget.org/docs/config/multi-user)). That is a hurdle for a non-technical
  partner.
- **Offline.** Yes, local-first.
- **Bank sync.** Provider depends on the region:
  - SimpleFIN for North America;
  - Enable Banking for the EU (experimental);
  - GoCardless, which is closed to new accounts;
  - Akahu for New Zealand and Pluggy for Brazil.
  Source: [bank sync docs](https://actualbudget.org/docs/advanced/bank-sync).
- **Price and licence.** Free; MIT. PikaPods hosts it [from $2.00 a month](https://www.pikapods.com/apps/actual).
- **Activity.** 29,933 stars, v26.11.0 released 2026-11-02, 781 contributors. The healthiest
  project in the category.
- **Main complaints.**
  - Single currency.
  - Envelope budgeting is a method people must learn.
  - No native mobile app.

### 3. Sure (community fork of Maybe Finance)

- **What it is.** After Maybe Finance shut down, its community forked it. Sure is a net-worth and
  budgeting app with built-in AI, a Flutter mobile app and a desktop app. Source:
  [GitHub](https://github.com/we-promise/sure).
- **Currencies.** Yes, with rates from Frankfurter, but an open issue reports a fault:
  [missing rates silently convert at 1.0 (#2417)](https://github.com/we-promise/sure/issues/2417).
- **Sharing.** Yes. Its data model has families, invitations, shared accounts and shared budgets.
- **Bank sync.** The widest list in open source:
  - aggregators: Plaid, SimpleFIN, Enable Banking, Lunch Flow, Akahu, TrueLayer and SnapTrade;
  - direct links to Wise, Monobank, Up, Fio, Mercury and Brex;
  - brokers and crypto exchanges.
- **Price and licence.** Self-host free; AGPL-3.0. Hosted plans ([sure.am/pricing](https://sure.am/pricing)):
  - Free: no hosted bank sync, 90-day history.
  - "Better": $5 a month or $50 a year, "globally available in any currency".
  - "Best": $9 a month or $90 a year.
  - A full-refund policy.
  - The pricing page still showed lorem-ipsum placeholder text.
- **Activity.** 10,780 stars, v0.7.6 released 2026-10-31, 442 contributors, 460 open issues. It
  moves fast, and the repository is heavily AI-assisted.
- **Why it matters.** It is the nearest thing to Financy: AGPL, self-hosted or hosted, households,
  multiple currencies, and a lower top price. Google already suggests "firefly iii vs sure" and
  "actual budget vs sure".

### 4. ezBookkeeping

- **What it is.** A lightweight self-hosted bookkeeping PWA with 23 languages. Source:
  [GitHub](https://github.com/mayswind/ezbookkeeping).
- **Currencies.** Yes, with several exchange-rate sources to choose from.
- **Import.** The widest list found:
  - files from banks: CSV, Excel, OFX, QFX, QIF, IIF, CAMT.052 and .053, MT940;
  - files from other apps: GnuCash, Firefly III and Beancount.
  AI reads text and receipts, and it ships an MCP server.
- **Sharing.** None. The
  [request for shared accounts (#53)](https://github.com/mayswind/ezbookkeeping/issues/53) has
  32 reactions and has been open since 2025-02.
- **Price and licence.** Free; MIT. Runs on SQLite, MySQL or Postgres.
- **Activity.** 5,960 stars, v2.1.1 released 2026-10-23, 51 contributors.

### 5. Cashew

- **What it is.** A free, polished budgeting app for phones. Data stays on the device, with backup
  to Google Drive. Source:
  [Google Play](https://play.google.com/store/apps/details?id=com.budget.tracker_app&hl=en_US).
- **Currencies.** Yes, with automatic rates.
- **Sharing.** No real household mode.
- **Reach.** Rated 4.9 from about 28,000 reviews, 500K+ installs, updated 2026-10-16. This is the
  bar for "logs a coffee in five seconds".
- **Licence and activity.** GPL-3.0 with 4,774 stars, but only 3 contributors. The GitHub source
  lags the store: the last release there is 5.3.4 from 2024-07-01, and the last commit is from
  2026-03-09. Effectively one person.

### 6. YNAB (You Need A Budget)

- **What it is.** Paid zero-based budgeting, the reference product in the category. Source:
  [pricing](https://www.ynab.com/pricing).
- **Price.**
  - $14.99 a month or $109 a year, with a 34-day trial.
  - One subscription covers up to 6 people.
  - Third parties report the yearly price at $83.99 until 2021, then $98.99, then $99 and now $109.
    The steps in between are **unconfirmed**.
- **Currencies.** One per budget. YNAB's own guide suggests a separate budget per currency
  ([guide](https://support.ynab.com/en_us/using-multiple-currencies-in-ynab-a-guide-SyBF6PHno)).
  Google suggests "does ynab support multiple currencies" and "ynab multi currency plugin".
- **Bank sync.** US-centred, through Plaid and MX. Its
  [status page](https://ynabstatus.com/incidents/3zb33zvy9zwg) shows recurring incidents with
  those connections. In 2024 YNAB announced it would partly remove direct bank imports
  ([HN 39773819](https://news.ycombinator.com/item?id=39773819)).
- **Main complaints.** Price rises, one currency, and a method people must learn.

### 7. Monarch Money

- **What it is.** The main Mint successor in the US; its co-founder was Mint's original product
  manager ([HN](https://news.ycombinator.com/item?id=38114512)). Source:
  [pricing](https://www.monarch.com/pricing).
- **Price.**
  - $14.99 a month or $99.99 a year, with a money-back guarantee and a 30% off code.
  - A price-tracking site reports a rise of the top tier in May 2026
    ([CostBench](https://costbench.com/changelog/monarch-money-price-increase-2026-05/),
    **unconfirmed**).
- **Currencies.** Its help article "International Accounts and Currency" says there are no plans to
  expand currency support. I read this in a search snippet because the
  [page](https://help.monarch.com/hc/en-us/articles/360048393552-International-Accounts-and-Currency)
  refused the request, so it is **unconfirmed**. Google suggests "monarch money alternative for
  europe" and "monarch money uk alternative".
- **Sharing.** Not checked in this research.
- **Their comparison pages.** Monarch publishes pages only against US apps: YNAB, Mint, Simplifi
  and Credit Karma ([sitemap](https://www.monarch.com/sitemap.xml)).

### 8. Lunch Money

- **What it is.** A web-first budgeting app built by one founder, aimed at multi-currency users
  (digital nomads, expats, freelancers). Source:
  [multi-currency page](https://lunchmoney.app/features/multicurrency).
- **Currencies.** 160+ currencies, daily rates, and the historic rate stored for each transaction.
  This is the bar Financy must meet.
- **Price** ([pricing](https://lunchmoney.app/pricing)):
  - $10 a month, or a yearly price you choose (default $100).
  - The price is locked for life, with a 30-day trial.
  - Third-party reviews say the yearly minimum rose from $50 to $60 on 2026-03-15
    (**unconfirmed**).
- **Sync.** Plaid for the US, Canada and part of the EU. Third-party bridges (Synci, LumoSync)
  connect European banks through GoCardless.
- **Mobile.** The app is a companion to the web, not built for offline use.
- **Trust signals.** No investors, profitable within its first few years, founded in 2019
  ([about](https://lunchmoney.app/about/)). The founder's Show HN post was a multi-currency launch
  ([HN 20811287](https://news.ycombinator.com/item?id=20811287), 229 points).
- **Their comparison pages.** Lunch Money publishes pages against YNAB, Monarch, Actual Budget,
  Mint, Rocket Money, Simplifi, Empower, Credit Karma and QuickBooks Online
  ([lunchmoney.app/compare](https://lunchmoney.app/compare)).

### 9. PocketSmith

- **What it is.** Paid budgeting with cash-flow forecasting. Source:
  [plans](https://my.pocketsmith.com/plans).
- **Price.** USD, each plan with a yearly and a monthly price:

  | Plan | Billed yearly | Billed monthly | Bank connections |
  | --- | --- | --- | --- |
  | Foundation | $9.99 a month | $14.95 | 6, in 1 country |
  | Flourish | $16.66 a month | $24.95 | 18, all countries |
  | Fortune | $26.66 a month | $39.95 | unlimited |

  A free plan allows 2 accounts.
- **Currencies and sharing.** Every plan includes multiple currencies and collaborator access, and
  it connects 14,000+ banks. It is the strongest paid rival on features, at two to six times
  Financy's price for a household that wants bank feeds abroad.

### 10. Toshl Finance

- **What it is.** A mobile and web money app built for many currencies from the start.
  - It names expats directly.
  - Rates are fetched hourly, and any transaction can take a custom rate.
  - Source: [currencies page](https://toshl.com/currencies/).
- **Plans** ([pricing](https://toshl.com/pricing/)):
  - Free: 2 accounts, 2 budgets, CSV export.
  - Pro: manual entry plus file import of CSV, OFX, QFX, QIF and XLS.
  - Medici: adds bank sync.
  - A 30-day trial that needs a card.
- **Price.** **Unconfirmed**: the page renders prices with JavaScript. The only figure found is
  $1.99 a month or $19.99 a year, from a
  [2014 Toshl blog post](https://toshl.com/blog/the-road-to-2-0-toshl-pro-and-pricing-2/).
- **Why it matters.** It already makes Financy's main promise (any currency, expats) and has a
  ten-year head start on mobile. Financy must win on household sharing, self-hosting, offline web
  and price.

### 11. Wallet by BudgetBakers

- **What it is.** A popular mobile money app, sold for "personal and family
  finance", with bank sync and a separate bill-splitting app (ShareCost). Source:
  [budgetbakers.com](https://budgetbakers.com/).
- **Currencies.** Yes, 150+ currencies. One expat blog names it the best expat app, and notes that
  each currency needs its own account.
- **Price.** **Unconfirmed**: its pricing page returned 404. Third parties list:
  - about $5.99 a month or about $21.99 a year;
  - lifetime $29.99;
  - €17.99 a year in Germany.

### 12. Zenmoney

- **What it is.** A money app with family sharing, searched for in Russian (see below). It connects
  3,300 UK and EU banks through GoCardless. Source: [zenmoney.app](https://zenmoney.app/).
- **Price.** Varies by country (**unconfirmed**).
- **Why it matters.** Russian-speaking expats are a natural first audience for Financy, which ships
  in Russian. Google suggests "дзен мани альтернатива" ("Zenmoney alternative") and
  "zenmoney альтернатива google play". Its bank sync rests on GoCardless, which takes no new
  customers ([bank-sync.md](bank-sync.md)).

## The rest, one line each

Open source and self-hosted:

- **GnuCash**: desktop double-entry accounting, GPL; 4,394 stars, 5.17 released 2026-09-27, 620 contributors. Multi-currency, no sharing, no web.
- **Money Manager Ex**: desktop and Android, GPL-2.0; 2,279 stars, v1.9.4 released 2026-08-31.
- **HomeBank**: desktop, free software, multiple currencies, 28 years old ([site](http://gethomebank.org/en/index.php)).
- **KMyMoney**: KDE desktop double-entry; on KDE's own GitLab.
- **Beancount + Fava**: plain-text double-entry for programmers; GPL-2.0 and MIT; 6,146 and 2,601 stars. Strong on currencies, no partner-friendly entry.
- **hledger**: plain-text accounting, GPL-3; 4,810 stars, 1.52.4, 202 contributors.
- **Paisa**: plain-text ledger with a web UI, AGPL; 3,231 stars, v0.7.8, 10 contributors.
- **Ghostfolio**: investment portfolio tracker, AGPL, with a hosted premium plan; 9,644 stars, 3.97.0 released 2026-11-02. The premium price did not render; **unconfirmed**.
- **Wealthfolio**: desktop investment tracker, AGPL; 9,317 stars, v3.12.0.
- **OpenBudgeteer**: envelope budgeting, AGPL; 974 stars, 10 contributors.
- **Budget Board**: AGPL; 896 stars, v3.9.0, 11 contributors.
- **ExpenseOwl**: minimal expense tracker, MIT; 1,528 stars, last push 2025-10.
- **Kresus**: French, AGPL, pulls bank data by scraping through Woob ([kresus.org](https://kresus.org/en/)).
- **Wallos**: subscription tracker only, GPL-3; 8,783 stars. Not a budget app.
- **Maybe Finance**: AGPL, 54,202 stars, **archived 2025-07-27** after a pivot to B2B ([GitHub](https://github.com/maybe-finance/maybe)). Its rates service (Synth) closed with it. Sure is the fork.
- **Ivy Wallet**: Android, GPL-3; 3,185 stars, **unmaintained since 2024-11-05**, now archived.
- **Budget Zen**: archived; its author removed it from the awesome-privacy list in 2026-02.
- **PikaPods**: not an app but a rival to Financy's cloud. It hosts Actual [from $2.00 a month](https://www.pikapods.com/apps/actual) and Firefly III [from $2.66](https://www.pikapods.com/apps/firefly-iii).

Paid (prices from the vendor's page unless marked):

- **Copilot Money**: iPhone, iPad, Mac and web; no Android. Lists **$18 a month, or $109 a year** as a "limited time offer, instead of $119" ([pricing](https://copilot.money/pricing)). Third-party sites in 2026-09 and 2026-10 still listed $13 and $95, so this is a fresh rise. Households are "coming soon".
- **Spendee**: Plus $1.99 a month or $14.99 a year; Premium $5.99 a month or $35.99 a year; shared wallets, bank sync, 7-day trial ([pricing](https://www.spendee.com/pricing)).
- **CoinKeeper**: free tier with unlimited currencies and 10 categories; Platinum 399 ₽ a month, 1,490 ₽ a year or 2,990 ₽ lifetime; Platinum PLUS with AI 599 ₽, 2,490 ₽ or 14,990 ₽ ([coinkeeper.me](https://coinkeeper.me/)).
- **Money Lover**: lifetime Premium $19.99 on the App Store; linked bank wallets $2.49 a month extra; multiple currencies (third-party figures, **unconfirmed**).
- **Goodbudget**: envelopes; $10 a month or $80 a year; free tier with 20 envelopes and 2 devices (third-party, **unconfirmed**).
- **Buxfer**: Plus $7.99, Pro $12.99 and Prime $20.99 a month, billed yearly; 130+ currencies; family access only in Prime ([pricing](https://www.buxfer.com/pricing)).
- **Quicken Simplifi**: $6.99 a month billed yearly, $3 a month in the first year; one shared user ([Simplifi](https://www.quicken.com/products/simplifi/)).
- **Rocket Money**: subscription cancelling plus budgets; Premium on a pay-what-you-want scale of about $6–$14, Premium+ $15 (third-party, **unconfirmed**).
- **Tiller**: spreadsheets fed by bank data; $99 a year, 30-day trial ([pricing](https://tiller.com/pricing/)).
- **Emma** (UK): Plus £4.99, Pro £9.99 and Ultimate £14.99 a month, or £41.99, £83.99 and £124.99 a year ([help centre](https://help.emma-app.com/en/article/1ywhulq/)).
- **Banktivity** (Mac): Bronze from $6.99 a month billed yearly ([pricing](https://banktivity.com/pricing/)).
- **Moneydance**: about $65 one-time, 90-day money-back guarantee ([site](https://infinitekind.com/moneydance)).
- **Mint**: **shut down**. Announced 2023-11-02, with users moved to Credit Karma ([HN 38114512](https://news.ycombinator.com/item?id=38114512), 178 comments).

Telegram trackers (no deep check): Cointry and Smart Budget Bot sell shared group-chat budgets in
several currencies. Financy's bot will meet these, and its edge is the full app behind the bot.
