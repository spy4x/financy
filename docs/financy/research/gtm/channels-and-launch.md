# Financy: channels and launch sequence

Where to tell people about Financy, in what order, and which search pages to build first. It
builds on `../market/` (competitors, needs, positioning) and on
`docs/financy/research/marketing.md`, and does not repeat them. Sources were read on
**2026-11-04**. Evidence labels: `documented` (the platform's own rules or docs), `studied` (a
named study or public data with a method), `likely` (my judgment). Reddit blocks automated
readers, and I did not work around it, so every subreddit rule below except r/selfhosted's comes
from a third-party copy and is marked **verify in the sidebar**.

## In short

- **Payers are expat and multi-currency households, not self-hosters.** Self-hosters bring
  stars, mentions and the partner who pays later. So the channels that reach households who
  already know the owner (his Telegram channel, family, friends, Russian-speaking expat chats)
  come first, and Show HN is the one big public bet. Lunch Money, a multi-currency budgeting
  app from a digital-nomad founder, got 229 points on Show HN in 2019 and about 1,000 sign-ups
  in a day ([HN](https://news.ycombinator.com/item?id=20811287),
  [Failory](https://www.failory.com/interview/lunch-money)). Most finance-tracker Show HNs get
  1 to 3 points (HN Algolia search, below), so it is a bet, not a plan.
- **Several rules gate the order:** r/selfhosted takes new projects only in its weekly
  megathread, awesome-selfhosted needs a first release more than four months old, Lobsters bars
  new users from self-promotion, and Habr allows one promotional post per person.
- **Search: build the category pages the issues miss.** "self hosted budget app" has the
  richest autocomplete family in English, "finanzguru alternative" is stronger in German than
  #115 assumes, and "Financy" as a brand gets autocorrected to "finance" and "fiancé".
- **No decided launch offer is contradicted.** Two need care: the friends' free year makes them
  insiders who must disclose it in any public review, and the live founding count must count
  paying households only.

## Channels, ranked by expected paying households per hour of the owner's time

The rank is `likely` (judgment). It weighs how many readers have the multi-currency household
problem, the readers' habit of paying, and the hours a post costs.

| # | Channel | Who reads it | Self-promotion rule | Format that works | Timing | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Owner's Telegram channel, family and friends | People who know him, many of them Russian-speaking and living abroad | His own channel: none | Weekly build-in-public post with one screenshot and one question; founding-price post at launch | Now, then weekly | Before, at, after |
| 2 | Show HN | Developers, many of them remote or abroad; skeptical of polish without product | "Please make it easy for users to try your thing out, ideally without barriers such as signups or emails"; "Please don't ask friends to upvote or comment" ([Show HN](https://news.ycombinator.com/showhn.html)); "Please don't use HN primarily for promotion" ([guidelines](https://news.ycombinator.com/newsguidelines.html)) | Title states what it is; first comment from the owner: why he built it, what is not done, the price, the demo link; answer every comment for a day | Tue to Thu, US morning (`likely`: the published timing analyses disagree and mostly measure Ask HN comments, [summary](https://www.indiehackers.com/post/best-time-to-post-to-hacker-news-b52bece549)) | At launch |
| 3 | Russian-speaking expat Telegram chats and channels; Habr; vc.ru | Emigrants and relocated IT workers who earn in one currency and spend in another; CoinKeeper and Zenmoney users | Chats: read each pinned rule and ask the admin first (`likely`: most ban ads). Habr: "Публикации рекламного характера допустимы только в блогах компаний или однократно в хабе «Я пиарюсь»" ([Habr rules](https://habr.com/ru/docs/help/rules/)). vc.ru: links to your own projects are fine "пока они остаются в интересах сообщества"; posts "продвигающие коммерческие сервисы" are banned ([vc.ru rules](https://vc.ru/rules)) | Habr: a technical article (offline-first sync, exchange-rate correctness) with Financy as the example, not an ad; the one "Я пиарюсь" post saved for launch. vc.ru: the founder story with numbers, no sales pitch. Chats: answer the "how do you track two currencies" question when it comes up | Habr and vc.ru weekday mornings Moscow time (`likely`) | At and after |
| 4 | r/selfhosted | About a million self-hosters (skill file's figure); few pay, many star and mention | Projects under three months old go in the weekly New Project Megathread; standalone posts are removed and redirected there; authors are asked for an "AI Involvement" line ([megathread, May 2026](https://redlib.groet-infra.nl/r/selfhosted/comments/1tqhzoo/new_project_megathread_week_of_28_may_2026/); [March 2026 rules update](https://redlib.groet-infra.nl/r/selfhosted/comments/1rmt39o/rules_update_new_project_friday_here_to_stay/)); "promoted apps must be production ready and have docs" ([wiki](https://redlib.groet-infra.nl/r/selfhosted/wiki/rules)). **Verify in the sidebar**: the two sources differ on Friday-only | Megathread entry: one paragraph, compose file, screenshot, what is not built, honest AI line. A standalone post only after three months, with a real release | Any day in the megathread | At launch (megathread), month 3+ (standalone) |
| 5 | Directories: AlternativeTo, openalternative.co, selfh.st | People searching "alternative to X"; answer engines read these | selfh.st: "Feel free to reach out and share the details of your project with me" ([selfh.st/apps](https://selfh.st/apps-about/)); AlternativeTo: no rule page found, so list honestly as an alternative to Firefly III, Actual, YNAB, CoinKeeper, Zenmoney | One-line description, identical to the site's | 30 minutes each | At launch |
| 6 | selfh.st Self-Host Weekly newsletter | Self-hosters who read a weekly recap ([about](https://selfh.st/about/)) | No submission rule published; contact page ([submit](https://selfh.st/submit/)) | A short note to the editor with the release and what is new; never pay for it before ROI | After the first tagged release | At, then each major release |
| 7 | r/expats, r/digitalnomad, r/eupersonalfinance, r/UKPersonalFinance, r/PersonalFinanceNZ, r/AusFinance | The exact buyer, asking money questions | r/eupersonalfinance: "avoid self-promotion"; referral links removed (third-party copy, [redditmaster](https://www.redditmaster.com/subreddit-rules/eupersonalfinance)). r/UKPersonalFinance asks for a 90/10 ratio ([wiki copy](https://lr.eu.psf.lt/r/UKPersonalFinance/wiki/using_rukpersonalfinance)). r/expats and r/digitalnomad: no rule text found. **Verify each sidebar** | No product posts. Answer real "two currencies" threads as the owner, say "I build Financy" whenever it is mentioned, link a blog post only when it answers the thread | 15 minutes a day, ongoing | After launch |
| 8 | r/personalfinance | Mostly US readers, US bank-feed expectations | "Avoid self-promotion" ([wiki copy](https://lr.eu.psf.lt/r/personalfinance/wiki/newuser)). **Verify** | Do not post. Answer only multi-currency questions, disclosed | Rarely | After |
| 9 | YouTube self-hosting creators | Self-hosters who watch app reviews; review videos of Actual and Firefly III exist ([example listing](https://git.handmade.network/actual-budget-vs-firefly-iii-live-test-which-is-best-in-2026.html)) | Their own policy; a sponsored video must be disclosed | One short email per creator who has already reviewed Actual or Firefly III: what Financy does that those lack, a demo link, no payment asked or offered | Once self-hosting is smooth from the docs | Month 2–3 |
| 10 | Fediverse (Mastodon, Lemmy) | Privacy-minded FOSS users | Lemmy c/selfhosted (63,534 subscribers, 6,092 active a month): "Promotion posts require active participation, with an account that is at least 30 days old", and AI tags [CBH] or [AIP] are required ([community API](https://lemmy.world/api/v3/community?name=selfhosted)) | Mastodon: the same build-in-public post, with #selfhosted. Lemmy: one post with the right tag after 30 days of real participation | Cross-post, minutes each | Before (Mastodon), at (Lemmy) |
| 11 | Product Hunt | Makers and early adopters, few households | "you cannot ask people directly to upvote your product"; launch at "12:01 am Pacific Time"; relaunch "as often as you have new significant product iterations" ([PH launch guide](https://www.producthunt.com/launch)) | A full day of answering comments | Optional, month 2–3, for the backlink | After |
| 12 | Lobsters | Developers; strict about promotion | New users "are not allowed to submit self-promo"; self-promo "should be less than a quarter of one's stories and comments in the last year"; needs an invitation ([about](https://lobste.rs/about)) | A technical post, never the launch | Only if the owner is already a member | After, or never |
| 13 | awesome-selfhosted | The canonical self-hosted list | "first released more than 4 months ago"; machine- or LLM-generated contributions are not allowed ([CONTRIBUTING](https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/CONTRIBUTING.md)) | A hand-written PR | First release + 4 months | Month 4+ |

Dropped: vote rings, asking friends or testers to upvote, sock-puppet "has anyone tried
Financy?" posts, and referral links in communities. Each breaks the rules quoted above, and
Reddit's sitewide rules forbid vote manipulation (`documented` but not readable by my tools;
check Reddit's content policy).

The owner builds with AI agents. r/selfhosted and Lemmy ask for an AI line or tag, and readers
there punish a hidden one. Say it plainly on every post: "Written with AI coding agents, every
change reviewed; I am the maintainer" (`likely` wording, the owner's to choose).

## The launch sequence

**Gate before any public step:** issue #76 (a household's changes pushed to every connected user)
is fixed, as `marketing.md` says. A finance app that leaks data at launch does not recover.

### Stage 0: private beta, from now until the cloud takes payments

- Family get Financy free as a gift; friends get a free year as founding testers. Ask each for
  one 20-minute call after two weeks: what they tried, where they stopped.
- Weekly post in the owner's Telegram channel and on Mastodon: one screenshot, one decision, one
  question ("which currencies do you juggle?").
- Start real participation now on Reddit, Lemmy and HN with the owner's own account, so the
  30-day and karma thresholds are met by launch. Not promotion: answers.
- Write the Habr technical article and the "why I rebuilt Financy" scar post.
- **Number to watch:** beta households where two or more members logged something in the last
  seven days. If the partner does not log, nobody pays.

### Stage 1: soft launch, the founding 100 (cloud live, demo live)

- Day 1: founding-price post in the Telegram channel and to friends: $3 a month or $30 a year
  for the first 100 paying households, with the live count.
- Same week: AlternativeTo, openalternative.co, selfh.st listings; r/selfhosted megathread
  entry; ask admins of two or three Russian-speaking expat chats whether a short post is welcome.
- **Number to watch:** paying households, and the share of demo visitors who pay.

### Stage 2: public launch (about two weeks after Stage 1, once the first payers had no blocker)

- Tuesday: Show HN. The demo needs no account, so the Show HN rule is met.
- Thursday: Habr article, with its one "Я пиарюсь" post saved for later if it is wanted.
- Next week: vc.ru founder story; note to the selfh.st editor; Lemmy post with the AI tag.
- **Number to watch:** paying households a week after Show HN, and the refund rate.

### Stage 3: months 1 to 3

- Search pages (next section), one or two a week, each in the languages its searchers use.
- 15 minutes a day answering multi-currency threads, disclosed.
- Monthly "What's new" post, sent to the Telegram channel and the newsletter.
- Month 1: turn on the referral reward (one free month each side).
- Month 2–3: emails to YouTube creators; optional Product Hunt; standalone r/selfhosted post
  after three months; awesome-selfhosted PR after four.
- **Numbers to watch:** month-2 retention of paying households, refunds under the 30-day
  guarantee, and sign-ups from search and answer engines (Umami referrers).

## Search and answer-engine pages

Signals are Google autocomplete, read 2026-11-04 (`studied` in the narrow sense: suggestions
show what people type, not how often). Issues #107 (YNAB, Firefly III, Actual) and #115
(Monarch for Europe, Firefly III vs Actual vs Sure, Copilot, Sure and Maybe, CoinKeeper and
Zenmoney in Russian) already cover the comparison pages. Seed #732 is about Seed's own pages and
adds nothing for Financy. What the issues miss, ranked:

1. **"Best self-hosted budget apps", a dated neutral list (en).** "self hosted budget app" returns
   ten suggestions ("… reddit", "best …", "open source …", "self hosted finance app github"), the
   richest family found. Financy is one row; Firefly III, Actual, Sure and ezBookkeeping the
   others. Also make the home page title say "self-hosted budget app", not only "finance
   tracker".
2. **Couples and families, per language, written for the native phrase.** de "haushaltsbuch app
   mehrere nutzer (kostenlos)" (six suggestions); pt-BR "app controle financeiro compartilhado
   casal (grátis)" (seven); ru "приложение для учета расходов для двоих"; en "family budget app
   multiple users free". These are `marketing.md`'s `/for/couples` and `/for/families` pages:
   give them these phrases and write de, pt-BR and ru first.
3. **"Finanzguru Alternative" (de), raised from "later" in #115.** Ten suggestions, including
   "open source", "self hosted", "Schweiz" and "Österreich". Finanzguru is bank-sync first, so
   the page opens with "if you want automatic bank sync, keep Finanzguru".
4. **"Multi-currency expense tracker" (en).** "multi currency budget app", "best multi-currency
   budget app", "multi currency expense tracker app" and "expense tracking app multiple
   currencies" all exist. This is `marketing.md`'s `multi-currency` feature page: make its title
   and H1 match one of these.
5. **Telegram bot page (ru).** "телеграм бот учет расходов" exists in Russian; nothing in
   English. One Russian question page for the bot.

Notes for the existing issues:

- **"Sure" collides** with US loan companies ("sure finance sedalia mo"). Title the page "Sure
  (the Maybe Finance fork)"; "sure vs actual budget" and "firefly iii vs sure" both exist.
- **CoinKeeper:** English "coinkeeper alternative" has no other suggestions; Russian "альтернатива
  coinkeeper" does. Russian only, as #115 says.
- **"Financy vs Sure" as its own page:** nobody searches "Financy" yet, so fold it into the Sure
  page.
- **Brand:** "financy" autocompletes to "finance" and "fiancé". Keep the name, but always write
  "Financy, the finance tracker" near the name, use financy.dev in every profile, and keep one
  identical sentence everywhere so answer engines tie the name to the product.
- **"Expat budget app" is not a search.** "budget app for expats" has no suggestions; "expat
  budget" means cost of living ("expat budget thailand"). Expats search the category words
  above. Keep the expat story on `/for/expats`, but do not chase that phrase.
- **Mentions beat own pages for citations.** In Semrush's study of 150,000 AI citations, Reddit,
  Wikipedia and YouTube led; Ahrefs found Reddit and Wikipedia top for ChatGPT
  ([Semrush](https://www.semrush.com/blog/most-cited-domains-ai/),
  [Ahrefs](https://ahrefs.com/blog/most-cited-domains-in-chatgpt/)). `studied`, with shifting
  shares. That is why channels 5, 7 and 9 matter beyond their direct sales.

## How to answer "why not X?" honestly

One sentence each, from the owner's own account, with "I build Financy" said first.

- **Firefly III:** "Firefly III is the most complete self-hosted tracker for one person, and if
  that is you, use it; I built Financy because my partner and I needed separate logins on one
  household, in several currencies."
- **Actual Budget:** "Actual is the best self-hosted envelope budget and works offline; it does
  not handle several currencies yet, which is the thing Financy is built around."
- **YNAB:** "If you want envelope budgeting with US bank feeds, YNAB is great; Financy is for
  households in more than one currency, which YNAB handles as separate budgets, and it costs $40
  a year."
- **Sure:** "Sure is the closest to Financy and has bank sync, which Financy does not yet; Financy
  focuses on exchange rates you can check, offline use and five-second entry, including from
  Telegram."

Check each claim against `../market/competitors.md` before posting, and never say a rival lacks
something without a dated source.

## The decided offers, checked

- **Friends' free year for feedback.** Under the FTC rules on endorsements and reviews, a free
  product is a material connection that must be disclosed in any public review or testimonial
  ([16 CFR 255](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-255),
  [16 CFR 465](https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-465)). HN and
  Product Hunt also forbid asking them to upvote. Ask friends for private feedback, and if one
  writes publicly, ask them to say they got a free year.
- **Founding 100 with a live count.** Honest only if the count shows paying households, excludes
  free family and friends, and closes at 100. Extending it later must be announced, not done
  quietly.
- **Referral reward.** Fine on the site and in the owner's channel. Never as links in
  communities: r/eupersonalfinance reportedly removes them, and a referrer posting in public
  should say they get a free month.
- **No trial, demo plus 30-day guarantee.** Fits Show HN's "without signups" rule, provided the
  demo is live and needs no account.

## Needs you

- Size and language of your Telegram channel; it decides whether channel 1 stays first.
- Your Reddit, HN and Lemmy accounts: their age and history, and whether you have a Lobsters
  invitation.
- The AI-involvement sentence for posts.
- Which Russian-speaking expat chats you are in, and permission to approach their admins.
- Every post, email and listing above is sent by you; nothing was posted.

## Sources

- Show HN rules: https://news.ycombinator.com/showhn.html ; HN guidelines:
  https://news.ycombinator.com/newsguidelines.html
- Lunch Money Show HN (229 points, 2019): https://news.ycombinator.com/item?id=20811287 ; sign-ups:
  https://www.failory.com/interview/lunch-money ;
  https://www.indiehackers.com/product/lunch-money/got-on-front-page-of-hacker-news-today--LnVqxbaYPHu7vsPBx39
- Base rate of finance-tracker Show HNs (most 1–3 points; one at 271):
  https://hn.algolia.com/api/v1/search?query=finance%20tracker&tags=show_hn
- HN timing analyses disagree: https://www.indiehackers.com/post/best-time-to-post-to-hacker-news-b52bece549
- Lobsters: https://lobste.rs/about
- r/selfhosted: https://redlib.groet-infra.nl/r/selfhosted/wiki/rules ;
  https://redlib.groet-infra.nl/r/selfhosted/comments/1rmt39o/rules_update_new_project_friday_here_to_stay/ ;
  https://redlib.groet-infra.nl/r/selfhosted/comments/1tqhzoo/new_project_megathread_week_of_28_may_2026/
- r/personalfinance (copy): https://lr.eu.psf.lt/r/personalfinance/wiki/newuser ;
  r/UKPersonalFinance (copy): https://lr.eu.psf.lt/r/UKPersonalFinance/wiki/using_rukpersonalfinance ;
  r/eupersonalfinance (third party): https://www.redditmaster.com/subreddit-rules/eupersonalfinance
- Lemmy c/selfhosted: https://lemmy.world/api/v3/community?name=selfhosted
- awesome-selfhosted: https://github.com/awesome-selfhosted/awesome-selfhosted-data/blob/master/CONTRIBUTING.md
- selfh.st: https://selfh.st/about/ ; https://selfh.st/apps-about/ ; https://selfh.st/submit/
- Product Hunt: https://www.producthunt.com/launch
- Habr: https://habr.com/ru/docs/help/rules/ ; vc.ru: https://vc.ru/rules
- AI citation studies: https://www.semrush.com/blog/most-cited-domains-ai/ ;
  https://ahrefs.com/blog/most-cited-domains-in-chatgpt/
- FTC: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-255 ;
  https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-465
- Google autocomplete, read 2026-11-04 via `suggestqueries.google.com` (client=firefox) for the
  phrases quoted above.
