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
  the provider's terms forbid serving them, so the app and the offline copy carry ECB rates only.

Every rate is stored once per pair, day and source, and never changed. A rate that is not a plain
decimal above zero is refused and logged by its pair, day and source.

## How a rate is chosen

- **The day's rate, else the latest earlier one.** A Saturday uses Friday's rate, and the lookup
  returns Friday's date with it.
- **Any pair goes through the euro.** Rates are stored against the euro, so US dollars to yen is
  the yen's rate divided by the dollar's, both from one source on one day.
- **The ECB first.** On a day both sources have a rate, the ECB's is used.
- **No rate is said, never guessed.** Before the oldest stored rate, or for a currency with no
  rate at all, the lookup answers "no rate" with the date asked; no total uses 0 or 1.

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

`GET /api/admin/rates` returns the latest fetch of each source, the rates per day, and the
fallback's calls this month against its cap. The admin panel's **Exchange rates** screen that
shows them comes later, with a child issue of #93. The **Jobs** page shows each run of
`rates.fetch` and `rates.backfill`; a failed ECB call is retried there.

Settings: [settings.md](../settings.md), "Exchange rates".
