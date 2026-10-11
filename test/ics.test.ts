import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IcsParseError, normaliseSubject, parseSchedule, type Lesson } from '../src/lib/ics';
import { formatTime } from '../src/lib/time';

const fixture = readFileSync(new URL('./fixtures/schema.ics', import.meta.url), 'utf8');
const empty = readFileSync(new URL('./fixtures/empty.ics', import.meta.url), 'utf8');

const HT26 = { from: new Date('2026-08-01T00:00:00Z'), to: new Date('2027-01-01T00:00:00Z') };

function onDay(lessons: Lesson[], key: string) {
  return lessons.filter((l) => l.dayKey === key);
}

function wrap(body: string, header = ''): string {
  return `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//SV\r\n${header}${body}END:VCALENDAR\r\n`;
}

describe('parseSchedule – fixture', () => {
  const schedule = parseSchedule(fixture, HT26);

  it('reads the calendar name', () => {
    expect(schedule.calendarName).toBe('Martin – skolan');
  });

  it('expands weekly recurrences into one lesson per occurrence', () => {
    const monday = onDay(schedule.lessons, '2026-10-12');
    expect(monday.map((l) => l.title)).toEqual([
      'Mentorstid',
      'Matematik',
      'Svenska',
      'Lunch',
      'Engelska',
      'Idrott och hälsa',
    ]);
  });

  it('applies RECURRENCE-ID overrides (room and time)', () => {
    const ma = onDay(schedule.lessons, '2026-10-12').find((l) => l.title === 'Matematik')!;
    expect(ma.location).toBe('Sal 212');
    expect(formatTime(ma.start)).toBe('08:40');
    expect(formatTime(ma.end)).toBe('09:40');
    // The regular Monday a week earlier is untouched.
    const prev = onDay(schedule.lessons, '2026-10-05').find((l) => l.title === 'Matematik')!;
    expect(prev.location).toBe('Sal 204');
    expect(formatTime(prev.start)).toBe('08:30');
  });

  it('honours EXDATE (studiedag and höstlov)', () => {
    expect(onDay(schedule.lessons, '2026-10-19').filter((l) => !l.allDay)).toHaveLength(0);
    for (const key of ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']) {
      expect(onDay(schedule.lessons, key).filter((l) => !l.allDay)).toHaveLength(0);
    }
  });

  it('marks STATUS:CANCELLED overrides', () => {
    const musik = onDay(schedule.lessons, '2026-10-13').find((l) => l.title === 'Musik')!;
    expect(musik.cancelled).toBe(true);
    const nextWeek = onDay(schedule.lessons, '2026-10-20').find((l) => l.title === 'Musik')!;
    expect(nextWeek.cancelled).toBe(false);
  });

  it('keeps the same local time across the DST switch on 2026-10-25', () => {
    const before = onDay(schedule.lessons, '2026-10-23').find((l) => l.title === 'Idrott och hälsa')!;
    const after = onDay(schedule.lessons, '2026-11-06').find((l) => l.title === 'Idrott och hälsa')!;
    expect(formatTime(before.start)).toBe('08:10');
    expect(formatTime(after.start)).toBe('08:10');
    expect(before.start.toISOString()).toBe('2026-10-23T06:10:00.000Z');
    expect(after.start.toISOString()).toBe('2026-11-06T07:10:00.000Z');
  });

  it('converts UTC times to Stockholm', () => {
    const samtal = schedule.lessons.find((l) => l.title === 'Utvecklingssamtal')!;
    expect(samtal.dayKey).toBe('2026-10-14');
    expect(formatTime(samtal.start)).toBe('15:00');
    expect(formatTime(samtal.end)).toBe('15:30');
  });

  it('treats floating times as X-WR-TIMEZONE (Europe/Stockholm)', () => {
    const friluft = schedule.lessons.find((l) => l.title === 'Friluftsdag')!;
    expect(friluft.start.toISOString()).toBe('2026-10-23T07:00:00.000Z');
    expect(formatTime(friluft.start)).toBe('09:00');
  });

  it('expands multi-day all-day events into one entry per day', () => {
    const lov = schedule.lessons.filter((l) => l.title === 'Höstlov');
    expect(lov.map((l) => l.dayKey)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
    ]);
    expect(lov.every((l) => l.allDay)).toBe(true);
    const studiedag = schedule.lessons.filter((l) => l.title === 'Studiedag – lov');
    expect(studiedag).toHaveLength(1);
    expect(studiedag[0].dayKey).toBe('2026-10-19');
  });

  it('unfolds long lines and unescapes text', () => {
    const idh = onDay(schedule.lessons, '2026-10-12').find((l) => l.title === 'Idrott och hälsa')!;
    expect(idh.description).toContain('orientering utomhus, ta med kläder');
    expect(idh.description.split('\n')[0]).toBe('Lärare: Mikael Ek');
  });

  it('classifies hand-ins and tests, strips the prefix and reads the course', () => {
    const handin = schedule.lessons.find((l) => l.kind === 'handin')!;
    expect(handin).toMatchObject({ title: 'Slöjdlogg åk 8', course: 'Slöjd', subject: 'slöjd', allDay: true, dayKey: '2026-10-14' });
    const exam = schedule.lessons.find((l) => l.kind === 'test')!;
    expect(exam).toMatchObject({ title: 'Historia – Första världskriget', course: '', allDay: true, dayKey: '2026-10-16' });
    const ma = schedule.lessons.find((l) => l.title === 'Matematik')!;
    expect(ma).toMatchObject({ kind: 'lesson', course: '' });
  });

  it('is sorted by start time', () => {
    const times = schedule.lessons.map((l) => l.start.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('respects the window', () => {
    const narrow = parseSchedule(fixture, {
      from: new Date('2026-10-12T00:00:00Z'),
      to: new Date('2026-10-13T00:00:00Z'),
    });
    expect(new Set(narrow.lessons.map((l) => l.dayKey))).toEqual(new Set(['2026-10-12']));
  });
});

describe('parseSchedule – edge cases', () => {
  it('returns no lessons for the empty real-world feed', () => {
    const s = parseSchedule(empty, HT26);
    expect(s.lessons).toEqual([]);
    expect(s.calendarName).toBe('Martin – skolan');
  });

  it('throws IcsParseError for non-ICS input (e.g. an Access login page)', () => {
    expect(() => parseSchedule('<!doctype html><title>Login</title>', HT26)).toThrow(IcsParseError);
    expect(() => parseSchedule('', HT26)).toThrow(IcsParseError);
  });

  it('tolerates a BOM and CRLF line endings', () => {
    const ics = '﻿' + wrap(
      'BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Svenska\r\nDTSTART:20261012T071000Z\r\nDTEND:20261012T081000Z\r\nEND:VEVENT\r\n',
    );
    const s = parseSchedule(ics, HT26);
    expect(s.lessons).toHaveLength(1);
    expect(formatTime(s.lessons[0].start)).toBe('09:10');
  });

  it('uses DURATION when DTEND is missing', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:SO\r\nDTSTART;TZID=Europe/Stockholm:20261012T100000\r\nDURATION:PT1H30M\r\nEND:VEVENT\r\n',
    );
    const l = parseSchedule(ics, HT26).lessons[0];
    expect(formatTime(l.start)).toBe('10:00');
    expect(formatTime(l.end)).toBe('11:30');
  });

  it('resolves a TZID with a VTIMEZONE definition and other IANA zones', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Engelska\r\nDTSTART;TZID=Europe/London:20261012T100000\r\nDTEND;TZID=Europe/London:20261012T110000\r\nEND:VEVENT\r\n',
    );
    const l = parseSchedule(ics, HT26).lessons[0];
    expect(formatTime(l.start)).toBe('11:00'); // London BST 10:00 = Stockholm 11:00
  });

  it('falls back to Europe/Stockholm for unknown TZIDs', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Bild\r\nDTSTART;TZID=W. Europe Standard Time:20261012T100000\r\nDTEND;TZID=W. Europe Standard Time:20261012T110000\r\nEND:VEVENT\r\n',
    );
    const l = parseSchedule(ics, HT26).lessons[0];
    expect(formatTime(l.start)).toBe('10:00');
  });

  it('uses X-WR-TIMEZONE for floating times when it is set to another zone', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Bild\r\nDTSTART:20261012T100000\r\nDTEND:20261012T110000\r\nEND:VEVENT\r\n',
      'X-WR-TIMEZONE:Europe/Helsinki\r\n',
    );
    const l = parseSchedule(ics, HT26).lessons[0];
    expect(formatTime(l.start)).toBe('09:00');
  });

  it('bounds an infinite RRULE by the window', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:a\r\nSUMMARY:Musik\r\nDTSTART;TZID=Europe/Stockholm:20260817T120000\r\nDTEND;TZID=Europe/Stockholm:20260817T130000\r\nRRULE:FREQ=WEEKLY;BYDAY=MO\r\nEND:VEVENT\r\n',
    );
    const s = parseSchedule(ics, {
      from: new Date('2026-10-12T00:00:00Z'),
      to: new Date('2026-11-09T00:00:00Z'),
    });
    expect(s.lessons.map((l) => l.dayKey)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
  });

  it('keeps an orphan RECURRENCE-ID as a standalone lesson', () => {
    const ics = wrap(
      'BEGIN:VEVENT\r\nUID:a\r\nRECURRENCE-ID;TZID=Europe/Stockholm:20261012T100000\r\nSUMMARY:Slöjd\r\nDTSTART;TZID=Europe/Stockholm:20261012T101000\r\nDTEND;TZID=Europe/Stockholm:20261012T110000\r\nEND:VEVENT\r\n',
    );
    const s = parseSchedule(ics, HT26);
    expect(s.lessons).toHaveLength(1);
    expect(formatTime(s.lessons[0].start)).toBe('10:10');
  });

  it('gives untitled events a placeholder title', () => {
    const ics = wrap('BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20261012T071000Z\r\nDTEND:20261012T081000Z\r\nEND:VEVENT\r\n');
    expect(parseSchedule(ics, HT26).lessons[0].title).toBe('(utan namn)');
  });
});

describe('normaliseSubject', () => {
  it('is case- and whitespace-insensitive', () => {
    expect(normaliseSubject('  Matematik ')).toBe('matematik');
    expect(normaliseSubject('Idrott  och\thälsa')).toBe('idrott och hälsa');
  });
});
