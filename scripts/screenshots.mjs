// Visual check: screenshots of the main states at phone and desktop width,
// light and dark, with a frozen clock so "Nu"/"Nästa" are deterministic.
// Usage: node scripts/screenshots.mjs [baseUrl] [outDir]
// Needs a running dev server (npm run dev) and a Playwright Chromium build.
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'screenshots';
const executablePath = process.env.CHROME_PATH;
const FROZEN = new Date('2026-10-12T07:05:00Z'); // Monday 09:05 in Stockholm

await mkdir(out, { recursive: true });
const browser = await chromium.launch(executablePath ? { executablePath } : {});

async function shot(name, { width, height, mobile = false, dark = false, hash, before, url = base }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: 2,
    colorScheme: dark ? 'dark' : 'light',
    timezoneId: 'Europe/Stockholm',
    locale: 'sv-SE',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.clock.setFixedTime(FROZEN);
  await page.goto(`${url}/${hash}`);
  // Playwright's selector waits do not play well with a faked clock; sleep host-side.
  await page.waitForTimeout(1200);
  if (before) await before(page);
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: !mobile });
  console.log('wrote', `${out}/${name}.png`);
  await ctx.close();
}

const phone = { width: 390, height: 844, mobile: true };
const desktop = { width: 1280, height: 900 };

await shot('phone-day-light', { ...phone, hash: '#/dag/2026-10-12' });
await shot('phone-day-dark', { ...phone, dark: true, hash: '#/dag/2026-10-12' });
await shot('phone-week-light', { ...phone, hash: '#/vecka/2026-10-12' });
await shot('phone-week-dark', { ...phone, dark: true, hash: '#/vecka/2026-10-12' });
await shot('phone-day-wednesday-overlap', { ...phone, hash: '#/dag/2026-10-14' });
await shot('phone-day-weekend', { ...phone, hash: '#/dag/2026-10-17' });
await shot('phone-week-hostlov', { ...phone, hash: '#/vecka/2026-10-26' });
await shot('phone-sheet', {
  ...phone,
  hash: '#/dag/2026-10-12',
  before: async (page) => {
    await page.locator('.lesson').nth(1).click();
    await page.waitForTimeout(300);
  },
});
await shot('desktop-day-light', { ...desktop, hash: '#/dag/2026-10-12' });
await shot('desktop-week-light', { ...desktop, hash: '#/vecka/2026-10-12' });
await shot('desktop-week-dark', { ...desktop, dark: true, hash: '#/vecka/2026-10-12' });

// Other feed states: run extra dev servers with VITE_FIXTURE=empty / html.
if (process.env.EMPTY_URL) await shot('phone-empty-calendar', { ...phone, hash: '', url: process.env.EMPTY_URL });
if (process.env.REAL_URL) await shot('phone-real-feed-prod', { ...phone, hash: '', url: process.env.REAL_URL });
if (process.env.HTML_URL) await shot('phone-access-login', { ...phone, hash: '', url: process.env.HTML_URL });

await browser.close();
