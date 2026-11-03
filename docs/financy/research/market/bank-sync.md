# Automatic bank sync: providers and options

Input for [spy4x/financy#3](https://github.com/spy4x/financy/issues/3). Financy's first version
imports bank statement files (CSV, OFX, QIF, CAMT.053, MT940 and PDF, with AI help). Automatic sync
comes later. This file lists the providers that could feed it, where each one works, what it costs
a small app, and whether a self-hoster can bring their own key. It also shows which open-source
apps use which provider.

Every page was read on **2026-11-03**. **Unconfirmed** marks a figure I could not check on the
provider's own page.

## In short

- **GoCardless Bank Account Data (formerly Nordigen) is closed to new customers.** It was the
  free EU option that most open-source apps were built on. Do not build on it.
- **Enable Banking is the EU replacement the open-source apps moved to.** Its free restricted mode
  lets each self-hoster connect their own accounts with their own key.
- **SimpleFIN Bridge covers the US and Canada,** and the user pays $15 a year directly.
- **For the cloud, every aggregator except Teller and Basiq hides its price** behind a sales
  call. A small app needs a quote from Enable Banking (EU) and possibly Plaid (US, UK).
- **Expats are the people aggregators cover worst.** Their money is spread across banks in several
  countries, plus Wise and Revolut. Statement import, done well, stays the main path even after
  sync ships.

## Providers

| Provider | Regions | Price for a small app | Self-hoster's own key | Used by |
| --- | --- | --- | --- | --- |
| [Enable Banking](https://enablebanking.com/) | 30 European countries, 2,700+ banks | own accounts: free; commercial: quote only | **yes**, free restricted mode | Actual (experimental), Firefly III importer, Sure |
| [SimpleFIN Bridge](https://www.simplefin.org/) | US, Canada | user pays $1.50 a month or $15 a year plus tax, for up to 25 banks and 25 apps | **yes**, the user's own token | Actual, Firefly III, Sure |
| [GoCardless Bank Account Data](https://gocardless.com/bank-account-data/) | UK and EU | **closed to new accounts since July 2025** | existing keys only | Actual (old users), Firefly III (moving away), Zenmoney, Lunch Flow, Synci, LumoSync |
| [Lunch Flow](https://www.lunchflow.app/) | 30+ countries, through other aggregators | user pays: $34.99 a year ($2.92 a month) for 2 connections, $10 per extra connection (period not checked), 7-day trial; a developer API sold "pay per usage" | **yes**, the user's own account | Firefly III, Sure; also feeds Lunch Money, YNAB, Actual |
| [Plaid](https://plaid.com/pricing/) | US, Canada, UK, EU | pay-as-you-go or a 12-month plan; no public per-account price; free sandbox, plus 200 free production calls per product | possible, but production access needs Plaid's approval | Monarch, Lunch Money, YNAB, Sure, Maybe |
| [Teller](https://teller.io/) | US | free for the first 100 live connections; then $0.30 per connected account a month for transactions | **yes**, free tier fits one household | requested in Firefly III ([#8598](https://github.com/firefly-iii/firefly-iii/issues/8598)) |
| [TrueLayer](https://truelayer.com/pricing/) | UK, EU | contact sales | no | Sure |
| [Tink](https://www.tink.com) | EU, UK | prices only for existing customers | no | — |
| [Yapily](https://www.yapily.com/pricing) | UK, EU | contact sales | no | — |
| [Salt Edge](https://www.saltedge.com) | many countries (not checked) | contact sales; its free consumer service Spectre reportedly closed 2025-10-31 (**unconfirmed**) | no | Firefly III's old Spectre importer |
| [Powens](https://www.powens.com/pricing/) | France and EU | startup programme, price on request | no | — |
| [Akahu](https://www.akahu.nz/personal-apps) | New Zealand | free personal apps (**unconfirmed**: the page returned 404) | **yes**, personal app tokens | Actual, Sure |
| [Basiq](https://basiq.io/pricing/) | Australia | $0.50 per user a month plus a platform fee | no | — |
| [Pluggy](https://www.pluggy.ai/en/pricing) | Brazil | from R$500 or R$2,500 a month, 15-day trial | no | Actual |
| MX, Finicity (Mastercard) | US, Canada | enterprise sales | no | YNAB (MX); Lunch Flow (both) |
| Belvo | Latin America | sales | no | — |
| Woob (scrapers) | mostly France | free, open source; logs in with the bank password | yes | Kresus |

Sources: the provider pages linked in the table, plus:

- GoCardless's closure: [Actual's GoCardless doc](https://actualbudget.org/docs/advanced/bank-sync/gocardless/)
  ("From July 2025 onwards, GoCardless has stopped accepting new Bank Account Data accounts").
- Who uses what in Actual: [Actual's bank-sync docs](https://actualbudget.org/docs/advanced/bank-sync).
- Who uses what in Firefly III: its [importer providers doc](https://github.com/firefly-iii/docs/blob/main/docs/docs/how-to/data-importer/import/third-party-providers.md).
- Who uses what in Sure: its [repository](https://github.com/we-promise/sure).
- Enable Banking's restricted mode: its [pricing page](https://enablebanking.com/pricing). A
  production application goes live after a contract, or after you whitelist your own accounts.

## Direct links to single banks

Some banks and money apps that expats use offer a personal API token. Sure connects several of them
directly.

- **Wise.** Wise has personal API tokens. Its docs say EU and UK customers cannot read balance
  statements with a personal token, because of PSD2
  ([docs](https://docs.wise.com/api-docs/guides/personal-tokens)). Customers elsewhere (for
  example in Singapore or the US) can. For EU and UK users, Wise is reachable through a PSD2
  aggregator instead.
- **Monobank** (Ukraine), **Up** (Australia), **Fio** (Czech Republic), **Mercury** and **Brex**.
  Sure links each of these directly with the user's token.
- **Revolut** has no personal API that I found. It is reachable through PSD2 aggregators such as
  Enable Banking.

## Bring your own key

A self-hoster can connect their own bank accounts without Financy paying anything, through four
providers:

1. **Enable Banking.** Sign up, create an application, whitelist your own accounts. This is free,
   and covers most of the EU.
2. **SimpleFIN Bridge.** The user buys a $15-a-year token and pastes it in. This covers the US and
   Canada.
3. **Lunch Flow.** The user pays about $35 a year and gets one connection that covers 30+
   countries. It depends on GoCardless and others underneath, and it is run by one founder. Its
   reviews come from expats who moved between the US, UK and EU.
4. **Teller or Akahu**, for US and New Zealand users who want a free personal token.

This is the same set Firefly III, Actual and Sure offer. A Financy self-hoster expects it.

## For the cloud

The cloud needs a commercial agreement, and only the user-pays bridges have public prices.
Options:

- **A. User-pays bridges only** (SimpleFIN, Lunch Flow, Enable Banking own-account mode, in the
  cloud too). Consequence: no cost or contract for NeatSoft, but setup is clumsy for a
  non-technical household, and Enable Banking's free mode may not allow a hosted service to use it
  on a customer's behalf (**to confirm** with Enable Banking).
- **B. One commercial aggregator for Europe** (Enable Banking first, because the open-source apps
  already use it and it covers 30 countries), priced per connected account. Consequence: a cost per
  household that the $4-a-month plan has to absorb or pass on as a paid add-on. PocketSmith and
  Money Lover charge extra for bank feeds, so an add-on is normal in this market.

My pick: start with **A**, because it costs nothing and matches what self-hosters expect. Ask Enable
Banking for a quote in parallel, and offer **B** as a paid add-on once there is demand. Avoid
GoCardless, which takes no new customers. Avoid Salt Edge's Spectre, whose free consumer service
reportedly closed.

## What to build first, whatever the provider

- **One provider interface.** Firefly III, Actual and Sure each started with one provider and then
  bolted on more. Sure lists more than 15.
- **The import pipeline as the base.** Sync only fetches the transactions; the matching, duplicate
  detection and rules come from the file import Financy already plans.
- **The original currency kept.** Aggregators return the amount in the account's currency, and the
  conversion rules of `needs.md` apply unchanged.
- **Sync status shown plainly.** Bank links break, and YNAB's status page lists repeated incidents
  ([example](https://ynabstatus.com/incidents/3zb33zvy9zwg)). Users leave when they don't know.
  Show the last sync, the error and a "reconnect" action for each account.
- **PSD2 consent expires.** In the EU it is usually 90 to 180 days, depending on the bank (the
  general rule, not checked per provider). After that the user must reconnect, so plan the
  reminder.
