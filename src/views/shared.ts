import { subjectHue } from '../lib/colors';
import type { Lesson, LessonKind } from '../lib/ics';
import { formatDuration, formatTime } from '../lib/time';

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type LessonState = 'past' | 'now' | 'next' | 'future' | 'other';

export function lessonStateAt(l: Lesson, now: Date, nextId: string | null, isToday: boolean): LessonState {
  if (!isToday) return 'other';
  if (l.cancelled) return 'other';
  const t = now.getTime();
  if (l.start.getTime() <= t && t < l.end.getTime()) return 'now';
  if (l.id === nextId) return 'next';
  if (l.end.getTime() <= t) return 'past';
  return 'future';
}

/** The lesson that starts next after `now` (timed, not cancelled). */
export function nextLessonId(lessons: Lesson[], now: Date): string | null {
  const t = now.getTime();
  const next = lessons.find((l) => !l.allDay && !l.cancelled && l.start.getTime() > t);
  return next?.id ?? null;
}

export function durationMinutes(l: Lesson): number {
  return Math.round((l.end.getTime() - l.start.getTime()) / 60_000);
}

export function minutesUntil(date: Date, now: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 60_000));
}

/** "om 12 min" / "om 1 tim 5 min" */
export function inLabel(minutes: number): string {
  if (minutes <= 0) return 'nu';
  return `om ${formatDuration(minutes)}`;
}

export function hueStyle(l: Lesson): string {
  return `--hue:${subjectHue(l.subject)}`;
}

/** Label for all-day items; ordinary all-day events are just "Heldag". */
export const KIND_LABEL: Record<LessonKind, string> = { lesson: 'Heldag', handin: 'Inlämning', test: 'Prov' };

/** Small mark for hand-ins (tray with arrow) and tests (pencil). */
export function kindIcon(kind: LessonKind): string {
  if (kind === 'lesson') return '';
  const path = kind === 'handin' ? 'M8 10V3M5 6l3-3 3 3M3 10v3h10v-3' : 'M3 13l1-3 7-7 2 2-7 7z';
  return `<svg class="kindicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** Decorative mark for empty states: three faded "lesson" bars, like the app icon. */
export function emptyGlyph(kind: 'calendar' | 'lock' | 'offline' | 'warn' | 'rest' = 'calendar'): string {
  const bars = `<rect x="14" y="12" width="36" height="8" rx="4"/><rect x="14" y="26" width="36" height="12" rx="4"/><rect x="14" y="44" width="36" height="8" rx="4"/>`;
  const overlay = {
    calendar: '',
    lock: `<path d="M48 40v-6a6 6 0 0 1 12 0v6" fill="none" stroke="currentColor" stroke-width="3"/><rect x="44" y="40" width="20" height="16" rx="4" fill="currentColor"/>`,
    offline: `<path d="M44 48a10 10 0 0 1 20 0M38 42a18 18 0 0 1 32 0" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="54" cy="55" r="3" fill="currentColor"/>`,
    warn: `<circle cx="54" cy="48" r="11" fill="currentColor"/><path d="M54 41v9M54 54v1.5" stroke="var(--bg)" stroke-width="3" stroke-linecap="round"/>`,
    rest: `<path d="M44 44h18v6a9 9 0 0 1-18 0zM62 46h3a3 3 0 0 1 0 6h-3" fill="none" stroke="currentColor" stroke-width="3"/><path d="M49 36v4M55 36v4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`,
  }[kind];
  return `<svg class="empty__glyph" viewBox="0 0 72 64" width="72" height="64" aria-hidden="true"><g class="empty__bars">${bars}</g>${overlay}</svg>`;
}

export function timeRange(l: Lesson): string {
  return `${formatTime(l.start)}–${formatTime(l.end)}`;
}
