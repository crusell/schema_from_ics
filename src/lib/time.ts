/**
 * Time helpers. Everything the UI shows is in Europe/Stockholm regardless of
 * the device's timezone, so all "what day is it" questions go through here.
 */
export const TZ = 'Europe/Stockholm';
export const LOCALE = 'sv-SE';

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number;
  minute: number;
  second: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    partsCache.set(tz, f);
  }
  return f;
}

/** Wall-clock components of an instant in the given zone. */
export function toWallClock(date: Date, tz: string = TZ): WallClock {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/**
 * Instant for a wall-clock time in the given zone. Handles DST correctly:
 * at the autumn fall-back the earlier (DST) instant wins, in the spring gap the
 * time is shifted forward like most calendar apps do.
 */
export function wallClockToInstant(w: WallClock, tz: string = TZ): Date {
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // Candidate offsets: the zone's offset a day before, at, and a day after.
  const offsets = [...new Set([-86_400_000, 0, 86_400_000].map((d) => offsetMs(new Date(asUtc + d), tz)))];
  const valid = offsets
    .map((off) => asUtc - off)
    .filter((t) => {
      const c = toWallClock(new Date(t), tz);
      return c.hour === w.hour && c.minute === w.minute && c.day === w.day;
    })
    .sort((a, b) => a - b);
  if (valid.length > 0) return new Date(valid[0]);
  // Non-existent time (spring gap): shift forward using the pre-gap offset.
  return new Date(asUtc - Math.min(...offsets));
}

/** Offset (ms) of the zone at the given instant: local = utc + offset. */
export function offsetMs(date: Date, tz: string = TZ): number {
  const w = toWallClock(date, tz);
  const local = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return local - Math.floor(date.getTime() / 1000) * 1000;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** "2026-10-12" – the Stockholm calendar date of an instant. */
export function dayKey(date: Date): string {
  const w = toWallClock(date);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

export function keyToWallClock(key: string): WallClock {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month: m, day: d, hour: 0, minute: 0, second: 0 };
}

/** Start of the Stockholm day as an instant. */
export function startOfDay(key: string): Date {
  return wallClockToInstant(keyToWallClock(key));
}

/** Minutes since local midnight, in Stockholm. */
export function minutesOfDay(date: Date): number {
  const w = toWallClock(date);
  return w.hour * 60 + w.minute;
}

/** Add whole days to a day key (calendar arithmetic, DST-safe). */
export function addDays(key: string, days: number): string {
  const w = keyToWallClock(key);
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key: string): number {
  const w = keyToWallClock(key);
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return (d + 6) % 7;
}

/** Monday of the ISO week that contains the day. */
export function startOfWeek(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

/** ISO 8601 week number and week-based year. */
export function isoWeek(key: string): { week: number; year: number } {
  const w = keyToWallClock(key);
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day));
  const dayNum = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(year, 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return { week, year };
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// ---------- Swedish formatting ----------

const WEEKDAYS = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
const WEEKDAYS_SHORT = ['mån', 'tis', 'ons', 'tors', 'fre', 'lör', 'sön'];
const MONTHS = [
  'januari', 'februari', 'mars', 'april', 'maj', 'juni',
  'juli', 'augusti', 'september', 'oktober', 'november', 'december',
];

export function weekdayName(key: string, short = false): string {
  return (short ? WEEKDAYS_SHORT : WEEKDAYS)[weekdayIndex(key)];
}

export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "12 oktober" */
export function formatDayMonth(key: string): string {
  const w = keyToWallClock(key);
  return `${w.day} ${MONTHS[w.month - 1]}`;
}

/** "12 okt" */
export function formatDayMonthShort(key: string): string {
  const w = keyToWallClock(key);
  return `${w.day} ${MONTHS[w.month - 1].slice(0, 3)}`;
}

/** "08:10" in Stockholm. */
export function formatTime(date: Date): string {
  const w = toWallClock(date);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** "12–16 oktober" or "28 sep–2 okt" (week range label). */
export function formatWeekRange(monday: string, lastDay: string): string {
  const a = keyToWallClock(monday);
  const b = keyToWallClock(lastDay);
  if (a.month === b.month) return `${a.day}–${b.day} ${MONTHS[a.month - 1]}`;
  return `${a.day} ${MONTHS[a.month - 1].slice(0, 3)}–${b.day} ${MONTHS[b.month - 1].slice(0, 3)}`;
}

/** Relative "för 5 min sedan" style label for the last-updated indicator. */
export function formatRelative(then: Date, now: Date): string {
  const diffMin = Math.round((now.getTime() - then.getTime()) / 60_000);
  if (diffMin < 1) return 'nyss';
  if (diffMin < 60) return `för ${diffMin} min sedan`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `för ${h} tim sedan`;
  const d = Math.round(h / 24);
  if (d === 1) return 'igår';
  return `för ${d} dagar sedan`;
}

/** Minutes → "1 tim 20 min" / "45 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} tim`;
  return `${h} tim ${m} min`;
}
