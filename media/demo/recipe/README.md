# Financy's demo video

The recipe of `media/demo/`: about a minute of Financy's app in the light theme, with the
website's sample household (four people, accounts in euros, pounds, baht and dollars). It shows the
accounts and their total in euros, a transfer from euros to baht at the day's rate, a dinner in baht
added with the `t` shortcut, a partner's entry arriving live, the month's budgets and the overview.

## Remake it

```sh
deno task demo-video            # start the stack, record and encode, about 15 to 30 minutes
deno task demo-video --encode   # encode the last take again, about 3 minutes
```

Run it from the repository root. Edit `media/demo/captions.vtt` or swap `media/demo/music.opus`,
then `--encode`: the last take stays in `media/demo/.take/` (gitignored) until the next recording.
A recording writes `captions.vtt` anew, with each caption timed from the moment its step started.

## What it needs

1. Docker with Compose, Deno, and `ffmpeg` with libvpx-vp9, libx264, libopus, libwebp and
   drawtext.
2. Chromium of the pinned Playwright (`deno run -A npm:playwright@1.57.0 install chromium`).
3. Ports 80 and 443 free, or held by a container named `traefik` (the proxy `deno task dev`
   reuses). No container named `financy-video-*`.
4. Passwordless `sudo -n`, to delete the stack's database files, which Postgres and Valkey write as
   their own users.
5. Network access: the admin panel fetches the day's exchange rates.

## What a run does

1. Off camera, `stack.ts` starts this checkout's development stack as the Compose project
   `financy-video`, on `app.financy-video.localhost` and `admin.financy-video.localhost`, with
   spare host ports, its own env file made by `deno task init`'s `prepareEnv`, and its data in a
   temporary folder. It runs beside any other stack on the machine and reuses a running `traefik`.
2. Off camera, `record.ts` builds the sample household with the exported helpers of
   `apps/mpa/screenshots/capture.ts`, the same that make the website's screenshots, fetches the
   day's rates and keeps Ada's and Grace's signed-in sessions. No password is ever on screen.
3. The app is recorded as Ada at 800×500 CSS pixels with the rail showing, so its text stays
   readable where the clip plays about 528 px wide. `pointer.js`, `keys.js` and `human-mouse.ts`
   draw a pointer and key caps and move like a person. Grace's groceries are sent through the API
   from her own session while Ada's page records, so the entry arrives live.
4. `take.ts` records with Chrome's screencast: a frame each time the page paints, timed by the
   clock, so a loaded machine paints fewer frames but never shifts the timing. It turns the shots
   into one frame per 1/30 s and writes them as a lossless `take.mkv`. On a loaded machine a page
   can take seconds to answer a click, and key presses lag: a page's answer plays in at most
   0.5 s, and typing at 65 ms a key.
5. `encode.ts` adds the title and end cards, burns in the captions, lays the music under it at
   about -28 LUFS, and writes `demo.webm`, `demo.mp4`, `poster.webp` (1280 wide) and
   `poster-640.webp`. There is one theme and one size; a site picks the poster width it needs.
6. On exit, failed, stopped with Ctrl-C (SIGINT) or SIGTERM, or not, the browser closes and the
   stack's containers, volumes and images go, with its temporary folder, and Traefik and the
   `proxy` network too when this run started them.

The poster is the accounts screen the clip opens on, without the pointer.

## Check the result

```sh
ffmpeg -i media/demo/demo.mp4 -vf "fps=1,scale=320:-1,tile=6x10" -frames:v 1 sheet.png
ffmpeg -i media/demo/demo.mp4 -af ebur128=peak=true -f null - 2>&1 | tail -12
```

Every caption readable and clear of what it describes, the cards there, and nothing on screen but
the sample household's made-up data.
