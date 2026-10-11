import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayKey,
  formatRelative,
  formatTime,
  formatWeekRange,
  isoWeek,
  minutesOfDay,
  offsetMs,
  startOfWeek,
  toWallClock,
  wallClockToInstant,
  weekdayIndex,
  weekdayName,
} from '../src/lib/time';

describe('wall clock ⇄ instant in Europe/Stockholm', () => {
  it('converts CEST (summer) wall clock to the right instant', () => {
    const d = wallClockToInstant({ year: 2026, month: 10, day: 23, hour: 8, minute: 10, second: 0 });
    expect(d.toISOString()).toBe('2026-10-23T06:10:00.000Z');
  });

  it('converts CET (winter) wall clock to the right instant', () => {
    const d = wallClockToInstant({ year: 2026, month: 10, day: 30, hour: 8, minute: 10, second: 0 });
    expect(d.toISOString()).toBe('2026-10-30T07:10:00.000Z');
  });

  it('handles the DST switch day 2026-10-25 (03:00 CEST → 02:00 CET)', () => {
    expect(offsetMs(new Date('2026-10-25T00:30:00Z'))).toBe(2 * 3_600_000);
    expect(offsetMs(new Date('2026-10-25T01:30:00Z'))).toBe(1 * 3_600_000);
    // 02:30 happens twice; we pick the first (CEST) occurrence.
    const ambiguous = wallClockToInstant({ year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 });
    expect(ambiguous.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    // 04:00 after the switch is CET.
    const after = wallClockToInstant({ year: 2026, month: 10, day: 25, hour: 4, minute: 0, second: 0 });
    expect(after.toISOString()).toBe('2026-10-25T03:00:00.000Z');
  });

  it('handles the spring-forward gap 2026-03-29 (02:30 does not exist)', () => {
    const gap = wallClockToInstant({ year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 });
    // Shifted forward to 03:30 CEST.
    expect(toWallClock(gap).hour).toBe(3);
    expect(toWallClock(gap).minute).toBe(30);
  });

  it('round-trips midnight correctly (no 24:00 artefacts)', () => {
    const w = toWallClock(new Date('2026-10-11T22:00:00Z'));
    expect(w).toMatchObject({ year: 2026, month: 10, day: 12, hour: 0, minute: 0 });
    expect(dayKey(new Date('2026-10-11T22:00:00Z'))).toBe('2026-10-12');
    expect(dayKey(new Date('2026-10-11T21:59:59Z'))).toBe('2026-10-11');
  });

  it('minutesOfDay and formatTime use Stockholm time', () => {
    const d = new Date('2026-10-23T06:10:00Z');
    expect(minutesOfDay(d)).toBe(8 * 60 + 10);
    expect(formatTime(d)).toBe('08:10');
  });
});

describe('week logic', () => {
  it('weeks start on Monday', () => {
    expect(weekdayIndex('2026-10-12')).toBe(0);
    expect(weekdayIndex('2026-10-11')).toBe(6);
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-12')).toBe('2026-10-12');
    expect(startOfWeek('2026-10-18')).toBe('2026-10-12');
  });

  it('computes ISO week numbers including year boundaries', () => {
    expect(isoWeek('2026-10-12')).toEqual({ week: 42, year: 2026 });
    expect(isoWeek('2026-01-01')).toEqual({ week: 1, year: 2026 });
    expect(isoWeek('2027-01-01')).toEqual({ week: 53, year: 2026 });
    expect(isoWeek('2027-01-04')).toEqual({ week: 1, year: 2027 });
    expect(isoWeek('2024-12-30')).toEqual({ week: 1, year: 2025 });
  });

  it('adds days across the DST switch without drifting', () => {
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('Swedish formatting', () => {
  it('names weekdays in Swedish', () => {
    expect(weekdayName('2026-10-12')).toBe('måndag');
    expect(weekdayName('2026-10-16', true)).toBe('fre');
  });

  it('formats week ranges', () => {
    expect(formatWeekRange('2026-10-12', '2026-10-16')).toBe('12–16 oktober');
    expect(formatWeekRange('2026-09-28', '2026-10-02')).toBe('28 sep–2 okt');
  });

  it('formats relative times', () => {
    const now = new Date('2026-10-12T10:00:00Z');
    expect(formatRelative(new Date('2026-10-12T09:59:50Z'), now)).toBe('nyss');
    expect(formatRelative(new Date('2026-10-12T09:45:00Z'), now)).toBe('för 15 min sedan');
    expect(formatRelative(new Date('2026-10-12T07:00:00Z'), now)).toBe('för 3 tim sedan');
    expect(formatRelative(new Date('2026-10-11T10:00:00Z'), now)).toBe('igår');
    expect(formatRelative(new Date('2026-10-08T10:00:00Z'), now)).toBe('för 4 dagar sedan');
  });
});
