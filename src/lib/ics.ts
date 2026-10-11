import ICAL from 'ical.js';
import {
  TZ,
  addDays,
  dayKey,
  isValidTimeZone,
  pad,
  startOfDay,
  wallClockToInstant,
} from './time';

export type LessonKind = 'lesson' | 'handin' | 'test';

export interface Lesson {
  /** Stable per occurrence: `${uid}@${start ISO}` */
  id: string;
  uid: string;
  /** Hand-ins and tests arrive as "Inlämning: …" / "Prov: …"; the prefix is stripped from the title. */
  kind: LessonKind;
  title: string;
  /** Course from a "Kurs: …" description line, if any; that line is removed from `description`. */
  course: string;
  /** Normalised title (or course, for hand-ins and tests) used for colour hashing. */
  subject: string;
  location: string;
  description: string;
  start: Date;
  end: Date;
  allDay: boolean;
  /** Stockholm calendar date, "YYYY-MM-DD". */
  dayKey: string;
  cancelled: boolean;
}

export interface Schedule {
  calendarName: string;
  lessons: Lesson[];
}

export interface ParseWindow {
  from: Date;
  to: Date;
}

export class IcsParseError extends Error {
  override name = 'IcsParseError';
}

/**
 * Parse an iCalendar text into flat, sorted lesson occurrences within the
 * window. Recurrence rules, EXDATEs and RECURRENCE-ID overrides are expanded.
 * Times are resolved to instants using the TZID parameter (IANA via Intl),
 * UTC, or the calendar's X-WR-TIMEZONE / Europe/Stockholm for floating times.
 */
export function parseSchedule(ics: string, window: ParseWindow): Schedule {
  const text = ics.replace(/^﻿/, '').trim();
  if (!/^BEGIN:VCALENDAR/i.test(text)) {
    throw new IcsParseError('Svaret är inte en iCalendar-fil');
  }

  let root: ICAL.Component;
  try {
    root = new ICAL.Component(ICAL.parse(text));
  } catch (err) {
    throw new IcsParseError(`Kunde inte tolka kalendern: ${(err as Error).message}`);
  }

  const calendarName = String(root.getFirstPropertyValue('x-wr-calname') ?? '').trim();
  const calTz = String(root.getFirstPropertyValue('x-wr-timezone') ?? '').trim();
  const floatingTz = isValidTimeZone(calTz) ? calTz : TZ;

  // Group VEVENTs by UID: one master (no RECURRENCE-ID) plus overrides.
  const masters = new Map<string, ICAL.Component>();
  const overrides = new Map<string, ICAL.Component[]>();
  for (const comp of root.getAllSubcomponents('vevent')) {
    const uid = String(comp.getFirstPropertyValue('uid') ?? `no-uid-${masters.size}`);
    if (comp.hasProperty('recurrence-id')) {
      const list = overrides.get(uid) ?? [];
      list.push(comp);
      overrides.set(uid, list);
    } else {
      masters.set(uid, comp);
    }
  }

  const lessons: Lesson[] = [];

  for (const [uid, master] of masters) {
    const exceptions = overrides.get(uid) ?? [];
    overrides.delete(uid);
    let event: ICAL.Event;
    try {
      event = new ICAL.Event(master, { exceptions });
    } catch {
      continue;
    }
    expandEvent(event, uid, window, floatingTz, lessons);
  }

  // Overrides without a master: treat each as a standalone event.
  for (const [uid, comps] of overrides) {
    for (const comp of comps) {
      pushOccurrence(lessons, comp, uid, comp.getFirstProperty('dtstart'), comp.getFirstProperty('dtend'), window, floatingTz);
    }
  }

  lessons.sort((a, b) => a.start.getTime() - b.start.getTime() || a.title.localeCompare(b.title, 'sv'));
  return { calendarName, lessons };
}

function expandEvent(
  event: ICAL.Event,
  uid: string,
  window: ParseWindow,
  floatingTz: string,
  out: Lesson[],
): void {
  const master = event.component;
  const dtstartProp = master.getFirstProperty('dtstart');
  if (!dtstartProp) return;

  if (!event.isRecurring()) {
    pushOccurrence(out, master, uid, dtstartProp, master.getFirstProperty('dtend'), window, floatingTz, event.endDate);
    return;
  }

  let iterator: ICAL.RecurExpansion;
  try {
    iterator = event.iterator();
  } catch {
    return;
  }

  const toLimit = window.to.getTime() + 86_400_000; // generous; filtered precisely below
  let guard = 0;
  let next: ICAL.Time | null;
  while ((next = iterator.next()) && guard++ < 5000) {
    let details: ReturnType<ICAL.Event['getOccurrenceDetails']>;
    try {
      details = event.getOccurrenceDetails(next);
    } catch {
      continue;
    }
    const item = details.item;
    const itemStart = item.component.getFirstProperty('dtstart') ?? dtstartProp;
    const itemEnd = item.component.getFirstProperty('dtend');
    const start = toInstant(details.startDate, itemStart, floatingTz);
    if (start.getTime() > toLimit) break;
    pushResolved(out, item.component, uid, details.startDate, details.endDate, itemStart, itemEnd ?? itemStart, window, floatingTz);
  }
}

function pushOccurrence(
  out: Lesson[],
  comp: ICAL.Component,
  uid: string,
  startProp: ICAL.Property | null,
  endProp: ICAL.Property | null,
  window: ParseWindow,
  floatingTz: string,
  endFallback?: ICAL.Time,
): void {
  if (!startProp) return;
  const startTime = startProp.getFirstValue() as ICAL.Time;
  let endTime = endProp ? (endProp.getFirstValue() as ICAL.Time) : endFallback;
  if (!endTime) {
    const dur = comp.getFirstPropertyValue('duration') as ICAL.Duration | null;
    endTime = startTime.clone();
    if (dur) endTime.addDuration(dur);
    else if (startTime.isDate) endTime.addDuration(ICAL.Duration.fromSeconds(86_400));
  }
  pushResolved(out, comp, uid, startTime, endTime, startProp, endProp ?? startProp, window, floatingTz);
}

function pushResolved(
  out: Lesson[],
  comp: ICAL.Component,
  uid: string,
  startTime: ICAL.Time,
  endTime: ICAL.Time,
  startProp: ICAL.Property,
  endProp: ICAL.Property,
  window: ParseWindow,
  floatingTz: string,
): void {
  const summary = cleanText(comp.getFirstPropertyValue('summary')) || '(utan namn)';
  // Hand-ins and tests are all-day in the feed; timed events keep their full title.
  const { kind, title } = startTime.isDate ? classify(summary) : { kind: 'lesson' as const, title: summary };
  const rawDescription = cleanText(comp.getFirstPropertyValue('description'));
  const course = rawDescription.match(COURSE_LINE)?.[1].trim() ?? '';
  const description = rawDescription.replace(COURSE_LINE, '').trim();
  const base = {
    uid,
    kind,
    title,
    course,
    subject: normaliseSubject(kind === 'lesson' ? title : course || title),
    location: cleanText(comp.getFirstPropertyValue('location')),
    description,
    cancelled: String(comp.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED',
  };

  if (startTime.isDate) {
    // All-day: one lesson per covered Stockholm day. DTEND is exclusive.
    const firstKey = `${startTime.year}-${pad(startTime.month)}-${pad(startTime.day)}`;
    let days = 1;
    if (endTime.isDate) {
      const endKey = `${endTime.year}-${pad(endTime.month)}-${pad(endTime.day)}`;
      days = Math.max(1, Math.round((Date.parse(endKey) - Date.parse(firstKey)) / 86_400_000));
    }
    for (let i = 0; i < days; i++) {
      const key = addDays(firstKey, i);
      const start = startOfDay(key);
      const end = startOfDay(addDays(key, 1));
      if (end.getTime() <= window.from.getTime() || start.getTime() >= window.to.getTime()) continue;
      out.push({ ...base, id: `${uid}@${key}`, start, end, allDay: true, dayKey: key });
    }
    return;
  }

  const start = toInstant(startTime, startProp, floatingTz);
  let end = toInstant(endTime, endProp, floatingTz);
  if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + 60_000);
  if (end.getTime() <= window.from.getTime() || start.getTime() >= window.to.getTime()) return;
  out.push({
    ...base,
    id: `${uid}@${start.toISOString()}`,
    start,
    end,
    allDay: false,
    dayKey: dayKey(start),
  });
}

/** Resolve an ICAL.Time to an instant, honouring the TZID parameter. */
function toInstant(time: ICAL.Time, prop: ICAL.Property | null, floatingTz: string): Date {
  const zoneId = time.zone?.tzid;
  if (zoneId === 'UTC' || zoneId === 'Z') return time.toJSDate();

  const tzid = prop?.getParameter('tzid') as string | undefined;
  const wall = {
    year: time.year,
    month: time.month,
    day: time.day,
    hour: time.hour,
    minute: time.minute,
    second: time.second,
  };
  if (tzid && isValidTimeZone(tzid)) return wallClockToInstant(wall, tzid);
  // Zone defined by a VTIMEZONE we cannot map to IANA: trust ical.js.
  if (zoneId && zoneId !== 'floating' && time.zone !== ICAL.Timezone.localTimezone) {
    return time.toJSDate();
  }
  return wallClockToInstant(wall, floatingTz);
}

function cleanText(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/\r\n|\r/g, '\n').trim();
}

const COURSE_LINE = /^kurs[ \t]*:[ \t]*(.*)\n?/im;

function classify(summary: string): { kind: LessonKind; title: string } {
  const m = summary.match(/^(inlämning|prov)\s*:\s*(.+)$/i);
  if (!m) return { kind: 'lesson', title: summary };
  return { kind: m[1].toLowerCase() === 'prov' ? 'test' : 'handin', title: m[2].trim() };
}

/** Lower-cased, whitespace-collapsed subject used for stable colours. */
export function normaliseSubject(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}
