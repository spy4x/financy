# What people need from a finance tracker

This file ranks what people say they want from a personal or family finance app, and what is left
when they give up on one. It closes with what Financy must have on the day it launches for someone
to switch, and what can wait. Financy is a self-hosted (AGPL-3.0) or cloud finance tracker for a
person or household, in any mix of currencies, offline-first, aimed at expats.

Every source was read on **2026-11-03**.

## How this was measured, and its limits

- **Hacker News comments.** I counted keyword matches across 1,037 comments in 16 threads from
  2019 to 2026, about finance apps, Mint's shutdown, Firefly III and new launches (list at the
  end). A comment counts once per theme and can count in several themes. HN readers are mostly
  developers, often American, so bank feeds and plain-text accounting are over-represented there,
  and expats are under-represented.
- **GitHub reactions** on the most-voted feature requests of open-source rivals.
- **Google autocomplete** suggestions, which show what people actually type, though not how often.
- **Reddit could not be read.** Reddit blocks automated readers, and I did not work around the
  block. Thread counts on Reddit are therefore missing. The nearest proxy is that Google suggests a
  "… reddit" ending for most queries below ("ynab alternative reddit", "budget app multiple
  currencies reddit", "budget app for couples reddit"), which shows people look there for
  answers.

## Ranked needs

| Rank | Need | HN comments | HN threads | Other signal |
| --- | --- | --- | --- | --- |
| 1 | Bank data that arrives without work, and doesn't break | 133 | 14 of 16 | Actual's Plaid request: 333 reactions |
| 2 | Reports that answer a question, not only charts | 89 | 13 | — |
| 3 | A fair price, no surprise rises | 73 | 13 | Copilot, Monarch, Lunch Money, YNAB all raised prices |
| 4 | Fast entry by hand | 57 | 10 | Cashew: 4.9 stars from about 28,000 reviews |
| 5 | Privacy and owning the data | 50 | 11 | plain-text accounting (54) and spreadsheets (51) as escape routes |
| 6 | A good mobile app | 43 | 13 | "copilot money alternative for android" |
| 7 | Many currencies, done right | 41 | 9 | Actual's currency request: 347 reactions, its most-reacted |
| 8 | Sharing with a partner or family | 38 | 7 | Firefly's most-asked change; ezBookkeeping #53 |
| 9 | No double-entry homework | 33 | 8 | — |
| 10 | Trust that a small app will still exist | 21 | 7 | Mint, Maybe, Ivy Wallet gone |

For Financy's audience the order changes. Needs 7 and 8 are rare on HN, but for an expat household
they decide whether the app can be used at all. Rank 7 has the strongest per-person signal found:
Actual's currency request is its most-reacted.

### 1. Bank data without work

- **The need.** People want transactions to appear by themselves, and they leave apps whose bank
  link breaks. One Mint refugee said apps that need manual entry are useless to them
  ([HN](https://news.ycombinator.com/item?id=38115065)).
- **Where it fails.**
  - YNAB's status page lists repeated incidents with its bank partners
    ([example](https://ynabstatus.com/incidents/3zb33zvy9zwg)).
  - In 2024 YNAB said it would partly remove direct imports
    ([HN 39773819](https://news.ycombinator.com/item?id=39773819)).
- **Abroad, the problem is coverage, not reliability.** A user of Lunch Money's launch noted it
  only helped with American accounts and left EU accounts to manual entry
  ([HN](https://news.ycombinator.com/item?id=20832167)).
- **For Financy.** Bank feeds are out of scope for version one (see `bank-sync.md`), so strong
  statement import has to carry this need at launch.

### 2. Reports that answer a question

- **The need.** People ask for answers, not dashboards: "where did the money go", "can we afford
  this", "what is left this month". Basic reports plus quick entry on the go matter more than
  charts ([HN](https://news.ycombinator.com/item?id=20836447)).
- **Who is answering it.** The 2026 launches lead with this:
  - a cash-flow forecast ([Stoke Money, HN 50122776](https://news.ycombinator.com/item?id=50122776));
  - local AI that explains spending ([Pulse Local, HN 50080275](https://news.ycombinator.com/item?id=50080275), 122 points).

### 3. A fair price, and no surprises

- **Price rises in the last year:**
  - Copilot now lists $18 a month, or $109 a year as an offer "instead of $119"; third-party sites
    showed $13 and $95 a month or two ago.
  - Lunch Money's yearly minimum reportedly rose from $50 to $60 (**unconfirmed**).
  - YNAB's yearly price went from $83.99 to $109 over a few years (steps **unconfirmed**).
  - Details and links: `competitors.md`.
- **What HN posters ask for.** One-time fees, offline use and open source
  ([HN](https://news.ycombinator.com/item?id=22901476)). Another said they would pay up to €70 a
  year for a self-hostable app ([HN](https://news.ycombinator.com/item?id=20841280)).
- **For Financy.** $40 a year for a whole household sits well under every paid rival with
  sharing. A price lock (Lunch Money's answer) would directly answer this fear.

### 4. Fast entry by hand

- **The need.** People with cash and foreign cards that no bank feed covers say quick manual entry
  is crucial ([HN](https://news.ycombinator.com/item?id=20836285)).
- **The bar.** Cashew, which is entry-first, has about 28,000 reviews at 4.9 on
  [Google Play](https://play.google.com/store/apps/details?id=com.budget.tracker_app&hl=en_US).
- **For Financy.** This is the partner persona ("logs a coffee in five seconds") and the reason
  for the Telegram bot.

### 5. Privacy and owning the data

- **The need.** Some refuse to keep financial data on a random company's server
  ([HN](https://news.ycombinator.com/item?id=20925818)).
- **Where people go instead.** Many escape to plain-text accounting (Beancount, hledger) or a
  spreadsheet. That is control bought with effort a partner won't spend.
- **Where they look.** Google suggests "self hosted budget app", "self hosted finance app github",
  "finanzguru alternative self hosted" (German) and "monarch money open source alternative".

### 6. A good mobile app

- **The need.** A partner will not use an app whose phone experience is poor: "my spouse won't want
  to use it unless the mobile app is good" ([HN](https://news.ycombinator.com/item?id=31563232)).
- **Where rivals fall short.** Firefly III and Actual have no official native app. Copilot has no
  Android version, and Google suggests "copilot money alternative for android".

### 7. Many currencies, done right

What "done right" means, from the comments:

- **Keep the original amount.** Converting everything to one currency when it is stored loses
  information ([HN](https://news.ycombinator.com/item?id=20837004)).
- **Use the rate of the day.** A spender in four currencies a year wants the rate of the day the
  money was spent, not today's rate ([HN](https://news.ycombinator.com/item?id=20836137)).
- **One budget across currencies.** YNAB forces separate budgets for USD and ARS
  ([HN](https://news.ycombinator.com/item?id=22900958)). A Brazilian living in Europe called
  multiple currencies a must ([HN](https://news.ycombinator.com/item?id=22906599)).
- **Never invent a rate.** Firefly III treats a missing rate as 1 (docs), and Sure has an open bug
  where a missing rate silently converts at 1.0
  ([#2417](https://github.com/we-promise/sure/issues/2417)).

Search signals:

- Google suggests "does ynab support multiple currencies", "does monarch money support multiple
  currencies", "actual budget multi currency", "budget app multiple currencies reddit", and
  "personal finance app multiple currencies".
- Actual's request has 347 reactions ([#1132](https://github.com/actualbudget/actual/issues/1132)).

### 8. Sharing with a partner or family

- **Firefly III.** It shares only by sharing one login; its developer calls proper sharing a large
  change ([HN](https://news.ycombinator.com/item?id=20918332)).
- **ezBookkeeping.** Its shared-accounts request has been open since 2025-02
  ([#53](https://github.com/mayswind/ezbookkeeping/issues/53)).
- **Copilot.** Households are still "coming soon".
- **Search signals.** "budget app for couples", "family budget app multiple users free",
  "budgeting app for couples with separate accounts", and in German "haushaltsbuch app für paare
  ohne kontoanbindung" ("household book app for couples without bank connection").

### 9. No double-entry homework

- **The split.** Double-entry tools win the technical user and lose the partner. Lemmy and HN users
  describe Firefly III as the detailed choice and Actual as the simple one.
- **For Financy.** Financy deliberately does not compete on double-entry, which matches this split.

### 10. Trust that a small app will last

- **The fear.** "I honestly don't trust any startup's products anymore," wrote one user when Mint
  closed ([HN](https://news.ycombinator.com/item?id=38115817)). Another has self-hosted since
  Mint's shutdown and accepted life without bank links
  ([HN](https://news.ycombinator.com/item?id=39393103)).
- **The record.** Maybe Finance (archived 2025-07), Ivy Wallet (unmaintained since 2024-11) and
  Budget Zen (archived) are recent examples. `positioning.md` covers how rivals answer this.

## What must exist at launch, and what can wait

Must exist for an expat household to switch:

1. **Many currencies done right.** The original amount and currency are kept, with the rate of the
   transaction's date and a manual override. When a rate is missing, the app shows it plainly
   instead of using 1.0. One overview in a chosen currency. This is the reason to switch, so it
   has to beat Lunch Money's bar (historic rate per transaction, 160+ currencies) on day one.
2. **Real household sharing.** Separate logins for each member, with no shared password. This is
   the hole in Firefly III and ezBookkeeping, and Copilot still lacks it.
3. **A way in from the old app.** Bank statement import (CSV, OFX, QIF, CAMT.053, MT940, PDF) is
   planned. Add imports from the apps people leave: Firefly III, Actual, YNAB, and the CSV exports
   of Wallet, Toshl, Spendee, Cashew and Zenmoney. ezBookkeeping already reads Firefly III,
   GnuCash and Beancount files. Without a migration path, a year of history keeps people where
   they are.
4. **Entry in a few seconds on a phone.** An installable PWA that works offline, plus the Telegram
   bot. Rivals' weak mobile apps are the partner's reason to refuse.
5. **A plain answer to "what if you disappear".** A full export in an open format, the AGPL source,
   one-command self-hosting, and the promise that a household that stops paying keeps read access
   and its export (already in the product definition).
6. **A few answers, not a wall of charts.** This month against last month, by category and by
   member, in the household currency. Plus recurring entries, so the month ahead is visible.

Can wait:

- **Automatic bank sync.** Planned for later (`bank-sync.md`). HN ranks it first, but Financy's
  expats are the people whose banks the aggregators cover worst.
- **AI categorisation and chat answers.** Rivals are adding these (Sure, Pulse Local,
  ezBookkeeping, CoinKeeper's AI tier). This is a later edge, not a reason to switch.
- **Investments beyond crypto holdings, net worth over time, receipts, goals and debts.**
- **Native store apps**, as long as the PWA is good.
- **Envelope or zero-based budgeting.** Financy's budgets are enough; YNAB and Actual own this
  method.

## HN threads used

| Thread | Date | Comments read | Topic |
| --- | --- | --- | --- |
| [38114512](https://news.ycombinator.com/item?id=38114512) | 2023-11-02 | 178 | Mint shuts down |
| [39392428](https://news.ycombinator.com/item?id=39392428) | 2024-02-16 | 157 | Firefly III |
| [20916920](https://news.ycombinator.com/item?id=20916920) | 2019-09-09 | 152 | Firefly III |
| [20811287](https://news.ycombinator.com/item?id=20811287) | 2019-08-27 | 132 | Lunch Money launch, multi-currency |
| [31561575](https://news.ycombinator.com/item?id=31561575) | 2022-05-30 | 131 | Firefly III |
| [50080275](https://news.ycombinator.com/item?id=50080275) | 2026-10-13 | 71 | Pulse Local, local AI budgeting |
| [38942675](https://news.ycombinator.com/item?id=38942675) | 2024-01-10 | 53 | How do you manage your finances? |
| [36674866](https://news.ycombinator.com/item?id=36674866) | 2023-07-11 | 45 | How do you manage your personal finances? |
| [22899748](https://news.ycombinator.com/item?id=22899748) | 2020-04-17 | 35 | What features would you look for? |
| [50122776](https://news.ycombinator.com/item?id=50122776) | 2026-10-16 | 24 | Stoke Money, cash-flow forecast |
| [42256125](https://news.ycombinator.com/item?id=42256125) | 2024-11-27 | 24 | Double-entry finance app |
| [41218206](https://news.ycombinator.com/item?id=41218206) | 2024-08-11 | 13 | Firefly III |
| [39773819](https://news.ycombinator.com/item?id=39773819) | 2024-03-21 | 11 | YNAB removes some bank imports |
| [38179611](https://news.ycombinator.com/item?id=38179611) | 2023-11-07 | 9 | Mint alternatives |
| [38700766](https://news.ycombinator.com/item?id=38700766) | 2023-12-19 | 1 | Self-hosted Mint alternative |
| [49036872](https://news.ycombinator.com/item?id=49036872) | 2026-07-24 | 1 | PocketLens, self-hosted via Plaid |

<details>
<summary>Theme keywords</summary>

Case-insensitive regular expressions run over each comment's text:

- **Bank sync:** plaid, bank sync, bank import, importing transactions, csv, ofx, qif, screen scraping, aggregator, connection, yodlee, simplefin, gocardless, nordigen, psd2, open banking.
- **Multi-currency:** currency, multi-currency, exchange rate, forex, fx, eur, gbp, usd.
- **Sharing:** wife, husband, spouse, partner, family, household, girlfriend, boyfriend, shared budget, share with.
- **Privacy:** privacy, private, self-host, own my data, local-first, offline, sell my data, trust them.
- **Price:** price, pricing, subscription, per month or year, a dollar amount, expensive, cheap, pay for, free tier, one-time.
- **Longevity:** shut down, abandon, discontinued, sunset, acquired, out of business, bus factor, maintained or maintainer, longevity, dead project.
- **Manual entry:** manual entry or input, tedious, friction, takes too long, quickly add, categorize.
- **Reports:** report, chart, graph, insight, dashboard, visualize, net worth, forecast.
- **Spreadsheet:** spreadsheet, excel, google sheets, tiller.
- **Plain-text accounting:** ledger, hledger, beancount, plain text.
- **Double-entry:** double-entry, accounting knowledge, too complex, complicated, learning curve.
- **Mobile:** mobile, android, ios, iphone, phone app.

These are rough: "csv" and "connection" also match other talk, and "privacy" includes "offline".
Treat the counts as a ranking, not a survey.

</details>
