# Research for the rebuild on Seed

These files are the research behind Financy's rebuild on Seed. The first six were written on
2026-11-03 before the rebuild's issues were filed; `market/` (2026-11-03) and `gtm/`
(2026-11-04) came after, on the owner's questions about rivals and the launch. They are kept
for their reasoning and evidence. They are not the plan: where they disagree with
[`docs/financy/product.md`](../product.md) or Financy's [`AGENTS.md`](../../../AGENTS.md),
those win: `product.md` holds the owner's decisions, and
`AGENTS.md` says where each part of the code goes.

| File                                                     | What it covers                                                                       |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [product.md](product.md)                                 | Who Financy is for, the first version, price, the metric, risks and competitors      |
| [marketing.md](marketing.md)                             | Positioning, the website's pages, search and answer-engine plan, the launch channels |
| [legacy-features.md](legacy-features.md)                 | What the old code did, feature by feature, and the bugs found in it                  |
| [issue-triage.md](issue-triage.md)                       | A verdict for each of the old open issues                                            |
| [seed-surface.md](seed-surface.md)                       | What Seed already gives Financy, and the changes Seed needs                          |
| [libs-gap.md](libs-gap.md)                               | What the shared libraries (ts-libs, preact-components) lack for Financy              |
| [market/competitors.md](market/competitors.md)           | About 30 rivals: prices, features, licences and what their users complain about      |
| [market/needs.md](market/needs.md)                       | What people ask finance trackers for, from forums, issues and reviews                |
| [market/positioning.md](market/positioning.md)           | Where Financy wins, where it does not compete, and the comparison pages              |
| [market/bank-sync.md](market/bank-sync.md)               | Bank-feed providers, their prices and terms, and a path at no cost to the owner      |
| [gtm/ceo-plan.md](gtm/ceo-plan.md)                       | The launch plan: a goal per stage, the offers, referral, VAT and legal risks         |
| [gtm/channels-and-launch.md](gtm/channels-and-launch.md) | Where to publish, each channel's rules, the search gaps and the launch sequence      |

These things changed after they were written:

- **No trial.** The research recommends a 30-day trial without a card. The owner then asked for
  that advice to be weighed again, and the pick was no trial: the public demo, a 30-day money-back
  guarantee and free self-hosting take its place (`product.md`, "The lead's picks").
- **Bank statement import.** The research planned CSV import for the first version and the
  standard bank formats (OFX, QIF, CAMT.053, MT940) for later. The first version now takes CSV,
  OFX, QIF, CAMT.053, MT940 and PDF statements, with AI help for a layout it does not know.
- **Crypto precision.** `libs-gap.md` leaves it open; amounts now keep at most 8 decimals.
- **Referral.** `gtm/ceo-plan.md` caps rewards at 12 a year, lets only groups that have paid
  for 30 days refer and leaves founding testers out. The owner questioned each limit, and all
  three were dropped: a reward always needs a real friend's payment that cleared the refund
  window (https://github.com/spy4x/seed/issues/741).
- **VAT.** The owner picked Stripe Tax over a merchant of record such as Paddle.
- **Audience.** The research speaks of households; the owner added individuals and small
  businesses, with a plain note that Financy is not double-entry.
- **Envelopes and investments.** The research leaves both out; envelopes now come next as a
  method each group picks, and a basic investments view is filed.
- **"Built in Europe".** `gtm/ceo-plan.md` warns this must be literally true. No page uses it;
  say "hosted in the EU" only once Financy runs on a server there.

The item numbers inside these files (such as "S4" in `seed-surface.md`) are the research's own and
do not match the filed issues. The issues link back here where they rely on a finding.
