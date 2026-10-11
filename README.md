# Martins schema

A small Swedish school-timetable PWA. It renders an iCalendar (ICS) feed as a
day view and a week view, works offline, installs on iOS and Android, and runs
as a single Cloudflare Worker (static assets + one tiny proxy route).

- UI entirely in Swedish (sv-SE, Monday-first weeks, ISO week numbers, 24h).
- All times shown in Europe/Stockholm regardless of device timezone.
- Current-time line, "Nu"/"Nästa" lesson, overlapping lessons side by side.
- Stable per-subject colours derived from the subject name.
- Light and dark theme (follows the system, with a manual override).
- Offline: the last successfully fetched schedule is shown with a
  "Uppdaterat …" indicator.

## Stack

Vite 8 + TypeScript (no framework), [ical.js](https://github.com/kewisch/ical.js)
for parsing and recurrence, [zod](https://zod.dev) at the Worker boundary,
vite-plugin-pwa (Workbox) for the manifest and service worker, vitest for
tests, wrangler for the Cloudflare Worker.

## Setup

```sh
npm install
cp .dev.vars.example .dev.vars   # then put the real feed URL in .dev.vars
```

`.dev.vars` is gitignored. The feed URL contains a secret token and must never
be committed.

## Development

```sh
npm run dev          # Vite on http://localhost:4310 with the fixture feed
npm run preview      # Build + wrangler dev on http://localhost:8787 (real proxy)
```

In `npm run dev` the route `/api/schedule.ics` is served from
`test/fixtures/schema.ics` by a tiny dev-only Vite middleware, so you can
work on the UI without the Worker. Other states:

```sh
VITE_FIXTURE=empty npm run dev   # the empty-calendar state (what the real feed returns today)
VITE_FIXTURE=html  npm run dev   # a Cloudflare Access login page instead of ICS
VITE_FIXTURE=error npm run dev   # a 502 from the proxy
# Real feed instead of the fixture (e.g. a local Plugga on http://localhost:3000):
# put DEV_FEED_URL=<feed url> in .env.local (gitignored), then `npm run dev`
```

`npm run preview` runs `wrangler dev`, which serves `dist/` and proxies the
real feed from `SCHEDULE_FEED_URL` in `.dev.vars`. Run `npm run build` first.
`SCHEDULE_FEED_URL` must be `https://`; plain `http://` is accepted only for
`localhost`.

Keyboard on desktop: `←`/`→` previous/next, `t` today, `d` day view, `v` week
view. On phones, swipe horizontally.

## Tests, type check, build

```sh
npm test             # vitest (ICS parsing, recurrence, timezone/DST, week logic, layout, Worker)
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + vite build (+ service worker and manifest)
```

Visual check (needs a running `npm run dev` and a Playwright Chromium build):

```sh
CHROME_PATH=/path/to/chrome-headless-shell npm run screenshots
```

writes PNGs for phone/desktop, light/dark, day/week into `screenshots/`
(gitignored).

## Deploy

The Worker is configured in `wrangler.jsonc` for the custom domain
`schema.martincrusell.com` (the zone must be on the same Cloudflare account;
wrangler creates the DNS record on first deploy).

First time, in this order, so the schedule is never reachable without Access:

1. `npx wrangler login`
2. In Zero Trust → Access → Applications, add a self-hosted application for
   `schema.martincrusell.com` with an Allow policy for the people who may see
   the schedule.
3. `npm run deploy`. Without the secret the proxy answers 500, so no schedule
   data is served yet.
4. Check that `https://schema.martincrusell.com` redirects to the Access
   login when opened in a private window.
5. `npx wrangler secret bulk .dev.vars` (or `npx wrangler secret put
   SCHEDULE_FEED_URL`) to give the Worker the feed URL.

After that, shipping a fix is one command. It runs the tests, builds and
deploys:

```sh
npm run deploy
```

`workers_dev` and `preview_urls` are off in `wrangler.jsonc`: a
`*.workers.dev` address would bypass Access.

### Cloudflare Zero Trust (Access)

The app has no login of its own; Access on `schema.martincrusell.com` is the
only thing keeping the schedule private.

Notes:

- Access redirects unauthenticated requests to a login page. The app detects
  a non-ICS response from `/api/schedule.ics` (e.g. that HTML page when the
  session has expired) and shows a "Du behöver logga in igen / Ladda om"
  state instead of crashing. A reload goes through Access again.
- The service worker only precaches the app shell and never caches `/api/*`
  or `/cdn-cgi/*`, so Access redirects are not served from cache.
- iOS installs the PWA with the Access cookie of the Safari session; if
  the session is short-lived you may want a longer session duration in the
  Access policy.

## Project layout

```
index.html            app shell
src/main.ts           bootstrap + service worker registration
src/app.ts            state, routing (#/dag/YYYY-MM-DD, #/vecka/YYYY-MM-DD), rendering
src/views/day.ts      day timeline
src/views/week.ts     week grid
src/views/shared.ts   escaping, lesson state helpers
src/lib/ics.ts        ICS → Lesson[] (ical.js, recurrence, timezones)
src/lib/time.ts       Europe/Stockholm helpers, ISO weeks, Swedish formatting
src/lib/layout.ts     overlap → columns
src/lib/colors.ts     subject → hue
src/lib/store.ts      fetch + localStorage cache
src/style.css         design tokens and all styles
worker/index.ts       Cloudflare Worker: assets + /api/schedule.ics proxy
test/                 vitest specs and ICS fixtures
scripts/icons.mjs     regenerates PNG icons from public/icons/favicon.svg
scripts/screenshots.mjs  visual check
```
