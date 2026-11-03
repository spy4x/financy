# AGENTS.md — Financy

Financy is a self-hosted finance tracker for a person or a family, in any mix of currencies,
licensed AGPL-3.0. The global agent instructions own Git Flow, review and cleanup; this file adds
what is specific to this repo.

## Financy is a product built on Seed

Financy is built on [Seed](https://github.com/spy4x/seed), the SaaS starter, the same way any
product starts from it: this tree began as a copy of Seed's `main`, and `.seed/` records which
Seed commit it last took. Seed and the shared libraries keep growing while Financy is built: when
Financy needs something they lack, or builds something they would benefit from, it goes there
first and Financy takes it from there.

## The old Financy is a reference for what, never for how

The first Financy lives on the branch `legacy`, frozen. Read it, and its docs (`docs/`,
`MULTI_CURRENCIES_FEATURE.md`, `DASHBOARD_ISSUES.md`), for what Financy does: its features, its
finance rules, its edge cases. Never for how: its structure, transport, state handling, sync and
code are not ported, not even a helper. The owner, 2026-11-03: "never blindly taking old code (it
was implemented using outdated AI models and the code is probably shit and full of bugs)".

- A finance rule taken from `legacy` is a hypothesis. Write it down as a test from the rule
  itself, check it against the issue, then write new code that passes it.
- Nothing is committed to `legacy`. An issue about the old code is done in the rebuild, or not
  at all.
- Seed's [extraction inventory](https://github.com/spy4x/seed/blob/main/docs/financy-extraction-inventory.md)
  says which old ideas are still worth taking, and where they go.

## Where code goes

Decide in this order, and stop at the first that fits:

1. **No UI, any project could use it** (dates, money arithmetic, parsing, an integration) →
   `spy4x/ts-libs`. **A UI primitive** (a component, an icon, a token, a chart) →
   `spy4x/preact-components`. The global "Shared libs before local code" applies unchanged.
2. **Any SaaS product built on Seed would need it** (sign-in, groups and roles, billing, uploads
   and quotas, data import and export, scheduled jobs, languages, notifications, an admin module,
   deploy, backups) → Seed.
3. **Only a finance product needs it** → Financy. That is a household's accounts, transactions,
   transfers, categories, budgets, balances, base currency and rate history, how a bank
   statement's rows become transactions, bill reminders and the Telegram bot's finance commands.
   The parts under them are not: a currency table, an exchange-rate client, a statement parser
   and an LLM client go to ts-libs.

**Seed first, never a local stand-in.** A Financy change that needs Seed to change waits for it:
make the Seed change in Seed's own worktree, review and merge it there by Seed's rules, then take
it into Financy (below). Never write a local version in Financy and plan to move it later. The
same holds for something Financy already built that Seed would benefit from: move it to Seed, then
take it back. Seed gains code only when a Financy task in progress needs it now or the owner asked
for it, and the Seed PR's body names that Financy task.

**Every Financy issue names the home of each part.** Its "What I suggest" says which parts go to
ts-libs, preact-components, Seed or Financy, by the order above, and links the library or Seed
issue that must merge first. An implementer who finds an unnamed reusable part stops and reports
it to the lead instead of writing it locally. The owner asked for this on 2026-11-03: "ensuring
we are always implementing things in shared libraries and Seed if something that Financy needs is
actually reusable and helpful for other potential projects".

Only the owner's own code moves from Financy into Seed or the libraries, because it becomes MIT
there. Code from an outside contributor stays in Financy.

## Seed's rules hold here

Read Seed's `AGENTS.md` (`~/sync/code/seed/AGENTS.md`, or on GitHub) before working here. Its
sections apply to Financy as written, with "Seed" read as "Financy" where they name the product:
"Three layers of UI", "Adding a feature", "The admin panel stays in sync", "The public website
stays in sync", "Product screenshots", "Blog" and "Handoff". Three sections do not apply: "The
live demo is not production", "Products built on Seed" and "Financy". "The public demo" applies
to Financy's demo, which is its own deployment with its own database: `DEMO_MODE` is never on in
production.

A Financy aggregate (accounts, transactions, budgets and the rest) copies Seed's aggregate shape
file by file ([docs/aggregates.md](docs/aggregates.md)). Seed's example content (the notes
aggregate, the live demo, Seed's own marketing pages, posts and pictures) is replaced by
Financy's as Financy's own lands; [docs/start-a-product.md](docs/start-a-product.md) lists it.

## Taking Seed's changes

Financy takes Seed's later changes with the sync in Seed's
[docs/products.md](docs/products.md), "Take Seed's changes". `.seed/commit` holds the Seed commit
Financy last took, and `.seed/skip` the Seed paths Financy deleted or owns completely. Sync when a
Seed change made for Financy merges, and before starting work that relies on a recent Seed change.

## Licences

Financy is AGPL-3.0 (`LICENSE`). The code that came from Seed keeps its MIT notice in
`LICENSES/MIT-seed.txt`, which the MIT licence requires; never delete it.

## What Financy is building

[docs/financy/product.md](docs/financy/product.md) holds who Financy is for, what the first
version does, the price, and the owner's decisions in the owner's words. Read it before building a
feature; a feature it does not list needs the owner first.

## No release and no deploy yet

Until the deploy issue in the "MVP" milestone merges, nothing is tagged and nothing is deployed:
the tree still carries Seed's site, prices and author, and a deploy would put them on
financy.dev. The global rule to release after a green gate starts to apply here then.

## Money and finance data

- An amount is an integer in its currency's smallest unit, never a float. That unit differs per
  currency: a yen has none, a dinar has three. A currency's decimals come from the ISO 4217 table
  in ts-libs, never from `Intl`, and a crypto currency has at most 8.
- A transaction keeps its original amount and currency next to the converted one, so a later rate
  change never rewrites history.
- Once Financy runs in production, that server holds real people's financial data. Nothing on it
  is disposable: there is no demo carve-out here.
