# Financy: what we are building

Who Financy is for, what its first version does and the decisions behind it. A feature not listed
here needs the owner's yes first. The issues in the "MVP" milestone build this.

## Who it is for

Financy is the money tracker for families whose life runs in more than one currency: every
account keeps its own currency, you see one honest total, and everyone in the household sees the
same numbers live, on the cloud or on your own server.

- **The money keeper**: an expat, a remote worker or an immigrant with income, rent and savings
  in different currencies. Today they keep a spreadsheet.
- **The partner**: adds a coffee in five seconds and checks what is left this month. If the
  partner stops logging, the household stops paying, so every screen is judged by them.
- **The self-hoster**: runs it at home for free, and brings the paying people.

Financy does not compete on automatic bank feeds, envelope budgeting, investment tracking,
splitting bills with friends or double-entry bookkeeping.

## The first version

- Households with roles, from Seed: everyone sees every change live, also offline.
- Accounts in any currency, crypto included, with a derived balance.
- Income, expenses and transfers, cross-currency transfers included, with the original amount
  kept next to the converted one.
- Categories with one level of parents, and monthly budgets that roll up to the parent.
- The month view: income, spending and what is left, in the household's base currency.
- Bank statement import: CSV in any bank's layout, OFX, QIF, CAMT.053, MT940 and PDF, with AI
  help for a layout Financy has not seen.
- Recurring transactions, and the Telegram bot for quick entry and balances.
- CSV export of everything, billing, the admin panel and the public website in nine languages.

Later, not in the first version: bank sync, goals, debts, receipts, tags, net worth over time,
natural-language entry, the token API and the MCP server, and the store apps.

## Money rules

- Accounts and categories, not double-entry: an account holds money, a category says why it
  moved, and a transfer is one record with two sides.
- A refund is income in an expense category, and it lowers that category's spending.
- Amounts are integers in each currency's smallest unit, with at most 8 decimals.
- Rates: free ECB rates (via Frankfurter) for everyone, a manual rate on any transaction, and in
  the cloud one paid provider for the currencies the ECB lacks.

## Price

- **Self-hosted**: free, AGPL-3.0.
- **Cloud**: €4 a month or €40 a year per household, up to 6 members. Inviting a partner never
  costs more.
- **No trial.** A person tries Financy in the public demo, with sample data and no account, then
  pays from sign-up, with a 30-day money-back guarantee. With no users yet, the first thing to
  learn is whether people pay; a trial delays that answer and costs code (a trial clock, expiry
  emails, abuse rules) that the demo and the guarantee make unnecessary. A household that stops
  paying keeps read access and its export.

## Where it runs

financy.dev, with the app and the admin panel on subdomains, hosted in the EU (Hetzner) with
NeatSoft PTE LTD as the data controller. The public demo is a separate deployment with its own
database. The new Financy starts with an empty database: nothing moves from the old one.

## The owner's decisions

All on 2026-11-03, in chat. The quotes are the options the owner chose, or the owner's words.

| Decision | Owner's words |
| --- | --- |
| Price per household, €4 a month or €40 a year | "€4 per household" |
| No trial: demo, money-back guarantee, pay from sign-up (the owner asked the lead to choose) | "I want you to evaluate this advice and pick what makes more sense for this new business" |
| Domain financy.dev | "financy.dev" |
| All nine languages | "All nine, like Seed" |
| No data from the old Financy | "No, start clean" |
| Telegram bot, recurring transactions and crypto in the first version | "Core only (Recommended),Telegram bot,Recurring transactions,Crypto holdings" |
| Bank statement import, with AI help, in the first version | "They require Bank export import (csv? Pdf? Each bank export  is different format (even csv), so we might utilize AI to analyze how to parse it better for our parsing library). Please add that module too." |
| At most 8 decimals | "Up to 8 decimals" |
| ECB rates plus a paid fallback | "ECB free + paid fallback" |
| Accounts and categories, not double-entry | "Accounts + categories" |
| One level of parent categories | "One level of parents" |
| A refund lowers its category | "Lowers the category" |
