# Financy website: search, answer-engine and conversion plan

Prepared 2026-11-03 for the rebuild on Seed. Advice only; nothing here is built. Evidence labels:
`documented` (an engine's or platform's own docs), `studied` (a named study with a method),
`likely` (judgment). No keyword tool was used: **every demand claim below is a guess from what
ranks and what people post, not a measured volume.** Search Console impressions, once the site is
live, replace these guesses.

## 0. The facts every page repeats

One entity description, word for word, on the home page's first sentence, the JSON-LD, the
README, `llms.txt`, GitHub's "About" and every directory listing (`documented`: Microsoft's
"Optimizing your content for inclusion in AI search answers", Oct 2025, asks for consistent facts):

> Financy is a free, open-source (AGPL-3.0) finance tracker for a person or a family, in any mix
> of currencies: self-host it, or use the paid cloud.

Rules for the copy:

- "Free" means self-hosting. The cloud price sits on `/pricing` only, never right after "free"
  in one sentence, so an engine does not quote "Financy is free" about the cloud.
- One name per thing: "group" in the app vs "household" on the site is two names. Pick one
  (suggest: the site says "household (a group in the app)" once, then "household").
- Status is stated, not hidden: until the rebuild is usable daily, every page carries the
  README's "work in progress" line. A page never names a feature the rebuilt app lacks (issue
  #82, point 4; Seed `AGENTS.md`, "The public website stays in sync").

## 1. Site map

Every page answers one question. Two pages never answer the same one. Primary action (CTA) is one
per page. "Self-host" = link to `/docs/self-host`; "Cloud" = sign-up in the SPA (only once the
cloud takes sign-ups; until then "Get notified" = newsletter).

### Core pages

| Path | One job | Primary action | Question it answers |
| --- | --- | --- | --- |
| `/` | Say what Financy is in five seconds; show the multi-currency total | Self-host (secondary: Cloud) | "self-hosted finance tracker multiple currencies" |
| `/features` | Index of built features, each linking to its page | Open a feature page | "what can Financy do" |
| `/pricing` | Cloud vs self-host, both prices open, what each includes | Cloud sign-up | "Financy price", "is Financy free" |
| `/docs/self-host` | Install with Docker Compose in one page | Copy the compose file | "how to self-host Financy" |
| `/docs/*` | Backups, upgrades, exchange-rate source, Telegram bot setup, import | none (help) | one task each |
| `/alternatives` | Hub of honest comparisons, dated | Open a comparison | "Financy alternatives" / "vs" |
| `/blog`, `/changelog`, `/subscribe` | Build in public; returning readers | Subscribe | — |
| `/privacy`, `/terms` | Legal, written for real financial data | — | — |
| `/admin` | Delete (Seed's page about its admin panel; Financy's operators are not buyers) | — | — |

### Feature pages (`/features/<slug>`, Seed's `features-data.tsx` page type)

Only for what is built at the time; add each in the PR that ships the feature.

| Slug | Question (answer starts "Yes.", "No." or "Not yet.") | Built today? |
| --- | --- | --- |
| `multi-currency` | "How do I see balances in several currencies as one total?" | Old app yes; rebuild no |
| `households` | "Can my partner and I share a budget, each with our own login?" | Partly (roles) |
| `live-sync` | "Do changes show on my partner's phone without reloading?" | Old app yes |
| `transfers` | "How do I record a transfer between accounts in different currencies?" | Old app yes |
| `budgets` | "Can I set a monthly limit per category?" | Old app yes |
| `self-hosting` | "Can I run a budget app on my own server?" | Yes (Seed deploy) |
| `telegram-bot` | "Can I add an expense from Telegram in plain words?" | Partly (#16 bug) |
| `import` | "Can I import a bank statement CSV?" | No (#33): no page yet |

### Use-case pages (`/for/<slug>`, new route sharing the feature page type)

One kind of person each; the first paragraph names their situation, then how Financy handles it,
with one real screenshot. Ship three first (expats, couples, families); add the other two only
where Search Console shows impressions for them (#82, point 4; `documented`: Google spam policy on
scaled content abuse counts many near-identical pages).

| Slug | Question | Distinct from |
| --- | --- | --- |
| `expats` | "How do I budget when I earn in one currency and spend in another?" | `multi-currency` (feature, not life) |
| `couples` | "How do couples track shared and separate money in one app?" | `households` (mechanics) |
| `families` | "Is there a self-hosted budget app for the whole family?" | `couples` (kids, roles, viewer) |
| `freelancers` | "How do I track income paid in a foreign currency?" | later |
| `digital-nomads` | "How do I track spending across countries while travelling?" | later; may merge into `expats` |

### Alternative pages (`/alternatives/<slug>`, replaces Seed's `/compare`)

Each opens with a one-sentence answer that names when the competitor is the better pick (the
README already says "If you need something finished today, use Actual Budget or Firefly III").
A table of checked facts with "Checked on <date>" and a source link per row. Re-check every three
months; change the date only when re-checked. Facts verified for this plan on 2026-11-03:

| Page | Lead answer (draft) | Checked facts |
| --- | --- | --- |
| `ynab-multiple-currencies` "Alternatives to YNAB for multiple currencies" | YNAB keeps one currency per plan; Financy totals any mix in one household. | YNAB's own guide suggests a separate plan per currency ([support.ynab.com](https://support.ynab.com/en_us/using-multiple-currencies-in-ynab-a-guide-SyBF6PHno)) |
| `firefly-iii` "Firefly III alternative for couples" | Firefly III is the mature choice for one person; it cannot share one administration between two logins today. | Firefly III FAQ: each administration is locked to one user; sharing means sharing the password; a sharing model is planned ([docs.firefly-iii.org FAQ](https://docs.firefly-iii.org/references/faq/firefly-iii/general/), [multi-user](https://docs.firefly-iii.org/how-to/firefly-iii/features/multi-user/)) |
| `actual-budget` "Actual Budget with multiple currencies" | Actual is the best self-hosted envelope budget; it does not do multi-currency yet. | Actual docs: "currency agnostic and does not support multi-currency", workaround with rule templates ([actualbudget.org](https://actualbudget.org/docs/budgeting/multi-currency)) |

Later candidates, after checking their facts: ezBookkeeping, Lunch Money, Wallos (different job,
probably skip). Never claim a competitor lacks something without a dated source.

**Cut:** issue #38 (separate Vite landing page) is superseded by Seed's MPA; Seed's `/compare`,
`/admin`, `/mvp`, hire band and Seed posts (Seed `docs/start-a-product.md`).

### Languages

All nine, as Seed serves them; each page written for that language's searchers, never translated
word for word (`documented`: Google multilingual guide; scaled content abuse). Where the phrase
differs, write for the native phrase: ru "учёт расходов в нескольких валютах", "семейный
бюджет"; de "Haushaltsbuch mehrere Währungen"; es "presupuesto familiar varias monedas"; pt-BR
"controle financeiro várias moedas". A Russian-language search for multi-currency family budgets
returns mostly app-store apps (Moneon, Дзен-мани, CoinKeeper) and no self-hosted option; the German
one returns app reviews and no self-hosted pick ([lifehacker.ru](https://lifehacker.ru/family-budget/),
[finanzwissen.de](https://finanzwissen.de/vergleich/haushaltsbuch-apps/)). So a native ru and de
page may face weaker competition than English (`likely`). Suggest ru, de, es first after en.

## 2. First 10 blog posts (proposals for the owner, per Seed `AGENTS.md` "Ideas go to the owner first")

Each is a proposal, not an issue, until the owner says yes. "Scar" = honest failure story.

1. **How to track expenses in two currencies and still see one total.** Reader: expat or couple
   with accounts in two currencies. Question: "track expenses in two currencies". Outline: why one
   total needs a base currency and a rate date; original amount vs converted; how Financy and a
   spreadsheet each do it. Interactive: two-account calculator (amount, currency, rate date →
   total, with today's vs the day's rate). Highest priority: it is the product's core intent.
2. **Why your net worth moved when you spent nothing.** Reader: anyone holding two currencies.
   Question: "why does my balance change exchange rate". Outline: revaluation explained; the
   original-amount rule; what to show the user. Interactive: a rate slider moving the total.
3. **How to share a budget with your partner without sharing a password.** Reader: couple.
   Question: "share budget with partner self hosted". Outline: why shared logins break audit and
   privacy; roles (viewer, editor, admin); live sync. Interactive: a role table, "who can do what".
4. **Scar: what the first Financy got wrong, and why I started over on Seed.** Reader: builders
   and self-hosters. Question: none; build-in-public and HN fodder. Outline: the old structure and
   sync; what broke (#18 WebSocket drops, #19 stale balances); what the rebuild changes. Interactive:
   before/after architecture diagram. **Scar.**
5. **How to record a currency exchange between your own accounts, fees included.** Reader:
   expats, freelancers. Question: "record currency transfer budget app". Outline: two linked
   transactions; implied rate vs market rate; where the fee goes. Interactive: enter sent and
   received amounts → implied rate and hidden fee.
6. **Budgeting when your salary and your rent are in different currencies.** Reader: expat.
   Question: "expat budgeting different currency salary". Outline: the risk in one number; a buffer
   rule; tracking it monthly. Interactive: "a 5% rate move changes your month by X".
7. **Which exchange rate should a personal finance app use?** Reader: technical self-hoster.
   Question: "which exchange rate for personal finance". Outline: transaction-day vs daily
   reference vs the bank's rate; Financy's choice and why; **original data**: the owner's own bank
   rates vs the reference rate on real transactions (`studied`: AI-citation studies by Ahrefs and
   Semrush find first-hand data overrepresented; only with numbers the owner supplies).
   Interactive: table of the measured gaps.
8. **Scar: the bug that sent one household's changes to every connected user.** Reader:
   developers. Question: none. Outline: what #76 did, how it was found, the fix and the test, and
   that no production users existed (#60). Interactive: none; a sequence diagram. **Scar**, after
   the fix ships and only with the owner's yes.
9. **Self-host Financy on a small server, with backups.** Reader: self-hoster. Question: "self
   hosted budget app docker". Outline: compose file; backups with restic or Litestream; upgrades.
   Interactive: copyable compose; a cost table self-host vs cloud (prices checked on the day).
   Distinct from `/docs/self-host`: the post is the story and the trade-off, the doc is the steps.
10. **What's new in Financy** (monthly changelog post, Seed's blog rule). Reader: subscribers.
    Interactive: short video loops of new screens.

Every post's social set includes a Telegram channel text (the owner's marketing rules).

## 3. Answer-engine plan

Answer engines draw on the Google and Bing indexes (`documented`: Google "AI features and your
website"; Microsoft Oct 2025). So the fundamentals come first: server-rendered pages (Seed's MPA
already is), sitemap with real `lastmod` (Seed's `pages.ts` does this), hreflang (Seed does this).

| Page type | What gets it quoted | Label |
| --- | --- | --- |
| Home | First sentence = the entity description above; `SoftwareApplication` + `SoftwareSourceCode` JSON-LD with two `Offer`s (self-host 0, cloud at its price), `Organization`/`Person` with `sameAs` GitHub and the Telegram channel | documented (structured data gallery) |
| Feature | Question as H2, answer in the first sentence ("Yes. Financy…"), quotable alone; one screenshot with alt text | documented (Google people-first content) / likely (answer-first shape) |
| Use case | Names the person's situation in the first sentence; links to the two features it uses | likely |
| Alternative | Comparison table in HTML (not an image), "Checked on" date, source link per row; the lead names when the competitor wins | likely; freshness for comparisons: documented in Microsoft's guidance |
| Pricing | Both prices in text, currency named, what each includes; never "free" next to the cloud price | documented (one set of facts) |
| Docs | One task per page, numbered steps, commands in code blocks | likely |
| Blog | Named author, published and updated dates, `BlogPosting` JSON-LD; original numbers | studied (Ahrefs/Semrush citation studies) |

Corrections to the brief and to #82:

- **FAQ structured data brings no rich result** for any site now (`documented`: Google Search
  Central, FAQ rich results limited, then removed). Keep `FAQPage` only because it states meaning;
  never promise it as a result. #82's "Done when" can keep it on that basis.
- **`llms.txt` is not a lever** (`documented`: Google says its systems don't use it). Seed
  generates it from `pages.ts`; keep that, spend nothing more.
- **robots.txt**: Seed's generator allows `*` plus named search bots, so training crawlers are
  allowed too. Keep it unless the owner decides otherwise (Needs you).
- Third-party mentions matter more than own pages for citations (`studied`: Ahrefs and Semrush
  analyses of ChatGPT and AI Overview citations find Reddit, GitHub, YouTube and review sites
  overrepresented). Section 4 is where most citation gains come from.

## 4. Launch channels, in order

| # | Channel | Honest ask | Must be true first |
| --- | --- | --- | --- |
| 1 | Owner's Telegram channel | "I'm rebuilding Financy in public; here is week N. Tell me which currencies you juggle." | Nothing; start now with build-in-public posts |
| 2 | GitHub repo + README | Star if useful; open an issue with your use case | README matches site facts (#69, #51); demo screenshot |
| 3 | Directories: AlternativeTo (as an alternative to YNAB, Firefly III, Actual), openalternative.co, selfh.st, selfhostyourself.com | Listing with the one-line description | Public site live; a tagged release |
| 4 | r/selfhosted | Post on New Project Friday: what it does, what is not done, compose file, ask for feedback | Self-host works from the docs in ~10 minutes; project under 3 months old → Friday only; promoted apps must be production-ready with docs ([r/selfhosted rules](https://redlib.groet-infra.nl/r/selfhosted/wiki/rules); mods changed rules March 2026, check the sidebar) |
| 5 | Hacker News, Show HN | "Show HN: Financy, a self-hosted finance tracker for households in many currencies"; owner answers every comment | Live demo or a cloud sign-up a visitor can try without installing; scar post 4 published to link from comments |
| 6 | r/expats, r/digitalnomad, expat forums (InterNations, Toytown Germany), country subs (r/eupersonalfinance, r/PersonalFinanceNZ, r/AusFinance…) | No product posts. Answer real "how do I track two currencies" threads as the owner, disclose authorship, link a blog post only when it answers the thread | Posts 1, 5, 6 live. Read each sub's self-promotion rule first; r/personalfinance does not allow promotion (`likely`, check rules) |
| 7 | Product Hunt | "We launched Financy Cloud: household finances in any mix of currencies" | Cloud takes payments; pricing page final; 5+ real users who can say what they think (owner's own supporters, never fake) |
| 8 | awesome-selfhosted | PR to `awesome-selfhosted-data` | First tagged release more than 4 months old; FOSS licence; maintained ([CONTRIBUTING](https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/CONTRIBUTING.md)) |

Gate before any launch from row 4 on: #76 (`p1-critical`, group changes pushed to every connected
user) is fixed. A finance app that leaks a household's changes, at launch, ends trust for good.

## 5. Website issues (six, one PR each)

Each issue: all nine languages written per language (the owner's rule), Lighthouse budget green (Seed CI
`browser` step), every page in `pages.ts` so sitemap and `llms.txt` follow, `BreadcrumbList` on
every page below home, design phase per the `design` skill, and nothing describing an unbuilt
feature.

1. **Make the site Financy's (Seed `docs/start-a-product.md`).** Work the whole checklist: brand,
   author, delete hire, `/compare`, `/admin`, `/mvp`, Seed posts; replace `PERSON_JSON_LD`,
   `HOME_HEAD`, the newsletter voice, OG images, privacy and terms (financial data: what is
   stored, where, who sees it). New home page: entity sentence first, the multi-currency total
   screenshot, one primary action, status line. JSON-LD `SoftwareApplication` with self-host
   offer. Done when `git grep "Seed's own site"` returns nothing and the home first sentence equals
   section 0's. Moves: impressions for "self-hosted finance tracker" queries; GitHub stars.
2. **Feature pages from `features-data.tsx`.** Rewrite it with the built features of section 1
   (multi-currency, households, live sync, transfers, budgets, self-hosting; Telegram bot when #16
   is fixed). Each page: question H2s answered "Yes./No./Not yet.", real screenshot, "Not built
   yet" list honest. Moves: impressions and clicks per feature query.
3. **Pricing and self-hosting docs.** `/pricing` with cloud and self-host side by side, both
   prices in text, what each includes, the doubt answered before the ask ("Can I move from cloud
   to self-host? Export"), `Offer` JSON-LD matching. `/docs/self-host`, `/docs/backups`,
   `/docs/upgrade`, `/docs/exchange-rates` in `PUBLISHED_DOCS`. Blocked on the owner's cloud
   price. Moves: cloud sign-ups; docs pageviews to installs (GitHub clones as proxy).
4. **Use-case pages `/for/<slug>`.** New route on the feature page type; ship expats, couples,
   families. Each links to its features and one alternative page. Moves: impressions for the three
   use-case questions; sign-ups with those pages as entry.
5. **Alternative pages `/alternatives/<slug>` and hub**, replacing `/compare`. YNAB for multiple
   currencies, Firefly III for couples, Actual Budget with multiple currencies; fact table with
   per-row source and `CHECKED_ON`, a lead that says when the competitor wins; `FAQPage` for
   meaning only. Moves: citations in the check below; impressions for "X alternative" queries.
6. **Blog and measurement.** Blog categories including "Scars"; a small calculator component for
   posts 1, 2, 5, 6 (server-rendered result with a form, works without JavaScript); Umami events
   for self-host, cloud sign-up, subscribe; Umami referrer view for chatgpt.com, perplexity.ai,
   claude.ai, gemini.google.com, copilot.microsoft.com and `utm_source=chatgpt.com`; a
   `docs/citation-check.md` with the eight questions below and a dated results table. Moves:
   answer-engine visits, subscribers.

### Citation check (run before launch, then after each issue ships)

Ask ChatGPT, Perplexity, Claude and Google AI Mode, record whether Financy is named and which page:
"multi currency budget app self hosted"; "track expenses in two currencies"; "YNAB alternative
multiple currencies"; "Firefly III alternative for couples"; "Actual Budget multiple currencies";
"family budget app self hosted"; "expat budgeting app"; and one in ru: "семейный бюджет в нескольких
валютах приложение". Also verify the site in Search Console and Bing Webmaster Tools (whose "AI
Performance" report shows Copilot citations, `documented`).

## Needs you

- **The cloud's price, and whether the cloud takes sign-ups at site launch.** Issue 3 and the
  home page's secondary action wait on it.
- **The domain** for Financy's site.
- **Search Console and Bing Webmaster Tools verification** once the domain is live.
- **Language order** after English: suggested ru, de, es.
- **Approve or drop each blog post** in section 2; post 8 discloses a security bug, post 7 needs
  your real bank-rate numbers.
- **Whether to add a "where did you hear about Financy" field** to cloud sign-up; many answer
  engines send no referrer.
- **Training crawlers** (GPTBot, ClaudeBot, CCBot, Google-Extended): Seed's robots.txt allows them;
  keep or block.
- **Supporting quotes or numbers** (users, households, currencies tracked) for proof next to the
  ask; none exist yet, so pages carry none.

## Sources

- Actual Budget, multi-currency doc: https://actualbudget.org/docs/budgeting/multi-currency
- Firefly III FAQ and multi-user doc: https://docs.firefly-iii.org/references/faq/firefly-iii/general/ ,
  https://docs.firefly-iii.org/how-to/firefly-iii/features/multi-user/
- YNAB multiple currencies guide: https://support.ynab.com/en_us/using-multiple-currencies-in-ynab-a-guide-SyBF6PHno
- What ranks for "YNAB alternative multiple currencies" (vendor pages: Lunch Money, Buxfer,
  beancount.io): https://lunchmoney.app/compare/ynab-alternative , https://beancount.io/compare/ynab-alternatives
- What ranks for "Firefly III alternative": https://alternativeto.net/software/firefly-iii/ ,
  https://openalternative.co/alternatives/firefly-iii , https://beancount.io/compare/firefly-iii-alternatives
- Self-hosted multi-currency competitors: https://selfhostyourself.com/tags/budgeting
- Demand signal (user saying multi-currency is the blocker after leaving YNAB for Actual):
  https://lunchflow.featurebase.app/p/multi-currency-support
- Russian and German results: https://lifehacker.ru/family-budget/ ,
  https://finanzwissen.de/vergleich/haushaltsbuch-apps/
- r/selfhosted rules: https://redlib.groet-infra.nl/r/selfhosted/wiki/rules
- awesome-selfhosted requirements: https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/CONTRIBUTING.md
