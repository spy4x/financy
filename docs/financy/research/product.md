# Financy rebuild: product brief

Written 2026-11-03 for the owner, by the product lead. Prices were checked by web search the same
day; most come from review and comparison sites rather than the vendors' own pages, so confirm
each one before quoting it in public. Sources are listed at the end.

## In short

Financy should be the shared money ledger for households whose life runs in more than one
currency. That niche is real and badly served: Actual Budget's multi-currency is still
experimental, YNAB and Monarch assume one currency and US banks, Firefly III handles currencies but
is built for bookkeepers, and Splitwise splits bills but tracks no balances. The first paid version
needs no bank sync, no investments and no AI. It needs fast entry on a phone, every account in its
own currency, one honest total, and a partner who sees the same numbers live. Price it per
household, not per member: Seed's per-member Pro plan charges a family for the very feature
Financy sells.

## 1. Who it is for

**Primary person: the household's money keeper, living across currencies.** An expat, a
remote worker or an immigrant with a salary in one currency, rent in another, savings in a third,
and a goal in a fourth (the owner's own "van conversion fund" and "NZ/AU move fund"). Usually the
more organised half of a couple. Technical enough to trust open source, not necessarily willing to
run a server. Today they keep a spreadsheet, because every app either forces one currency or turns
foreign spending into a mess of rule templates.

**Secondary person: the partner.** Adds a coffee in five seconds, glances at "how much do we have"
and "how much is left this month", and never configures anything. If this person stops logging,
the household stops paying. Every design choice for the MVP is judged by whether the partner keeps
using it.

**Tertiary, free, and important for reach: the self-hoster.** Runs it on a home server, files
issues, writes the Reddit post that brings the paying people. Not the buyer, but the channel.

**The job they hire it for:** "Tell us, in one currency we choose, how much our family has and
where this month's money went, even though our money sits in four currencies, two countries and
two phones, without either of us doing bookkeeping."

**Positioning sentence:**

> Financy is the money tracker for families whose life runs in more than one currency: every
> account keeps its own currency, you see one honest total, and everyone in the household sees the
> same numbers live, on the cloud or on your own server.

**Where Financy should not compete:**

- **Automatic US bank sync** (Monarch, Copilot, YNAB). It costs money per account, needs a licence
  and a support desk, and those three have years of lead. Financy wins on currencies and sharing,
  not on feeds.
- **Envelope budgeting purists** (YNAB, Actual). "Give every dollar a job" is a method with a
  loyal crowd. Financy offers category limits, not a budgeting religion.
- **Investments and net-worth over time** (Ghostfolio, Monarch Plus). Prices of securities need
  market data licences. Out.
- **Splitting with friends** (Splitwise). A household shares one pot; it does not settle debts
  between members. A trip with friends is a phase 3 question at the earliest.
- **Double-entry accounting** (Firefly III, Beancount). Correct, powerful and hostile to the
  partner. Financy keeps transfers correct internally and never shows debits and credits.

## 2. The MVP that can take its first payment

The test for each item: would a paying couple cancel in the first month without it?

**Must have:**

1. **Sign-up, sign-in, 2FA, password reset.** From Seed. The old Financy never finished reset and
   2FA; Seed already has them.
2. **A household (Seed group) with roles and invitations.** Owner, editor, viewer. The partner
   joins by link or email. From Seed, renamed in the copy to "household".
3. **Accounts in any currency**, with a starting balance, archive and restore. Cash, card, bank,
   savings: one kind, a name and a currency. No account types in the MVP.
4. **Income, expense and transfer**, entered in under five seconds on a phone: amount first,
   everything else prefilled from the last entry. A transfer between currencies records both
   amounts (sent and received), so the rate the bank really charged is kept.
5. **The original amount and currency on every transaction**, plus the amount in the account's
   currency. A euro coffee paid from a dong card stores both. The user can correct the converted
   amount when the bank statement arrives (old issue #33's real pain).
6. **One household total in a base currency**, using daily reference rates, with the rate date
   shown. Never presented as exact: "about €24,177 at today's rates".
7. **Categories with a monthly limit** and a progress bar. Flat list, sensible defaults, edit and
   merge. This is the "where did it go" half of the job.
8. **A this-month screen**: total, spent by category, left in each limit, latest entries with who
   added them.
9. **Live updates and offline entry.** From Seed (WebSocket, offline-first PWA). An entry made on
   a plane appears on the partner's phone when it lands. This is the demo moment.
10. **CSV import of a bank statement and full export (CSV and JSON).** Import is how a new
    household brings two years of history in an evening; export is the promise that they can leave.
    Seed's data export covers the personal part; the household's ledger needs its own CSV.
11. **Delete the household and the account**, with a clear statement of what is erased now and
    what lingers in backups (see section 5).
12. **Billing for the cloud**: trial, one flat household plan, Stripe portal. From Seed, with a
    flat price instead of per member.
13. **Admin counterpart** (Seed rule): the operator sees households, plans and sync health, never
    transaction amounts or descriptions by default.

**Cut list, and why each waits:**

| Cut                                     | Why it waits                                                                                                                                                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bank sync (any provider)                | Licensing, per-account cost, support load, and GoCardless's free tier closed in 2025. CSV import does the job for the first hundred households. Phase 2, opt-in, as a paid add-on.                           |
| Telegram bot and natural-language entry | Nice, but fast phone entry already does the job. Seed has Telegram sign-in; the bot is phase 2.                                                                                                              |
| AI categorisation, voice entry, LLM     | Sends financial text to a third party, which needs its own consent and a DPA. Phase 3 at the earliest, opt-in, self-hostable model only if possible.                                                         |
| Tags                                    | Categories cover the job. Tags double the filtering UI. Phase 2.                                                                                                                                             |
| Nested categories                       | A flat list with good defaults is enough for a household. Phase 2 if users ask.                                                                                                                              |
| Recurring transactions and bill alerts  | Valuable, but a household can live a month without. Phase 2: it is the first retention feature.                                                                                                              |
| Savings goals                           | The owner's own wish (van, move fund). Phase 2, because it is cheap once accounts and currencies are solid, and it is the best story for marketing.                                                          |
| Debts and loans                         | Phase 3. Overlaps with Splitwise and needs its own model.                                                                                                                                                    |
| Shared accounts across several groups   | The old model let one account live in several groups. It complicates permissions and totals. One household per account in the MVP.                                                                          |
| Receipts and attachments                | Storage cost and personal data in images. Phase 3.                                                                                                                                                           |
| Reports beyond this month               | One month view plus a 6-month spending trend is enough. Yearly reports in phase 2.                                                                                                                           |
| Crypto, stocks, net worth over time     | Market data licences, a different product. Phase 3 or never.                                                                                                                                                 |
| Public API and MCP server               | The usual package says yes, but no paying household asks for it first. Phase 2, and it is a strong self-hoster feature. Seed already has a token API.                                                       |
| Mobile and desktop wrappers             | The PWA installs on both. Capacitor apps after the first payments, mainly for store discovery.                                                                                                               |

**Phase 2 (first retention and growth):** recurring transactions and bill reminders (push), savings
goals in any currency, tags, yearly reports, the Telegram bot for quick entry, the public API and
MCP server, opt-in bank sync for the EU and UK through one provider, mobile store apps.

**Phase 3 (expand the job):** splitting within a trip or between households, debts, receipts, a
rules engine for imports, opt-in AI categorisation, net worth with manual asset values.

## 3. Paid cloud pricing hypothesis

**What competitors charge (per year, as reported in 2026):**

| Product                    | Price                                  | Who it covers                 | Bank sync | Multi-currency            |
| -------------------------- | -------------------------------------- | ----------------------------- | --------- | ------------------------- |
| YNAB                       | $109 ($14.99 a month)                  | up to 6 people                | yes (US)  | no                        |
| Monarch Core               | $99.99 ($14.99 a month); Plus $199     | household, partner included   | yes       | limited                   |
| Copilot Money              | about $95                              | one person, Apple only        | yes (US)  | limited                   |
| Lunch Money                | pay what you want, $60 minimum         | one account                   | yes       | yes, its main strength    |
| Ghostfolio cloud           | about $40–48                           | one person, investments only  | no        | yes                       |
| Wallet by BudgetBakers     | about $22 (US), €18 (DE)               | one person, groups extra      | some      | Premium only              |
| Toshl                      | about $20–40 (Pro and Medici)          | one person                    | Medici    | yes                       |
| Splitwise Pro              | about $40–50                           | one person                    | no        | conversion is Pro only    |
| Actual, Firefly III        | free to self-host; hosting from others | anyone                        | via GoCardless (closed) or SimpleFIN | Firefly yes; Actual experimental |

**The hypothesis:**

- **Free:** everything, self-hosted, forever. The AGPL code is the whole product: no feature is held
  back from self-hosters. This is the trust Financy sells and the channel that finds its buyers.
- **Cloud: one plan, "Household", €4 a month or €40 a year**, up to 6 members, unlimited accounts,
  currencies and history. Priced near Ghostfolio and below Lunch Money because the MVP has no bank
  sync; well below YNAB and Monarch, which include feeds.
- **Trial:** 30 days, no card required. Personal finance needs a full month to show its value (one
  salary cycle); YNAB gives 34 days and Lunch Money 30. Ask for the card at the end, with a plain
  reminder seven days before (no countdown banners).
- **After the trial or a cancellation:** the household becomes read-only with export always
  available. Data is never held hostage; deleted only on request or after 12 months inactive, with
  two emails first.
- **Later add-on, phase 2:** bank sync at cost plus a margin (for example €2 a month per
  household), so the base price never has to rise for those who do not want it.
- **Founding price:** the first 100 households keep their price for life. True, finite, and
  stated once; no countdown.

**Per member or per household?** Per household. Seed's Pro is €9 per member a month, so a couple
pays €216 a year, twice Monarch's price for a product without bank sync. Worse, it puts a price on
inviting the partner, the action that predicts retention, and makes the invite form show a charge
(`SeatPriceConfirm`). Seed's plan catalog already supports `perSeat: false`, so this is a
configuration of Financy's plan, not a change to Seed. Keep the member cap (6) so a "household"
cannot become a company.

**What it costs to run:** a shared Hetzner VM handles thousands of households; the real costs are
backups off the server, the email provider, the Stripe fee (about 1.5–3% plus €0.25 per charge,
which argues for nudging annual billing) and the owner's support time. Support time is the cost to
watch: no free cloud plan keeps it bounded.

## 4. The one number

**Week-two active households: of households that start a cloud trial, the share where at least two
members each logged at least one transaction in the second week.**

Why this and not trial-to-paid: with a few dozen trials, payment counts are too small and too late
to steer by. A household where both people still log in week two has formed the habit and has the
shared value, which is the whole positioning. If the number is good and payments are not, the price
or the paywall is wrong; if it is bad, the product is.

Target to beat: 30% of trials in the first three months. Trial-to-paid at day 30 is tracked beside
it as the business check (aim: 40% of week-two active households pay).

**How to measure it with Umami, and its limit.** Seed's SPA sends nothing to Umami on purpose, and
it should stay that way for a finance app. So:

- **Umami (website only):** the funnel from landing page to `start-trial` click, by language and
  by page, including the alternative and question pages. Events carry no ids or amounts.
- **The number itself comes from Financy's own database**, shown as a counter in the admin panel:
  households created per week, and of those, how many had two members with a transaction dated in
  days 8–14. Counting rows Financy already holds needs no tracker, no consent banner and no new
  personal data. Self-hosted installs report nothing, and the copy should say so.

## 5. Business and legal risks

**Holding financial data (GDPR).** A ledger reveals income, health spending, religion and
relationships, so treat it as sensitive even where the law does not label it so.

- Host the cloud in the EU (Hetzner Germany or Finland) and say so on the pricing page. NeatSoft
  (Singapore) is the controller; name an EU representative if you actively sell to EU residents
  (GDPR art. 27), or accept that gap knowingly.
- Encrypt at rest (encrypted volumes), in transit (TLS), and in backups (restic already encrypts).
  Field-level encryption is not needed for the MVP; claim only what is true: "encrypted on disk and
  in backups", not "end-to-end".
- Seed's backups keep monthly snapshots for six months. The privacy page must say that deleted data
  leaves live systems at once and backups within six months.
- Operator access: the admin panel must not show amounts or descriptions by default, and any access
  to a household's data for support is logged and done only on the user's request.
- Processors to list: Hetzner, Stripe, the email provider, the backup storage. Sign their DPAs.
- Rebuild must: a Financy privacy page and terms (Seed has templates), export and deletion working
  from day one, an incident plan with a 72-hour notice path.

**Never giving financial advice.** Financy shows what happened; it never says what to do with
money. No "you should save more", no investment suggestions, no AI tips in the MVP. The terms state
it is a record-keeping tool, not advice, and that converted totals are estimates at published
reference rates. Rebuild must: avoid advice wording in copy, and show the rate date next to every
converted total.

**Bank-sync providers.** In the EU and UK, reading bank accounts is a regulated service (PSD2
account information). Financy should never hold that licence; it uses a licensed aggregator as an
agent.

- GoCardless Bank Account Data (ex-Nordigen) closed new sign-ups in July 2025; Actual and Firefly
  III both say so. Do not plan on it.
- SimpleFIN Bridge: $15 a year paid by the user directly, mostly US and Canada, no contract for
  Financy. The cheapest honest first step for self-hosters.
- Salt Edge: custom pricing, a limited free tier of 100 live connections; needs a contract and its
  terms on reselling.
- Enable Banking (EU): volume pricing with a monthly minimum; free for a person's own accounts
  according to an informal 2024 statement. Worth a direct conversation.
- Plaid: per-account monthly fees, prices shown only after applying for production; pay-as-you-go
  is not offered in Europe.
- Rebuild must: keep bank sync out of the MVP; design the import pipeline so a provider is one
  adapter that feeds the same path as CSV import.

**Exchange-rate data licences.** The ECB publishes daily reference rates for about 30 currencies,
free to reuse with attribution, "for information only". Frankfurter is an open-source API over that
data and can be self-hosted. The gap: the ECB set lacks currencies the target users need (Vietnamese
dong, UAE dirham, many others). Commercial providers (Open Exchange Rates and similar) need a paid
plan for commercial use. Rebuild must: use ECB data through a self-hosted Frankfurter as the
default, add one paid provider for the missing currencies in the cloud only, let the user enter a
manual rate, attribute the source on screen, and never call a rate "exact".

**AGPL and the cloud.** AGPL lets anyone run a competing Financy cloud, provided they publish their
changes. That is the deal, and the moat is the owner's operation, trust and speed, not the code.
Risks to handle:

- Seed is MIT and Financy is AGPL: Financy may include Seed's code; the AGPL then covers the whole
  of Financy. Fine.
- The cloud must show a "Source" link to the exact running version (AGPL section 13). Put it in the
  footer and the about screen.
- Contributions: decide now whether contributors sign a licence grant (a CLA) so the owner can ever
  relicense or sell a commercial licence. Without one, every outside commit is AGPL-only forever.
- Trademark: register or at least claim "Financy" so a fork cannot sell under the name (Maybe did
  this; its forks had to rename).

**Abuse and failure cost.** A wrong total misleads a family's decision; a sync bug that loses a
week of entries destroys the trust the product sells. The cost of failure is high and silent.
Rebuild must: test conversion and transfer arithmetic with integer money, keep an audit trail of
who changed what, show sync status plainly, and back up the cloud daily off the server with a
tested restore. Abuse risk is low (no money moves); the main ones are a removed member who still
has data offline (revoke and wipe the local copy on next sync) and spam sign-ups (trial without a
card needs email verification, which Seed has).

**The cautionary tale: Maybe Finance.** An open-source finance app with funding and hype that
pivoted to B2B in 2025 and archived its repository, leaving self-hosters on community forks.
Financy's promise must be the opposite and stated plainly: the code stays open, export always
works, and a household can move from the cloud to its own server in an evening.

## 6. Decisions only the owner can make

1. **Price per household, not per member.**
   Recommended: yes, €4 a month or €40 a year for up to 6 members.
   Trade-off: less revenue from large families, but the partner invite stays free, and that invite
   is what the product is for.

2. **No bank sync in the first paid version.**
   Recommended: CSV import only; bank sync as a phase 2 paid add-on through one provider.
   Trade-off: some trials will leave for Monarch or Lunch Money, but the MVP ships months sooner
   and with no licence or per-account cost.

3. **No free cloud plan; the free plan is self-hosting.**
   Recommended: a 30-day trial without a card, then read-only with export.
   Trade-off: a smaller cloud audience and less word of mouth from free users, against bounded
   support load and data liability.

4. **Contributor licence grant (CLA) from the first outside contribution.**
   Recommended: yes, a short grant that keeps the code AGPL but lets the owner relicense.
   Trade-off: a little friction for contributors, against keeping the option of a commercial
   licence or a future change of terms.

5. **Where the cloud's data lives and who is the controller.**
   Recommended: Hetzner in the EU, NeatSoft as controller, privacy page says both.
   Trade-off: an EU representative may be needed for EU sales, a small yearly cost, against the
   trust that "your data stays in the EU" buys with the target users.

6. **The paid source of exchange rates for currencies the ECB lacks.**
   Recommended: one paid provider for the cloud, ECB data via Frankfurter as the free default for
   self-hosters, plus a manual rate on any transaction.
   Trade-off: a fixed monthly cost of roughly $10–20, against covering the dong, dirham and the
   other currencies the expat buyer actually holds.

## Sources

Checked by web search on 2026-11-03. Most are secondary; dates in brackets are the source's own.

- YNAB price and 6-person sharing: [getfinny.app, 2026](https://getfinny.app/blog/ynab-pricing-2026),
  [fincomparelab](https://www.fincomparelab.com/guides/ynab-pricing/).
- Monarch Core and Plus: [fincomparelab](https://www.fincomparelab.com/guides/monarch-money-pricing/),
  [walletgrower, 2026](https://walletgrower.com/blog/monarch-money-review-2026).
- Copilot Money: [costbench changelog, Aug 2026](https://costbench.com/changelog/copilot-money-plan-removed-2026-08/).
- Lunch Money minimum: [Lunch Money blog, 2026-01-12](https://lunchmoney.app/blog/an-update-to-our-annual-plan-minimum-effective-march-15-2026),
  [pricing](https://lunchmoney.app/pricing), [multicurrency docs](https://support.lunchmoney.app/settings/multicurrency).
- Ghostfolio cloud: [gappsy](https://gappsy.com/tools/ghostfolio/), [Greenline](https://usegreenline.com/compare/ghostfolio).
- Wallet by BudgetBakers: [WalletHub](https://wallethub.com/best-budget-apps),
  [finder UK](https://www.finder.com/uk/wallet-budgetbakers-review).
- Toshl: [Entrepreneur store](https://store.entrepreneur.com/sales/toshl-finance-medici-plan-3-yr-subscription),
  [Toshl blog](https://toshl.com/blog/the-road-to-2-0-toshl-pro-and-pricing-2/).
- Splitwise Pro and the daily cap: [getfinny.app, 2026](https://getfinny.app/blog/splitwise-pricing-2026).
- Actual Budget multi-currency: [docs](https://actualbudget.org/docs/budgeting/multi-currency),
  [release 26.1.0](https://actualbudget.org/blog/release-26.1.0/),
  [roadmap 2026](https://actualbudget.org/blog/roadmap-for-2026).
- Firefly III audience and importer: [ElfHosted docs](https://docs.elfhosted.com/app/fireflyiii/).
- Maybe Finance pivot and archive (July 2025): [community post](https://piefed.jeena.net/post/210491),
  [Sure fork](https://github.com/boul2gom/sure).
- GoCardless closure (July 2025): [Actual docs](https://actualbudget.org/docs/advanced/bank-sync/gocardless/),
  [Firefly III docs](https://docs.firefly-iii.org/how-to/data-importer/import/gocardless/).
- SimpleFIN Bridge: [bridge.simplefin.org](https://bridge.simplefin.org).
- Salt Edge: [product page](https://saltedge.com/products/spectre). Enable Banking:
  [openbankingtracker](https://openbankingtracker.com/api-aggregators/enablebanking/vs/salt-edge).
- Plaid: [support: pricing plans](https://support.plaid.com/hc/en-us/articles/16110502116887),
  [billing docs](https://plaid.com/en-eu/docs/account/billing/).
- ECB reference rates: [ECB](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html).
  The reuse terms and Open Exchange Rates' commercial plans were not confirmed by search; check
  the ECB legal notice and the provider's pricing page before relying on them.
- Seed facts: Seed `docs/billing.md` (€9 per member, `perSeat`),
  `docs/analytics.md` (SPA sends nothing to Umami), `docs/backups.md` (six-month retention).
