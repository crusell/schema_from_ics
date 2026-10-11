# primer.md – session continuity

## What this is

"Martins schema": a Swedish school-timetable PWA that renders an ICS feed
(`plugga.martincrusell.com`, "Martin – skolan") as a day view and a week view.
Hosted as a single Cloudflare Worker at `schema.martincrusell.com` (static
assets + `/api/schedule.ics` proxy). No auth in the app; Cloudflare Zero Trust
Access is meant to sit in front.

Stack: Vite 8, vanilla TypeScript, ical.js, zod (Worker env), vite-plugin-pwa,
vitest, wrangler. See `CLAUDE.md` for architecture and `README.md` for
setup/deploy.

## Current state (2026-10-11)

Feature-complete first version, **not deployed, not committed** (git repo is
initialised, no commits).

- Day view with timeline, now-line, "Nu"/"Nästa" tags, a "Pågår/Nästa" card
  at the top of today, past lessons faded, overlapping lessons side by side,
  all-day events as chips, details bottom sheet (`<dialog>`).
- Week view (Mon–Fri, Sat/Sun only when scheduled), today column tinted,
  tap a day header to open that day.
- Mobile: fixed bottom bar (Dag/Vecka, ‹ Idag ›), swipe between days/weeks,
  safe-area insets. Desktop: controls move into the header, week grid fills
  width. Light/dark via system + manual toggle (◐ button).
- Offline: raw ICS + timestamp in localStorage; header shows "Uppdaterat för
  X sedan" / "Offline · …" / "Ladda om" (Access login page detected).
- Empty-calendar state (what the real feed returns today), weekend/holiday
  day states, empty week state, error states.
- PWA: manifest (sv-SE, maskable icon), Workbox precache of the app shell,
  Apple meta tags. Icons generated from `public/icons/favicon.svg`.
- Worker proxy validated against the real feed with `wrangler dev`
  (200, `text/calendar`, `no-store`; token not in bundle).
- Tests: 48 passing (`npm test`), typecheck clean, production build OK.
- Screenshots (gitignored) in `screenshots/` from `npm run screenshots`.

## What changed this session

Everything: project created from an empty directory.

## Next steps

1. Set up Cloudflare Access for `schema.martincrusell.com`, then
   `npx wrangler login`, `npx wrangler secret put SCHEDULE_FEED_URL`,
   `npm run deploy`. Verify the custom domain is created and Access blocks
   anonymous access, then test install on iOS (Safari → Dela → Lägg till på
   hemskärmen) and Android.
2. When the school publishes real events, open the live feed and check the
   actual event shape (SUMMARY format, LOCATION, DESCRIPTION conventions,
   TZID vs UTC). Adjust `teacherOf()` in `src/views/shared.ts` and the
   subject normalisation/colour map in `src/lib/colors.ts` if needed, and add
   a fixture based on real data.
3. Commit (first commit) once the user has reviewed.
4. Nice-to-haves: "share this day" / add-to-calendar, haptic feedback on
   swipe, remember last view (day/week) in localStorage.

## Open blockers / unverified

- Not deployed (deliberately: Zero Trust not in place yet). DNS untouched.
- iOS/Android install flow, swipe gestures and the service worker have not
  been tested on a real device; verified only in headless Chromium.
- The real feed has zero VEVENTs today, so parsing of the real event shape is
  untested; the fixture is a realistic guess.
- The built-in browser pane could not render screenshots in this session
  (pane hidden); screenshots were produced with Playwright's cached Chromium
  via `scripts/screenshots.mjs` (`playwright-core` is a devDependency and
  needs `CHROME_PATH` pointing at a Chromium binary).
