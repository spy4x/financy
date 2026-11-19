# Website screenshots and social images

`capture.ts` makes the product pictures of the public website and its Open Graph images. Its output
is committed: the website serves the files, nothing builds them at deploy time.

| Output                                       | What it is                                     |
| -------------------------------------------- | ---------------------------------------------- |
| `static/shots/<name>-<light\|dark>-<w>.webp` | Product screenshots, in each theme and width   |
| `static/og/<page>.png`                       | 1200×630 social card per page, from `og.html`  |
| `screenshots/.out/masters/`                  | Full-resolution PNG masters (gitignored)       |
| `screenshots/.out/cache/`                    | The two Geist fonts the cards use (gitignored) |

## Run it

1. Start the development stack with the admin panel (`admin` in `COMPOSE_PROFILES`): run
   `deno task proxy:start` and `deno task dev` from the repository root. The script talks to
   `http://app.localhost` and `http://admin.localhost`; `SHOTS_APP_URL` and `SHOTS_ADMIN_URL` change
   them.
2. Have `cwebp` (libwebp), `magick` (ImageMagick 7) and `tar` on the `PATH`.
3. From `apps/mpa`: `deno task screenshots`.
   `deno task screenshots --og-only` renders only the social cards, from the shots already there.
4. Look at every picture before you commit it.

A screen that fails is listed at the end and the run exits 1; the others are still written.

## What it does

- Signs up Ada Lovelace, Grace Hopper, Linus Torvalds and Margaret Hamilton (all `@example.com`),
  with a password made per run. It deletes the four accounts first and again at the end, even when
  the run fails, through the development route `/api/test/cleanup-user`.
- Builds the group "Sample household" through the API: four adults, accounts in EUR, USD, GBP and
  THB, transactions, one transfer and three budgets. Every id it makes is a UUID version 7.
- Signs Linus in to the admin panel as an operator and runs the `rates.fetch` job, so a fresh stack
  has the day's rates. A screen that says a rate is missing fails the run.
- Records a finished backup through the development route `/api/test/record-backup`, so the admin
  panel's System page can report that everything is working.
- Answers the app's two Telegram requests in the browser, because a development stack has no bot.
- Photographs each screen in light and dark on a 390×844 phone at device scale 3, with reduced
  motion, a hidden caret, no transitions, and a clock fixed a few minutes after the data was made,
  so every time reads "3 minutes ago".
- Fails the run when a number the website's words quote is not on the screen, or when a screen's
  content reaches past its crop.

Every screen is delivered at 780 and 390 px wide.

| Screen                 | Page that shows it                        | Screen in the product      | Height at 780 |
| ---------------------- | ----------------------------------------- | -------------------------- | ------------- |
| `for-expats`           | `/for/expats`, `/features/multi-currency` | Accounts                   | 1268          |
| `for-couples`          | `/for/couples`                            | Overview                   | 1268          |
| `for-families`         | `/for/families`, `/features/households`   | Members                    | 880           |
| `for-small-business`   | `/for/small-business`                     | Transactions               | 1096          |
| `feature-live-sync`    | `/features/live-sync`                     | Transactions               | 1096          |
| `feature-self-hosting` | `/features/self-hosting`                  | System, in the admin panel | 1408          |
| `feature-transfers`    | `/features/transfers`                     | Transfer editor            | 1504          |
| `feature-budgets`      | `/features/budgets`                       | Budgets                    | 880           |
| `feature-telegram-bot` | `/features/telegram-bot`                  | Link Telegram dialog       | 802           |

A crop's height is written twice: as its `clip` in `capture.ts`, and at twice the size in
`audience-data.ts` or `features-data.tsx`. Change both together; `feature-pages.test.ts` fails when
a feature page's height differs from its file. The one exception is `feature-telegram-bot`: its crop
is measured from the dialog, so only its height in `features-data.tsx` is written by hand.

## Feature loops

`loops.ts` (`deno task loops`, or `deno task loops offline` for one) records the three silent
loops the feature pages and the home page play: realtime sync, offline editing and the keyboard
shortcuts, once, in the dark theme, which the site shows in both of its themes. It needs the same
running stack, plus `ffmpeg` built with `libsvtav1` and `libx264`, and `cwebp`.

- It signs up the same four people as `capture.ts`, seeds its own notes and tags, and deletes the
  people again at the end.
- Each clip plays in the real SPA at 720×450 CSS px (realtime: two windows of 360 px side by side)
  at device scale 2, with a drawn pointer moved at a person's pace and key caps for shortcuts.
- Chromium's screencast is played back at 15 frames a second. The clip ends with a half-second
  fade into its own first frame, so it loops without a jump.
- It writes `media/video/<name>-loop-dark.webm` (AV1) and `.mp4` (H.264), each under 600 KB, and
  the first frame as `static/video/<name>-loop-dark-<720|1440>.webp`, the poster.

## Size budgets

`cwebp` starts at quality 80 and steps down until a file fits 70 KB. The whole `static/shots` folder
stays under 2.5 MB. A social card is a
full-colour PNG when it fits 150 KB and a 256-colour one when it does not.

## Fonts

The cards use Geist Sans and Geist Mono from the `geist` npm package, pinned to 1.7.2 in
`capture.ts`. The script downloads that tarball from the npm registry once, checks it against the
registry's SHA-512 integrity, and unpacks the two variable fonts into `.out/cache`. Geist is under
the SIL Open Font License. `og.html` loads nothing from outside: capture.ts serves it, the fonts
and the screenshots from a made-up origin and blocks every other request.
