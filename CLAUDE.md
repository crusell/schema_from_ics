# CLAUDE.md

Swedish school-timetable PWA ("Martins schema"). Read `primer.md` first for
current state and next steps.

## Commands

```sh
npm run dev          # Vite + fixture feed on :4310 (VITE_FIXTURE=empty|html|error for other states;
                     # DEV_FEED_URL in gitignored .env.local proxies a real feed instead)
npm run build        # tsc --noEmit + vite build → dist/ (incl. sw.js, manifest)
npm run preview      # wrangler dev on :8787 serving dist/ + real proxy (needs .dev.vars, build first)
npm test             # vitest run
npm run typecheck
npm run icons        # regenerate public/icons/*.png from favicon.svg (sharp)
npm run screenshots  # visual check, needs CHROME_PATH and a running dev server
npm run deploy       # build + wrangler deploy (do not run without Zero Trust in place)
```

## Architecture

- **Frontend**: Vite 8 + vanilla TypeScript, no framework. One `State` object
  in `src/app.ts`; every change calls `render()` which rebuilds `#app` with
  template strings. Event handling is delegated via `data-action` attributes.
  Views (`src/views/day.ts`, `week.ts`) are pure functions returning HTML.
- **Data**: `src/lib/store.ts` fetches `/api/schedule.ics` (same origin),
  validates that it starts with `BEGIN:VCALENDAR`, and caches the raw text +
  timestamp in `localStorage` (`schema:cache:v1`). On failure the cached copy
  is used and the header shows offline / error status. Refresh on load, when
  the tab becomes visible (if older than 5 min), every 30 min, and on `online`.
- **Parsing**: `src/lib/ics.ts` uses ical.js. VEVENTs are grouped by UID,
  RECURRENCE-ID overrides are attached as `exceptions`, recurrences are
  expanded within a window (±90/200 days around the viewed day, re-expanded
  when navigating outside it). Times: `Z` → instant; `TZID` → wall clock
  converted with `Intl` (`src/lib/time.ts`), falling back to ical.js
  VTIMEZONE and finally to `X-WR-TIMEZONE`/Europe/Stockholm for floating
  times. All-day events become one `Lesson` per covered day.
  `Inlämning: …` / `Prov: …` summaries become `kind: 'handin' | 'test'` with
  the prefix stripped; a `Kurs: …` description line is moved into `course` (and
  drives the colour). Only all-day events are classified. The Vite dev
  middleware reuses the Worker's `handleSchedule` for `DEV_FEED_URL`. The feed carries no teacher.
- **Time**: everything UI-facing goes through `src/lib/time.ts` with
  `Europe/Stockholm` hard-coded; `dayKey` ("YYYY-MM-DD") is the identity of a
  day. Never use `Date#getHours()` etc. in UI code.
- **Layout**: `src/lib/layout.ts` assigns overlapping lessons to columns;
  CSS positions blocks with `--s` (start minute), `--d` (duration), `--col`,
  `--cols` and `--ppm` (pixels per minute).
- **Colours**: `src/lib/colors.ts` maps a normalised subject name to a hue
  (known Swedish subjects fixed, otherwise FNV-1a hash on a 12-step wheel).
  CSS derives OKLCH background/ink/bar colours per theme from `--hue`.
- **Worker**: `worker/index.ts`. `/api/schedule.ics` → fetches
  `env.SCHEDULE_FEED_URL` (validated with zod, https only except http://localhost), checks the body is
  a calendar, returns `text/calendar` with `no-store`. Everything else →
  static assets (`dist/`, SPA fallback). The upstream URL is a Worker secret;
  it must never be in the client bundle or any committed file.
- **PWA**: vite-plugin-pwa `generateSW`, precache app shell only; `/api/*`
  and `/cdn-cgi/*` are excluded from the navigation fallback so Cloudflare
  Access redirects are never cached.

## Patterns and rules

- All feed-derived strings are HTML-escaped with `esc()` from
  `src/views/shared.ts` before being put into templates. Numeric CSS vars
  (`--hue`, `--s`, …) are the only unescaped interpolations.
- The Worker entry module must only export the handler object (workerd
  rejects other named exports); helpers used by tests are exported as named
  exports *of functions* only.
- Keep it simple: no state library, no component framework, no CSS tooling.
- Validate at boundaries with zod (Worker env). Tests live in `test/`,
  fixtures in `test/fixtures/` (`schema.ics` realistic HT 2026 timetable,
  `empty.ics` the real feed as of 2026-10-11).
- Every change: update tests, README/CLAUDE.md if behaviour or structure
  changes, and rewrite `primer.md` at the end of the session.
- Never commit `.dev.vars`; never deploy without Zero Trust Access in front.

## Routes and state

- Hash routes: `#/dag/YYYY-MM-DD`, `#/vecka/YYYY-MM-DD` (pushState; back
  button works).
- Theme: `localStorage['schema:theme']` = `light` | `dark`, absent = auto.
  Applied as `data-theme` on `<html>` before first paint (inline script in
  `index.html`).
