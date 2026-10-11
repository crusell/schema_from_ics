import { describe, expect, it } from 'vitest';
import type { Lesson } from '../src/lib/ics';
import { axisBounds, layoutDay } from '../src/lib/layout';
import { subjectHue } from '../src/lib/colors';

function lesson(title: string, start: string, end: string, allDay = false): Lesson {
  return {
    id: `${title}@${start}`,
    uid: title,
    kind: 'lesson',
    title,
    course: '',
    subject: title.toLowerCase(),
    location: '',
    description: '',
    start: new Date(`2026-10-12T${start}:00+02:00`),
    end: new Date(`2026-10-12T${end}:00+02:00`),
    allDay,
    dayKey: '2026-10-12',
    cancelled: false,
  };
}

describe('layoutDay', () => {
  it('gives non-overlapping lessons a single column', () => {
    const placed = layoutDay([lesson('A', '08:00', '09:00'), lesson('B', '09:00', '10:00')]);
    expect(placed.map((p) => [p.col, p.cols])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it('places overlapping lessons side by side', () => {
    const placed = layoutDay([lesson('A', '13:30', '14:30'), lesson('B', '14:00', '14:30')]);
    expect(placed.map((p) => [p.lesson.title, p.col, p.cols])).toEqual([
      ['A', 0, 2],
      ['B', 1, 2],
    ]);
  });

  it('handles transitive clusters and reuses freed columns', () => {
    const placed = layoutDay([
      lesson('A', '08:00', '10:00'),
      lesson('B', '08:30', '09:00'),
      lesson('C', '09:00', '09:30'), // fits in B's column
      lesson('D', '11:00', '12:00'), // new cluster
    ]);
    const byTitle = Object.fromEntries(placed.map((p) => [p.lesson.title, [p.col, p.cols]]));
    expect(byTitle).toEqual({ A: [0, 2], B: [1, 2], C: [1, 2], D: [0, 1] });
  });

  it('excludes all-day events and computes minutes in Stockholm time', () => {
    const placed = layoutDay([lesson('Lov', '00:00', '00:00', true), lesson('A', '08:10', '09:30')]);
    expect(placed).toHaveLength(1);
    expect(placed[0].startMin).toBe(490);
    expect(placed[0].endMin).toBe(570);
  });
});

describe('axisBounds', () => {
  it('defaults to 08–16 and expands to cover lessons', () => {
    expect(axisBounds([])).toEqual({ start: 8, end: 16 });
    const placed = layoutDay([lesson('A', '07:30', '17:10')]);
    expect(axisBounds(placed)).toEqual({ start: 7, end: 18 });
  });
});

describe('subjectHue', () => {
  it('is stable and within 0–359', () => {
    expect(subjectHue('matematik')).toBe(subjectHue('matematik'));
    for (const s of ['matematik', 'svenska', 'engelska', 'no', 'so', 'idrott och hälsa', 'lunch']) {
      const h = subjectHue(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it('separates common subjects', () => {
    const hues = ['matematik', 'svenska', 'engelska', 'no', 'so'].map(subjectHue);
    expect(new Set(hues).size).toBe(hues.length);
  });
});
