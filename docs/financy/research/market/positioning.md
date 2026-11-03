# Positioning, prices and comparison pages

Where Financy can win and where it cannot, how its price compares, and which "Alternatives to X"
and "X vs Y" pages to write first. The last part is a separate short list of comparison pages for
Seed, the free SaaS starter Financy is built on.

This file extends `docs/financy/research/marketing.md` and does not repeat its site map or
blog plan. Every page was read on **2026-11-03**. **Unconfirmed** marks a fact I could not check
on the vendor's own page. Details and links for each competitor are in `competitors.md`.

Financy costs **$4 a month or $40 a year** (US dollars) per household of up to 6 members, as
`docs/financy/product.md` says.

## In short

- **Financy wins where two needs meet:** a household that shares money across several currencies.
  - Firefly III has currencies but no sharing.
  - Actual Budget has sharing but no currencies.
  - The paid apps confirmed to have both (PocketSmith, Buxfer Prime) cost $10 to $24 a month and
    cannot be self-hosted.
- **Sure is the one rival with the same shape:** AGPL, self-hosted or hosted, households, many
  currencies. It has a free hosted tier, and its $50-a-year tier costs about what Financy does
  while including bank sync. Financy must beat it on rates, offline use, entry speed and calm.
- **Write the Firefly III, YNAB and Actual pages first**, as `marketing.md` plans. Then add Monarch
  for Europe, a neutral "Firefly III vs Actual Budget vs Sure" guide, and Copilot for Android.

## Where Financy wins

1. **One household, many currencies, separate logins.** Among open-source web apps, only Sure also
   does all three, and Financy matches its price. Firefly III makes partners share a password; Actual
   needs an OpenID provider and has no currencies; ezBookkeeping has no sharing.
2. **Exchange rates people can trust.** It keeps the original amount, uses the rate of the
   transaction's date, and lets the user override it. Firefly III treats a missing rate as 1, and
   Sure has an open bug that converts at 1.0. Lunch Money's per-transaction historic rate is the
   bar.
3. **Offline in the browser, live between members.** Among the self-hosted web apps checked, only
   Actual is built to work offline, and it has no currencies.
4. **Five-second entry for the partner,** in the PWA and the Telegram bot. None of the twelve main
   rivals offers a Telegram bot of its own, as far as I found (not checked exhaustively). Small
   Telegram-only trackers (Cointry, Smart Budget Bot) have no full app
   behind them.
5. **The same code self-hosted or in the cloud, AGPL.** Firefly III refuses to offer hosting.
   PikaPods hosts Actual and Firefly III but adds no features. Monarch, Copilot and YNAB cannot be
   self-hosted.
6. **Languages and regions the US apps ignore.** Google suggests "monarch money alternative for
   europe", "copilot money alternative uk" and "copilot money alternative for android". In German
   it suggests "finanzguru alternative self hosted"; in Russian, "дзен мани альтернатива"
   ("Zenmoney alternative"). Financy ships in nine languages.

## Where Financy cannot win, for now

Say so on the pages; it is also what earns an answer engine's citation.

- **US bank feeds.** Monarch, Copilot, YNAB and Rocket Money connect thousands of US banks.
  Financy has statement import until sync arrives (`bank-sync.md`).
- **Envelope or zero-based budgeting.** YNAB, Actual and Goodbudget own this method.
- **Investments and net worth.** Sure, Ghostfolio, Wealthfolio and Monarch. Financy tracks crypto
  holdings only.
- **Native app reach.** Cashew has 500K+ installs at 4.9 stars; Wallet and Toshl have years in the
  stores. Financy's PWA must feel native to compete on the phone.
- **Double-entry and plain-text accounting.** GnuCash, Beancount, hledger and Firefly III.
- **The lowest price.** Sure's hosted tier is free (without bank sync), and PikaPods hosts Actual
  from $2.00 a month.

## Price table

Household prices from each vendor's page, in the currency shown. "Both" means many currencies and
household sharing in the same plan.

| App | Monthly | Yearly | Both? | Self-host | Source |
| --- | --- | --- | --- | --- | --- |
| **Financy cloud** | **$4** | **$40** | yes, up to 6 members | yes, free | `product.md` |
| Sure hosted "Better" / "Best" | $5 / $9 | $50 / $90 | yes | yes, free | [sure.am](https://sure.am/pricing) |
| Actual on PikaPods | from $2.00 | — | no currencies | yes, free | [PikaPods](https://www.pikapods.com/apps/actual) |
| Firefly III on PikaPods | from $2.66 | — | no sharing | yes, free | [PikaPods](https://www.pikapods.com/apps/firefly-iii) |
| Lunch Money | $10 | you choose, default $100; minimum reportedly $60 (**unconfirmed**) | currencies yes; sharing not checked | no | [pricing](https://lunchmoney.app/pricing) |
| PocketSmith Foundation / Flourish | $14.95 / $24.95 | $119.88 / $199.92 | yes | no | [plans](https://my.pocketsmith.com/plans) |
| Buxfer Prime (family access) | $23.99 | $251.88 | yes | no | [pricing](https://www.buxfer.com/pricing) |
| YNAB | $14.99 | $109 | no: one currency per budget | no | [pricing](https://www.ynab.com/pricing) |
| Monarch Money | $14.99 | $99.99 | no: limited currencies (**unconfirmed**) | no | [pricing](https://www.monarch.com/pricing) |
| Copilot Money | $18 | $109 offer, $119 list | no: households "coming soon" | no | [pricing](https://copilot.money/pricing) |
| Quicken Simplifi | $6.99 billed yearly | $83.88 | sharing with one person | no | [Simplifi](https://www.quicken.com/products/simplifi/) |
| Spendee Premium | $5.99 | $35.99 | shared wallets; currencies not checked | no | [pricing](https://www.spendee.com/pricing) |
| Wallet (BudgetBakers) | about $5.99 (**unconfirmed**) | about $21.99 (**unconfirmed**) | yes | no | third-party reviews |
| Toshl | not shown without JavaScript (**unconfirmed**) | — | currencies yes; sharing not checked | no | [pricing](https://toshl.com/pricing/) |
| Emma (UK) | £4.99–£14.99 | £41.99–£124.99 | not checked | no | [help centre](https://help.emma-app.com/en/article/1ywhulq/) |
| CoinKeeper Platinum | 399 ₽ | 1,490 ₽ (lifetime 2,990 ₽) | yes (family) | no | [coinkeeper.me](https://coinkeeper.me/) |
| Tiller | — | $99 | spreadsheet | no | [pricing](https://tiller.com/pricing/) |
| Cashew | free | free | no sharing | no | [Google Play](https://play.google.com/store/apps/details?id=com.budget.tracker_app&hl=en_US) |

What it shows:

- **Against the paid apps,** Financy at $40 a year is under half of YNAB, Monarch and Copilot,
  which also lack currencies. It is about a third of PocketSmith's cheapest plan with both.
- **Against Lunch Money,** the nearest paid product in spirit, Financy is cheaper and adds
  self-hosting and offline use.
- **Against Sure,** "Better" at $50 a year is close to Financy's $40, and Sure includes hosted bank
  sync. Financy must show the household and currency difference plainly.
- **Price rises in the last year** are a theme to use honestly (`needs.md`, rank 3). The examples:
  - Copilot now lists $18 a month, where third-party sites showed $13 a month or two ago.
  - Lunch Money's minimum reportedly rose to $60.
  - Monarch's top tier reportedly rose in May 2026.

## Comparison pages for Financy, ranked

**Signals used.**

- **Google autocomplete:** the suggestions people get when they type the query, in English unless
  noted. More suggestions with qualifiers such as "free", "open source", "self hosted" or "reddit"
  mean an active search.
- **Pages that already rank:** which competitors or review sites publish a page for the same
  query.
- **Fit:** how directly Financy answers the searcher's reason to leave.
- **Reddit thread counts are missing:** Reddit refuses automated readers, and I did not work around
  that. A "… reddit" suggestion is used as a proxy.

| Rank | Page | Autocomplete evidence | Who already ranks | Why Financy fits |
| --- | --- | --- | --- | --- |
| 1 | **Firefly III alternative** (planned: for couples) | "firefly iii alternative self hosted", "… reddit", "… price"; German "firefly iii alternativen" | [beancount.io](https://beancount.io/compare/firefly-iii-alternatives), [openalternative](https://openalternative.co/firefly-iii), [alternativeto](https://alternativeto.net/software/firefly-iii/) | same self-hosting audience; Financy adds sharing and reliable rates |
| 2 | **YNAB alternative** (planned: for multiple currencies) | "ynab alternative free / open source / self hosted / reddit / canada / australia"; "does ynab support multiple currencies"; "ynab multi currency plugin" | [Monarch](https://www.monarch.com/compare/ynab-alternative), [Lunch Money](https://lunchmoney.app/compare/ynab-alternative), [beancount.io](https://beancount.io/compare/ynab-alternatives) | the largest query; currencies and price are Financy's answer |
| 3 | **Actual Budget alternative** (planned: with multiple currencies) | "actual budget alternative self hosted / open source / reddit", "actual budget gocardless alternative", "actual budget multi currency support", "actual budget foreign currency" | [Lunch Money](https://lunchmoney.app/compare/actual-budget-alternative), [beancount.io](https://beancount.io/compare/beancount-vs-actual-budget) | currencies; **re-check before publishing**, since Actual's currency PR (#9356) is open |
| 4 | **Monarch Money alternative for Europe** (new) | "monarch money alternative for europe", "monarch money uk alternative", "… cheaper alternative", "… open source alternative", "does monarch money support multiple currencies" | [Lunch Money](https://lunchmoney.app/compare/monarch-alternative), [beancount.io](https://beancount.io/compare/monarch-alternatives) | Europe, currencies, a third of the price |
| 5 | **Firefly III vs Actual Budget vs Sure** (new, a neutral guide with Financy as the fourth column) | "firefly iii vs actual budget" (the top "vs" suggestion for both), "actual budget vs firefly iii vs sure", "firefly iii vs sure", "actual budget vs sure" | [beancount.io blog](https://beancount.io/blog/2026/07/26/firefly-iii-vs-actual-budget-self-hosted-open-source-budgeting-guide) | the decision every self-hoster faces; answer engines quote such tables |
| 6 | **Copilot Money alternative for Android and Europe** (new) | "copilot money alternative for android / europe / uk / canada", "copilot money free alternative reddit", "… open source alternative" | [beancount.io](https://beancount.io/compare/copilot-alternatives) | web and Android, households now, and the fresh price rise |
| 7 | **Multi-currency budget app** (category question page) | "budget app multiple currencies reddit / at once / in one account", "best multi-currency budget app", "personal finance app multiple currencies" | Lunch Money's [multi-currency page](https://lunchmoney.app/features/multicurrency); vendor blogs such as getfinny.app | the core promise, stated as the searcher types it |
| 8 | **Budget app for couples / family budget app** (category) | "budget app for couples free / reddit / to share", "budgeting app for couples with separate accounts", "family budget app multiple users free"; German "haushaltsbuch app für paare ohne kontoanbindung" | many listicles | the partner persona; the German query fits manual entry exactly |
| 9 | **Sure vs Financy, or Maybe Finance alternative** (new) | "maybe finance alternative", "… reddit"; "sure finance github" | none found | the nearest rival; Maybe's former users still search |
| 10 | **Zenmoney and CoinKeeper alternative** (Russian, new) | "дзен мани альтернатива", "zenmoney альтернатива google play", "coinkeeper альтернатива на пк", "дзен мани или coinkeeper" | none found | Russian-speaking expats; Zenmoney's EU sync rests on GoCardless |
| 11 | **Toshl, Wallet and Spendee alternatives** (one page each, later) | "toshl alternatives reddit", "wallet budgetbakers alternative free / reddit", "spendee alternatives free / reddit" | none found | the same multi-currency mobile users; small volume |
| 12 | **Finanzguru and MoneyMoney alternatives** (German, later) | "finanzguru alternative open source / self hosted / kostenlos", "moneymoney alternative linux / windows" | none found | German self-hosters; MoneyMoney is Mac-only |
| — | Skip for now | "mint alternative" (US bank-feed intent, crowded); "lunch money alternative" (mostly about children's lunch money); "pocketsmith alternative" (moderate, after rank 11) | — | — |

Rules from `marketing.md` still apply: the page opens with when the competitor is the better
pick, and every fact carries a source and a "Checked on" date.

## How competitors answer "will you still be here?"

How each one answers it:

- **Lunch Money: a price promise and profit.** The price is locked for life
  ([pricing](https://lunchmoney.app/pricing)). It has no investors and says it was profitable
  within its first few years ([about](https://lunchmoney.app/about/)).
- **Firefly III: there is nothing to shut down.** It is AGPL code you run yourself, and the
  developer says plainly that it is not a business
  ([FAQ](https://github.com/firefly-iii/docs/blob/main/docs/docs/references/faq/firefly-iii/general.md)).
- **Actual: a community and a file on your device.** It has 781 contributors and an MIT licence,
  and its local-first design keeps the data on the user's machine.
- **Sure: proof that a fork works.** It exists because Maybe shut down, and the AGPL let the
  community carry on ([GitHub](https://github.com/we-promise/sure)).
- **Monarch: positioned as the safe landing for Mint's users.** It publishes a
  [Mint alternative page](https://www.monarch.com/compare/mint-alternative), and its co-founder was
  Mint's original product manager.
- **Cashew: the data never leaves you.** Data lives on the phone, with backup to the user's own
  Google Drive.

The cautionary record people remember:

- **Mint** closed (2023).
- **Maybe Finance** was archived in 2025-07, and its rates service went with it.
- **Ivy Wallet** has been unmaintained since 2024-11.
- **Budget Zen** was archived.
- **Spectre's** free consumer tier reportedly ended (**unconfirmed**).
- **GoCardless** stopped taking new bank-data customers.

**The owner's own answer, on antonshubin.com.** It rests on ownership rather than company age.
[How I work](https://antonshubin.com/how-i-work) promises clients that they own the code and keys
from day one, with a 5-day refund. [Why not just AI](https://antonshubin.com/why-not-just-ai)
shows the process: a separate reviewer with a security review, agent rules public in
spy4x/dotfiles, and a public track record.

**Suggested answer for Financy,** one short section on `/pricing` and the self-hosting page:

1. The code is AGPL on GitHub. If Financy stops, anyone can run it, as Sure's community did after
   Maybe.
2. The cloud runs the same code you can self-host. Moving is an export and an import, and the docs
   show the one command.
3. Export everything at any time in open formats. A household that stops paying keeps read access
   and its export (already in `product.md`).
4. Exchange rates come from the ECB through Frankfurter, a public source, and do not depend on a
   private service that could close the way Maybe's Synth did.
5. **The owner's call:** a price lock for early households, as Lunch Money offers. It answers both
   the price fear and the longevity fear in one line.

## Comparison pages for Seed

Seed is a free, MIT-licensed SaaS starter on Deno, Hono, Fresh and Preact
([seedsaas.com](https://seedsaas.com)). Its sitemap already has
[/compare](https://seedsaas.com/compare),
[SaaS Pegasus alternatives](https://seedsaas.com/blog/saas-pegasus-alternatives),
[ShipFast alternatives](https://seedsaas.com/blog/shipfast-alternatives) and
[free SaaS boilerplate](https://seedsaas.com/blog/free-saas-boilerplate).

The field, from each vendor's page or the GitHub API, read 2026-11-03:

| Starter | Price | Licence or terms | Stack | Signal |
| --- | --- | --- | --- | --- |
| [ShipFast](https://shipfa.st) | $199 Starter (list $299), $249 All-in (list $349), $299 with CodeFast; one-time | paid licence | Next.js | the page shows "$100 off for the first 8460 customers (14 left)" |
| [Supastarter](https://supastarter.dev) | $349, $799 or $1,499 once; a subscription option too | paid licence | Next.js | — |
| [MakerKit](https://makerkit.dev/pricing) | Pro $299 (list $349), Teams $599 (list $649); lifetime | paid licence; free "lite" kit on GitHub (466 stars) | Next.js | — |
| [Jumpstart Pro](https://jumpstartrails.com/pricing) | $199 a year (list $249) or $599 a year (list $749), Black Friday prices | paid, yearly | Rails | — |
| [SaaS Pegasus](https://www.saaspegasus.com/pricing/) | $449 or $649 (update terms not checked) | paid licence | Django | Seed already has a page |
| [SaaSrock](https://saasrock.com/pricing) | $249, $499 or $1,999 once; custom from $6k | paid licence | not checked | — |
| [Open SaaS](https://opensaas.sh) | free | MIT, 16,243 stars, pushed 2026-10-28 | React, Node, Prisma on Wasp | the main free rival |
| [Bullet Train](https://bullettrain.co) | free | MIT, 1,892 stars | Rails | — |
| Next.js SaaS Starter (`nextjs/saas-starter`) | free | MIT, 16,249 stars, last push 2025-12-11 | Next.js | quiet for 11 months |
| create-t3-app | free | MIT, 29,203 stars, last push 2025-12-13 | Next.js, tRPC | a scaffold, not a full SaaS |
| ixartz SaaS Boilerplate | free | MIT, 7,480 stars | Next.js | Google suggests it by name |
| Epic Stack | free | MIT, 5,547 stars | React Router | — |
| Wave (DevDojo) | free | MIT, 6,553 stars | Laravel | — |
| BoxyHQ SaaS Starter Kit | free | Apache-2.0, 4,965 stars | Next.js | — |
| Apptension SaaS Boilerplate | free | MIT, 3,027 stars | Django, React | Google suggests it by name |

Ranked new pages, by autocomplete evidence and fit:

1. **ShipFast vs Supastarter vs MakerKit, and a free alternative.** Google completes all six
   pairings among the three ("shipfast vs makerkit", "supastarter vs makerkit", "makerkit vs
   shipfast"…), and "makerkit alternatives" plus "supastarter alternative" exist. One neutral
   three-way table with Seed as the free fourth column.
2. **Open SaaS vs Seed.** "open saas", "open saas github", "open saas boilerplate" and "open saas
   (wasp)" are all suggested. It is the other free MIT starter with real users, so an honest
   comparison (React and Node on Wasp against web standards on Deno, Hono and Fresh) answers the
   question a free-starter shopper actually has.
3. **Best open-source SaaS boilerplate.** Suggested: "best open source saas boilerplate", "best free
   saas boilerplate", "open source saas boilerplate github". Extend the existing free SaaS
   boilerplate page or add a dated list.
4. **Hono SaaS starter.** "hono boilerplate", "hono boilerplate github", "hono bun boilerplate" and
   "hono api boilerplate" are suggested, and no SaaS starter owns the query. Seed is built on Hono,
   and running on Bun is a stated goal.
5. **Next.js SaaS Starter alternative.** "nextjs saas starter", "… kit", "… github" and
   "… supabase" are the biggest query family. Seed is not Next.js; the honest angle is "a full SaaS
   on web standards, not a framework lock-in". Vercel's starter has been quiet since 2025-12.
6. **Jumpstart Pro alternatives.** "jumpstart pro alternatives" and "jumpstart pro alternative free"
   are suggested, but the searchers want Rails, so the fit is weak.
7. **Skip for now:**
   - **Bullet Train:** "bullet train vs" completes to trains.
   - **create-t3-app and Epic Stack:** no "vs" suggestions.
   - **"deno saas":** completes to definitions of SaaS. "deno boilerplate" and "preact boilerplate"
     exist but are small.
