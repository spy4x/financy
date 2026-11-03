# Research for the rebuild on Seed

These six files are the research behind Financy's rebuild on Seed, written on 2026-11-03 before
the rebuild's issues were filed. They are kept for their reasoning and evidence. They are not the
plan: where they disagree with [`docs/financy/product.md`](../product.md), `product.md` wins,
because it holds the owner's decisions.

| File                                         | What it covers                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| [product.md](product.md)                     | Who Financy is for, the first version, price, the metric, risks and competitors        |
| [marketing.md](marketing.md)                 | Positioning, the website's pages, search and answer-engine plan, the launch channels   |
| [legacy-features.md](legacy-features.md)     | What the old code did, feature by feature, and the bugs found in it                    |
| [issue-triage.md](issue-triage.md)           | A verdict for each of the old open issues                                              |
| [seed-surface.md](seed-surface.md)           | What Seed already gives Financy, and the changes Seed needs                            |
| [libs-gap.md](libs-gap.md)                   | What the shared libraries (ts-libs, preact-components) lack for Financy                |

Two things changed after they were written:

- **No trial.** The research recommends a 30-day trial without a card. The owner then asked for
  that advice to be weighed again, and the pick was no trial: the public demo, a 30-day money-back
  guarantee and free self-hosting take its place (`product.md`, "The lead's picks").
- **Bank statement import** joined the first version afterwards, so these files do not cover it.

The item numbers inside these files (such as "S4" in `seed-surface.md`) are the research's own and
do not match the filed issues. The issues link back here where they rely on a finding.
