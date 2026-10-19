# AGENTS.md — Financy

Financy is a self-hosted finance tracker for a person or a family, in any mix of currencies,
licensed AGPL-3.0. The global agent instructions own Git Flow, review and cleanup; this file adds
what is specific to this repo.

## Financy is a product built on Seed

Financy is rebuilt on [Seed](https://github.com/spy4x/seed), the SaaS starter, the same way any
product starts from it. Seed and the shared libraries keep growing while Financy is built: when
Financy needs something they lack, or builds something they would benefit from, it goes there
first and Financy takes it from there.

The code in `apps/api`, `apps/web` and `libs/{client,server,shared}` is the old implementation.
Read it, and the old docs (`docs/`, `MULTI_CURRENCIES_FEATURE.md`, `DASHBOARD_ISSUES.md`), for
what Financy does: its features, its finance rules, its edge cases. Never for how: its structure,
transport, state handling and sync are superseded by Seed's, and none of it is ported. Seed's
[extraction inventory](https://github.com/spy4x/seed/blob/main/docs/financy-extraction-inventory.md)
says which old parts are still worth taking, and where they go.

**How the rebuild starts.** One PR tags the current `main` as `legacy`, replaces the tree with
Seed's `main`, and writes the Seed commit it copied into `.seed-commit`. Financy's own code is then
added in later PRs. Until that PR merges, the rest of this file describes the target.

## Where code goes

Decide in this order, and stop at the first that fits:

1. **No UI, any project could use it** (dates, money arithmetic, parsing, an integration) →
   `spy4x/ts-libs`. **A UI primitive** (a component, an icon, a token) →
   `spy4x/preact-components`. The global "Shared libs before local code" applies unchanged.
2. **Any SaaS product built on Seed would need it** (sign-in, groups and roles, billing, uploads
   and quotas, data export, languages, notifications, an admin module, deploy, backups) → Seed.
3. **Only a finance product needs it** → Financy. That is currencies and exchange rates,
   accounts, transactions, transfers, categories, budgets, balances, bill reminders, bank
   statement import and the Telegram bot's finance commands.

**Seed first, never a local stand-in.** A Financy change that needs Seed to change waits for it:
make the Seed change in Seed's own worktree, review and merge it there by Seed's rules, then take
it into Financy (below). Never write a local version in Financy and plan to move it later. The
same holds for something Financy already built that Seed would benefit from: move it to Seed, then
take it back. Seed gains code only when a Financy task in progress needs it now or the owner asked
for it, and the Seed PR's body names that Financy task.

Only the owner's own code moves from Financy into Seed or the libraries, because it becomes MIT
there. Code from an outside contributor stays in Financy.

## Seed's rules hold here

Read Seed's `AGENTS.md` (`~/sync/code/seed/AGENTS.md`, or on GitHub) before working here. Its
sections apply to Financy as written: the three layers of UI, the MPA working without JavaScript,
the `libs/ui` contract, the aggregate shape copied from `docs/aggregates.md`, the admin panel kept
in sync with every feature, and the product screenshots. Two sections do not apply: "The live demo
is not production" and "Financy".

A Financy aggregate (accounts, transactions, budgets and the rest) copies Seed's aggregate shape
file by file. Seed's example content (the notes aggregate, the live demo, Seed's own marketing
pages and pictures) is replaced by Financy's as Financy's own lands.

## Taking Seed's changes

Financy does not share Seed's git history, so Seed's changes come in as a patch from the commit in
`.seed-commit` to Seed's current `main`. Each sync is one PR on a `chore/seed-sync-<date>` branch:

```bash
git fetch https://github.com/spy4x/seed main
git diff "$(cat .seed-commit)" FETCH_HEAD -- . ':!AGENTS.md' | git apply --3way
git rev-parse FETCH_HEAD > .seed-commit
```

Resolve conflicts by keeping Financy's version of a file Financy owns (its aggregates, screens,
brand, website copy) and Seed's version of anything else. A file Financy deleted stays deleted.
Run the full check before the PR. Sync when a Seed change made for Financy merges, and before
starting work that relies on a recent Seed change.

## Money and finance data

- Amounts are integers in the currency's minor unit, which differs per currency (a yen has none,
  a dinar has three). Never a float.
- A transaction keeps its original amount and currency next to the converted one, so a later rate
  change never rewrites history.
- Financy's production server holds real people's financial data. Nothing on it is disposable:
  there is no demo carve-out here.
