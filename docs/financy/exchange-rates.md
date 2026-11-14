# Exchange rates

A household keeps one main currency. Its totals convert every other currency into it with the
rate of the day the money moved. This guide is for the person who runs a Financy server: where
rates come from, what it costs, and what to check when a rate is missing.

## Where rates come from

- **The ECB, every day, free.** The worker's `rates.fetch` job runs at 16:00 UTC, after the
  European Central Bank publishes, and stores its reference rates for about 30 currencies through
  [Frankfurter](https://frankfurter.dev). No key is needed. `RATES_FRANKFURTER_URL` points at a
  self-hosted Frankfurter instead of the public one.
- **A paid fallback, only if you turn it on.** Some main currencies (the Vietnamese dong, the UAE
  dirham) have no ECB rate. With `RATES_FALLBACK_KEY` set, the same job asks
  [exchangerate-api.com](https://www.exchangerate-api.com) once a day for the main currencies
  households use that the ECB lacks. `RATES_FALLBACK_MONTHLY_CAP` is required with the key: the
  most calls in one calendar month. Each call is counted before it is made, and at the cap no call
  is made until the next month. A failed paid call is not retried. Its rates stay on the server:
  the provider's terms forbid serving them, so the app's household settings carry ECB rates and
  coin prices, never a fallback rate.

Every rate is stored once per pair, day and source, and never changed. A rate that is not a plain
decimal above zero is refused and logged by its pair, day and source.

## Coin prices

A crypto account holds a listed coin (`COINS` in `libs/domain/money/+lib.ts`). With
`RATES_COINGECKO_KEY` set, the same `rates.fetch` job first asks
[CoinGecko](https://www.coingecko.com) for today's price in euros of each listed coin an account
holds (a deleted account or group does not count, an archived account does). `RATES_COINGECKO_PLAN`
is `demo` (the default) or `pro`.

- **Only today's price is kept.** `coin_prices` holds one row per coin, replaced each day, never a
  history. A coin no account holds loses its row. CoinGecko's terms ask for stored prices to be
  refreshed within 24 hours and deleted when access ends: **removing the key deletes every stored
  price at the next run.**
- **One call per coin, counted.** Each call is counted before it is made, under a cap of 10,000 a
  calendar month, the Demo plan's limit. A coin priced today already is not asked again, so a rerun
  makes no call.
- **Failures never stop the rates.** A failed call, a missing or refused price is logged by source
  and error code, never a URL or the key, and not retried; the ECB step runs after it either way.
- **Where prices go.** `household.settings` sends each price with its date to the app. No API
  token may send that query, so prices never leave through the token API. Wherever a price is
  shown, CoinGecko is credited: "Data provided by CoinGecko".

## How a rate is chosen

- **The day's rate, else the latest earlier one.** A Saturday uses Friday's rate, and the lookup
  returns Friday's date with it.
- **Any pair goes through the euro.** Rates are stored against the euro, so US dollars to yen is
  the yen's rate divided by the dollar's, both from one source on one day.
- **The ECB first.** On a day both sources have a rate, the ECB's is used.
- **No rate is said, never guessed.** Before the oldest stored rate, or for a currency with no
  rate at all, the lookup answers "no rate" with the date asked; no total uses 0 or 1.

## How entries and the ledger use rates

- **An entry stores its account amount once.** An entry in another currency than its account's
  gets its account amount from the rate of its own date and is marked converted. A person who
  types both amounts sets a manual rate, and the entry is not marked. An edit that keeps the
  account, amount, currency and date keeps the stored account amount, so a later rate never
  rewrites history. No rate for the date refuses the entry with `NO_RATE`.
- **A transfer stores its received amount once, the same way.** Between two accounts in one
  currency the received amount is the sent amount. Across currencies the person states both, or
  the server fills the received amount at the rate of the transfer's date and marks it converted.
  An edit recomputes it when the sent amount, the date or an account changes and the edit does not
  state it. No rate refuses the transfer with `NO_RATE`.
- **A balance needs no rate.** It is the starting balance plus the account amounts of the live
  entries, minus the live transfers' sent amounts out of the account and plus their received
  amounts into it, dated on or before the day asked, all in the account's currency.
- **The ledger converts each entry at its own date's rate.** An entry in the household's main
  currency counts its own amount; any other counts its account amount, converted into the main
  currency at the entry's date. A currency with no rate is left out of the totals and named in
  `leftOut`. Transfers are not in the ledger: moving money between the household's accounts is
  neither income nor spending.

## Rates before the first day

A server stores rates from the day it first ran. An import with older dates asks for the missing
days (`requestBackfillBefore`); requests that overlap become one, and nothing before 1999-01-04,
the ECB's first day, is asked for. The requests wait in `rate_backfill_requests`.

The worker's `rates.backfill` job (**Past exchange rates** in Jobs) runs every hour at minute 41.
It takes the open requests oldest first and asks Frankfurter for each one's ECB rates in one range
call. It stores them, skipping any rate stored already, and deletes the request in the same
transaction. A failed call is retried, and the request stays open until a call succeeds. The paid
fallback is never asked for past days, so a backfill costs nothing.

## Checking it

`GET /api/admin/rates` returns the latest fetch of each source, the rates per day, the
fallback's calls this month against its cap, and the coin prices: each stored price with its day
and fetch time, the coins accounts hold with no price, and CoinGecko's calls this month. The admin
panel's **Exchange rates** screen shows them. The **Jobs** page shows each run of `rates.fetch`
and `rates.backfill`; a failed ECB call is retried there, a failed coin call is not.

Settings: [settings.md](../settings.md), "Exchange rates".
