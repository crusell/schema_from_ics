# primer.md – session continuity

## What this is

"Martins schema": a Swedish school-timetable PWA that renders an ICS feed
(`plugga.martincrusell.com`, "Martin – skolan") as a day view and a week view.
Hosted as a single Cloudflare Worker at `schema.martincrusell.com` (static
assets + `/api/schedule.ics` proxy). No auth in the app; Cloudflare Zero Trust
Access is meant to sit in front.

Stack: Vite 8, vanilla TypeScript, ical.js, zod (Worker env), vite-plugin-pwa,
vitest, wrangler. See `CLAUDE.md` for architecture and `README.md` for
setup/deploy. Repo: `github.com/crusell/schema_from_ics` (public).

## Current state (2026-10-11)

First version pushed to `main` (one commit). **Not deployed.** Work since then
is on branch `real-feed-shape` (PR open).

- Day view: timeline, now-line, "Nu"/"Nästa" tags, "Pågår/Nästa" card,
  overlapping lessons side by side, details bottom sheet.
- Week view: Mon–Fri (Sat/Sun only when scheduled), all-day row above the
  time grid.
- Hand-ins and tests (`Inlämning: …`, `Prov: …`, all-day in the feed) are
  their own kind: rows with icon in day view, icon badges (phone) or chips
  (desktop) in week view, course shown in the sheet.
- Offline cache in localStorage, PWA manifest + service worker, light/dark.
- Tests: 57 passing (parser, layout, time, worker, views), typecheck clean.

## What changed this session

- Project created from an empty directory and pushed.
- Tried against a real feed from a local Plugga (`DEV_FEED_URL` in gitignored
  `.env.local`, proxied by the Vite dev middleware). Real shape: lessons have
  SUMMARY + LOCATION only, UTC times, no teacher; hand-ins/tests are all-day
  with `Kurs: …` in DESCRIPTION.
- Added `kind`/`course` to `Lesson`, removed teacher parsing.
- Fixed week view: all-day chips used to push a column's time grid down so
  lessons no longer lined up with the hour rail; 15-minute blocks were clipped.
- Dev port moved 5173 → 4310 (strict).
- Ran /simplify and /code-review: Vite dev proxy now reuses the Worker's
  `handleSchedule` (Worker accepts `http://` for localhost only); hand-in
  colours follow the subject named in the course; weekend columns show up to
  the last used day; view tests added.

## Next steps

1. Review and merge the `real-feed-shape` PR.
2. Set up Cloudflare Access for `schema.martincrusell.com`, then
   `npx wrangler login`, `npx wrangler secret put SCHEDULE_FEED_URL`,
   `npm run deploy`. Verify Access blocks anonymous access, then test install
   on iOS and Android.
3. Nice-to-haves: upcoming hand-ins/tests overview, remember last view.

## Open blockers / unverified

- Not deployed (deliberately: Zero Trust not in place yet). DNS untouched.
- Real-device install, swipe and service worker behind Access untested.
- Phone day view: the now-line time label overlaps the hour label next to it.
- Screenshots in `screenshots/` (gitignored) predate the hand-in changes.
