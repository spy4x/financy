# Financy: the CEO plan

What a founder should do with Financy before release, at release and in the first three months
after, how to design the referral programme, and how to stand against each rival. Written
2026-11-04. It builds on `../market/` (competitors, needs, positioning, bank sync) and does not
repeat it. Channels and launch posts are another agent's file; they are only named here.

## In short

- **The first job is proof, not reach.** Before release, ten households (friends and testers)
  must log money every week, the partner included. At release, the job is the first 100 paying
  households, won one by one by the owner. After release, the job is keeping them: a household
  that still logs in month two is the number that matters.
- **Referral: two-sided, one free month each, paid as account credit after the friend's first
  payment has passed the 30-day refund window, capped at 12 free months a year.** The research
  says rewards help most for an unknown brand, a two-sided reward removes the friend's suspicion,
  and a useful reward with a small face value beats a large cash one. It costs about $8 of list
  revenue per paying household, about a tenth of its expected value. Build it after launch, once
  there are customers who have stayed.
- **Against rivals, Financy wins one narrow fight:** a household sharing money in several
  currencies, offline, self-hosted or in a cheap cloud. Of the five "cannot win" areas, two are
  permanent choices (double-entry, the lowest price), three are "not in the first version" (bank
  feeds, envelope budgeting, investments), each with a cost and a plan below.
- **The risk most likely to hurt in year one is tax, not code:** a Singapore company selling a
  digital subscription to EU and UK consumers owes VAT from the first sale.

## 1. The referral programme

### What the research says

- **Referred customers are worth more, and the reward pays back.** Schmitt, Skiera and Van den
  Bulte (2011) tracked about 10,000 customers of a German bank. Referred customers had a
  contribution margin 25% higher at first (the gap shrank over time), an 18% lower churn hazard
  that did not shrink, and a value over six years at least 16% higher: 40 euros on a base of 253
  euros. The bank paid the referrer a 25-euro voucher, with no minimum stay required of the new
  customer; the authors estimate a return of about 60% on that reward over six years. The gain
  was smaller for older and low-margin customers, so they advise a selective programme.
- **The referrer matters.** Van den Bulte, Bayer, Skiera and Schmitt (2018), same bank: a
  referred customer whose referrer is still a customer has a churn hazard about 40% lower than a
  non-referred one; once the referrer leaves, it is about 280% higher. Referrers with more tenure
  bring higher-margin customers. Their advice: recruit referrers who joined at least six months
  ago, have high margins and are unlikely to leave.
- **Rewards help most for a weak brand and weak ties.** Ryu and Feick (2007), four experiments:
  a reward raises the likelihood of referring, most of all to weak ties and for weaker brands.
  For strong ties and strong brands, giving at least part of the reward to the receiver works
  better. A secondary summary reports a lift of over 20 percentage points for the weak brand and
  under 10 for the strong one; I could not check that figure in the paper. Financy at launch is
  a weak brand.
- **A one-sided reward makes the friend suspicious; a two-sided one fixes it.** Verlegh, Ryu,
  Tuk and Feick (2013), four experiments and a survey: the receiver infers an ulterior motive
  when the sender is paid, more so for unsolicited and weak-tie referrals. Rewarding both sides,
  or giving a symbolic reward, removed the negative effect.
- **The size of the reward cuts both ways.** Wirtz, Orsingher, Chew and Tambyah (2013): how a
  referrer thinks the friend will see them ("metaperception") drives whether they refer; an
  incentive lowers it, and a strong tie raises it. Orsingher and Wirtz (2018), three experiments:
  a larger incentive is more attractive but makes the referrer look worse, and the two effects
  cancel. Their advice: a reward that is very useful to the referrer but has a low face value,
  aimed at strong ties.
- **Dropbox.** Drew Houston's April 2010 slides report 2.8 million direct referral invites in 30
  days, with extra storage for both sides (then 250 MB each, later 500 MB). The often-quoted
  "signups up 60%, permanently" and "35% of daily signups" come from secondary write-ups, not a
  primary source I could find. The lesson that holds: the reward was more of the product itself,
  given to both people.

### The design for Financy

- **The reward.** The friend's household gets one free month (a month of credit, or 13 months on
  a yearly plan). The referrer's household gets one free month too. Both are more of the product:
  useful, a small face value ($4), and nothing awkward to explain to a friend. No cash: cash brings
  payouts, tax forms and fraud that a $4 product cannot carry.
- **When.** The friend pays normally from sign-up (no trial, as decided). The credit for both
  sides is granted only when the friend's first payment is 31 days old and was neither refunded
  nor disputed, and lands on the next invoice as a customer-balance credit in Stripe.
- **Who can refer.** A paying household that has itself paid for at least 30 days. The research
  favours tenured referrers; 30 days is the shortest wait that still screens out refunds.
- **Cap.** 12 free months a year per household: a year free at most. A few heavy referrers then
  cost at most $40 each.
- **Fraud limits.** No reward for one's own second household, for a household on the same card
  (Stripe's card fingerprint), for free or comped households (family, founding testers), or for a
  payment later refunded or disputed. The share text says plainly that both get a month.
- **The numbers** (assumptions marked; no Financy data exists yet). A monthly household at $4
  pays about $0.42 to $0.48 in card fees (2.9% plus $0.30, more for cards from abroad). Assuming
  5% monthly churn, it stays about 20 months: about $71 net. A yearly household at $40 that renews
  at 60% is worth about $96 net. At the founding price, take three quarters of that. The two free
  months cost $8 of list revenue, near zero in server cost, so about 8% to 15% of a household's
  value. Schmitt's 16% to 25% value premium for referred customers would roughly pay for it.

## 2. The CEO plan by stage

### Now, before release

- **The goal:** households that keep using it without being asked.
- **The number:** households where two members logged a transaction in each of the last four
  weeks. Target ten before launch.
- **Do:** (1) put family and the founding testers on it now and import their real bank
  statements with them, in person or on a call; (2) post the build weekly in the Telegram channel
  and on the blog, and collect a list of people who asked to be told at launch; (3) cut anything
  in milestones 5 and 6 that no tester used.
- **Refuse:** new features outside the milestones, a mobile store app, bank sync, and any
  discount beyond the decided offers.

### At release

- **The goal:** the first 100 paying households, the founding cohort.
- **The number:** paying households past the 30-day guarantee, shown as the real founding count.
- **Do:** (1) offer every founding household a 15-minute call to import their first statement;
  (2) publish the comparison pages and the public demo the day the launch posts go out (Show HN,
  r/selfhosted, expat and Russian-speaking communities, Product Hunt: the other agent's file);
  (3) answer every message within a day from `hi@financy.dev`, as a person.
- **Refuse:** lifetime deals, extending the founding price past 100, a timer, paid ads, and
  building for people who do not pay.

### The first three months

- **The goal:** keep them.
- **The number:** share of paying households where someone logged a transaction in week eight,
  plus refunds and cancellations, each with its reason.
- **Do:** (1) email or call every household that cancels or asks for a refund, and fix what
  repeats; (2) ship the monthly "what's new" post and the referral programme once 30 households
  have passed their guarantee; (3) start the phone apps (milestone 7) only if the PWA is the top
  reason people give for leaving.
- **Refuse:** a pivot to US banks, a business or accountant tier, rewrites, and any change to the
  price for founding households.

## 3. The first customers

There are no old users: the old Financy had none in production. Family and the founding testers
are free, so they are proof, not revenue.

**The first 10 paying households** come from people who already know the owner: the Telegram
channel, LinkedIn, past clients, and expat friends of friends. The owner writes to each one
personally, with the demo link and one question: "which currencies do you juggle?" Each tester
is asked for one introduction to another household, said honestly as a favour, before any
referral programme exists.

**From 10 to 100** comes from people with the exact problem, where they already look: the
comparison pages (Firefly III, YNAB, Actual, Monarch for Europe, Zenmoney and CoinKeeper in
Russian), the self-hosting crowd (the free version brings the paying partner), and expat
communities. Import from the apps people leave (Firefly III, Actual, YNAB, Toshl, Wallet,
Spendee, CoinKeeper, Zenmoney exports) decides whether they switch.

**What the owner does personally:** the onboarding call for the first 100; a reply to every
email; a short weekly post in the Telegram channel with what shipped and what testers said; a
public count of founding households; and a direct ask for a review or quote after a household's
first good month.

## 4. Playing against rivals

| Rival | Where Financy wins | Not competing at launch | The honest line |
| --- | --- | --- | --- |
| Sure | Offline use, honest rates (Sure has an open bug converting missing rates at 1.0), five-second entry, a Telegram bot | Bank sync, investments, a free hosted tier | "Sure if you want bank sync and investments; Financy if your household lives in several currencies and logs by hand." |
| YNAB | Many currencies, a third of the price, self-hosting | US bank feeds, the envelope method | "YNAB if you want its method and your money is in one US currency." |
| Actual | Many currencies (Actual has none yet; re-check its open PR before saying so), separate logins without an OpenID server | The envelope method, a large community | "Actual if you budget in one currency; Financy when you have several." |
| Firefly III | Separate logins for a partner, offline, a cloud you do not have to run | Double-entry, rules depth, years of maturity | "Firefly III if you want an accounting tool; Financy if your partner must use it too." |
| CoinKeeper | Self-hosting, open source, web and offline, nine languages | Russian bank sync, store apps | "CoinKeeper for Russian bank links; Financy if you live abroad and own your data." |
| Monarch | Europe, many currencies, under half the price | US bank feeds, investments, polish | "Monarch if your banks are American." |
| Spendee | Self-hosting, a web app that works offline, households of six | Store apps, bank sync | "Spendee for a phone-only app with bank links." |
| Wallet (BudgetBakers) | Self-hosting, open source, one honest total across currencies | Bank sync, store apps, years of ratings | "Wallet if you want bank links in many countries." |
| Toshl | Household sharing, self-hosting, web offline | A ten-year mobile head start | "Toshl if you are one person on a phone." |

The five areas once called "cannot win":

- **US bank feeds: not in the first version.** Cloud aggregators hide prices behind sales calls
  and charge per connection, which a $4 plan cannot carry; Financy's expats are the people they
  cover worst. Cheap path later: bring-your-own-key (Enable Banking in the EU, SimpleFIN at $15 a
  year paid by the user). Recommendation: EU first, bring-your-own-key, after launch; never US
  first.
- **Envelope budgeting: not in the first version.** Rolling budgets over and an "unassigned"
  amount is weeks of work, not months. Recommendation: add rollover budgets only if paying
  households ask; never clone YNAB.
- **Investments: not in the first version.** Prices for stocks and funds need a paid data feed
  per symbol. Recommendation: manual asset values and net worth over time (already planned
  later); point portfolio people to Ghostfolio.
- **Double-entry: a permanent choice.** It is homework for the partner, who decides whether the
  household pays. Recommendation: offer an export to Beancount or hledger instead.
- **The lowest price: a permanent choice.** Self-hosting is already free; the cloud's $4 pays
  for a solo founder to keep it alive. Recommendation: compete on value and the price promise,
  never on cheapness.

## 5. Risks that could sink it in year one

- **Trust with financial data.** One leak ends the business. Mitigation: no bank credentials
  stored at all, encryption at rest, two-factor sign-in, a public security page, and the AI help
  off by default with a clear note on which provider sees what.
- **A solo founder.** Illness or a busy client season stops support. Mitigation: the AGPL code,
  full export, read access after cancelling, and a written plan of what happens if the owner
  stops, on the pricing page.
- **Tax on payments.** A non-EU seller of digital services to EU consumers owes VAT from the
  first sale (the non-Union OSS scheme has no threshold), and the UK is the same. Mitigation:
  Stripe Tax with OSS and UK registrations before the first EU sale, or a merchant of record
  such as Paddle; the owner's choice.
- **GDPR.** NeatSoft PTE LTD in Singapore, as controller of EU residents' data processed
  continuously, needs an EU representative under Article 27, plus a privacy policy, processor
  agreements (Stripe, hosting, any AI provider, Telegram) and working deletion. Mitigation: a
  paid representative service and the server in the EU before launch. "Built in Europe" must be
  literally true (data hosted in the EU) or reworded.
- **Payments failing silently.** Live Stripe from day one means a webhook bug double-charges or
  locks a household. Mitigation: idempotent webhooks, a test with Stripe's test clock before
  launch, and a daily check that Stripe and Financy agree on who is paying.

## Notes and defaults taken

- "Kept while subscribed" (the founding price) is used here; `product.md` in this folder says "for
  life". They must say the same thing on the pricing page.
- A two-sided free month is not a trial: the friend pays first, as decided.
- The churn and renewal rates are assumptions, to be replaced by Financy's own data at month 3.

## Sources

- Schmitt, Skiera, Van den Bulte (2011), "Referral Programs and Customer Value", *Journal of
  Marketing* 75(1), 46–59. [PDF](https://faculty.wharton.upenn.edu/wp-content/uploads/2012/04/Schmitt-Skiera-vandenBulte-2011-Referral-Programs-Customer-Value.pdf)
- Van den Bulte, Bayer, Skiera, Schmitt (2018), "How Customer Referral Programs Turn Social
  Capital into Economic Capital", *Journal of Marketing Research* 55(1), 132–146.
  [PDF](https://faculty.wharton.upenn.edu/wp-content/uploads/2017/07/VdB-et-al.-JMR-2018.pdf)
- Ryu, Feick (2007), "A Penny for Your Thoughts: Referral Reward Programs and Referral
  Likelihood", *Journal of Marketing* 71(1), 84–94. Abstract only:
  [Baylor summary](https://kellercenter.hankamer.baylor.edu/news/story/2008/insider-referral-reward-programs-and-referral-likelihood)
- Verlegh, Ryu, Tuk, Feick (2013), "Receiver responses to rewarded referrals: the motive
  inferences framework", *Journal of the Academy of Marketing Science* 41(6), 669–682. Abstract
  only: [UvA](https://dare.uva.nl/id/553a0430-0ee6-4f93-bd73-f97db1105ca2)
- Wirtz, Orsingher, Chew, Tambyah (2013), "The Role of Metaperception on the Effectiveness of
  Referral Reward Programs", *Journal of Service Research* 16(1), 82–98. Abstract only:
  [Bologna](https://cris.unibo.it/handle/11585/151861)
- Orsingher, Wirtz (2018), "Psychological drivers of referral reward program effectiveness",
  *Journal of Services Marketing*. [PDF](https://web2-bschool.nus.edu.sg/wp-content/uploads/media_rp/publications/x1WUW1528209854.pdf)
- Houston (2010), "Dropbox: Startup Lessons Learned".
  [Slides](https://www.slideshare.net/slideshow/dropbox-startup-lessons-learned-3836587/3836587);
  [Dropbox referral page](https://www.dropbox.com/refer)
- Rival facts: `../market/competitors.md` and `../market/positioning.md`, read 2026-11-03.
- EU VAT for non-EU sellers (non-Union OSS) and GDPR Article 27: from the EU's own rules, not
  re-read for this file; check both with an accountant before the first EU sale.
