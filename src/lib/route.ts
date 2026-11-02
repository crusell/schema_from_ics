import { startOfWeek } from './time';

export type View = 'day' | 'week';

/**
 * Hash routes: `#/dag/YYYY-MM-DD`, `#/vecka/YYYY-MM-DD`. Today (or this week)
 * is written without a date, `#/dag` / `#/vecka`, so a bookmark or an iOS
 * home-screen icon saved from the current address always opens on today
 * instead of the day it was saved.
 */
export function routeHash(view: View, day: string, today: string): string {
  const name = view === 'day' ? 'dag' : 'vecka';
  const isCurrent = view === 'day' ? day === today : startOfWeek(day) === startOfWeek(today);
  return isCurrent ? `#/${name}` : `#/${name}/${day}`;
}

export function parseRoute(hash: string, today: string): { view: View; day: string } | null {
  const m = hash.match(/^#\/(dag|vecka)(?:\/(\d{4}-\d{2}-\d{2}))?$/);
  if (!m) return null;
  return { view: m[1] === 'dag' ? 'day' : 'week', day: m[2] ?? today };
}
