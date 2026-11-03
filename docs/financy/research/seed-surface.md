# Financy on Seed: what the product inherits and what it must change

Written 2026-11-03 for the lead of the Financy rebuild. Seed was read at `875e2dea` (its `main`
that day); Financy at `bd3b956` (`main`, equal to the `legacy` branch). Paths are Seed's unless
marked `financy:`.

## In short

Financy gets Seed's whole platform by copying its tree: sign-in, groups, billing, realtime and
offline sync, the admin panel, the public website with blog, changelog, docs, newsletter and nine
languages, the demo, deploy, backups and CI. The first PR replaces Financy's tree with Seed's and
touches only the files that would otherwise break CI, publish images under Seed's name or keep
secrets Financy cannot read. Eleven more PRs, listed below, remove Seed's identity and fill the
site, pricing, legal pages and demo with Financy's. Nine Seed changes must land before some of
them; the largest is that Seed's notes example cannot be switched off.

## 1. What Financy gets for free today

| Area                    | What a product gets                                                                                                       | Main path                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Sign-in                 | E-mail and password, magic codes, sign-in providers, passkeys, sessions, password reset, guest "try it now"                | `libs/server/auth`, `docs/sign-in-providers.md`, `docs/guests.md`               |
| Second factor           | TOTP, recovery codes, the session gate on both buses                                                                      | `apps/api/cqrs/session-gate.ts`, `libs/server/auth`                             |
| Groups and roles        | Group as the only tenancy boundary, roles VIEWER to OWNER, invitations, ownership transfer, moving items between groups   | `libs/server/groups`, `libs/domain/groups`, `docs/aggregates.md`                |
| Billing                 | Stripe or a fake provider, plans and entitlements, trials (card optional), per-seat or flat price, grace, downgrade       | `docs/billing.md`, `libs/domain/billing/+lib.ts` (`PLANS`), `libs/server/billing` |
| Realtime                | WebSocket transport with change sequence, pull as the authority; switchable off (`SPA_REALTIME`)                         | ADR 002 and 003 in `docs/decisions/`, `apps/api`                                |
| Offline                 | IndexedDB copy, queue of writes, idempotency keys; switchable off (`SPA_OFFLINE`)                                         | `docs/offline.md`, `apps/spa/src`                                               |
| Admin panel             | Own host, modules: users, groups, billing, audit, stats, jobs, newsletter, blog, catalog, API tokens, system              | `apps/admin/src/modules`, `docs/admin-modules.md`                               |
| Public website (MPA)    | Fresh, works without JavaScript: home, features, pricing, admin, privacy, terms, robots, sitemap, `llms.txt`             | `apps/mpa`, `apps/mpa/pages.ts`                                                 |
| Blog                    | Posts written in the admin app, nine languages, RSS, question pages                                                       | `docs/blog.md`, `libs/server/blog`, `apps/mpa/blog.ts`                          |
| Changelog               | `/changelog` written from the git log at deploy                                                                           | `apps/mpa/changelog-write.ts`, `apps/mpa/changelog.json`                        |
| Docs site               | `/docs/<slug>` rendered from the repo's Markdown guides                                                                   | `apps/mpa/docs-site.ts`                                                         |
| Languages               | en, ru, es, de, pt-BR, ar, fr, ja, zh-CN, in five namespaces, with stale-translation checks                               | `i18n/`, `i18n/TRANSLATING.md`, `libs/domain/identity/preferences.ts`           |
| Newsletter              | Double opt-in, unsubscribe, sending from the admin app                                                                    | `libs/server/subscribers`, `libs/ui/subscribe-screen.tsx`                       |
| Notifications           | Inbox, e-mail, Web Push, per-person settings                                                                              | `libs/server/notifications`, `libs/server/mail`                                 |
| Telegram                | Linked account, bot commands, notices                                                                                     | `docs/telegram.md`, `libs/server/telegram`                                      |
| Jobs                    | Delayed and repeating (cron) jobs in the worker, with retries                                                             | `docs/jobs.md`, `libs/server/jobs`, `apps/worker`                               |
| Files                   | File store, signed URLs, quotas per plan (attachments are wired for notes only)                                           | `docs/files.md`, `libs/server/files`                                            |
| Data export and import  | A person's data export (ZIP with JSON and CSV); a group's export and import in Seed's own format                          | `docs/data-export.md`, `docs/aggregates.md` "Making an aggregate exportable"    |
| Audit and stats         | Account activity, operator audit, Umami stats in the admin app                                                            | `apps/admin/src/modules/audit`, `stats`, `docs/analytics.md`                    |
| Token API               | Personal API tokens and the documented REST API                                                                           | `docs/token-api.md`, `libs/server/api-tokens`                                   |
| Overview and search     | Overview page with widgets; command palette with search (notes only)                                                      | `apps/spa/src/state/search.ts`, `libs/domain/notes/overview.ts`                 |
| Demo                    | `DEMO_MODE=true`: fake data, starter data per account, nightly wipe                                                       | `docs/demo.md`, `apps/worker/demo/`                                             |
| Deploy                  | Docker Compose behind Traefik, one command (`deno task deploy`), several projects on one server, release images           | `docs/deploy.md`, `infra/`, `.woodpecker/release.yml`                           |
| Backups                 | restic to S3, restore rehearsal in CI                                                                                     | `docs/backups.md`, `infra/backup`                                               |
| CI                      | check, integration, backup-restore, alert rules, browser tests, e2e smoke and full                                        | `.woodpecker/ci.yml`, `docs/woodpecker-ci-setup.md`                             |
| Lighthouse budget       | Performance 95, the rest 100, on the pages listed                                                                         | `apps/mpa/lighthouse/lighthouserc.json`, `deno task lighthouse`                 |
| Screenshots and videos  | Recipes that re-capture the site's shots, OG cards, feature loops, admin video and README pictures                        | `apps/mpa/screenshots/`, `docs/screenshots/record.ts`, `.claude/skills/recapture-shots` |
| Catalog (off)           | A product catalog module, off unless `CATALOG=true`                                                                       | `docs/catalog.md`                                                               |

## 2. The rebuild PR

### Facts that shape it

- `legacy` already exists and equals `main` (`bd3b956`). Financy has no tags. financy.dev and
  app.financy.dev answer 404, so nothing is live.
- Financy's `main` is protected and requires the status `ci/woodpecker/pr/woodpecker` (strict).
  Woodpecker names a status after the workflow file. Financy's old pipeline is `.woodpecker.yml`;
  Seed's is `.woodpecker/ci.yml`, which reports `ci/woodpecker/pr/ci`. Seed's own protection
  requires exactly that.
- Woodpecker: Seed is repo id 15, Financy id 1. Both have an empty pipeline path (the default:
  `.woodpecker/` first), timeout 60 minutes, untrusted, approval only for forks. Seed's `ci.yml`
  uses no secrets, so it runs unchanged on Financy's repo.
- Seed's tracked env files (`infra/envs/.env.age`, `.env.prod.age`, `.env.backup.age`,
  `.env.prod.stale-2026-01.age`) are encrypted with Seed's age key. Financy's key cannot read them,
  and they hold Seed's server settings.
- `.woodpecker/release.yml` publishes on a `v*` tag to `IMAGE_PREFIX: antonshubin/template` with
  the global Docker Hub secrets. A Financy tag before this changes would overwrite Seed's images.

### Owner action before it can merge

Change Financy's required status check from `ci/woodpecker/pr/woodpecker` to
`ci/woodpecker/pr/ci`. Branch protection is the owner's to change. Without it the PR can never
merge: the old status never reports once `.woodpecker.yml` is gone. Renaming Seed's `ci.yml` to
`woodpecker.yml` instead is worse: `release.yml` has `depends_on: [ci]`, six files read
`.woodpecker/ci.yml` by name (`deno.jsonc`, `apps/mpa/lighthouse/run.sh`, `e2e/mpa/run.sh`,
`e2e/spa/run.sh`, `infra/backup/restore.test.sh`, `docs/woodpecker-ci-setup.md`), and every sync
would conflict.

### Steps

1. Worktree from Financy's `origin/main` (global Git Flow), branch `feat/rebuild-on-seed`. Check
   `git rev-parse origin/legacy` equals `origin/main`.
2. `git fetch https://github.com/spy4x/seed main` and keep `SEED=$(git rev-parse FETCH_HEAD)`. Use
   this one SHA for both the tree and `.seed/commit`; `docs/products.md` step 1 uses
   `git ls-remote`, which could see a newer `main` than the tree taken.
3. Replace the tree in one command: `git read-tree -u --reset FETCH_HEAD`. It removes every
   Financy file Seed lacks (old `apps/web`, `libs/client`, `.woodpecker.yml`, `.github/`,
   `.vscode/`, old docs) and checks out Seed's. `legacy` keeps all of them.
4. Bring back Financy's own: `git checkout origin/legacy -- LICENSE` (AGPL-3.0) and
   `AGENTS.md`. Delete Seed's four `infra/envs/.env*.age` files. Financy's two old ones stay in
   `legacy`; package 9 reads any value it reuses from there and writes a fresh env from
   `infra/envs/.env.example`. Developers run `deno task init` for a local `.env`.
5. Write `.seed/commit` (`$SEED`) and `.seed/skip` (below).
6. Edit the files in the table below. Nothing else.
7. Run `deno task check` the CI way (global "TS style"). Then
   `git diff --stat "$SEED" HEAD -- . ':!.seed'` must list only the table's files: that is the
   reviewer's check that nothing else of Seed changed.
8. Push, open the PR, review gate, wait for `ci/woodpecker/pr/ci`. Squash-merge: `main` keeps the
   old history and gains one commit.

### Files the rebuild PR must touch

| File                                        | Change                                                                                                                                                                                                              | Why now                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `.seed/commit`, `.seed/skip`                | New                                                                                                                                                                                                                 | Every later sync needs them                                             |
| `AGENTS.md`                                 | Financy's, with "How the rebuild starts" rewritten as done (legacy is a branch, not a tag; the tree is Seed's at `$SEED`); the old-code paragraph points at `legacy`                                              | Seed's AGENTS.md would tell agents this is the template                 |
| `README.md`                                 | Financy's: what it is, honest status (being rebuilt on Seed, old version on `legacy`), CI badge for repo id 1, AGPL-3.0, no seedsaas.com or demo links, no author section copied from Seed                         | GitHub shows it now                                                     |
| `LICENSE`                                   | AGPL-3.0 from `legacy`; Seed's MIT notice kept in a separate file (for example `LICENSE-SEED`), which MIT requires in every copy                                                                                   | The repo's licence is public now                                        |
| `.woodpecker/release.yml`                   | `IMAGE_PREFIX: antonshubin/financy`                                                                                                                                                                                 | A tag would overwrite Seed's images                                     |
| `infra/envs/.env*.age` (4)                  | Deleted                                                                                                                                                                                                             | Unreadable with Financy's key; Seed's server settings                   |
| `docs/financy-extraction-inventory.md`      | Deleted                                                                                                                                                                                                             | Seed's working list; points at Financy's old paths                      |

### Safe for later PRs

Everything else: the brand, the site copy, `/compare`, Seed's posts, the pictures, legal pages,
pricing, the demo. They are not live because nothing deploys on merge (`.woodpecker/deploy.yml.example`
is inactive) and financy.dev serves nothing. Two conditions keep it so:

- **No release and no deploy until package 9.** The global "Autonomy" rule says to tag and deploy
  `main` after a green gate; for Financy that would put Seed's site, Seed's prices and Seed's
  author offer on financy.dev. The lead holds both until packages 1 to 4 and 9 have merged.
- `deno task deploy` is never run with Financy's old `.env.prod` (it is gone from `main` after this
  PR, so it cannot be by accident).

### `.seed/skip` to start with

```
README.md
LICENSE
infra/envs/.env.age
infra/envs/.env.prod.age
infra/envs/.env.backup.age
infra/envs/.env.prod.stale-2026-01.age
docs/financy-extraction-inventory.md
```

`AGENTS.md` needs no line: the sync recipe excludes it. `.woodpecker/release.yml` stays off the
list: Financy changes one line and wants Seed's later fixes, so a sync merges it with `--3way`.
Each later package adds the paths it deletes or takes over completely (listed per package below).
Paths with `[[lang]]` work as written; a glob such as `libs/server/blog/seed-posts/*.md` works too
(checked in bash; zsh does not glob command output, so it passes through as a pathspec).

### What breaks, and what to do

| What                                                                 | Effect                                                                                                                                             | Do                                                                  |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Required check name                                                  | PR never mergeable                                                                                                                                 | Owner changes it (above)                                            |
| Open PR on the old code (financy #72)                                | Its base vanishes; it reports the old status                                                                                                       | Close after merge, as the old-code rule in Financy's AGENTS.md says |
| Changelog                                                            | `changelog-write.ts` takes every first-parent `feat`/`fix` of `HEAD`, so `/changelog` lists old Financy's commits; overrides are keyed by Seed PR numbers (581, 627) | Seed change S2 before package 5                                     |
| `docs/products.md` step 1 vs a fetched tree                          | `ls-remote` can record a newer Seed commit than the tree                                                                                           | Step 2 above; Seed doc fix (S6)                                     |
| Tests that check Seed's values (`apps/mpa/site.test.ts`, `e2e/mpa/`) | Pass now; change with each package                                                                                                                 | Each package edits its tests                                        |
| Old Financy docs (`MULTI_CURRENCIES_FEATURE.md`, `DASHBOARD_ISSUES.md`, `docs/`) | Gone from `main`                                                                                                                       | Read from `legacy`; Financy's AGENTS.md says so                     |

## 3. Work packages after the rebuild PR

Eleven packages, one PR each. Two of the brief's items are folded in because they touch the same
files as a bigger package: `llms.txt` goes with the site copy (package 2), and the analytics events
go with the pages that send them (1, 2, 7) and the Umami ids with the deploy (9). Every package that
edits English in `i18n/` also carries the eight translations, each by its own agent with a
back-translation check, and Russian goes to the owner (`i18n/TRANSLATING.md`, rules 5 and 6):
`deno task check` fails on a stale translation, so they cannot be split off.

Order: 1 → (2, 5, 6 in parallel) → 7 → (3, 4, 11 in parallel) → 9 → (8, 10).

### 1. Brand, author and repository identity

- **Files.** `apps/mpa/brand.ts` (`SITE_NAME`, `SITE_ICON`, `REPOSITORY_URL`, `TRY_ENTRY`,
  `AUTHOR_URL`, `appAddress`); `apps/spa/index.html`, `apps/spa/vite.config.ts` (manifest names),
  `apps/admin/index.html`, `libs/ui/frame.tsx` (`BrandMark`), `libs/ui/admin-frame.tsx`
  (`ADMIN_PRODUCT`) and their tests (`libs/ui/admin-frame.test.tsx`, `libs/ui/account.test.tsx`,
  `e2e/pwa.e2e.ts`, `e2e/app-shell-parity.e2e.ts`); the brand hue in the design tokens; the
  author's offer: `apps/mpa/hire.ts`, `routes/mvp.ts`, `e2e/mpa/mvp.mpa.ts`,
  `components/founders-handoff.tsx`, `components/pricing-ways.tsx`, `NAV_LINKS`, `footerGroups`,
  `SiteFrame` and `PERSON_JSON_LD` in `apps/mpa/site.tsx`, `WhoBuilds` in `routes/index.tsx`,
  `error-page.tsx`, i18n keys `SiteNav.hireHint` and `HomeWho.offer`, the `hire-me` event in
  `docs/analytics.md`; the admin app's help links `ADMIN_BILLING_SETUP_URL`
  (`libs/ui/admin-billing-list.tsx`) and `ADMIN_STATS_SETUP_URL` (`libs/ui/admin-stats-screen.tsx`),
  both pointing at Seed's GitHub docs.
- **Default to record.** Anton builds Financy too, so the author credit and `AUTHOR_URL`
  (antonshubin.com) stay true; Seed's MVP offer and prices (`hire.ts`) go.
- **Skip list gains** the deleted files.
- **Done when.** The SPA tab, the installed app and the admin tab say Financy;
  `git grep -n -w Seed -- apps/spa apps/admin libs/ui` finds nothing a person sees; no page links
  to `/mvp` or shows Seed's prices; tests pass.
- **Needs** the rebuild PR, and the brand hue and icon (design skill, product-designer).

### 2. Website copy, features and `llms.txt`

- **Files.** `apps/mpa/routes/index.tsx` (copy, FAQs, `HOME_HEAD`, which is the `llms.txt`
  summary, the `app.seedsaas.com` browser frames, the `Newsletter` band),
  `routes/[[lang]]/features.tsx`, `features/[slug].tsx`, `routes/admin.tsx`,
  `routes/features/admin.ts`, `apps/mpa/features-data.tsx` (758 lines: the features page and every
  `/features/<slug>`), `components/features-visuals.tsx`, `components/feature-loop.tsx`,
  `apps/mpa/loops.ts`, `apps/mpa/admin-modules.ts`, `routes/llms.txt.ts` (its MIT line becomes
  AGPL-3.0), `apps/mpa/config.ts` (`ROBOTS_POLICY`), `apps/mpa/subscribers.tsx` and the
  newsletter keys in `i18n/site/`; delete `/compare`: `routes/[[lang]]/compare.tsx`,
  `components/compare-alternatives.tsx`, its `pages.ts` entry, `static/og/compare.png` and the
  `compare` key of `OG_IMAGES`, `e2e/mpa/compare.mpa.ts`, the `compare-source` event, the links in
  `site.tsx`, `features.tsx`, `features/[slug].tsx` and `index.tsx`, and `/compare` and
  `/pt-BR/compare` in `lighthouserc.json`. `i18n/site/en.ts` names Seed 80 times.
- **Rule.** The site never lists a feature the product lacks (Seed AGENTS.md, "The public website
  stays in sync"). This PR describes what exists when it merges; each feature PR after it updates
  the pages that name it.
- **Skip list gains** the `/compare` files.
- **Done when.** `git grep -n "Seed's own site" -- apps/mpa i18n/site` lists only items owned by
  packages 3 to 6 and 10; `/compare` answers 404 and nothing links to it; `/llms.txt` describes
  Financy under AGPL-3.0; Lighthouse passes.
- **Needs** package 1; the copy from the marketing plan ([marketing.md](marketing.md)).

### 3. Legal pages

- **Files.** `apps/mpa/routes/[[lang]]/privacy.tsx`, `routes/[[lang]]/terms.tsx` and their i18n
  keys.
- **Content.** The operator (NeatSoft PTE LTD or the owner, the owner's choice), every datum the
  cloud stores (financial records are personal data under GDPR), processors (Hetzner, Stripe, the
  mail provider, Umami self-hosted, the exchange-rate source), retention after a lapse, the
  self-hosted case where Financy holds nothing.
- **Done when.** Every table the product stores is named on the privacy page; the terms describe
  the paid cloud and the AGPL self-hosted version; no mention of seedsaas.com or its demo.
- **Needs** package 7 (what is stored), package 4 (what is sold), the exchange-rate vendor.
  Legal wording is the owner's to approve: `needs-decision`.

### 4. Pricing and plans for the paid cloud

- **Files.** `libs/domain/billing/+lib.ts` (`PLANS`: a flat household plan with `perSeat: false`,
  the member cap, Financy's limits in place of `maxNotes` and `attachments.maxPerNote`, the trial
  length), `routes/[[lang]]/pricing.tsx` (copy, FAQ), `apps/mpa/components/pricing-ways.tsx`,
  `infra/envs/.env.example` comments (`STRIPE_PRICE_PRO`, `BILLING_TRIAL_REQUIRES_CARD`), the
  billing tests.
- **Done when.** `/pricing` shows Financy's plans from `PLANS`; the fake provider charges the flat
  price; a trial starts without a card if the owner chose that; tests pass.
- **Needs** package 7 (the limits name Financy's aggregates); the owner's price
  ([product.md](product.md) proposes €4 a month or €40 a year). A yearly price needs Seed change S4.

### 5. Blog and changelog

- **Files.** Every `.md` in `libs/server/blog/seed-posts/` except `README.md`;
  `apps/mpa/blog.ts` (`BLOG_NAME`); the post page `/blog/welcome-to-the-seed-blog` in
  `apps/mpa/lighthouse/lighthouserc.json`, and the Lighthouse runner's stand-in, which reads Seed's
  posts (`apps/mpa/lighthouse/run.sh`, `blog-api.ts`); `apps/mpa/changelog-overrides.ts` emptied;
  the "built by one developer, Anton Shubin" line, `routes/[[lang]]/changelog.tsx:175`;
  `apps/mpa/changelog.json` regenerated.
- **Skip list gains** `libs/server/blog/seed-posts/*.md`, so Seed's future posts never arrive.
- **Done when.** `/blog` names Financy's blog; `/changelog` starts at the rebuild; Lighthouse runs
  green with no Seed post.
- **Needs** Seed changes S2 (changelog start) and S3 (Lighthouse blog fixture). The first post idea
  goes to the owner in chat before any issue (Seed AGENTS.md, "Blog").

### 6. Docs site

- **Files.** `apps/mpa/docs-site.ts` (`DOCS_SITE_ORIGIN`, `PUBLISHED_DOCS`), `pages.ts`
  (`DOCS_PUBLISHED`), each published guide's pointer line, `.dockerignore` and
  `infra/deploy/include.txt` (`docs-site.test.ts` checks all four), the `/docs/capacity` entry in
  `lighthouserc.json`.
- **What to publish.** Financy's own guides (self-hosting, import, currencies). Seed's guides
  (`products`, `start-a-product`, `deploy` and the rest) describe Seed and must not appear on
  financy.dev.
- **Done when.** `/docs` lists only Financy's guides with financy.dev URLs; the test passes.
- **Needs** Seed change S5: published guides are listed in Seed's `docs/README.md` and live in
  Seed's `docs/`, which every sync rewrites.

### 7. Financy's first aggregate, beside notes

- **Files.** The full list in `docs/aggregates.md`, in order: domain, migration, repository,
  handlers, transports, screen in `libs/ui`, SPA view, offline, changes pull, tests, admin
  counterpart, delete and restore, movable, exportable, data export section, overview widget,
  notifications, starter data, onboarding, demo. Plus the privacy page line and the features copy
  (packages 3 and 2 rules), and the product's own analytics events in `docs/analytics.md`.
- **Which aggregate.** Accounts with balances in their own currency, or transactions; the product
  brief's first slice decides.
- **Done when.** The aggregate works offline and live between two members, has its admin module,
  appears in the data export and the group export, and the demo seeds it (if the demo is on).
- **Needs** the library items 1 and 2 of [libs-gap.md](libs-gap.md) (money and currency field).

### 8. Demo with finance data

- **Files.** `apps/worker/demo/*` (fake people and data), the starter-data job, `OnboardingView`,
  `DEMO_NOTE` in the auth screen, the wipe's `KEPT_TABLES`, `docs/demo.md`.
- **Decision.** Financy's production holds real financial data and its AGENTS.md has no demo
  carve-out, so a demo needs a deployment of its own (`docs/deploy.md`, "Several projects on one
  server"), for example demo.financy.dev with its own database. Option A: run it, with the wipe and
  seed updated by every schema change. Option B: no demo, and the "try it now" guest account
  (`docs/guests.md`) does the job. Pick: B until launch, then A. The owner's choice:
  `needs-decision`.
- **Done when.** (A) demo.financy.dev shows a household in three currencies and resets nightly.
- **Needs** package 7 and package 9.

### 9. Env, domains and deploy

- **Files.** `infra/envs/.env.prod` written from `infra/envs/.env.example` and encrypted as
  `.env.prod.age` (`PROJECT`, `DOMAIN`, `MPA_DOMAIN`, `ADMIN_DOMAIN`, SMTP, Stripe, VAPID, Umami
  ids `MPA_UMAMI_ORIGIN` and `MPA_UMAMI_WEBSITE_ID`, restic backup repository, `DEMO_MODE=false`,
  `CATALOG` unset); DNS on Cloudflare for financy.dev, app., admin.; the server (financy #60);
  `deno task operator:create`; optionally `.woodpecker/deploy.yml`.
- **Default to record.** financy.dev for the site, app.financy.dev for the SPA, admin.financy.dev
  for the admin app, matching Seed's layout and Financy's old env.
- **Done when.** The three hosts answer with Financy's brand; a backup snapshot exists and a
  restore rehearsal passes; the first operator can sign in.
- **Needs** packages 1 to 4. Picking or renting the server is the owner's (`manual` if new cost).

### 10. Screenshots, OG cards and videos (last)

- **Files.** `apps/mpa/static/shots/`, `static/og/` (drawn by `screenshots/og.html`),
  `static/video/`, `media/video/`, `apps/mpa/admin-video.ts` (length, size, date, transcript),
  `apps/mpa/screenshots/loops.ts` (task `loops`), `docs/screenshots/*.png` (README pictures),
  `media/demo/` (the README demo video and its recipe). The GitHub social preview is uploaded by
  hand: `manual`.
- **Skip list gains** the picture folders Financy owns, so Seed's re-captures never arrive.
- **Done when.** No picture shows Seed, seedsaas.com or notes; `recapture-shots` reruns them.
- **Needs** every visual package before it.

### 11. Notes switched off

- **Files.** Depends on S1. With a switch: one env line and the plan limits. Without it: about 500
  files name notes outside `libs/*/notes`, and every later sync conflicts in them.
- **Done when.** No screen, palette entry, plan line, demo record or site page mentions notes.
- **Needs** package 7 and Seed change S1.

## 4. Seed's rules: keep, adapt or drop

Seed's `AGENTS.md` sections, as a product reads them. Financy's `AGENTS.md` already says the two
"drop" sections do not apply.

| Section                                | For Financy | How                                                                                                                                               |
| -------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Three layers of UI" and the contract  | Keep        | As written, including the MPA working without JavaScript and `ScreenForm`, `PageHeader`                                                            |
| "Adding a feature"                     | Keep        | Copy the notes aggregate file by file (`docs/aggregates.md`); UUID v7 (`docs/ids.md`, `tests/no-uuid-v4.test.ts`)                                   |
| "The admin panel stays in sync"        | Keep        | Every Financy feature gets its admin counterpart in the same PR                                                                                    |
| "The public website stays in sync"     | Keep        | Financy's own pages; Lighthouse budget in CI step `browser`                                                                                         |
| "Product screenshots"                  | Keep        | Same skill; the admin video too                                                                                                                    |
| "Blog"                                 | Adapt       | "What's new in Seed" becomes "What's new in Financy"; post ideas to the owner in chat first                                                         |
| "Handoff"                              | Keep        | `docs/handoff.md` traps hold in Financy's copy too; its map and "What is decided" stay Seed's                                                       |
| "Products built on Seed"               | Adapt       | Financy is the product: take syncs, give back to Seed first                                                                                        |
| "The public demo"                      | Adapt       | Only on a demo deployment of its own (package 8); then the wipe and seed change with every schema change                                           |
| "The live demo is not production"      | Drop        | Financy's server holds real data                                                                                                                    |
| "Financy"                              | Drop        | Seed's note about Financy                                                                                                                           |

Rules in Seed's docs that also bind a product: the privacy page names every stored datum; the
translation loop and rules 5 and 6 (`i18n/TRANSLATING.md`); `docs/handoff.md` ground rules (money
is integers, bigint as decimal strings, the group is the only tenancy boundary, Postgres
authoritative); "Seed's own site" marks (`git grep`) are cleared, never copied into new code.

For the lead: Financy's `AGENTS.md` names exchange rates as Financy-only, while the owner's shared-library rules
and [libs-gap.md](libs-gap.md) item 3 put an exchange-rate integration in ts-libs. The rates' storage and
use stay in Financy; the client belongs in ts-libs.

## 5. Gaps

### Already in Seed, ready to build on

- **Scheduled jobs:** cron and delayed jobs, retries, per-aggregate jobs (`docs/jobs.md`). Covers
  recurring transactions, bill reminders, a nightly rate fetch.
- **Data export and import:** a person's ZIP with CSV per section (`docs/data-export.md`); group
  export and import in Seed's format (`docs/aggregates.md`).
- **Audit log:** account activity and the operator audit module.
- **Charts and widgets:** `@spy4x/preact-charts`, overview widgets per aggregate.
- **Locale, time zone, hour cycle:** `libs/domain/identity/preferences.ts`.
- **Money:** `formatMoney`, `parseMoney`, `currencyDecimals` (ts-libs), `MoneyDisplay`,
  `MoneyInput` (preact-components), integer amounts by rule.
- **Recurrence:** `@spy4x/time/rrule`.
- **CSV export:** `csvField`, `downloadCsv` (ts-libs).
- **File store and quotas:** `libs/server/files`, plan limits on storage.
- **Flat price:** `perSeat: false` on a plan.
- **Notifications, push, Telegram commands.**

### Missing, belongs in Seed first

Each would serve any product on Seed. Ordered by when Financy needs it.

| #  | Gap                                                                                                                                                                                                                                                       | Needed before       | Where                                                                  |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| S1 | **The notes example cannot be switched off.** Unlike the catalog (`CATALOG`), notes are wired into about 500 files; deleting them makes every later sync conflict. A switch, or a removal recipe Seed tests                                               | Package 11          | `libs/*/notes`, `apps/api/services/db-base.ts`, SPA nav and search      |
| S2 | **Changelog has no start point.** It takes every `feat`/`fix` in history, and overrides are keyed by Seed's PR numbers. A start commit set by the product                                                                                                 | Package 5, deploy   | `apps/mpa/changelog-write.ts`, `changelog-overrides.ts`                |
| S3 | **Lighthouse needs Seed's posts.** The runner's blog stand-in reads `libs/server/blog/seed-posts`, which the checklist tells a product to delete. A fixture post of its own                                                                               | Package 5           | `apps/mpa/lighthouse/run.sh`, `blog-api.ts`                            |
| S4 | **One paid price, monthly only.** One env price (`STRIPE_PRICE_PRO`), no yearly interval                                                                                                                                                                  | Package 4, if yearly | `libs/domain/billing/+lib.ts`, `libs/server/billing`, `docs/billing.md` |
| S5 | **A product's published guides have no home of their own.** `PUBLISHED_DOCS` follows Seed's `docs/README.md` in Seed's `docs/`, which syncs rewrite                                                                                                     | Package 6           | `apps/mpa/docs-site.ts`, `docs/README.md`                              |
| S6 | **The start-a-product checklist misses items:** `ADMIN_STATS_SETUP_URL`, `apps/mpa/admin-modules.ts`, `admin-video.ts`, `blog.ts` (`BLOG_NAME`), `components/feature-loop.tsx`, `loops.ts`, `screenshots/loops.ts`, `routes/features/admin.ts`, `media/demo/`, the `/compare` and `/docs/capacity` Lighthouse entries, a non-MIT licence, and `ls-remote` in step 1 | Packages 1 to 6     | `docs/start-a-product.md`, `docs/products.md`                          |
| S7 | **Search covers notes only.** A registry of searchable aggregates for the palette (financy #80)                                                                                                                                                           | Financy's search    | `apps/spa/src/state/search.ts`, `libs/server/notes/note-search.ts`     |
| S8 | **No import flow for outside files.** Group import reads Seed's own format only. Upload, map columns, preview, commit as a job, undo; the parsing parts are library items 7 to 9 of [libs-gap.md](libs-gap.md)                                                 | Bank CSV import     | `libs/server/jobs`, `libs/server/files`, a new `libs/ui` screen        |
| S9 | **No first day of the week preference.** Locale implies it only partly; weekly budgets and reports need it                                                                                                                                                | Weekly periods      | `libs/domain/identity/preferences.ts`                                  |

Not blocking, already filed in Seed: the MCP server (seed #211, p4), the Android app (#202) and
the desktop app (#203). Attachments are wired for notes only (`libs/domain/notes/attachments.ts`);
copying that pattern for receipts is the documented way, so it is no gap. Library gaps (currencies,
exchange rates, periods, CSV parsing, charts) are in [libs-gap.md](libs-gap.md).

<details>
<summary>Evidence</summary>

- Status contexts: `gh api repos/spy4x/financy/branches/main/protection` requires
  `ci/woodpecker/pr/woodpecker`; Seed's requires `ci/woodpecker/pr/ci`.
- Woodpecker repos: Seed id 15, Financy id 1 (`/api/repos/lookup/spy4x/<name>`); README badge
  `README.md:10` uses 15.
- `.woodpecker/release.yml:40` `IMAGE_PREFIX: antonshubin/template`; Docker Hub secrets
  `from_secret: DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN` at lines 111 to 186.
- `.woodpecker/ci.yml`: no `from_secret`; triggers `pull_request`, `push` to `main`, `tag`.
- `git grep -n "Seed's own site"`: 47 files at `875e2dea`.
- Notes reach: `git grep -l -iw 'notes\?' -- ':!libs/domain/notes' ':!libs/server/notes' ':!docs' ':!*.md' | wc -l` gives 523.
- Plans: `libs/domain/billing/+lib.ts`, `perSeat` field and the Free and Pro entries;
  `BILLING_TRIAL_REQUIRES_CARD` in `docs/billing.md:128`.
- Skip pathspecs: a bash test of `git diff` with `:!apps/mpa/routes/[[lang]]/compare.tsx` and
  directory entries excluded all 38 test paths.

</details>
