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

**Live** at `https://schema.martincrusell.com` behind Cloudflare Access
(team `crusell`), Worker `schema`, deployed from `main`. `workers_dev` and
preview URLs are off. `SCHEDULE_FEED_URL` secret is set to the production
Plugga feed, which has **zero events** until the user adds data in production
Plugga, so the live app shows "Schemat är tomt ännu". That is expected.

- Day view: timeline, now-line, "Nu"/"Nästa" tags, "Pågår/Nästa" card,
  overlapping lessons side by side, details bottom sheet.
- Week view: Mon–Fri plus weekend up to its last used day, all-day row above
  the time grid.
- Hand-ins and tests (`Inlämning: …`, `Prov: …`, all-day in the feed) are
  their own kind: rows in day view, icon badges (phone) or chips (desktop) in
  week view, course in the sheet, colour follows the subject in the course.
- Offline cache in localStorage, PWA manifest + service worker, light/dark.
- Tests: 57 passing (parser, layout, time, worker, views), typecheck clean.

## What changed this session

- Project created from an empty directory, pushed to GitHub, PR #1 merged.
- Adjusted to the real feed shape using a local Plugga feed (`DEV_FEED_URL`
  in gitignored `.env.local`): no teacher, UTC times, all-day hand-ins/tests
  with `Kurs: …` in DESCRIPTION.
- Fixed week grid misalignment and clipped 15-minute lessons.
- /simplify and /code-review passes; Vite dev proxy reuses the Worker's
  `handleSchedule` (http allowed for localhost only).
- First deploy done; Access verified to redirect every path when anonymous.
- Dev port is 4310 (strict).

## Next steps

1. Add schedule data in production Plugga; the app picks it up on refresh.
2. Check the live app with real data on phone; test install on iOS/Android.
3. Ship fixes with `npm run deploy` (tests + build + deploy).
4. Ideas: bigger tap targets for week hand-in badges (e.g. one pill per day),
   upcoming hand-ins/tests overview, remember last view.

## Open blockers / unverified

- Install flow, swipe and service worker behind Access not tested on device.
- Phone day view: the now-line time label overlaps the hour label next to it.
- Light theme not re-checked since the hand-in changes.
- Screenshots in `screenshots/` (gitignored) predate the hand-in changes.
