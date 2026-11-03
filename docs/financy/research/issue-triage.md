# Financy issue triage for the rebuild on Seed

Read-only triage of every open issue in spy4x/financy, done 2026-11-03. The brief counted 46, but
65 are open. Nothing was posted, labelled or closed. Seed paths are relative to `spy4x/seed`
`main`. Shared library paths are relative to `ts-libs` (`@spy4x/*` 1.107.0) and
`preact-components` (13.7.0).

## 1. Seed holes

**None found.** The old bug classes the brief named (#76, #81, #73, #41, #18, #50) were checked
against Seed's equivalent code. Each one is handled:

- **#76, group changes sent to everyone.** Seed reads the recipients from the database on every
  hint: `apps/api/services/realtime.ts:268-276` → `memberUserIds(groupId)` →
  `libs/server/groups/postgres-group-repository.ts:278-287` (`group_members.user_id`). The
  notifier gets only a `sendToUsers` port and cannot broadcast (ts-libs `realtime/notify.ts:19,38`).
  A test pins this: `apps/api/services/realtime.test.ts:387`. The pull that follows a hint checks
  membership again (`apps/api/features/groups/handlers.ts:172-181`).
- **#81, Telegram link code from a weak RNG.** `libs/server/auth/telegram.ts:91-110` uses
  `randomBase64Url` (a 12-byte binding and an 18-byte secret). The secret is stored hashed, works
  once, has an attempt limit and expires after 10 minutes. The webhook secret is compared in
  constant time (`apps/api/routes/telegram.ts:52`).
- **#73, the push switch.** The body is validated (`apps/api/routes/pushNotification.ts:38-43`).
  The welcome push is awaited, and `send` reaches only one user's devices
  (`apps/api/services/web-push-service.ts:93-103,121-130`). Endpoints must be public HTTPS
  addresses, checked against DNS, and redirects are not followed (ts-libs
  `integrations/push.ts:23-26`). The device id is `uuidV7()` (`apps/spa/src/views/ProfileView.tsx:478-481`).
- **#41, undeclared keys reaching the database.** Seed sets no global `onUndeclaredKey`, on
  purpose (ts-libs `validation/README.md:104`). Instead, every write names its columns:
  `apps/api/features/profile/handlers.ts:27` passes `{ firstName, lastName }`, and
  `libs/server/notes/postgres-note-repository.ts:412` does the same. Extra keys never reach SQL.
- **#18, WebSocket drops in the background.** On `visibilitychange`, `online` and `pageshow`, the
  client resumes after a quiet period (`apps/spa/src/realtime/index.ts:205-231`). The e2e tests
  cover it (`e2e/realtime-resume.e2e.ts:75,111,141`).
- **#50, time zones.** Preferences hold the time zone, locale and hour cycle
  (`libs/domain/identity/preferences.ts:70-77`). The overview cuts days in the person's zone
  (`apps/spa/src/state/overview.ts`).

The swap has three consequences. None of them is a hole:

- **The required CI check will never pass after the swap.** Financy's `main` protection requires
  `ci/woodpecker/pr/woodpecker`. Seed's pipeline is `.woodpecker/ci.yml`, which reports
  `ci/woodpecker/pr/ci`. Until the owner renames the required check, no PR can merge.
- **Licence.** Seed is MIT and Financy is AGPL-3.0. The copy must keep Financy's `LICENSE`, put it
  in `.seed/skip` (`docs/products.md`), and change the licence line in `llms.txt`
  (`docs/start-a-product.md`).
- **Library gap: currency decimals.** ts-libs money takes a `decimals` option
  (`platform/universal/money.ts:44-52`). preact-components `MoneyDisplay` and `MoneyInput` do not:
  they always use the currency's ISO decimals (`ui/money-input.tsx:175`, `currencyDecimals`). So a
  crypto balance (BTC with 8 places, USDT with 6) cannot be shown or typed. No issue exists for it
  yet. Under the library exception it is p2 for Financy's currencies work.

## 2. Verdicts

Counts: 28 CLOSE-SEED, 12 CLOSE-OLD, 19 FEATURE, 6 DUPLICATE. 65 in all.

| # | Title | Verdict | Rebuild topic | Priority | Home | Reason and evidence |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Move GitHub Projects to In Progress | CLOSE-OLD | - | - | - | A one-line chore about the old project board, with nothing to build. |
| 2 | Asset and liability tracking | FEATURE | Net worth: assets and liabilities | p3 | Financy | An account type with a sign (asset or liability) on the accounts model. It needs accounts first. |
| 3 | Research Plaid or a similar provider | FEATURE | Bank sync research | p4 | Financy | Plaid covers the US, Canada and the EU only. Compare it with GoCardless Bank Account Data. Import (#33) comes first. |
| 4 | Dashboard range in the URL | CLOSE-SEED | - | - | - | The overview keeps its range in the URL: `apps/spa/src/views/OverviewView.tsx:60,147` (`rangeFromSearch`/`rangeToSearch`). |
| 5 | MultiCurrencies | FEATURE | Currencies and exchange rates | p2 | Financy, plus preact-components decimals | This is core to the MVP: per-account currency, a rate fetcher with history, overrides and an API usage cap (the old tables `exchange_rates*`). It needs the decimals gap from section 1 fixed. |
| 6 | Earnings, income tracking (Russian) | DUPLICATE | Transactions core | - | - | This duplicates the transactions core topic. It is vague, and the old code already had income categories. |
| 7 | Scheduled transactions entered automatically | FEATURE | Recurring transactions | p3 | Financy, on Seed jobs | Repeating jobs exist (`docs/jobs.md:49-60`, cron or `everyMs`). Group it with #48. |
| 8 | Polish README and docs | DUPLICATE | - | - | - | This duplicates #51, which is the concrete version. |
| 9 | Sub-category; a transaction may sit in the parent | DUPLICATE | - | - | - | This duplicates #36. Carry its rule into #36: a transaction may sit in a parent category. |
| 10 | Optional analytics for the cloud version | CLOSE-SEED | - | - | - | Umami runs on the public site, and the SPA counts nothing: `docs/analytics.md`. |
| 11 | Use DI to mock dependencies | CLOSE-SEED | - | - | - | Routes take dependency interfaces, e.g. `apps/api/routes/pushNotification.ts:17`. |
| 12 | LLM entry | FEATURE | Natural-language and voice entry | p4 | Financy | Text to a draft transaction through a capped LLM API (DeepSeek, prepaid). It comes after quick entry. |
| 13 | Tags with transactions_to_tags and groups_to_tags | FEATURE | Tags on transactions | p3 | Financy, reusing Seed tags | Seed's tags aggregate is already group-scoped (`libs/domain/tags`, `tags.group_id`). Financy adds a link table modelled on `note_tags`. |
| 14 | Edit from the row dropdown reloads the page | CLOSE-OLD | - | - | - | This was the old router. Seed's screens navigate through a `navigate` port with wouter (AGENTS.md "Pure"). |
| 15 | Merge categories into accounts | FEATURE | Data model: double-entry or not | p2 | Financy, needs-decision | The owner must decide this before any schema exists. "Michael" is not identified anywhere, so the issue is vague. |
| 16 | Telegram account linking not implemented | CLOSE-SEED | - | - | - | Seed links accounts: `/start`, `/link`, `/unlink` and `/help` (`docs/telegram.md:71-93`, `libs/server/auth/telegram.ts`). The finance commands are a separate topic in section 3. |
| 17 | Line chart: income, expenses and cash flow | FEATURE | Dashboard and charts | p3 | Financy | `LineChart` exists in `@spy4x/preact-charts`, and the overview has room for widgets (`preferences.ts:58-66`). |
| 18 | WebSocket disconnects in the background | CLOSE-OLD | - | - | - | This was old code. Seed resumes the socket (`apps/spa/src/realtime/index.ts:205-231`) and tests it (`e2e/realtime-resume.e2e.ts`). |
| 19 | Account amount stale after changing starting amount | CLOSE-OLD | - | - | - | This was the old store. Carry one rule into the accounts topic: a balance is derived from the starting amount plus transactions, never stored separately. |
| 20 | Hover popup on group, account or category | FEATURE | Details panel | p5 | Financy | A hover-only popup fails on the keyboard and on phones. If it is ever built, use a details panel or the row's menu instead. |
| 21 | Audio input | DUPLICATE | - | - | - | This duplicates #12: voice is one input to the same entry flow. |
| 22 | Save preferred date and time format | CLOSE-SEED | - | - | - | Preferences hold the locale (region format) and hour cycle: `libs/domain/identity/preferences.ts:70-77`. |
| 23 | Choose dashboard widgets and their order | CLOSE-SEED | - | - | - | The overview layout preference exists (`preferences.ts:58-66`; seed#219, closed). Financy adds its own widgets to it. |
| 24 | unit-tests | CLOSE-SEED | - | - | - | Seed ships `tests/`, colocated `*.test.ts` and `deno task check`. |
| 25 | e2e-tests | CLOSE-SEED | - | - | - | Seed ships `e2e/` with Playwright. |
| 26 | OTEL_DENO=1 | FEATURE | Tracing | p4 | Seed | Seed has no OpenTelemetry and no metrics endpoint (`docs/stack.md:94-115`), and no Seed issue asks for it. It belongs in Seed, not Financy. |
| 27 | Maps instead of arrays in web state | CLOSE-OLD | - | - | - | This was an old-code optimisation. Seed's state lives in `apps/spa/src/state` and the offline database. |
| 28 | Net worth: assets minus liabilities | DUPLICATE | - | - | - | This duplicates #2. |
| 29 | Client id `cId` as a ULID | CLOSE-SEED | - | - | - | The client makes UUID v7 ids itself: `docs/ids.md`, `docs/offline.md`. |
| 30 | Configure Woodpecker CI/CD (milestone) | CLOSE-SEED | - | - | - | The pipeline comes with the copy (`.woodpecker/ci.yml`, `release.yml`). What remains is one-time setup by the owner: activate the repo in Woodpecker, rename the required check, and set `IMAGE_PREFIX` and the secrets. |
| 31 | Operations toastr | CLOSE-SEED | - | - | - | Toasts exist: `apps/spa/src/state/toasts.ts`. |
| 32 | PWA icons and colours | CLOSE-SEED | - | - | - | The PWA exists (`apps/spa/src/sw.ts`, `e2e/pwa.e2e.ts`). The rebrand of the manifest (`apps/spa/vite.config.ts:85-90`, name `Seed`) is a section 3 topic. |
| 33 | Bank statement upload and reconciliation | FEATURE | Statement import | p3 | Financy; parser in ts-libs | Import CSV and OFX, match existing transactions, and warn when the balance does not match. A generic CSV/OFX parser belongs in ts-libs. |
| 34 | Receipt attachments | FEATURE | Receipts | p4 | Financy, on Seed files | Seed's file store handles signed uploads of images and PDFs (`docs/files.md`, note attachments). |
| 35 | Financial goals | FEATURE | Savings goals | p4 | Financy | This is on the old roadmap. It comes after budgets. |
| 36 | Parent categories | FEATURE | Categories with parents | p2 | Financy | Decide the schema early, together with #15, because #39 calls nested categories important. Include #9's rule. |
| 37 | Status page | FEATURE | Status page | p5 | Seed | Moved to Seed as spy4x/seed#691: a status page any product could use. |
| 38 | Landing page | CLOSE-SEED | - | - | - | The Fresh public site comes with the copy: `apps/mpa`. |
| 39 | Important features (Russian) | DUPLICATE | Umbrella | - | - | The title means "Important features". It lists budget progress per category, nested categories, quick entry, backup and sync, groups, physical and virtual accounts, monthly category stats, multi-currency, a daily budget notification, mobile first, offline first and envelopes. Every item maps to #36, #5, #48 or a section 3 topic. Split it, then close. |
| 40 | Signals encapsulated in stores | CLOSE-SEED | - | - | - | Seed's stores are signals behind ports: `apps/spa/src/state`. |
| 41 | ArkType undeclared keys not respected | CLOSE-OLD | - | - | - | This was old code. Seed is safe because every write names its columns (section 1). |
| 42 | Profile management UI | CLOSE-SEED | - | - | - | `apps/spa/src/views/ProfileView.tsx`. |
| 43 | Shared schemas as the base of every entity | CLOSE-SEED | - | - | - | Seed's domain has one folder per aggregate (`libs/domain`, `docs/aggregates.md`). |
| 44 | Export the user's data | CLOSE-SEED | - | - | - | A ZIP of JSON and CSV, built by a job: `docs/data-export.md`. Financy adds a section for each of its aggregates. |
| 45 | Check realtime on two devices | CLOSE-SEED | - | - | - | Covered by the e2e test `e2e/groups-socket.e2e.ts:147`. |
| 46 | group_memberships | CLOSE-SEED | - | - | - | Groups, invitations and roles: `libs/domain/groups`, `apps/spa/src/views/GroupsView.tsx`. |
| 47 | Unify styles and fix dark theme | CLOSE-SEED | - | - | - | The house theme comes from preact-components, with light and dark modes. |
| 48 | Bill reminders | FEATURE | Bill reminders | p4 | Financy, on Seed jobs and notifications | Build it with #7 on the same jobs and push/email notifications. |
| 49 | Dexie and offline-first (milestone) | CLOSE-SEED | - | - | - | Offline storage is IndexedDB: `apps/spa/src/offline`, `docs/offline.md`. Each Financy aggregate adds its collection (section 3). |
| 50 | Transaction date and time zone | CLOSE-OLD | - | - | - | Seed has the zone preference (section 1). Choosing between a calendar date and a timestamp for transactions moves to section 3. |
| 51 | README: what Financy is, show it, status | FEATURE | README and GitHub card | p3 | Financy | After the swap the README is Seed's, so put `README.md` in `.seed/skip`. Fold in #8 and #69 point 1. Its "MIT" line is now wrong: Financy is AGPL-3.0. |
| 57 | Move password hashing to ts-libs (milestone) | CLOSE-SEED | - | - | - | Seed uses `createPasswordHasher` (`apps/api/services/sign-in.ts:645`). There is no production data to migrate. |
| 60 | No production deployment (milestone) | CLOSE-OLD | - | - | - | The old app was never deployed (financy.dev returns 404). The rebuild deploys with Seed's `deno task deploy` (`infra/scripts/deploy.ts`) once it is ready. |
| 62 | Adopt ts-libs sign-in, db and config (milestone) | CLOSE-SEED | - | - | - | All of it is in Seed: `apps/api/services/sign-in.ts`, `auth.ts:15` (the TOTP issuer comes from config), `middlewares/auth-rate-limits.ts`, `services/json-body.ts` and `services/db-base.ts:222-235`. ts-libs#230 is closed. |
| 66 | Fresh-clone setup fails on env comments and vapid.json (milestone) | CLOSE-SEED | - | - | - | Fixed in Seed: `infra/scripts/env-file.ts:6-16` strips comments, `init.ts` makes the keys, and `deploy.ts:302-305` creates `vapid.json`. |
| 67 | Adopt preact-components 1.0 (milestone) | CLOSE-SEED | - | - | - | Seed is built on preact-components 13.7. The decimals gap remains (section 1). |
| 69 | Description oversells, resume date, where to open it (milestone) | CLOSE-OLD | - | - | - | Points 2 and 3 describe the old app. Point 1 (the GitHub description) moves to #51. |
| 70 | Deep review with Fable 5.5 | CLOSE-OLD | - | - | - | It reviews the old code. A review of the rebuild can be filed once it exists. |
| 71 | No UUID v4 for the push device id (milestone) | CLOSE-SEED | - | - | - | Seed uses `uuidV7()` (`ProfileView.tsx:478-481`). PR #72 targets the old code, so close it unmerged. |
| 73 | The push switch can never be turned on | CLOSE-SEED | - | - | - | Seed's push flow works and validates its input (section 1). The open A/B question applied only to the old code, so it no longer needs an answer. |
| 76 | Group changes pushed to every connected user | CLOSE-OLD | - | - | - | This p1 bug is in the old code only. Seed is safe (section 1). |
| 77 | Frozen install, missing stylesheet, dead Tailwind config | CLOSE-SEED | - | - | - | `Dockerfile.base:56` runs `deno install --frozen`. The stylesheet and the config are old files. |
| 80 | Palette search in the Seed rebuild | FEATURE | Search palette entries | p3 | Financy | The owner asked for it. It is blocked by seed#342 (open, p3, milestone "Broad launch"). The palette itself exists: `libs/ui/search-palette.tsx`. |
| 81 | Telegram link code from a weak RNG | CLOSE-OLD | - | - | - | This was old code. Seed is safe (section 1). |
| 82 | Feature, use-case and alternative pages | FEATURE | Website pages | p3 | Financy `apps/mpa` | The owner asked for it. Seed's page type is done (seed#563, closed). Build pages only for features that exist. |

**PR #72** ("feat: no UUID v4 for the push device id") changes the old `apps/web` code. Close it
unmerged with #71, because Seed already uses `uuidV7()`.

**Milestone "Before the rebuild on Seed"** (#66, #69, #71) empties out: #66 and #71 are
CLOSE-SEED, and #69 is CLOSE-OLD after its point 1 moves to #51. Close the milestone with them.

**Milestone "Rebuild on Seed"** (#30, #49, #57, #60, #62, #67):

- #49, #57, #62 and #67 come with the copy.
- #30 turns into the owner's one-time setup: activate Woodpecker, rename the required check, and
  set `IMAGE_PREFIX` and the secrets.
- #60 turns into the first deploy of the rebuild.

What the milestone should track instead is the section 3 list, starting with the p2 topics.

## 3. Topics the old issues never covered

These are what a finance product on Seed needs. The p2 topics are marked; the rest are p3 unless
noted.

- **Accounts (p2).** Starting balance, a derived balance, a default account, archiving,
  physical and virtual accounts, and an account type for net worth (#2).
- **Transactions core (p2).** Income, expense, and transfers as linked pairs. Amounts are integers
  in the smallest unit. Quick entry.
- **Categories (p2).** Income or expense, icon, colour, and parents (#36).
- **Budgets (p2).** Monthly limits per category, progress bars, envelopes, and the daily budget
  notification from #39.
- **Currencies (p2).** Crypto currencies with their own decimals. Rate history and overrides
  (#5).
- **Transaction date semantics (p2).** A calendar date or a timestamp, read in the person's zone
  (from #50).
- **Remove Seed's notes reference aggregate (p2)** once the first Financy aggregate copies it
  (`docs/aggregates.md`).
- **Every aggregate's companions, in the same PR (Seed AGENTS.md).** Each one gets:
  - an admin counterpart;
  - the demo wipe and seed (`docs/demo.md`);
  - an offline collection;
  - an export section and a portable for group export and import;
  - plan limits for the cloud version (like `maxNotes`);
  - website pages kept in sync.
- **Finance terms in all nine languages.**
- **Telegram finance commands** in `apps/api/telegram/commands.ts`, such as adding an expense and
  checking a balance (`docs/financy-extraction-inventory.md`).
- **The token API and the MCP server**, the product approach's "usual package".
- **Rebrand:** the PWA manifest, the mails, the site, the README card (#51), `IMAGE_PREFIX`, and
  the AGPL-3.0 licence kept through `.seed/skip`.
- **A privacy page written for financial data** on the public site.
- **Later (p4):**
  - split expenses, debts and investments;
  - transaction templates;
  - sharing one account across groups;
  - mobile apps (seed#202).
