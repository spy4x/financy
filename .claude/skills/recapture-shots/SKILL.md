---
name: recapture-shots
description: Re-capture the product screenshots, both the public website's (apps/mpa/static/shots and og cards, by apps/mpa/screenshots/capture.ts) and the README's (docs/screenshots, by docs/screenshots/record.ts). Use after a change that alters how a photographed screen looks in a significant way, and ask the owner when unsure. Also re-records the admin panel video of the website's /admin page (docs/screenshots/admin-video.ts) and the website's three feature loops (apps/mpa/screenshots/loops.ts) when a screen they show changed significantly.
---

# Re-capture the product screenshots

Two sets of pictures show the product, and both are re-captured together:

- The public website (`apps/mpa`): made by `apps/mpa/screenshots/capture.ts`, committed under
  `apps/mpa/static/shots/` and `apps/mpa/static/og/`.
- The README: the stills of Accounts, Transactions, Budgets and Overview, the add-a-transaction
  GIF and the GitHub social preview, made by `docs/screenshots/record.ts` and committed under
  `docs/screenshots/`.

The admin panel video on the website's `/admin` page is a third piece, made by
`docs/screenshots/admin-video.ts` (`deno task video:admin`) and committed under
`apps/mpa/media/video/` and `apps/mpa/static/video/`. Re-record it in the same PR when the change
altered a screen the video shows significantly; its header names the shots.

The website's three feature loops (live sync, offline entries, keyboard shortcuts) are a fourth,
made by `apps/mpa/screenshots/loops.ts` (`deno task loops` in `apps/mpa`) and committed under
`apps/mpa/media/video/` and `apps/mpa/static/video/` as `<name>-loop-light.*`. They are recorded
once, in the light theme, and the site shows that one copy in both of its themes. Re-record them in
the same PR when the change altered the transactions list, the transaction editor, the budgets
screen, the search palette or the shell significantly.

`AGENTS.seed.md`, "Product screenshots", says when to run this. This skill says how.

## 1. Decide whether to run

`AGENTS.seed.md`, "Product screenshots", says when. The website's photographed screens are
listed in `apps/mpa/screenshots/README.md`, "What it does"; the README's are named in
`record.ts`'s header.

## 2. Prepare

1. Work in a worktree on `main` with the change merged (Git Flow in the global rules), branch
   `docs/recapture-shots`.
2. Check the tools: `command -v cwebp magick tar ffmpeg`.
3. A fresh worktree has no `infra/envs/.env` and no `infra/configs/vapid.json`: follow the
   README's "Quick start" (copy `.env.example`, set `KV_PASSWORD`, `deno task vapid-key:create`).
   Keep `ENV=dev`, which the README pictures need. When another project already holds port 5432,
   set `DB_HOST_PORT` in that `.env` to a free one, keeping its
   `127.0.0.1:<port>` form so Postgres stays off the network (`127.0.0.1:55432`).
4. Add `admin` to `COMPOSE_PROFILES` in `infra/envs/.env` and set `FILES=false` there (without
   it the API stays unhealthy and Traefik answers 404), then from the worktree root run
   `deno task proxy:start` and `deno task dev`. Both start detached Docker containers. When
   `deno task dev` hangs on its `docker compose --dry-run` check (#200), run what it would run:

   ```bash
   docker compose -f ./infra/compose/compose.shared.yml -f ./infra/compose/compose.dev.yml \
     --env-file ./infra/envs/.env build deno-base
   docker compose -f ./infra/compose/compose.shared.yml -f ./infra/compose/compose.dev.yml \
     --env-file ./infra/envs/.env up -d --build
   ```

   Wait until `http://app.localhost` and `http://admin.localhost` answer.

## 3. Capture

From `apps/mpa`, through the harness's background runner (a foreground call stops at ten minutes):

```bash
systemd-run --user --scope --quiet -p TasksMax=4000 -p MemoryMax=8G timeout 900 deno task screenshots
```

A failing screen is listed at the end and the run exits 1; fix the cause and run again, at most
three times. The script deletes its four demo accounts at the end, also when it fails.

Then, from the worktree root, record the README pictures the same way:

```bash
systemd-run --user --scope --quiet -p TasksMax=4000 -p MemoryMax=8G timeout 900 deno run -A docs/screenshots/record.ts
```

It builds the website's sample household with `capture.ts`'s helpers, so it signs up the same four
people: run it after `capture.ts` has finished, never beside it. It deletes the four through the
development route `/api/test/cleanup-user` (only with `ENV=dev`) before it starts, so any
development database works, also one where an earlier run left them, and again when it ends, also
when it fails, so the admin panel video never shows them. A screen that does not show what the
README says it shows, or a missing exchange rate, fails the run.

When the video needs it too, record it last, on a freshly seeded database, as the header of
`docs/screenshots/admin-video.ts` says (`ENV=dev deno task db:reset`, then restart the API and the
worker), with the API run as a release build (`APP_VERSION` and `APP_COMMIT`, which System
shows; the header says how):

```bash
APP_URL=http://app.localhost ADMIN_URL=http://admin.localhost SEED_PASSWORD=… APP_VERSION=… systemd-run --user --scope --quiet -p TasksMax=4000 -p MemoryMax=8G timeout 900 deno task video:admin
```

When the loops need it, record them from `apps/mpa` (`deno task loops realtime` remakes one):

```bash
systemd-run --user --scope --quiet -p TasksMax=4000 -p MemoryMax=8G timeout 900 deno task loops
```

It prints each clip's length and sizes; every file stays under 600 KB and each clip lasts 5 to 8
seconds.

The admin video's run prints the length, the file sizes and the music's loudness. Update `apps/mpa/admin-video.ts`
with them (the seconds from `ffprobe` of the MP4, rounded; the MP4's size; the upload date with
its timezone) and with one transcript line per shot of the new cut, then the e2e tests in
`e2e/mpa/admin.mpa.ts` that pin the length, the number of shots and the size.

## 4. Look, then ship

1. Open every changed `.webp`, `og/*.png` and `docs/screenshots/*.png` with the Read tool, and a few
   frames of the GIF. For the frames, copy `docs/screenshots/add-transaction-dark-1280.gif` into
   your scratch folder, then run there
   `ffmpeg -i add-transaction-dark-1280.gif -vf "select='not(mod(n,12))'" -fps_mode vfr f%02d.png`.
   Check each against the screen it shows: right data, nothing cut off, both themes, no spinner,
   toast, focus ring or hover caught mid-flight.
2. Update the README's alt text so it describes the new pictures. For the video, extract stills
   of key moments (`ffmpeg -i admin-panel.mp4 -vf fps=2 still-%03d.png` in your scratch folder),
   look at each, and check that the transcript matches what the video shows.
3. For the loops, extract a contact sheet of each clip
   (`ffmpeg -i realtime-loop-light.webm -vf "fps=2,scale=720:-1,tile=3x4" -frames:v 1 sheet.png`
   in your scratch folder) and check that the pointer moves to each target and the story reads
   from start to end.
4. Check the budgets the website's README names: 70 KB for each file, under 2.5 MB for the folder
   (`du -sb apps/mpa/static/shots`).
5. Stop what you started: `deno task compose down` and `deno task proxy:stop`, unless the stack was
   already running before you began. Then run the orphan sweep.
6. Open a PR with the before and after of the main pictures. A design reviewer checks it, as for
   any visible change; merge and deploy as `AGENTS.seed.md` says.
7. `docs/screenshots/social-preview-1280.png` reaches GitHub only when the owner uploads it in the
   repository's settings (General, "Social preview"); no agent can. When it changed, the PR body
   and the final report name this under "Needs you".
